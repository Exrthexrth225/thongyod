"""Cut a sticker sheet laid out on a grid into one WebP per cell (Earth's game stickers, racers, souvenirs).
Keeps every piece in a cell bigger than a few pixels (so hat + glasses stay together), drops specks, trims,
centres on a square (or keeps the cell's baseline with --baseline), and saves at SIZE px.

usage: python3 grid.py SHEET.png OUT_DIR COLS ROWS name1,name2,... [--size 256] [--baseline] [--min 0.01 (drop pieces smaller than this share of the biggest)]
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sheet, out, cols, rows, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5].split(',')
size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 256
baseline = '--baseline' in sys.argv
os.makedirs(out, exist_ok=True)
a = np.array(Image.open(sheet).convert('RGBA'))
H, W = a.shape[:2]
ch, cw = H / rows, W / cols
assert len(names) == cols * rows, (len(names), cols * rows)
# Label the whole sheet once and give each piece to the cell its centre is in, so art that pokes over a cell
# line stays whole and never shows up in the neighbour's picture.
al = a[..., 3]
solid = al >= 96
lab, n = ndimage.label(ndimage.binary_closing(solid, iterations=2))
sizes = ndimage.sum(solid, lab, range(1, n + 1))
centres = ndimage.center_of_mass(solid, lab, range(1, n + 1))
cell_of = [min(rows - 1, int(cy // ch)) * cols + min(cols - 1, int(cx // cw)) for cy, cx in centres]
ratio = float(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 0.01
crops = []
for k, name in enumerate(names):
    mine = [i for i in range(n) if cell_of[i] == k]
    biggest = max(sizes[i] for i in mine)
    keep = np.isin(lab, [i + 1 for i in mine if sizes[i] >= max(400, biggest * ratio)])
    keep = ndimage.binary_dilation(keep, iterations=3)
    piece = a.copy()
    piece[..., 3] = np.where(keep, al, 0)
    ys, xs = np.nonzero(piece[..., 3] > 8)
    crops.append((name, piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1], ys.max()))
side = max(max(cr.shape[:2]) for _, cr, _ in crops)
for name, cr, _ in crops:
    h, w = cr.shape[:2]
    if baseline:
        # same scale for all, feet on one line
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(Image.fromarray(cr), ((side - w) // 2, side - h))
    else:
        s = max(h, w)
        canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        canvas.alpha_composite(Image.fromarray(cr), ((s - w) // 2, (s - h) // 2))
    canvas.resize((size, size), Image.LANCZOS).save(f'{out}/{name}.webp', 'WEBP', quality=90, method=6)
print('cut', len(crops), 'into', out)
