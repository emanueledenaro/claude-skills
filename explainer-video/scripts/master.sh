#!/bin/bash
# Master a rendered film: audio to -14 LUFS in two passes (the picture is copied),
# then print what the delivered file measures.
# Usage: master.sh raw.mp4 final.mp4
set -euo pipefail
IN="$1"; OUT="$2"
J=$(ffmpeg -hide_banner -i "$IN" -vn -af "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$J" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$IN" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "== format"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,codec_name:format=duration,size -of default=nw=1 "$OUT"
echo "== loudness (target: I near -14 LUFS, peak at or under -1 dBFS)"
ffmpeg -hide_banner -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^ +(I|Peak):" | tail -2
echo "== stills longer than 2 s (each one is a planned hold or an empty beat)"
ffmpeg -hide_banner -i "$OUT" -vf "freezedetect=n=0.003:d=2" -an -f null - 2>&1 | grep -o "freeze_[a-z]*: [0-9.]*" | paste - - - || true
echo "== silences longer than 0.4 s"
ffmpeg -hide_banner -i "$OUT" -af "silencedetect=n=-30dB:d=0.4" -vn -f null - 2>&1 | grep -o "silence_[a-z]*: [0-9.]*" | paste - - - || true
