"""DoodleTalk backend: CLIP doodle recognition + SD-Turbo picture-card generation (see SPEC.md)."""
import base64
import io
import os
import threading
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel

from vocab import DEPICT, VOCAB

ROOT = Path(__file__).resolve().parent.parent
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
SIZE = 512
I2I_SIZE = int(os.environ.get("I2I_SIZE", 512))  # img2img res; 384 ~1.3s vs 512 ~2.2s on M4 (VAE-bound)
CLIP_WEIGHTS = next((Path.home() / ".cache/huggingface/hub/models--laion--CLIP-ViT-L-14-laion2B-s32B-b82K/snapshots")
                    .glob("*/open_clip_pytorch_model.bin"), "laion2b_s32b_b82k")
CLIP_TEMPLATES = ["a simple child's drawing of {}", "a sketch of a {}", "a doodle of {}"]

STYLES = {
    "pictogram": "{word}, simple flat AAC pictogram icon, bold black outlines, bright solid colors, "
                 "plain white background, centered, clean vector style, minimal",
    "storybook": "{word}, children's storybook illustration, soft watercolor, warm colors, "
                 "plain white background, centered, single subject",
    "clay": "{word} sculpted from plasticine clay, claymation object, no face, soft studio lighting, "
            "plain white background, centered, single subject",
    "crayon": "{word}, colorful crayon drawing, bold wax crayon strokes, child-friendly, "
              "plain white paper background, centered, single subject",
}

state = {"loaded": False, "error": None}
lock = threading.Lock()  # MPS is not thread-safe: serialize all model calls
M = {}


def load_models():
    try:
        import open_clip
        from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image

        t0 = time.time()
        model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14", pretrained=str(CLIP_WEIGHTS))
        model = model.to(DEVICE).eval()
        tok = open_clip.get_tokenizer("ViT-L-14")
        with torch.no_grad():
            embs = []
            for v in VOCAB:
                e = model.encode_text(tok([t.format(v["word"]) for t in CLIP_TEMPLATES]).to(DEVICE))
                e = (e / e.norm(dim=-1, keepdim=True)).mean(0)
                embs.append(e / e.norm())
            M["text_emb"] = torch.stack(embs)
        M.update(clip=model, preprocess=preprocess)
        print(f"CLIP ready in {time.time() - t0:.1f}s", flush=True)

        t0 = time.time()
        t2i = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sd-turbo", variant="fp16", torch_dtype=torch.float16, safety_checker=None)
        t2i = t2i.to(DEVICE)
        t2i.set_progress_bar_config(disable=True)
        if os.environ.get("TINY_VAE", "1") == "1":
            # TAESD (~10MB) replaces the full VAE: the VAE dominates latency on Apple Silicon (~0.6s vs ~1.2s per card).
            from diffusers import AutoencoderTiny
            t2i.vae = AutoencoderTiny.from_pretrained("madebyollin/taesd", torch_dtype=torch.float16).to(DEVICE)
        i2i = AutoPipelineForImage2Image.from_pipe(t2i)
        i2i.set_progress_bar_config(disable=True)
        M.update(t2i=t2i, i2i=i2i, upcast_vae=os.environ.get("UPCAST_VAE") == "1")
        if M["upcast_vae"]:
            t2i.vae.to(torch.float32)
        # warmup + black/NaN check; fall back to fp32 VAE decode if fp16 is broken
        img, _ = generate_image("apple", None, "pictogram", 0.6, 0)
        if max(img.convert("L").getextrema()) < 10 and not M["upcast_vae"]:
            print("fp16 VAE produced a black image -> upcasting VAE to fp32", flush=True)
            t2i.vae.to(torch.float32)
            M["upcast_vae"] = True
        generate_image("apple", Image.new("RGB", (SIZE, SIZE), "white"), "pictogram", 0.6, 0)
        print(f"SD-Turbo ready in {time.time() - t0:.1f}s (upcast_vae={M['upcast_vae']})", flush=True)
        state["loaded"] = True
    except Exception as e:
        traceback.print_exc()
        state["error"] = repr(e)


DRAWABLE = [i for i, v in enumerate(VOCAB) if v["category"] in {"food", "things", "animals", "places", "people"}
             and v["word"].lower() not in DEPICT and v["word"] not in {"I", "he", "she", "home"}]


