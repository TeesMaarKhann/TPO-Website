# Makes the welcome letter pieces from the illustrated card
# (assets/invite/letter.webp), with the card's paper and border removed so
# they sit straight on the page:
#   assets/letter-art.webp      the couple, the dog and the flower behind them
#   assets/letter-stem.webp     the faint stem that sits behind the words
#   assets/letter-divider.webp  the green divider under "Dear <guest>,"
# The words themselves are written by the site.
# Usage: python3 tools/cut_letter.py
# Needs: pip install opencv-python-headless numpy pillow
import cv2, numpy as np
from PIL import Image
im = np.array(Image.open('assets/invite/letter.webp').convert('RGB'))
hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
H, W = im.shape[:2]

# Paint the words (and the divider) out of the card
y0, y1, x0, x1 = 1060, 1830, 90, 1160
mask = np.zeros((H, W), np.uint8)
rh, rs = h[y0:y1, x0:x1], s[y0:y1, x0:x1]
mask[y0:y1, x0:x1] = (rs > 48) | (((rh >= 135) | (rh <= 4)) & (rs > 33))
mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=3)
clean = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA).astype(np.float32)

# Make the paper see-through. Faint colours keep their hue but fade out.
paper = np.median(clean[300:1000, 60:120].reshape(-1, 3), axis=0)
diff = clean - paper
dist = np.sqrt((diff ** 2).sum(-1))
D = 70.0
alpha = np.clip((dist - 3) / (D - 3), 0, 1)
scale = np.where(dist > 0, np.maximum(D / np.maximum(dist, 1e-3), 1), 1)
colour = paper + diff * scale[..., None]

# Inside the drawn figures (enclosed by the dark ink lines) stays solid
ink = ((v < 150) | ((s > 70) & (v < 215))).astype(np.uint8)
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
ff = (1 - ink).astype(np.uint8); m = np.zeros((H + 2, W + 2), np.uint8)
for x in range(0, W, 4):
    for y in (0, H - 1):
        if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
for y in range(0, H, 4):
    for x in (0, W - 1):
        if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
inside = cv2.GaussianBlur((ff != 2).astype(np.float32), (0, 0), 1.2)
inside[1000:] = 0  # only the figures, not the stem
solid = inside > 0.5
alpha = np.maximum(alpha, inside)
colour[solid] = clean[solid]
rgba = np.dstack([colour, alpha * 255]).clip(0, 255).astype(np.uint8)

def save(box, path):
    out = Image.fromarray(rgba, 'RGBA').crop(box)
    out = out.crop(out.getbbox())
    out.save(path, quality=86, method=6)
    print(path, out.size)

save((56, 56, W - 56, 972), 'assets/letter-art.webp')
save((56, 995, W - 56, H - 56), 'assets/letter-stem.webp')

# The divider: the strongly coloured green pixels around it
y0, y1, x0, x1 = 1205, 1262, 430, 830
d = hsv[y0:y1, x0:x1]
a = np.clip((d[..., 1].astype(np.float32) - 30) / 40, 0, 1)
a[(d[..., 0] < 25) | (d[..., 0] > 95)] = 0
Image.fromarray(np.dstack([im[y0:y1, x0:x1], a * 255]).astype(np.uint8), 'RGBA') \
    .save('assets/letter-divider.webp', quality=90, method=6)
