# Makes the phone versions of the invites (assets/mobile) with the paper made
# transparent, so every page shows the same cream background behind the art.
# Usage: python3 tools/cut_mobile.py assets/invite assets/mobile
# Needs: pip install opencv-python-headless numpy pillow
import sys, os, cv2, numpy as np
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
# name: fill enclosed areas of the drawing so pale skin/clothes stay solid
# The cover is cut down to just the illustration; the home page writes the
# names and dates itself.
CROP = {'cover': (150, 100, 870, 875)}
NAMES = {'cover': True, 'family': False, 'haldi': True, 'sangeet': True, 'wedding': True, 'cocktail': True}
for name, fill in NAMES.items():
    im = np.array(Image.open(f'{SRC}/{name}.jpg').convert('RGB')).astype(np.float32)
    h, w = im.shape[:2]
    hsv = cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_RGB2HSV)
    paper_px = im[(hsv[..., 1] < 22) & (hsv[..., 2] > 205)]
    paper = np.median(paper_px, axis=0)
    dist = np.sqrt(((im - paper) ** 2).sum(-1))
    alpha = np.clip((dist - 16) / 26, 0, 1)
    # faint background motifs: light and pale -> drop
    alpha[(hsv[..., 1] < 45) & (hsv[..., 2] > 185)] = 0
    if fill:
        solid = (alpha > 0.35).astype(np.uint8)
        solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        ff = (1 - solid).astype(np.uint8); m = np.zeros((h + 2, w + 2), np.uint8)
        for x in range(0, w, 4):
            for y in (0, h - 1):
                if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
        for y in range(0, h, 4):
            for x in (0, w - 1):
                if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
        inside = cv2.GaussianBlur((ff != 2).astype(np.float32), (0, 0), 1.2)
        alpha = np.maximum(alpha, inside)
    rgba = np.dstack([im, alpha * 255]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    if name in CROP: img = img.crop(CROP[name])
    img.save(f'{OUT}/{name}.webp', quality=86, method=6)
    print(name, img.size)
