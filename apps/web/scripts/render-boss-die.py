"""Bake the rounded resin die into transform-only sprite sheets. Requires numpy and Pillow."""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "src/assets/boss/die"
SIZE, COLS, ROWS = 144, 8, 6
FACES = ((3, 4, 2, 5, 1, 6), (3, 4, 6, 1, 2, 5), (6, 1, 2, 5, 3, 4),
         (1, 6, 2, 5, 4, 3), (3, 4, 1, 6, 5, 2), (4, 3, 2, 5, 6, 1))
PIPS = ((), (4,), (0, 8), (0, 4, 8), (0, 2, 6, 8), (0, 2, 4, 6, 8), (0, 2, 3, 5, 6, 8))
LIGHT = np.array([-.44, .73, .52])
HALF_LIGHT = LIGHT + [0, 0, 1]
HALF_LIGHT /= np.linalg.norm(HALF_LIGHT)


def rotation(angles):
    x, y, z = np.radians(angles)
    sx, sy, sz = np.sin([x, y, z])
    cx, cy, cz = np.cos([x, y, z])
    return np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @ np.array(
        [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])


def surface(t):
    # Orthographic rays into one solid rounded box. All edges share the same radius.
    remaining = (1 - t) ** 2
    rock = np.sin((t - .73) * 26) * max(0, 1 - t) * 35 if t > .73 else 0
    rot = rotation([16 + 445 * remaining, -18 + 315 * remaining + rock, -5 + 105 * remaining])
    coords = ((np.arange(SIZE * 2) + .5) / (SIZE * 2) - .5) * 3.32
    x, y = np.meshgrid(coords, -coords)
    origin = np.stack([x, y, np.full_like(x, 3)], axis=-1) @ rot
    ray = -rot[2]
    dist = np.zeros_like(x)
    for _ in range(42):
        pos = origin + dist[..., None] * ray
        delta = np.abs(pos) - .74
        sdf = np.linalg.norm(delta.clip(0), axis=-1) + np.minimum(delta.max(axis=-1), 0) - .26
        dist += np.clip(sdf, 0, .45)
    hit = (sdf < .001) & (dist < 5)
    pos = pos[hit]
    normal = np.sign(pos) * (np.abs(pos) - .74).clip(0)
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    axis = np.abs(pos).argmax(axis=1)
    side = 2 * axis + (pos[np.arange(len(pos)), axis] < 0)
    return rot, pos, normal, side, hit


def draw(model, faces):
    rot, pos, normal, side, hit = model
    normals = normal.copy()
    ink = np.zeros(len(pos))
    for face, value in enumerate(faces):
        mask = side == face
        u, v = [k for k in range(3) if k != face // 2]
        for dot in PIPS[value]:
            dx = (pos[:, u] - (dot % 3 - 1) * .46) / .15
            dy = (pos[:, v] - (dot // 3 - 1) * .46) / .15
            radius = np.hypot(dx, dy)
            inside = mask & (radius < 1)
            ink[inside] = np.clip((1 - radius[inside]) * 10, 0, 1)
            normals[inside, u] -= .85 * dx[inside]
            normals[inside, v] -= .85 * dy[inside]
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    world = normals @ rot.T
    diffuse = (world @ LIGHT).clip(0)
    gloss = (world @ HALF_LIGHT).clip(0) ** 28
    resin = np.array([254, 240, 208]) * (.67 + .36 * diffuse[:, None])
    pigment = np.array([52, 39, 42]) * (.78 + .4 * diffuse[:, None])
    rgb = resin * (1 - ink[:, None]) + pigment * ink[:, None] + 32 * gloss[:, None]
    pixels = np.zeros((*hit.shape, 4), dtype=np.uint8)
    pixels[hit, :3] = rgb.clip(0, 255)
    pixels[hit, 3] = 255
    return Image.fromarray(pixels).resize((SIZE, SIZE), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    sheets = [Image.new("RGBA", (COLS * SIZE, ROWS * SIZE)) for _ in FACES]
    for frame in range(COLS * ROWS):
        model = surface(frame / (COLS * ROWS - 1))
        for sheet, faces in zip(sheets, FACES):
            sheet.paste(draw(model, faces), (frame % COLS * SIZE, frame // COLS * SIZE))
    for value, sheet in enumerate(sheets, 1):
        sheet.save(OUT / f"roll-{value}.webp", quality=88, method=5)
