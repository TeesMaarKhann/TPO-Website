# Used once to cut the desktop pieces in assets/desk from the invite images.
# Usage: python3 tools/cut_pieces.py <folder with clean/ invite images> assets/desk
# Needs: pip install opencv-python-headless numpy pillow
# Cut each invite into pieces with transparent backgrounds for the desktop layout.
import sys, json, cv2, numpy as np
from PIL import Image
S, OUT = sys.argv[1], sys.argv[2]
SRC = {'haldi':'clean/haldi.png','sangeet':'clean/sangeet.png','wedding':'clean/wedding.jpg',
       'wedding-day':'clean/wedding-day.jpg',
       'cocktail':'clean/cocktail.jpg','family':'clean/family.png','cover':'clean/cover.png'}
# piece: (source, [rects as fractions], fill_holes, max output width)
P = {
 'haldi-text':   ('haldi',  [(.17,.07,.83,.55)], False, 1100),
 'haldi-art':    ('haldi',  [(0,.57,1,1)], True, 1700),
 'sangeet-dance':('sangeet',[(.08,0,1,.655)], True, 1600),
 'sangeet-dog':  ('sangeet',[(0,.635,.535,.82),(0,.82,.6,1)], True, 1200),
 'sangeet-text': ('sangeet',[(.525,.69,.93,.91)], False, 900),
 'wedding-strip':('wedding',[(0,0,.57,.77),(0,.77,.76,1)], True, 1500),
 'wedding-title':('wedding',[(.59,.08,.97,.27)], False, 1000),
 'wedding-text': ('wedding',[(.575,.36,.97,.68)], False, 1000),
 'wedding-text-day': ('wedding-day',[(.575,.36,.97,.68)], False, 1000),
 'family-head':  ('family', [(.1,.07,.9,.25)], False, 1200),
 'family-ishita':('family', [(.08,.27,.92,.555)], False, 1200),
 'family-sarvesh':('family',[(.08,.62,.92,.92)], False, 1200),
 'family-orn':   ('family', [(.33,.575,.67,.61)], False, 500),
}
cache={}
def src(n):
    if n not in cache:
        cache[n]=np.array(Image.open(f'{S}/{SRC[n]}').convert('RGB')).astype(np.float32)
    return cache[n]
info={}
for name,(sname,rects,fill,maxw) in P.items():
    im=src(sname); H,W=im.shape[:2]
    xs=[r[0] for r in rects]+[r[2] for r in rects]; ys=[r[1] for r in rects]+[r[3] for r in rects]
    X0,Y0,X1,Y1=int(min(xs)*W),int(min(ys)*H),int(max(xs)*W),int(max(ys)*H)
    crop=im[Y0:Y1,X0:X1]; h,w=crop.shape[:2]
    region=np.zeros((h,w),np.uint8)
    for x0,y0,x1,y1 in rects:
        region[int(y0*H)-Y0:int(y1*H)-Y0, int(x0*W)-X0:int(x1*W)-X0]=1
    # paper colour = bright, unsaturated pixels of this crop
    hsv=cv2.cvtColor(crop.astype(np.uint8),cv2.COLOR_RGB2HSV)
    paper_px=crop[(hsv[...,1]<22)&(hsv[...,2]>205)]
    paper=np.median(paper_px,axis=0) if len(paper_px)>500 else np.array([235,233,229.])
    dist=np.sqrt(((crop-paper)**2).sum(-1))
    alpha=np.clip((dist-16)/26,0,1)
    # faint background motifs: light and nearly grey -> drop
    alpha[(hsv[...,1]<45)&(hsv[...,2]>185)]=0
    if fill:
        solid=(alpha>0.35).astype(np.uint8)
        solid=cv2.morphologyEx(solid,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
        bg=(1-solid).astype(np.uint8); ff=bg.copy(); m=np.zeros((h+2,w+2),np.uint8)
        # flood the background from every edge pixel
        for x in range(0,w,4):
            for y in (0,h-1):
                if ff[y,x]==1: cv2.floodFill(ff,m,(x,y),2)
        for y in range(0,h,4):
            for x in (0,w-1):
                if ff[y,x]==1: cv2.floodFill(ff,m,(x,y),2)
        inside=(ff!=2).astype(np.float32)
        inside=cv2.GaussianBlur(inside,(0,0),1.2)
        alpha=np.maximum(alpha,inside)
    alpha*=region
    # soften where a piece meets its crop edge, so nothing ends in a hard line
    f=max(6,int(min(h,w)*0.012))
    edge=np.ones((h,w),np.float32)
    ramp=np.linspace(0,1,f)
    if Y0>2: edge[:f]*=ramp[:,None]
    if Y1<H-2: edge[-f:]*=ramp[::-1][:,None]
    if X0>2: edge[:,:f]*=ramp[None,:]
    if X1<W-2: edge[:,-f:]*=ramp[::-1][None,:]
    alpha*=edge
    rgba=np.dstack([crop,alpha*255]).clip(0,255).astype(np.uint8)
    img=Image.fromarray(rgba,'RGBA')
    if img.width>maxw: img=img.resize((maxw,round(img.height*maxw/img.width)),Image.LANCZOS)
    img.save(f'{OUT}/{name}.webp',quality=86,method=6)
    info[name]=[img.width,img.height]
    print(name,img.size)
json.dump(info,open(f'{S}/pieces.json','w'))
