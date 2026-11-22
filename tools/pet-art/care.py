"""Care poses (DECISIONS #120): a 3x3 sheet, rows baby / teen / adult, columns sad, bath, refuse (image/36, 37).
Each pose is placed on its stage's canvas at the same size as that stage's existing main pose (matched by the sad
pose, which has the main pose's body), same baseline, body centred, so Pet can swap to them like any other pose.

usage: python3 care.py SHEET.png SPECIES ASSET_DIR   (ASSET_DIR = apps/web/src/assets/pets/v2)
"""
import os, sys
import numpy as np
from PIL import Image

sheet, species, base = sys.argv[1], sys.argv[2], sys.argv[3]
ROWS = [f'{species}-baby', f'{species}-teen', species]
COLS = ['sad', 'bath', 'refuse']
BOTTOM = 10

a = np.array(Image.open(sheet).convert('RGBA')).astype(np.float32)
a[a[..., 3] < 24, 3] = 0
H, W = a.shape[:2]

def tight(img):
    ys, xs = np.nonzero(img[..., 3] > 0)
    return img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def stats(img):
    op = img[..., 3] >= 128
    ys, xs = np.nonzero(op)
    return dict(area=op.sum(), base=int(ys.max()), cx=float(xs.mean()))

for r, folder in enumerate(ROWS):
    main = np.array(Image.open(f'{base}/{folder}/main.webp').convert('RGBA')).astype(np.float32)
    CH, CW = main.shape[:2]
    ref = stats(main)
    cells = [tight(a[r * H // 3:(r + 1) * H // 3, c * W // 3:(c + 1) * W // 3]) for c in range(3)]
    scale = (ref['area'] / stats(cells[0])['area']) ** 0.5  # sad ≈ main body
    for name, cell in zip(COLS, cells):
        s = stats(cell)
        # Never cut the top (bath bubbles reach high): shrink this pose a little if it would.
        k = min(scale, (ref['base'] - 2) / max(1, s['base']), CW / cell.shape[1])
        img = Image.fromarray(cell.clip(0, 255).astype(np.uint8))
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        x0 = min(max(0, round(CW / 2 - s['cx'] * k)), CW - img.width)  # keep fins inside the canvas
        y0 = round(ref['base'] - s['base'] * k)
        canvas.alpha_composite(img, (x0, y0))
        canvas.save(f'{base}/{folder}/{name}.webp', 'WEBP', quality=90, method=6)
    print(folder, 'scale', round(scale, 3))
