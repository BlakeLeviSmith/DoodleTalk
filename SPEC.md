# DoodleTalk — Draw it. See it. Say it.

Banana Hacks 2026 entry (theme: generative AI & image creation).

## Pitch
About 5 million Americans may benefit from AAC (augmentative & alternative communication; ASHA). Picture cards
are generic, expensive, and never show *their* dog, *their* cup, *their* favorite banana.
DoodleTalk lets a child (or parent/therapist) scribble something; CLIP figures out what word
they mean; SD-Turbo instantly redraws the scribble as a clean, consistent picture card that
keeps the child's own composition; the card joins their talking board, and tapping cards
speaks a sentence out loud.

## Architecture
- `backend/` — Python FastAPI on Apple Silicon (MPS), run with `.venv/bin/python backend/server.py`
  (serves on http://localhost:8000, and serves `frontend/` as static files at `/`).
  - Image model: `stabilityai/sd-turbo` (fp16 weights only, already in HF cache), diffusers
    `AutoPipelineForImage2Image` + `AutoPipelineForText2Image` sharing components. 512x512, 1-4 steps,
    guidance_scale=0.0.
  - Recognition: open_clip `ViT-L-14` pretrained `laion2b_s32b_b82k` (already in HF cache) zero-shot
    over an AAC vocabulary (~150 words, `backend/vocab.py`), prompt template "a simple child's drawing of {word}".
- `frontend/` — vanilla HTML/CSS/JS, no build step. `index.html`, `app.js`, `style.css`.

## API contract (JSON; images are PNG data URLs `data:image/png;base64,...`)
- `GET /api/health` → `{"ok": true, "device": "mps", "models_loaded": true}`
- `POST /api/recognize` body `{"image": dataURL}` → `{"labels": [{"word": "apple", "category": "food", "score": 0.62}, ...top 5]}`
- `POST /api/generate` body
  `{"word": "apple", "image": dataURL|null, "style": "pictogram"|"storybook"|"clay"|"crayon", "strength": 0.6, "seed": 42}`
  - with `image`: img2img from the doodle (composite onto white first; strength default 0.6; steps such that
    steps*strength >= 1, e.g. steps=2 for strength 0.5-0.99).
  - without `image`: text2img (1 step).
  → `{"image": dataURL, "ms": 412, "prompt": "..."}`
- Style prompts (backend owns them), e.g. pictogram: "a {word}, simple flat AAC pictogram icon, bold black outlines,
  bright solid colors, white background, centered, clean vector style".

## Frontend UX
1. **Draw panel**: big canvas (512x512 logical), brush colors (6 kid-friendly), brush size, undo, clear, eraser.
   Touch + mouse (pointer events). While drawing, debounce ~350ms after stroke end → call recognize, then
   generate with the top word (or user-picked/typed word). Show live "magic" preview next to the canvas.
2. **Word chips**: top-5 CLIP guesses as tappable chips; plus a text box to type a word. Picking one regenerates.
3. **Style picker**: pictogram / storybook / clay / crayon.
4. **Add to board** button → card (image + word label) saved to the board (persist in localStorage, wrapped in try/catch).
5. **Talking board**: grid of cards grouped by category color (Fitzgerald-key-like colors: people yellow, actions green,
   descriptors blue, nouns orange, social pink). Tap a card → speaks word via `speechSynthesis` and appends to a
   sentence strip at top. Sentence strip has ▶ Speak all, ⌫ backspace, ✕ clear. Starter cards "I", "want", "more",
   "help", "yes", "no" are prepopulated (generated text2img on first load, cached).
6. Big, rounded, high-contrast, accessible UI (min 64px touch targets), banana-yellow accent, works on iPad width.
7. If backend unreachable, show a friendly banner (don't crash).
