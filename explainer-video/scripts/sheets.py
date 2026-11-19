"""Contact sheets for looking at a film without playing it.

  python3 sheets.py stills <folder>        folder of element-NNNN.jpeg stills
                                           (npx remotion render ... --frames=a,b,c
                                           --image-format=jpeg --sequence): twelve
                                           per sheet, with the second of each
  python3 sheets.py phone <film.mp4> <out-prefix>
                                           one frame every 3 s at phone width,
                                           thirty per sheet
"""
import subprocess
import sys
from pathlib import Path


def stills(folder, fps=30):
    d = Path(folder)
    files = sorted(p.name for p in d.glob("element-*.jpeg"))
    for n in range(0, len(files), 12):
        chunk = files[n:n + 12]
        ins = [x for f in chunk for x in ("-i", str(d / f))]
        lab = "".join(f"[{i}:v]scale=800:450[v{i}];" for i in range(len(chunk)))
        cat = "".join(f"[v{i}]" for i in range(len(chunk)))
        fc = f"{lab}{cat}concat=n={len(chunk)}:v=1:a=0,tile=3x4:padding=8:margin=8:color=0x555555"
        out = d / f"sheet{n // 12 + 1}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, "-frames:v", "1", str(out)], check=True)
        print(out.name + ":", " ".join(f"{int(f.split('-')[1].split('.')[0]) / fps:.1f}" for f in chunk))


def phone(film, prefix):
    vf = "fps=1/3,scale=400:-2,tile=6x5:padding=4:margin=4:color=0x555555"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", film, "-vf", vf, f"{prefix}-%d.jpg"], check=True)
    print("tiles are 3 s apart, starting near 1.5 s:", " ".join(sorted(p.name for p in Path(prefix).parent.glob(Path(prefix).name + "-*.jpg"))))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "stills":
        stills(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == "phone":
        phone(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