def fill_doodle(img: Image.Image) -> Image.Image:
    """Fill enclosed outline regions with the dominant stroke colour; outline-only doodles otherwise stay outlines."""
    small = img.resize((128, 128))
    ink = small.convert("L").point(lambda v: 255 if v < 230 else 0).filter(ImageFilter.MaxFilter(3))
    ImageDraw.floodfill(ink, (0, 0), 128)  # mark everything reachable from the corner as outside
    inside = ink.point(lambda v: 255 if v == 0 else 0)
    if not inside.getbbox():
        return img
    px = list(small.getdata())
    strokes = [c for c in px if min(c) < 200 and max(c) - min(c) > 40] or [c for c in px if sum(c) < 600]
    buckets = {}
    for c in strokes:
        buckets.setdefault(tuple(v // 32 for v in c), []).append(c)
    best = max(buckets.values(), key=len)
    col = tuple(int(sum(c[i] for c in best) / len(best) * 0.8 + 51) for i in range(3))
    mask = inside.resize(img.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(3))
    return Image.composite(Image.new("RGB", img.size, col), img, mask)


def decode_image(data_url: str) -> Image.Image:
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, img).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)


def encode_image(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def generate_image(word, image, style, strength, seed):
    subject = DEPICT.get(word) or DEPICT.get(word.lower()) or word
    prompt = STYLES.get(style, STYLES["pictogram"]).format(word=subject)
    gen = torch.Generator("cpu").manual_seed(int(seed))
    upcast = M.get("upcast_vae")
    out_type = "latent" if upcast else "pil"
    with lock, torch.inference_mode():
        if image is not None:
            # One UNet step from a custom noise level. (With steps=2, any strength in [0.5,1) collapses to
            # t=499, which barely changes the doodle.) User strength 0..1 maps to t in [500, 980].
            t = int(999 * min(max(0.5 + 0.5 * float(strength), 0.5), 0.98))
            image = fill_doodle(image).resize((I2I_SIZE, I2I_SIZE), Image.LANCZOS)
            out = M["i2i"](prompt=prompt, image=image, strength=1.0, timesteps=[t],
                           guidance_scale=0.0, generator=gen, output_type=out_type).images
        else:
            out = M["t2i"](prompt=prompt, num_inference_steps=1, guidance_scale=0.0, generator=gen,
                           height=SIZE, width=SIZE, output_type=out_type).images
        if upcast:
            vae = M["t2i"].vae
            dec = vae.decode(out.to(torch.float32) / vae.config.scaling_factor).sample
            out = M["t2i"].image_processor.postprocess(dec, output_type="pil")
    return out[0].resize((SIZE, SIZE), Image.LANCZOS), prompt


@asynccontextmanager
async def lifespan(_app):
    threading.Thread(target=load_models, daemon=True).start()  # health responds immediately while loading
    yield


app = FastAPI(title="DoodleTalk", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RecognizeReq(BaseModel):
    image: str


class GenerateReq(BaseModel):
    word: str
    image: str | None = None
    style: str = "pictogram"
    strength: float = 0.6
    seed: int = 42


def require_loaded():
    if not state["loaded"]:
        raise HTTPException(503, state["error"] or "models still loading")


@app.get("/api/health")
def health():
    return {"ok": True, "device": DEVICE, "models_loaded": state["loaded"], "error": state["error"]}


@app.post("/api/recognize")
def recognize(req: RecognizeReq):
    require_loaded()
    img = decode_image(req.image)
    with lock, torch.no_grad():
        x = M["preprocess"](img).unsqueeze(0).to(DEVICE)
        f = M["clip"].encode_image(x)
        f = f / f.norm(dim=-1, keepdim=True)
        logits = (100.0 * f @ M["text_emb"][DRAWABLE].T)[0].cpu()
    # Only rank drawable nouns: color/feeling words otherwise win on almost any colored scribble.
    top = logits.softmax(dim=-1).topk(5)
    return {"labels": [{**VOCAB[DRAWABLE[i]], "score": round(float(s), 4)} for s, i in zip(top.values, top.indices.tolist())]}


@app.post("/api/generate")
def generate(req: GenerateReq):
    require_loaded()
    word = req.word.strip()[:60] or "star"
    t0 = time.time()
    img, prompt = generate_image(word, decode_image(req.image) if req.image else None,
                                 req.style, req.strength, req.seed)
    return {"image": encode_image(img), "ms": int((time.time() - t0) * 1000), "prompt": prompt}


(ROOT / "frontend").mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
