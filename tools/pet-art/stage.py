"""Baby / teen pose sheets (DECISIONS #105): 3x2 sheet, row by row main, blink, happy, eat, sleep, shy.
Cuts the 6 poses, makes blink = main with only the eyes from the eyes-closed drawing, and places all poses on the
adult canvas (720 x 581 for the dragon) with one shared scale, the same baseline and the body centred, so the Pet
component can swap them exactly like the adult poses. Raster (no tracing): the sheets are already clean.

usage: python3 stage.py SHEET.png OUT_DIR [canvas_w canvas_h]
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

POSES = ['main', 'blink', 'happy', 'eat', 'sleep', 'shy']
sheet, out = sys.argv[1], sys.argv[2]
CW, CH = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (720, 581)
BOTTOM, SIDE, TOP = 10, 14, 14
os.makedirs(out, exist_ok=True)

a = np.array(Image.open(sheet).convert('RGBA')).astype(np.float32)
al = a[..., 3]
al[al < 24] = 0  # faint specks
solid = ndimage.binary_closing(al >= 128, iterations=3)
lab, n = ndimage.label(solid)
sizes = ndimage.sum(solid, lab, range(1, n + 1))
big = [i + 1 for i, s in enumerate(sizes) if s > 8000]
assert len(big) == 6, (len(big), sorted(sizes)[-8:])
objs = []
for i in big:
    ys, xs = np.nonzero(lab == i)
    objs.append(dict(id=i, cy=ys.mean(), cx=xs.mean()))
objs.sort(key=lambda o: o['cy'])
order = [o for k in range(2) for o in sorted(objs[k * 3:(k + 1) * 3], key=lambda o: o['cx'])]

pieces = {}
for name, o in zip(POSES, order):
    m = ndimage.binary_fill_holes(lab == o['id'])
    grow = ndimage.binary_dilation(m, iterations=4)
    piece = a.copy()
    piece[..., 3] = np.where(grow, al, 0)
    ys, xs = np.nonzero(piece[..., 3] > 0)
    crop = piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
    crop[crop[..., 3] == 0, :3] = 0
    op = crop[..., 3] >= 128
    oys, oxs = np.nonzero(op)
    pieces[name] = dict(img=crop, base=int(oys.max()), cx=float(oxs.mean()))

# blink: main body, eyes from the closed-eyes drawing (aligned by alpha), feathered
main, closed = pieces['main']['img'], pieces['blink']['img']
best = (1e18, 0, 0)
r = 10
H, W = main.shape[:2]
for dy in range(-r, r + 1):
    for dx in range(-r, r + 1):
        c = np.zeros((H, W))
        y0, x0 = max(0, dy), max(0, dx)
        src = closed[max(0, -dy):, max(0, -dx):, 3] / 255
        hh, ww = min(H - y0, src.shape[0]), min(W - x0, src.shape[1])
        c[y0:y0 + hh, x0:x0 + ww] = src[:hh, :ww]
        d = ((main[..., 3] / 255 - c) ** 2).sum()
        if d < best[0]:
            best = (d, dy, dx)
_, dy, dx = best
aligned = np.zeros_like(main)
y0, x0 = max(0, dy), max(0, dx)
src = closed[max(0, -dy):, max(0, -dx):]
hh, ww = min(H - y0, src.shape[0]), min(W - x0, src.shape[1])
aligned[y0:y0 + hh, x0:x0 + ww] = src[:hh, :ww]
diff = np.abs(main[..., :3] - aligned[..., :3]).sum(-1) * (main[..., 3] > 200) * (aligned[..., 3] > 200)
eyes = ndimage.binary_opening(diff > 90, iterations=1)
lb, nn = ndimage.label(eyes)
sz = ndimage.sum(eyes, lb, range(1, nn + 1))
keep = np.isin(lb, [i + 1 for i, s in enumerate(sz) if s > 25])
keep[int(H * 0.8):] = False
feather = ndimage.gaussian_filter(ndimage.binary_dilation(keep, iterations=6).astype(float), 2.0)[..., None]
blink = main.copy()
blink[..., :3] = main[..., :3] * (1 - feather) + aligned[..., :3] * feather
pieces['blink'] = dict(pieces['main'], img=blink)
print('blink shift', (dy, dx), 'eye px', int(keep.sum()))

# one scale for all poses so the biggest one fits the adult canvas
left = max(p['cx'] for p in pieces.values())
right = max(p['img'].shape[1] - p['cx'] for p in pieces.values())
up = max(p['base'] for p in pieces.values())
scale = min((CW / 2 - SIDE) / max(left, right), (CH - BOTTOM - TOP) / up)
print('scale', round(scale, 3))
for name, p in pieces.items():
    img = Image.fromarray(p['img'].clip(0, 255).astype(np.uint8))
    w, h = img.size
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    x0 = round(CW / 2 - p['cx'] * scale)
    y0 = round(CH - BOTTOM - p['base'] * scale)
    canvas.alpha_composite(img, (x0, y0))
    canvas.save(f'{out}/{name}.webp', 'WEBP', quality=90, method=6)
print('done', out)
