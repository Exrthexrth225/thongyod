"""Adult eating flipbook (DECISIONS #108): a 4x1 sheet (open mouth → bite → chew → happy) becomes eat1..eat4.webp on
the adult canvas. One scale for all 4 (frame 1 is fitted onto the main.webp box: same width, bottom and
centre), and frames 2–4 are nudged onto frame 1 by matching their outlines, so only the mouth seems to move.

usage: python3 eat.py SHEET.png SPECIES_DIR   (SPECIES_DIR holds main.webp; writes eat1..eat4.webp there)
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

sheet, d = sys.argv[1], sys.argv[2]
ref = np.array(Image.open(f'{d}/main.webp').convert('RGBA'))  # same size as the resting pose
CH, CW = ref.shape[:2]
rys, rxs = np.nonzero(ref[..., 3] >= 128)
ref_w, ref_bottom, ref_cx = rxs.max() - rxs.min() + 1, rys.max(), (rxs.max() + rxs.min()) / 2

a = np.array(Image.open(sheet).convert('RGBA')).astype(np.float32)
a[..., 3][a[..., 3] < 24] = 0
W = a.shape[1]
frames = []
for k in range(4):
    cell = a[:, int(k * W / 4):int((k + 1) * W / 4)].copy()
    solid = cell[..., 3] >= 96
    lab, n = ndimage.label(ndimage.binary_closing(solid, iterations=2))
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(60, sizes.max() * 0.002)])
    cell[..., 3] = np.where(ndimage.binary_dilation(keep, iterations=3), cell[..., 3], 0)
    frames.append(cell)

def bbox(img):
    ys, xs = np.nonzero(img[..., 3] >= 128)
    return xs.min(), xs.max(), ys.min(), ys.max()

# outline-match frames 2–4 onto frame 1 (whole-pixel shift), inside each cell
def shift_to(base, img, r=12):
    A = base[..., 3] / 255
    best = (1e18, 0, 0)
    for dy in range(-r, r + 1, 1):
        for dx in range(-r, r + 1, 1):
            B = np.roll(np.roll(img[..., 3] / 255, dy, 0), dx, 1)
            dd = ((A - B) ** 2).sum()
            if dd < best[0]:
                best = (dd, dy, dx)
    return np.roll(np.roll(img, best[1], 0), best[2], 1), best[1:]

for k in range(1, 4):
    frames[k], s = shift_to(frames[0], frames[k])
    print('frame', k + 1, 'shift', s)

x0, x1, y0, y1 = bbox(frames[0])
scale = ref_w / (x1 - x0 + 1)
print('scale', round(scale, 3))
for k, f in enumerate(frames):
    img = Image.fromarray(f.clip(0, 255).astype(np.uint8))
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ox = round(ref_cx - ((x0 + x1) / 2) * scale)
    oy = round(ref_bottom - y1 * scale)
    canvas.alpha_composite(img, (ox, oy)) if ox >= 0 and oy >= 0 else canvas.paste(img, (ox, oy), img)
    canvas.save(f'{d}/eat{k + 1}.webp', 'WEBP', quality=90, method=6)
print('done', d)
