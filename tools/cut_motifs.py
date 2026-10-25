# Cuts the small background motifs out of the invites, for the pieces that
# float up behind each panel (assets/motifs).
# The wedding flower and leaf (marigold.svg, leaf.svg) are drawn by hand to
# match, because on the invite they always sit under the film strip or text.
# Usage: python3 tools/cut_motifs.py
# Needs: pip install numpy pillow
import numpy as np
from PIL import Image, ImageFilter

INV = 'assets/invite/'
OUT = 'assets/motifs/'

# name: (invite, crop box in px of the 1000x1600 invite, how to cut)
PIECES = {
    'flower':  ('family.jpg',  (78, 83, 122, 127), 'ink'),
    'flower2': ('haldi.jpg',   (78, 98, 122, 142), 'ink'),
    'sparkle': ('sangeet.jpg', (106, 999, 160, 1056), 'ink'),
    'sparkle2':('sangeet.jpg', (380, 1300, 432, 1356), 'ink'),
    'bulb':    ('cocktail.jpg',(22, 16, 70, 64), 'glow'),
}


def paper_of(a):
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return np.median(edge, axis=0)


for name, (src, box, how) in PIECES.items():
    a = np.asarray(Image.open(INV + src).convert('RGB').crop(box)).astype(np.float32)
    h, w = a.shape[:2]
    paper = paper_of(a)
    if how == 'ink':
        # How far each pixel is from the paper colour = how much motif is there.
        dist = np.sqrt(((a - paper) ** 2).sum(-1))
        alpha = np.clip((dist - 7) / (np.percentile(dist, 99) - 7), 0, 1)
        # Smooth out the paper grain inside the shape.
        alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8))
                           .filter(ImageFilter.GaussianBlur(.8))).astype(np.float32) / 255
        alpha = np.clip((alpha - .12) / .6, 0, 1)
        # Paint every pixel the motif's own colour; alpha carries the shape.
        colour = (a * alpha[..., None]).sum((0, 1)) / max(alpha.sum(), 1)
        rgb = np.broadcast_to(colour, a.shape)
        # Fade the very edge so no crop line shows.
        yy, xx = np.mgrid[0:h, 0:w]
        r = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2))
        alpha *= np.clip((1 - r) / .15, 0, 1)
    else:
        # Fairy light: the wire runs right through it, so rebuild it from the
        # invite's own colours: a white core inside a warm yellow glow.
        hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert('HSV')).astype(np.float32)
        lum = a.mean(-1)
        core = a[lum >= np.percentile(lum, 97)].mean(0)
        glow = a[hsv[..., 1] >= np.percentile(hsv[..., 1], 90)].mean(0)
        glow = paper + (glow - paper) * 2.2          # the glow is faint; lift it
        yy, xx = np.mgrid[0:h, 0:w]
        r = np.hypot(xx - w / 2 + .5, yy - h / 2 + .5) / (w / 2)
        t = np.clip((r - .2) / .1, 0, 1)[..., None]  # 0 in the core, 1 in the glow
        rgb = core * (1 - t) + glow * t
        alpha = np.where(r < .25, 1, np.clip(1 - (r - .25) / .75, 0, 1) ** 1.6 * .85)
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    img.save(OUT + name + '.webp', lossless=True, method=6)
    print(name, img.size)

# Background tile for the Haldi and family pages: the flower in the same
# staggered grid as on the invites (every 200px, offset by 100px).
f = Image.open(OUT + 'flower.webp')
tile = Image.new('RGBA', (200, 200), (0, 0, 0, 0))
for x, y in ((50, 50), (150, 150)):
    tile.alpha_composite(f, (x - f.width // 2, y - f.height // 2))
tile.save(OUT + 'flower-tile.webp', lossless=True, method=6)
print('flower-tile', tile.size)
