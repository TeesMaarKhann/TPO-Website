# Makes the welcome letter (assets/letter.webp) from the illustrated card
# (assets/invite/letter.webp): the words on the card are painted out so the
# site can write "Dear <guest>," and the message itself. The green divider
# is kept as its own see-through image (assets/letter-divider.webp).
# Usage: python3 tools/cut_letter.py
# Needs: pip install opencv-python-headless numpy pillow
import cv2, numpy as np
from PIL import Image
im = np.array(Image.open('assets/invite/letter.webp').convert('RGB'))
hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)
h, s = hsv[..., 0], hsv[..., 1]

# The divider: the strongly coloured green pixels around it
y0, y1, x0, x1 = 1205, 1262, 430, 830
d = hsv[y0:y1, x0:x1]
alpha = np.clip((d[..., 1].astype(np.float32) - 30) / 40, 0, 1)
alpha[(d[..., 0] < 25) | (d[..., 0] > 95)] = 0  # green only
div = np.dstack([im[y0:y1, x0:x1], alpha * 255]).astype(np.uint8)
Image.fromarray(div, 'RGBA').save('assets/letter-divider.webp', quality=90, method=6)

# The words: pink text and the divider, painted over from the background
y0, y1, x0, x1 = 1060, 1830, 90, 1160
mask = np.zeros(im.shape[:2], np.uint8)
rh, rs = h[y0:y1, x0:x1], s[y0:y1, x0:x1]
mask[y0:y1, x0:x1] = (rs > 48) | (((rh >= 135) | (rh <= 4)) & (rs > 33))
mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=3)
out = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
Image.fromarray(out).save('assets/letter.webp', quality=84, method=6)
print('ok')
