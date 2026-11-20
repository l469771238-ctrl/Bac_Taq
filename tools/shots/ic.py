# -*- coding: utf-8 -*-
"""رسم أيقونات SVG في PIL — نفكك المسار ونرسمه كث خطوط سميكة."""
import re, math
from math import radians, cos, sin, hypot, acos, sqrt, pi
from PIL import Image, ImageDraw

NUM = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')

def _toks(d):
    out=[]; i=0; n=len(d)
    while i<n:
        ch=d[i]
        if ch in 'MmLlHhVvCcSsQqTtAaZz':
            out.append(ch); i+=1
        elif ch in ' ,\n\t\r':
            i+=1
        else:
            m=NUM.match(d,i)
            if m: out.append(float(m.group())); i=m.end()
            else: i+=1
    return out

def _bez(p0,p1,p2,p3,n=14):
    pts=[]
    for i in range(n+1):
        t=i/n; u=1-t
        pts.append((u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
                    u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]))
    return pts

def _quad(p0,p1,p2,n=10):
    pts=[]
    for i in range(n+1):
        t=i/n; u=1-t
        pts.append((u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0], u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]))
    return pts


def _arc(p0, rx, ry, phi, fa, fs, p1, n=28):
    """SVG elliptical arc → نقاط (معادلة center parameterization)."""
    if rx==0 or ry==0: return [p1]
    phi=radians(phi)
    dx2=(p0[0]-p1[0])/2.0; dy2=(p0[1]-p1[1])/2.0
    x1p= cos(phi)*dx2+sin(phi)*dy2
    y1p=-sin(phi)*dx2+cos(phi)*dy2
    rx=abs(rx); ry=abs(ry)
    lam=x1p*x1p/(rx*rx)+y1p*y1p/(ry*ry)
    if lam>1:
        s=sqrt(lam); rx*=s; ry*=s
    num=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p
    den=rx*rx*y1p*y1p+ry*ry*x1p*x1p
    co=(-1 if fa==fs else 1)*sqrt(max(0.0, num/den)) if den else 0.0
    cxp= co*rx*y1p/ry
    cyp=-co*ry*x1p/rx
    cx=cos(phi)*cxp-sin(phi)*cyp+(p0[0]+p1[0])/2.0
    cy=sin(phi)*cxp+cos(phi)*cyp+(p0[1]+p1[1])/2.0
    def ang(ux,uy,vx,vy):
        d=(ux*vx+uy*vy)/(hypot(ux,uy)*hypot(vx,vy))
        d=max(-1.0,min(1.0,d)); a=acos(d)
        if ux*vy-uy*vx<0: a=-a
        return a
    ux=(x1p-cxp)/rx; uy=(y1p-cyp)/ry
    vx=(-x1p-cxp)/rx; vy=(-y1p-cyp)/ry
    th1=ang(1,0,ux,uy)
    dth=ang(ux,uy,vx,vy)
    if fs==0 and dth>0: dth-=2*pi
    elif fs==1 and dth<0: dth+=2*pi
    pts=[]
    for i in range(1,n+1):
        t=th1+dth*i/n
        pts.append((cx+rx*cos(t)*cos(phi)-ry*sin(t)*sin(phi),
                    cy+rx*cos(t)*sin(phi)+ry*sin(t)*cos(phi)))
    return pts

