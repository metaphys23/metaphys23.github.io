from math import *
from fractions import Fraction as F
from itertools import product
g=9.8
print("=== 1. Мотор+редуктор (FA-130 ~ n0=12300, Ms=3.5 mN*m)")
n0,Ms,eta,r,m=12300,0.0035,0.7,0.01,0.5
Md=m*g*r; imin=Md/(eta*Ms); iopt=2*imin
def v_of(i):
    Mr=Md/(i*eta)
    if Mr>=Ms: return 0.0
    nm=n0*(1-Mr/Ms); return 2*pi*nm/60/i*r
print("Md",Md,"imin",imin,"iopt",iopt,"v(40)",v_of(40),"v(14)",v_of(14))
print("v(30)",v_of(30),"v(60)",v_of(60),"v(80)",v_of(80))
print("wrong v with n0:",2*pi*n0/60/40*r, " i without eta:", Md/Ms)
# backdrive stuck zone: Md*eta/i <= Ms  -> i >= Md*eta/Ms
print("descends if i <", Md*eta/Ms)
print("RS-775 24V Pmax", (pi*8300/30)*0.72/4, "FA130 Pmax", (pi*12300/30)*0.0035/4)

print("=== 2. Многоступенчатый (LEGO)")
Z=[8,12,16,20,24,36,40]
st=sorted({F(b,a) for a in Z for b in Z})
reach={1:set(st)}
reach[2]={x*y for x in st for y in st}
reach[3]={x*y for x in reach[2] for y in st}
allr=reach[1]|reach[2]|reach[3]
i=F(24,8)*F(36,12)*F(40,16); print("i",i,float(i),"n_out",1800/float(i),"sum-wrong",1800/(3+3+2.5),"M_out",0.05*float(i)*0.95**3)
cands=[2,3,4,5,6,7,7.5,8,9,10,11,12,13,14,15,18,20,21,25,27,30,35,45,50,64,75,100,125,150,200,250]
for t in cands:
    ft=F(t).limit_denominator(100)
    k=next((s for s in (1,2,3) if ft in reach[s]),None)
    print(t, "stages:",k)
for t in [F(1,2),F(1,3),F(1,5),F(1,7),F(2,3),F(5,4)]:
    k=next((s for s in (1,2,3) if t in reach[s]),None); print(t,"stages:",k)
print("max", max(allr), "min", min(allr))

print("=== 3. Червячный")
def worm(z1,q,f):
    gm=atan(z1/q); ph=atan(f); eta=tan(gm)/tan(gm+ph); lock=gm<=ph
    eb=tan(gm-ph)/tan(gm) if not lock else 0
    return degrees(gm),degrees(ph),eta,lock,eb
for (z1,q,f) in [(1,16,0.07),(1,12.5,0.07),(1,10,0.07),(2,10,0.07),(1,20,0.07),(1,16,0.04),(4,10,0.05)]:
    print(z1,q,f, ["%.4f"%x if isinstance(x,float) else x for x in worm(z1,q,f)])
z1,q,f,z2=1,16,0.07,40; gm,ph,eta,lock,eb=worm(z1,q,f)
M_d=100*g*0.05; print("Md",M_d,"M1",M_d/(z2/z1*eta),"M1 no eta",M_d/(z2/z1))
print("eta max under lock (gamma=phi):", tan(atan(f))/tan(2*atan(f)))
for f in [0.03,0.05,0.07,0.1,0.15]:
    best=None
    for z1 in (1,2,4):
        for q in (8,10,12.5,16,20):
            G=atan(z1/q)
            if G<=atan(f):
                e=tan(G)/tan(G+atan(f))
                if not best or e>best[0]: best=(e,z1,q)
    print("f",f,"best self-lock",best)

print("=== 4. Планетарный")
def ok(zs,zp,zr,N):
    co= zr==zs+2*zp
    asm=(zs+zr)%N==0
    nb=(zs+zp)*sin(pi/N) > zp+2
    return co,asm,nb
print("task1 zs12 zr48 zp18 N3",ok(12,18,48,3), "i",1+48/12)
for N in range(2,8): print(" N",N,ok(12,18,48,N), (12+18)*sin(pi/N), 20)
# game classification: ring fixed, i=1+zr/zs, z>=12, zr<=100? zs,zp in [12..40]
def sols(i,N):
    out=[]
    for zs in range(12,41):
        for zp in range(12,41):
            zr=zs+2*zp
            if zr>120: continue
            if abs(1+zr/zs-i)<1e-9 and all(ok(zs,zp,zr,N)): out.append((zs,zp,zr))
    return out
for i in [2,2.5,3,3.5,4,4.5,5,6,7,8,9,10,12]:
    print(i,[ (N,len(sols(i,N)), sols(i,N)[:2]) for N in (3,4,5,6)])
