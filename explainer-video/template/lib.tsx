// Shared by every version of the film: the timeline, cues on spoken words,
// easing, captions and the music volume. Copy to src/lib.tsx.
// timeline.json is written by scripts/build_timeline.py.
import React from "react";
import { Easing, interpolate } from "remotion";
import timeline from "./timeline.json";

export const TL = timeline;
export const FPS = TL.fps;
export const W = 1920;
export const H = 1080;
export const M = 96; // safe margin

export const scene = (name: string) => {
  const s = TL.scenes.find((x) => x.name === name);
  if (!s) throw new Error(`scene ${name} is not in the timeline`);
  return s;
};

const norm = (s: string) => s.toLowerCase().replace(/[«».,:;?!"]/g, "");

/**
 * Second at which the voice starts the word `text` in a scene (nth = 0 is the
 * first hit). The match is a prefix on the lowercased word, so "per" also hits
 * "perché": pass a longer prefix or an nth, and let the throw catch a typo.
 */
export const cue = (name: string, text: string, nth = 0): number => {
  const idx = TL.scenes.findIndex((x) => x.name === name);
  const hits = TL.words.filter((w) => w.scene === idx && norm(w.text).startsWith(norm(text)));
  const hit = hits[nth];
  if (!hit) throw new Error(`word "${text}" (${nth}) is not spoken in scene ${name}`);
  return hit.start;
};

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Progress 0 to 1 of an entrance that starts at second `at`. */
export const enter = (t: number, at: number, dur = 0.45) =>
  interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: easeOut });

/** Progress 0 to 1 of an exit that starts at second `at`. */
export const leave = (t: number, at: number, dur = 0.22) =>
  interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: easeIn });

/** Progress 0 to 1 between two seconds, eased both ways: for long moves and drawn lines. */
export const glide = (t: number, from: number, to: number) =>
  interpolate(t, [from, to], [0, 1], { ...clamp, easing: easeInOut });

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Stable pseudo-random number, so a frame redraws identically. */
export const rnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type InProps = {
  t: number;
  at: number;
  out?: number;
  dur?: number;
  dy?: number;
  dx?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Enters rising a few pixels, leaves faster. Renders nothing outside its life. */
export const In: React.FC<InProps> = ({ t, at, out, dur = 0.45, dy = 28, dx = 0, style, children }) => {
  const a = enter(t, at, dur);
  const b = out === undefined ? 0 : leave(t, out);
  if (a === 0 || b === 1) return null;
  return (
    <div style={{ opacity: a * (1 - b), translate: `${dx * (1 - a)}px ${dy * (1 - a) - 20 * b}px`, ...style }}>{children}</div>
  );
};

type CaptionLook = { fontFamily: string; fontWeight: number; color: string; background: string; radius?: number };

/** Captions: one line, always in the same place. Keep subjects above y = 920. */
export const Captions: React.FC<{ t: number; look: CaptionLook }> = ({ t, look }) => {
  const c = TL.captions.find((x) => t >= x.start - 0.08 && t < x.hideAt);
  if (!c) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: M, textAlign: "center" }}>
      <span style={{ fontFamily: look.fontFamily, fontWeight: look.fontWeight, fontSize: 40, color: look.color, background: look.background, padding: "10px 26px", borderRadius: look.radius ?? 0 }}>
        {c.text}
      </span>
    </div>
  );
};

type MusicPlan = {
  /** volume under the voice */
  under?: number;
  /** seconds [from, to] of full silence before the payoff */
  hush?: [number, number];
  /** seconds [from, to] of the loudest stretch, on the payoff */
  peak?: [number, number];
};

/**
 * Volume of the music per frame: louder for the opening second, low under the
 * voice, silent on the hush, loudest on the peak, up after the last word, then out.
 * Use as <Audio src={...} volume={musicVolume({ hush, peak })} />.
 */
export const musicVolume = ({ under = 0.11, hush, peak }: MusicPlan = {}) => (frame: number) => {
  const t = frame / FPS;
  let v = Math.max(under, interpolate(t, [0, 0.7, 1.2], [0.32, 0.32, under], clamp));
  if (peak) v += 0.2 * interpolate(t, [peak[0] - 0.2, peak[0] + 0.3, peak[1], peak[1] + 1], [0, 1, 1, 0], clamp);
  if (hush) v *= interpolate(t, [hush[0] - 0.5, hush[0], hush[1], hush[1] + 0.5], [1, 0, 0, 1], clamp);
  const lastWord = TL.words[TL.words.length - 1].end;
  v += interpolate(t, [lastWord, lastWord + 0.6], [0, 0.2], clamp);
  return v * interpolate(t, [TL.duration - 1.6, TL.duration - 0.1], [1, 0], clamp);
};