def parse(d):
    """يرجع لستة مسارات، كل مسار لستة نقاط."""
    t=_toks(d); i=0; cur=(0,0); start=(0,0); prev_c=None; prev_cmd=''
    paths=[]; poly=[]
    last='M'
    while i<len(t):
        if isinstance(t[i],str):
            cmd=t[i]; i+=1; last=cmd
        else:
            cmd=last  # أرقام ناقصة: نعيد الأمر الأخير (M→L, m→l)
            if cmd=='M': cmd='L'
            elif cmd=='m': cmd='l'
        rel=cmd.islower(); C=cmd.upper()
        def pt(x,y):
            return (cur[0]+x, cur[1]+y) if rel else (x,y)
        def need(k):
            nonlocal i
            v=t[i:i+k]; i+=k; return v
        if C=='M':
            x,y=need(2); p=pt(x,y)
            if poly: paths.append(poly)
            poly=[p]; cur=p; start=p; prev_cmd='M'
        elif C=='L':
            x,y=need(2); p=pt(x,y); poly.append(p); cur=p; prev_cmd='L'
        elif C=='H':
            (x,)=need(1); p=(cur[0]+x if rel else x, cur[1]); poly.append(p); cur=p; prev_cmd='H'
        elif C=='V':
            (y,)=need(1); p=(cur[0], cur[1]+y if rel else y); poly.append(p); cur=p; prev_cmd='V'
        elif C=='C':
            x1,y1,x2,y2,x,y=need(6)
            p1=pt(x1,y1); p2=pt(x2,y2); p=pt(x,y)
            poly+=_bez(cur,p1,p2,p)[1:]; prev_c=p2; cur=p; prev_cmd='C'
        elif C=='S':
            x2,y2,x,y=need(4)
            p1=(2*cur[0]-prev_c[0],2*cur[1]-prev_c[1]) if prev_cmd in 'CS' else cur
            p2=pt(x2,y2); p=pt(x,y)
            poly+=_bez(cur,p1,p2,p)[1:]; prev_c=p2; cur=p; prev_cmd='S'
        elif C=='Q':
            x1,y1,x,y=need(4)
            p1=pt(x1,y1); p=pt(x,y)
            poly+=_quad(cur,p1,p)[1:]; prev_c=p1; cur=p; prev_cmd='Q'
        elif C=='T':
            x,y=need(2)
            p1=(2*cur[0]-prev_c[0],2*cur[1]-prev_c[1]) if prev_cmd in 'QT' else cur
            p=pt(x,y)
            poly+=_quad(cur,p1,p)[1:]; prev_c=p1; cur=p; prev_cmd='T'
        elif C=='A':
            rx,ry,rot,la,sw,x,y=need(7)
            p=pt(x,y)
            poly+=_arc(cur, rx, ry, rot, int(la), int(sw), p); cur=p; prev_cmd='A'
        elif C=='Z':
            if poly: poly.append(start); paths.append(poly); poly=[]
            cur=start; prev_cmd='Z'
        else:
            break
    if poly: paths.append(poly)
    return paths

def icon_paths(name, jsfile):
    src=open(jsfile,encoding='utf-8').read()
    m=re.search(r'\b'+re.escape(name)+r":\s*'([^']+)'", src)
    if not m: return None
    return m.group(1)

def draw_icon(img, d, box, color, width=1.5, ss=4):
    """box=(x0,y0,x1,y1) المربع اللي الأيقونة تترسم جوّاه. viewBox 24x24."""
    x0,y0,x1,y1=box
    sz=x1-x0
    k=sz*ss/24.0
    W=int(round(width*k))
    pad=W+2
    tmp=Image.new('L',(int(sz*ss)+pad*2,int(sz*ss)+pad*2),0)
    dd=ImageDraw.Draw(tmp)
    paths=parse(d)
    for poly in paths:
        pts=[(p[0]*k+pad, p[1]*k+pad) for p in poly]
        if len(pts)>1:
            dd.line(pts, fill=255, width=W, joint='curve')
        for q in pts:  # نهايات مدورة
            dd.ellipse([q[0]-W/2,q[1]-W/2,q[0]+W/2,q[1]+W/2], fill=255)
    tmp=tmp.resize((int(sz)+ (pad*2//ss), int(sz)+(pad*2//ss)), Image.LANCZOS)
    col=Image.new('RGBA', img.size, color+(0,))
    col.putalpha(0)
    lay=Image.new('RGBA', img.size, (0,0,0,0))
    lay.paste(Image.merge('RGBA', (Image.new('L',tmp.size,color[0]),
                                   Image.new('L',tmp.size,color[1]),
                                   Image.new('L',tmp.size,color[2]),
                                   tmp)), (int(x0)-pad//ss, int(y0)-pad//ss))
    return Image.alpha_composite(img, lay)

def icon_center(img, d, cx, cy, size, color, width=1.5):
    return draw_icon(img, d, (cx-size/2, cy-size/2, cx+size/2, cy+size/2), color, width)
