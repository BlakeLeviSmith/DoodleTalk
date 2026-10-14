"""End-to-end smoke test: python backend/test_client.py (server must be running on :8000)."""
import base64, io, json, time, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw

URL = "http://localhost:8000"
OUT = Path(__file__).parent / "test_out"
OUT.mkdir(exist_ok=True)


def post(path, body):
    req = urllib.request.Request(URL + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))


while not json.load(urllib.request.urlopen(URL + "/api/health"))["models_loaded"]:
    time.sleep(2)

# synthetic doodle: transparent canvas, red circle with a stem + leaf (an apple-ish scribble)
img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.ellipse((120, 140, 400, 420), outline=(220, 30, 30, 255), width=14)
d.line((260, 140, 270, 80), fill=(110, 60, 20, 255), width=12)
d.ellipse((275, 70, 340, 110), outline=(30, 160, 30, 255), width=10)
buf = io.BytesIO(); img.save(buf, "PNG")
doodle = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

print(post("/api/recognize", {"image": doodle}))
for style in ["pictogram", "storybook", "clay", "crayon"]:
    for mode, im in [("img2img", doodle), ("text2img", None)]:
        r = post("/api/generate", {"word": "apple", "image": im, "style": style, "strength": 0.6, "seed": 42})
        (OUT / f"{style}_{mode}.png").write_bytes(base64.b64decode(r["image"].split(",")[1]))
        print(f"{style:10s} {mode:9s} {r['ms']} ms")
