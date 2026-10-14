# DoodleTalk: Draw it. See it. Say it.

## The problem

Some children cannot rely on speech. They use AAC (augmentative and alternative communication): boards of picture cards that speak when tapped. ASHA cites estimates that [about 5 million Americans may benefit from AAC](https://www.asha.org/Practice-Portal/Professional-Issues/Augmentative-and-Alternative-Communication/). But the cards are generic, often expensive, and fixed. If a child wants *their* banana, *their* dog, or *their* favorite cup and there is no card, they cannot say it, and they cannot make one.

## What we built

DoodleTalk lets a child, parent or therapist scribble anything. In about 0.6 seconds on a laptop, the doodle becomes a clean picture card, labeled with the right word, ready to tap and speak.

1. **Draw.** A touch-friendly canvas, built for iPad width.
2. **Understand.** CLIP ViT-L/14 runs zero-shot over 91 drawable words from a 163-word AAC vocabulary and suggests the top five words. A human confirms or types their own.
3. **Redraw.** SD-Turbo img2img restyles the doodle as a pictogram, storybook, clay or crayon card, keeping the child's own composition.
4. **Say it.** Cards join a color-coded talking board. Tap "I", "want", "banana" and the browser speaks the sentence.

## Why it matters

The vocabulary on a board is usually chosen for a child. Here, the child can add to it. A banana drawn by the child becomes a real, speakable card in seconds, at no per-card cost. We are not claiming clinical results; we have not run user studies. We are showing that current image models make personalized AAC vocabulary cheap and immediate.

## Privacy by design

DoodleTalk runs **fully local**. Both models run on the device (Apple Silicon or CUDA), the board lives in the browser, and no drawing is ever uploaded. For a tool used by children and people with disabilities, no cloud, no account and no data collection is a core feature, not an afterthought.

## Technical highlights

- Two models chained: CLIP for meaning, SD-Turbo for pixels.
- One-to-two-step diffusion, so previews feel live.
- FastAPI backend, vanilla JS frontend with no build step.
- Strength and style are exposed as simple controls.

## Honest limits

DoodleTalk is not a replacement for an AAC system designed with a speech-language pathologist. CLIP can mis-guess, and generated cards vary in consistency. We see it as a complement that gives children a voice in building their own vocabulary.

## What's next

A LoRA fine-tune on a consistent pictogram style (for example ARASAAC symbols, subject to licensing), cards from photos of a child's own items, and an offline iPad app.

**Draw it. See it. Say it.**

<!-- word count: 430 -->
