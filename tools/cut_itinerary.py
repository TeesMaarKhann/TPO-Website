# Cuts the watercolour icons out of the itinerary tent card (assets/itinerary),
# with the paper made see-through, for the Itinerary page.
# Usage:
#   pdfimages -png IS_Golden_Tent_Card.pdf /tmp/card     # -> card-000.png, card-002.png
#   python3 tools/cut_itinerary.py /tmp/card-000.png /tmp/card-002.png
# Needs: pip install opencv-python-headless numpy pillow
import sys, os, cv2, numpy as np
from PIL import Image

PAGE1, PAGE2 = sys.argv[1], sys.argv[2]
OUT = 'assets/itinerary'
os.makedirs(OUT, exist_ok=True)

# name: (page, crop box measured on a 774px-wide copy of the card)
ICONS = {
    'haldi':        (1, (412, 540, 492, 618)),
    'plate':        (1, (264, 612, 378, 684)),
    'check-in':     (1, (408, 686, 488, 764)),
    'tea':          (1, (254, 748, 342, 822)),
    'disco':        (1, (412, 830, 498, 918)),
    'dinner':       (1, (262, 892, 376, 968)),
    'vidhi':        (2, (286, 266, 362, 348)),
    'horse':        (2, (414, 336, 510, 422)),
    'mangalashtak': (2, (282, 410, 372, 482)),
    'cocktail':     (2, (424, 618, 492, 698)),
    'check-out':    (2, (294, 940, 368, 1010)),
}

pages = {}
for n, path in ((1, PAGE1), (2, PAGE2)):
    pages[n] = np.array(Image.open(path).convert('RGB')).astype(np.float32)

for name, (pg, box) in ICONS.items():
    im = pages[pg]
    k = im.shape[1] / 774
    x0, y0, x1, y1 = (round(v * k) for v in box)
    a = im[y0:y1, x0:x1]
    h, w = a.shape[:2]
    hsv = cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_RGB2HSV)
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    paper = np.median(edge, axis=0)
    dist = np.sqrt(((a - paper) ** 2).sum(-1))
    alpha = np.clip((dist - 14) / 30, 0, 1)
    # paper grain: light and colourless -> drop
    alpha[(hsv[..., 1] < 18) & (hsv[..., 2] > 215)] = 0
    # fill enclosed pale parts (plates, cups) so they stay solid
    solid = (alpha > 0.35).astype(np.uint8)
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    ff = (1 - solid).astype(np.uint8)
    m = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(w):
        for y in (0, h - 1):
            if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
    for y in range(h):
        for x in (0, w - 1):
            if ff[y, x] == 1: cv2.floodFill(ff, m, (x, y), 2)
    inside = cv2.GaussianBlur((ff != 2).astype(np.float32), (0, 0), 1.0)
    alpha = np.maximum(alpha, inside)
    rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    img = img.crop(img.getbbox() or (0, 0, w, h))
    img.thumbnail((200, 200), Image.LANCZOS)
    img.save(f'{OUT}/{name}.webp', quality=88, method=6)
    print(name, img.size)
