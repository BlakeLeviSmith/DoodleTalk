# DoodleTalk: 90-second demo script

Total runtime: 1:30. Voiceover in plain text, on-screen action in *italics*.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00-0:12 | *Dark, quiet. Photo or simple animation of a child at a talking board, reaching toward a fruit bowl. Cut to the board: no banana card anywhere.* | "This child wants a banana. She can't say it. Her talking board has hundreds of cards, but none of them is a banana." |
| 0:12-0:22 | *Cut to DoodleTalk, empty canvas, banana-yellow UI.* | "AAC cards are generic and expensive, and kids can't make their own. So we built DoodleTalk. Draw it. See it. Say it." |
| 0:22-0:40 | *Live: draw a wobbly yellow banana. Stroke ends; chips appear with "banana" on top; the preview becomes a clean pictogram banana in about a second.* | "She scribbles a banana. CLIP, zero-shot, figures out the word. SD-Turbo redraws her doodle as a clean card, keeping her shape, in about a second." |
| 0:40-0:50 | *Tap "Add to board". Card drops into the Foods group.* | "One tap and it's on her board." |
| 0:50-1:05 | *Tap "I", then "want", then the banana card. Sentence strip fills. Tap Speak all. Audio: "I want banana."* | "Now she taps: I. Want. Banana. And the board says it for her." |
| 1:05-1:15 | *Switch style: pictogram, storybook, clay, crayon. Same doodle, four looks (use cached outputs for speed).* | "Parents and therapists can switch the style, so the card looks the way that child likes best." |
| 1:15-1:30 | *Show terminal / Wi-Fi off icon, then the board. End card: logo + tagline.* | "And it all runs locally. The models run on this laptop with Wi-Fi off. A child's drawings never leave the device. DoodleTalk: personal vocabulary, made by the child, in seconds." |

## Recording tips

- **Cache hero outputs.** Before recording, run the banana doodle once per style so the models are warm and results are in the cache. Do a dry run; first generation after launch is slowest because of model load.
- Keep a pre-saved fallback clip of the banana generation in case a live take misfires.
- **QuickTime on Mac:** File > New Screen Recording, choose a region around the browser window, enable the microphone, record voiceover separately if room noise is a problem.
- Use a fixed seed for repeatable results. Zoom the browser to about 110% so the UI is readable at video size.
- Turn on Do Not Disturb and hide the dock and bookmarks bar.
- Make sure system volume is up so TTS is captured; QuickTime does not capture system audio by default, so either record voiceover over a mic pickup of the speaker or use a loopback tool such as BlackHole.
- Draw with a bold yellow brush, big and slow, so the viewer can follow it.
- Do not claim user studies or results; stay with "what it does".
