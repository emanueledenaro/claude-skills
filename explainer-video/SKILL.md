---
name: explainer-video
description: "Pipeline for a narrated motion-graphics explainer built with Remotion and an AI voice: questions in rounds, script, style frames, voice with word times, a measured timeline, scenes cued to spoken words, checks on stills, render, loudness master. Use when the person asks for a video that explains an idea or presents a product with a voice ('video spiegazione', 'video motion graphics', 'explainer', 'video di presentazione'), wants a second style of a film built this way, or returns to change one, in any project. Not for a silent loop, a screen recording or a social clip without narration."
---

A narrated explainer is voice-led: the voice is the clock, and every picture lands on the word that means it. This skill is the order of work that gets there and the scripts that measure it. What makes a film good (hook, holds, rhythm, truth on screen) is `video-direction` when it is listed: load it with this skill and let it win on direction. Remotion syntax is `remotion-best-practices`. Questions to the person follow `adhd-replies`.

The person never sees a step you have not looked at yourself. You cannot hear: say what you measured, and hand the listening to the person.

## 1. Read, then ask

- Read what the subject really does before any question: README, glossary, docs. List what is real and what is not (sample data, integrations that are not connected). Facts are your job, decisions are the person's.
- Ask in rounds of 3 or 4 decisions, each with a recommended answer first. The ones that change the film: what the audience may and may not learn, audio (AI voice with captions, text and music, the person speaking live), own look or the brand's, the thread of the explanation, which features, who watches, the date, the voice, the music, the closing line.
- A subject the audience must not recognise as finished gets drawn interfaces only: no real screen, no internal name.

Done when you can say the film in one sentence and no production choice is left assumed.

## 2. Script

- Write the voice text scene by scene, with what the screen shows under each scene, then one row per scene: time, what happens, what the viewer must understand, the word that cues it, how it leaves, the sound.
- Budget from measured pace: an Italian AI narration ran at 157 words a minute. Plan 150 to 160, add 0.7 to 1.4 s at each scene joint and 3 to 4 s of still at the end. Three minutes is about 430 words.
- Count the words with a command. When the count is short, add one concrete sentence per feature before stretching pauses.
- Every claim about the subject gets a line naming the feature it comes from. Invented data on screen carries a visible example label. Write the open points at the bottom of the file.

Done when the person approves the text. No voice credits are spent before that.

## 3. Style frames

- Three directions that differ in material and motion, each named by a real reference. For each, two real frames at 1920x1080 of the same two scenes: the scene that carries the idea and the payoff.
- One HTML file with a `?f=` switch per frame, shot with headless Chrome (`reference.md`). Read every PNG, fix what collides or overflows, then one side-by-side sheet.
- When the person wants two versions, both share the timeline, the voice, the music and the captions; each gets its own kit and its own scenes. A recolour is the same version twice.

Done when the person names the direction, or the two to build.

## 4. Voice, word times, music

- Pick the voice with the language filter and no search text, price the run with an estimate first, and tell the person the cost and the voice.
- Generate the whole script in one run, scenes separated by blank lines. Spell for the ear: a brand, an acronym or a foreign word is written the way it is said, and a display map turns it back into the written form on screen.
- Download every take. Transcribe the one you use for per-word start and end.
- One instrumental track, one generation, at least as long as the film. Measure its loudness in 10 s steps.

Done when the words file holds every word of the script with its times, and the person knows which take and track are in use.

## 5. Timeline

- Write `timeline.config.json` (keys in the header of `scripts/build_timeline.py`): each scene's first spoken word and the pause before its voice. Give the hook 0.8 s, the scene before the payoff 1.4 s, the others 0.7 to 1.2 s.
- `python3 <skill>/scripts/build_timeline.py timeline.config.json` cuts the voice on the quietest 20 ms of each joint, inserts the pauses, shifts the word times, builds one-line captions and prints scene times, pace and short captions.

Done when the printed duration fits the target and every caption under 1.2 s is one you chose.

## 6. Build

- Scaffold with `npx create-video@latest --yes --blank --no-tailwind video`, add `@remotion/google-fonts` and `@remotion/media` with `npx remotion add`, copy `template/lib.tsx` to `src/lib.tsx`.
- One composition per version, its length read from the timeline. `t = frame / fps`; a scene is a function of `t` that renders only inside its window.
- Every entrance starts at `cue(scene, "word")`: the timeline is the only place a time is written.
- A scene owns its pause: a title, a carried-over object or a drawn frame fills it. Hold the big title until the first content arrives.
- Per version: a kit file (palette, type, primitives, the scene container with its transition) and the scenes in three files. A world that spans two scenes is one component over both windows.
- Music under the voice at 0.11, silence in the pause before the payoff, loudest on the payoff: `musicVolume` in the template.

Done when `npx tsc --noEmit` prints nothing.

## 7. Look, then render

- Render about 45 stills across every scene and phase, sheet them, read every sheet:

```bash
npx remotion render <Comp> out/check --frames=0,135,315 --image-format=jpeg --sequence --log=error
python3 <skill>/scripts/sheets.py stills out/check
```

- Hunt on the sheets: text past the right margin, a caption over a subject, labels on top of each other, words fused by tight tracking, a moment with almost nothing on screen, a moving object that drifts into the caption line.
- Fix, then render only the frames you touched and look again.
- Full render in the background, one film at a time (3 minutes at 1080p took 5 to 7 minutes). Then:

```bash
<skill>/scripts/master.sh out/raw.mp4 ../Film.mp4
python3 <skill>/scripts/sheets.py phone ../Film.mp4 out/phone
```

- Read the phone sheets of the final file. A tile with a title alone or a black frame is an empty beat: fill it and render again. Check the first six frames for the hook.

Done when the final file's sheets show no defect you would flag and the master prints -14 LUFS with the peak at or under -1 dBFS.

## 8. Deliver

- Send the films as soon as each one passes, the first while the second renders.
- Say, in the person's language: length and format measured, loudness measured, what you saw only on stills, what nobody has heard yet (pronunciations, whether the music is really instrumental), what is missing (sound effects), credits spent, and that the quality score is your own.
- Append the measured scene times and the differences between spoken and written text to the script file.

After a note from the person, change that place and that time, look at the stills again, render again.

## Files

- `scripts/build_timeline.py`: voice plus word times to a retimed voice and `timeline.json`.
- `scripts/sheets.py`: contact sheets from stills or from a finished film.
- `scripts/master.sh`: loudness master and the measures of the delivered file.
- `template/lib.tsx`: timeline access, `cue`, easing, `In`, `Captions`, `musicVolume`.
- `reference.md`: commands and the traps met while building the first film, read it at steps 3, 4, 6 and 7.
