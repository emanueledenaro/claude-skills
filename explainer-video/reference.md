# Explainer video reference

Commands and traps from the first film built with `explainer-video` (November 2026: Remotion 4.0.545, ElevenLabs through its connector, ffmpeg from Homebrew). Versions move: when a command fails, read its help before trusting this page.

## Style frames with headless Chrome

One HTML file, each frame a `<section>` shown by a `?f=` query, fonts from Google Fonts with `display=block`.

```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1920,1080 --virtual-time-budget=6000 \
  --screenshot="$PWD/style-1a.png" "file://$PWD/frames.html?f=1a"
```

- Lines that connect measured elements (a slot to its candidates) are drawn by a script after `document.fonts.ready`, from `getBoundingClientRect`.
- A side-by-side sheet: `ffmpeg -i a.png -i b.png ... -filter_complex "[0][1][2]concat=n=3:v=1:a=0,scale=960:540,tile=3x1:padding=12:margin=12:color=white" -frames:v 1 sheet.png`.

## Voice and music (ElevenLabs connector)

- Voice search: the language filter with a search text returned voices of other languages. Filter by language and gender, sort by usage, read the descriptions.
- A speech run returns two takes and charges both. About 2,500 credits per take for 2,500 characters. Price it with `estimate_only`, and call it once: a second call is a second charge.
- The run returns before the audio exists. Read the status with the run's session ids, then download `content.mp3` from the signed URL with `curl`. The URL expires.
- Word times: put the chosen take on the flow as an asset node, transcribe it with that node as input. The result carries `words` with start and end, and a `words.json` URL. It cost 0 credits.
- Written the way it is said: a brand name with its stress accent, an acronym as its spoken syllables, "intelligenza artificiale" where the script says "AI". The transcript returns the same spelling, so the display map in the timeline config turns it back.
- The voice ran with pauses of 0.04 to 0.12 s between scenes. The joints are too short to cut by time alone: the script looks for the quietest 20 ms around each one.
- Music: ask for one generation (`generations_count: 1`), the default is four. Its settings came back as "Instrumental: False" although the prompt asked for no vocals: tell the person to listen.

## Remotion

- `tsconfig` has `noUnusedLocals`: an unused import or constant fails `tsc`. Remove it when you remove its last use.
- Fonts: `import { loadFont } from "@remotion/google-fonts/InterTight"`, then `loadFont("normal", { weights: ["500", "900"], subsets: ["latin"] }).fontFamily`.
- Stills: `--frames=a,b,c --image-format=jpeg --sequence` writes `element-NNNN.jpeg`, the number is the frame.
- A line that draws itself: `pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k}` on a line, path, rect or circle. For a circle add `transform="rotate(-90 cx cy)"` so it starts at the top.
- Gradient text clips descenders: `display: inline-block` with `padding-bottom: 0.14em` and the same negative margin.
- Tracking tighter than -0.03em fuses words in a heavy face: add `word-spacing: 0.12em`.
- A word that appears on its cue: return `null` before the cue when later words may follow it on the line, keep it in the layout at opacity 0 when its neighbours must stay still.
- Layout that depends on text width (a tree hanging from an inline slot): position it relative to the inline element, with fixed offsets from that element.

## Cues

- `cue(scene, "per")` matches by prefix on the lowercased word: it also hits "perché". "Una" hits "una". A scene number spoken as a word ("Tre.") hits the same word later in the scene. Pass a longer prefix, a neighbour word with an offset, or the `nth`.
- A wrong cue throws at render with the scene and the word. A cue that matches the wrong word does not: check on a still that the element arrives where the caption says the word.

## Checks with ffmpeg

- This ffmpeg build had no `drawtext` filter: sheets print the second of each tile in the terminal instead.
- `freezedetect` reports a text hold as a freeze and misses the motion of thin lines and small dots. Its list is a place to look. The phone sheets decide.
- Phone sheets with `fps=1/3` sample near 1.5 s, 4.5 s, 7.5 s: a tile is not the exact second in its name.
- Captions sit at the bottom margin: nothing important below y = 920 at 1080p, and a moving object needs its whole path checked against that line.

## Shell habits that cost time

- A `cd` in a command moves the session's working directory for the next ones: use absolute paths in every command.
- Two renders at once slow both: chain them in one background command, master and sheets included, and read the result when it reports.
- Edit sources with exact-string replacements that assert one match each: a silent miss leaves the old frame in the next render.
