"""Build the timeline of a narrated video from one voice take and its word times.

Cuts the voice at every scene joint on the quietest 20 ms, inserts the pause
each scene asks for, shifts the word times, builds one-line captions and writes
the retimed voice plus a timeline JSON that the Remotion code reads.

Usage: python3 build_timeline.py timeline.config.json   (run from the project root)

Config keys (paths are relative to the current directory):
  audio      the voice take, any format ffmpeg reads
  words      JSON with {"words": [{"text", "start", "end"}, ...]} for that take
  outAudio   where to write the retimed voice (wav)
  outJson    where to write the timeline (src/timeline.json)
  fps        frame rate of the film
  tail       seconds of still image after the last word
  scenes     [{"name", "first", "gap"}]: "first" is the first spoken word of the
             scene exactly as transcribed (searched in order), or use
             "firstIndex" with the word index; "gap" is the pause in seconds
             inserted before the scene's voice
  display    {"spoken": "written"}: how a phonetic spelling is shown on screen
"""
import array
import json
import subprocess
import sys
import wave
from pathlib import Path

RATE = 48000


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    return array.array("h", raw)


def quietest(samples, lo, hi, win=0.02):
    """Middle (seconds) of the quietest 20 ms window between lo and hi."""
    n = int(win * RATE)
    best, best_t = None, lo
    step = int(0.004 * RATE)
    for start in range(int(lo * RATE), max(int(lo * RATE) + 1, int(hi * RATE) - n), step):
        energy = sum(abs(s) for s in samples[start:start + n])
        if best is None or energy < best:
            best, best_t = energy, (start + n / 2) / RATE
    return best_t


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    scene_cfg = cfg["scenes"]
    tail = cfg.get("tail", 3.5)
    fps = cfg.get("fps", 30)
    display = cfg.get("display", {})
    words = json.loads(Path(cfg["words"]).read_text(encoding="utf-8"))["words"]
    samples = decode(cfg["audio"])
    total = len(samples) / RATE

    # index of the first word of each scene
    starts, cursor = [], 0
    for sc in scene_cfg:
        if "firstIndex" in sc:
            idx = sc["firstIndex"]
        else:
            idx = next((i for i in range(cursor, len(words)) if words[i]["text"] == sc["first"]), None)
            if idx is None:
                sys.exit(f'scene {sc["name"]}: word "{sc["first"]}" not found after index {cursor}')
        starts.append(idx)
        cursor = idx + 1
    if starts[0] != 0:
        sys.exit("the first scene must start at the first word")

    # cut points in the original audio
    cuts = [0.0]
    for idx in starts[1:]:
        prev_end, nxt = words[idx - 1]["end"], words[idx]["start"]
        cuts.append(quietest(samples, prev_end - 0.06, nxt + 0.06))
    cuts.append(total)

    out = array.array("h")
    fade = int(0.012 * RATE)
    scenes, shifts = [], []
    for i, sc in enumerate(scene_cfg):
        name, gap = sc["name"], sc["gap"]
        scene_start = len(out) / RATE
        out.extend([0] * int(gap * RATE))
        voice_start = len(out) / RATE
        seg = samples[int(cuts[i] * RATE):int(cuts[i + 1] * RATE)]
        for k in range(min(fade, len(seg))):  # short fades against clicks
            seg[k] = int(seg[k] * k / fade)
            seg[-1 - k] = int(seg[-1 - k] * k / fade)
        out.extend(seg)
        shifts.append(voice_start - cuts[i])
        scenes.append({"name": name, "start": scene_start, "voiceStart": voice_start,
                       "firstWord": starts[i]})
    out.extend([0] * int(tail * RATE))
    duration = len(out) / RATE
    for i, s in enumerate(scenes):
        s["end"] = scenes[i + 1]["start"] if i + 1 < len(scenes) else duration
        s["lastWord"] = (starts[i + 1] if i + 1 < len(scenes) else len(words)) - 1

    with wave.open(str(cfg["outAudio"]), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(out.tobytes())

    def scene_of(i):
        return max(k for k, st in enumerate(starts) if st <= i)

    new_words = []
    for i, wd in enumerate(words):
        sh = shifts[scene_of(i)]
        text = wd["text"]
        for spoken, shown in display.items():
            text = text.replace(spoken, shown)
        new_words.append({"i": i, "text": text, "scene": scene_of(i),
                          "start": round(wd["start"] + sh, 3), "end": round(wd["end"] + sh, 3)})

    # captions: break on punctuation, at most 9 words and 58 characters
    groups, cur = [], []

    def length(ws):
        return sum(len(x["text"]) + 1 for x in ws) - 1

    def closes(ws):
        return ws[-1]["text"].rstrip("»").endswith((".", "?"))

    for i, w in enumerate(new_words):
        if cur and w["scene"] != cur[0]["scene"]:
            groups.append(cur)
            cur = []
        cur.append(w)
        end_sentence = w["text"].rstrip("»").endswith((".", ":", "?"))
        soft = w["text"].endswith(",")
        nxt_len = len(new_words[i + 1]["text"]) + 1 if i + 1 < len(new_words) else 0
        if end_sentence or (soft and len(cur) >= 4) or len(cur) >= 9 or length(cur) + nxt_len > 58:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)

    # lines of one or two words: a sentence opener joins the next line,
    # a sentence tail takes three words from the line before
    i = 0
    while i < len(groups):
        g = groups[i]
        same_prev = i > 0 and groups[i - 1][0]["scene"] == g[0]["scene"]
        same_next = i + 1 < len(groups) and groups[i + 1][0]["scene"] == g[0]["scene"]
        if len(g) <= 2 and closes(g):
            starts_sentence = not same_prev or closes(groups[i - 1])
            if starts_sentence and same_next and length(g) + 1 + length(groups[i + 1]) <= 58:
                groups[i + 1] = g + groups[i + 1]
                del groups[i]
                continue
            if not starts_sentence and len(groups[i - 1]) >= 6:
                groups[i] = groups[i - 1][-3:] + g
                groups[i - 1] = groups[i - 1][:-3]
        i += 1

    merged = []
    for g in groups:
        text = " ".join(w["text"] for w in g).replace("«", "").replace("».", ".").replace("»", "")
        merged.append({"text": text, "start": g[0]["start"], "end": g[-1]["end"], "scene": g[0]["scene"]})
    # a line stays until the next one starts (at most 0.9 s after its last word)
    for i, c in enumerate(merged):
        nxt = merged[i + 1]["start"] if i + 1 < len(merged) else duration
        c["hideAt"] = round(min(nxt, c["end"] + 0.9), 3)

    Path(cfg["outJson"]).write_text(json.dumps({
        "fps": fps, "duration": round(duration, 3), "frames": round(duration * fps),
        "scenes": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items()} for s in scenes],
        "words": new_words, "captions": merged,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    spoken = words[-1]["end"] - words[0]["start"]
    print(f"duration {duration:.2f} s ({int(duration // 60)}:{duration % 60:04.1f}), frames {round(duration * fps)}, "
          f"voice {spoken:.1f} s at {len(words) / spoken * 60:.0f} words a minute")
    for s in scenes:
        print(f"  {s['name']:12s} start {s['start']:7.2f}  voice {s['voiceStart']:7.2f}  end {s['end']:7.2f}")
    short = [c for c in merged if c["hideAt"] - c["start"] < 1.2]
    print(f"captions {len(merged)}, shorter than 1.2 s: {len(short)}")
    for c in short:
        print("   ", round(c["hideAt"] - c["start"], 2), c["text"])
    print("longest caption:", max(len(c["text"]) for c in merged), "characters")


if __name__ == "__main__":
    main()
