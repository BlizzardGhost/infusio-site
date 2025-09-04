// /src/scripts/background-flow.ts
// Soft aromatic clouds (canvas) + subtle Vanta fog (THREE).
// Upward-moving smoke: large blurred ellipses with a gentle updraft.

import * as THREE from 'three';
import FOG from 'vanta/dist/vanta.fog.min';

type VantaInstance = { destroy?: () => void } | null;

const C = {
  base: 0x0b0f11,
  mint: 0x2dd4bf,
  matcha: 0x13c296,
};

let fog: VantaInstance = null;
let raf = 0;

/* -------------------- Vanta fog -------------------- */
function initFog() {
  const el = document.getElementById('vanta-fog');
  if (!el) return;
  fog = FOG({
    THREE, el,
    highlightColor: C.mint,
    midtoneColor: C.matcha,
    lowlightColor: 0x0a1713,
    baseColor: C.base,
    blurFactor: 0.6,
    zoom: 0.6,
    speed: 0.25,
  });
  (el as HTMLElement).style.opacity = '0.10';
}

/* ------------------- Simplex (tiny) ------------------- */
class Simplex {
  private p:number[]=[]; private perm:number[]=[];
  constructor(seed=1337){
    this.p = Array.from({length:256}, (_,i)=>i);
    let n = seed;
    for (let i=255;i>0;i--){
      n = (n*16807)%2147483647;
      const r = n % (i+1);
      [this.p[i], this.p[r]] = [this.p[r], this.p[i]];
    }
    this.perm = Array.from({length:512}, (_,i)=>this.p[i&255]);
  }
  private fade(t:number){ return t*t*t*(t*(t*6-15)+10); }
  private grad(h:number, x:number, y:number){
    const u = (h&1)?-x:x, v = (h&2)?-2*y:2*y;
    return u+v;
  }
  noise2D(x:number,y:number){
    const X = Math.floor(x)&255, Y=Math.floor(y)&255;
    const xf = x-Math.floor(x), yf=y-Math.floor(y);
    const u = this.fade(xf), v = this.fade(yf);
    const aa=this.perm[this.perm[X]+Y],
          ab=this.perm[this.perm[X]+Y+1],
          ba=this.perm[this.perm[X+1]+Y],
          bb=this.perm[this.perm[X+1]+Y+1];
    const x1 = this.lerp(this.grad(aa,xf,yf),    this.grad(ba,xf-1,yf),    u);
    const x2 = this.lerp(this.grad(ab,xf,yf-1),  this.grad(bb,xf-1,yf-1),  u);
    return this.lerp(x1,x2,v);
  }
  private lerp(a:number,b:number,t:number){ return a+(b-a)*t; }
}

/* ------------------- Smoke layer ------------------- */
type Puff = { x:number; y:number; r:number; hue:number; a:number; drift:number; phase:number };

class Smoke {
  private el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private w=0; private h=0; private dpr=Math.min(2, window.devicePixelRatio||1);
  private noise = new Simplex(1089);
  private puffs: Puff[] = [];
  private t = 0;
  private last = 0;

  // Tuned for "tea vapor drifting upward"
  private OPTS = {
    count: 12,         // multiple overlapping clouds
    minR: 320,
    maxR: 580,
    alpha: 0.0065,     // very subtle; layered with soft-light
    tint: 160,         // jade
    flow: 0.00065,     // tiny noise scale -> coherent shapes (FIXED)
    curl: 8,           // how strongly noise bends the wind
    updraftY: -22,     // px/sec steady rise (negative = up)
    breezeX:  2.5,     // px/sec gentle sideways
    blur: 62,          // creamy edges
    fade: 0.050,       // long exposure (lower = longer trails)
  };

  constructor(canvas: HTMLCanvasElement){
    this.el = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    this.off = document.createElement('canvas');
    const octx = this.off.getContext('2d');
    if (!octx) throw new Error('2D context not available (offscreen)');
    this.offCtx = octx;

    requestAnimationFrame(() => this.resize());
    window.addEventListener('resize', this.resize);
    this.seed();
  }

  private seed(){
    this.puffs = [];
    for (let i=0;i<this.OPTS.count;i++){
      this.puffs.push({
        x: Math.random()*Math.max(1,this.w),
        y: Math.random()*Math.max(1,this.h),
        r: this.rand(this.OPTS.minR, this.OPTS.maxR),
        hue: this.OPTS.tint + this.rand(-6, 6),
        a: this.OPTS.alpha * (0.8 + Math.random()*0.4),
        drift: 0.7 + Math.random()*0.8,
        phase: Math.random()*Math.PI*2,
      });
    }
  }

  private rand(min:number,max:number){ return min + Math.random()*(max-min); }

  private resize = () => {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);

    const W = Math.round(this.w*this.dpr), H = Math.round(this.h*this.dpr);
    this.el.width = W; this.el.height = H;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);

    this.off.width = W; this.off.height = H;
    this.offCtx.setTransform(this.dpr,0,0,this.dpr,0,0);

    // base
    this.ctx.fillStyle = '#0b0f11';
    this.ctx.fillRect(0,0,this.w,this.h);
  };

  // draw a big, rotated ellipse built from a radial gradient
  private drawPuff(p:Puff, now:number, theta:number){
    const r  = p.r * (0.95 + 0.05*Math.sin(now*0.0004 + p.phase));
    const rx = r * 1.0;       // major radius
    const ry = r * 0.55;      // minor radius -> “smoke” look

    this.offCtx.save();
    this.offCtx.translate(p.x, p.y);
    this.offCtx.rotate(theta);
    this.offCtx.scale(1, ry/rx); // squash to ellipse

    const g = this.offCtx.createRadialGradient(0, 0, rx*0.15, 0, 0, rx);
    g.addColorStop(0, `hsla(${p.hue}, 60%, 62%, ${p.a})`);
    g.addColorStop(1, `hsla(${p.hue}, 50%, 38%, 0)`);

    this.offCtx.fillStyle = g;
    this.offCtx.beginPath();
    this.offCtx.arc(0, 0, rx, 0, Math.PI*2);
    this.offCtx.fill();
    this.offCtx.restore();
  }

  private step(now:number){
    if (!this.last) this.last = now;
    const dt = Math.min(0.033, (now - this.last)/1000); // seconds (clamped to 33ms)
    this.last = now;
    this.t += dt;

    // fade offscreen slightly (long exposure)
    this.offCtx.globalCompositeOperation = 'source-over';
    this.offCtx.fillStyle = `rgba(11,15,17,${this.OPTS.fade})`;
    this.offCtx.fillRect(0,0,this.w,this.h);

    // draw puffs with mild add before blur
    this.offCtx.globalCompositeOperation = 'lighter';

    for (const p of this.puffs){
      // tiny curl-noise to vary the updraft
      const n = this.noise.noise2D(
        p.x*this.OPTS.flow,
        p.y*this.OPTS.flow + this.t*0.25
      ) * Math.PI*2;

      const vx = this.OPTS.breezeX + Math.cos(n) * this.OPTS.curl * p.drift; // px/sec
      const vy = this.OPTS.updraftY + Math.sin(n) * this.OPTS.curl * p.drift; // px/sec

      // MOVE — multiply only by dt (FIXED: removed nonexistent this.OPTS.speed)
      p.x += vx * dt;
      p.y += vy * dt;

      // wrap softly so nothing pops
      const pad = p.r * 0.6;
      if (p.x < -pad)       p.x = this.w + pad;
      if (p.x > this.w+pad) p.x = -pad;
      if (p.y < -pad)       p.y = this.h + pad;
      if (p.y > this.h+pad) p.y = -pad;

      // orient ellipse along local flow
      const theta = Math.atan2(vy, vx) + 0.2*Math.sin(this.t*0.5 + p.phase);
      this.drawPuff(p, now, theta);
    }

    // composite offscreen → onscreen with big blur and soft-light blend
    this.ctx.fillStyle = '#0b0f11';
    this.ctx.fillRect(0,0,this.w,this.h);

    this.ctx.save();
    this.ctx.globalAlpha = 0.9;
    (this.ctx as any).filter = `blur(${this.OPTS.blur}px)`;
    this.ctx.globalCompositeOperation = 'soft-light';
    this.ctx.drawImage(this.off, 0, 0, this.w, this.h);
    (this.ctx as any).filter = 'none';
    this.ctx.restore();

    // fade near the top so smoke “dissipates”
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-in';
    const mask = this.ctx.createLinearGradient(0, 0, 0, this.h);
    mask.addColorStop(0.00, 'rgba(0,0,0,0)');
    mask.addColorStop(0.15, 'rgba(0,0,0,0.25)');
    mask.addColorStop(0.45, 'rgba(0,0,0,1)');
    this.ctx.fillStyle = mask;
    this.ctx.fillRect(0,0,this.w,this.h);
    this.ctx.restore();
  }

  start(){
    const loop = (ts:number) => { this.step(ts); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  destroy(){
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', this.resize);
  }
}

/* ---------------- Lifecycle ---------------- */
let smoke: Smoke | null = null;

export default function initBackgroundFlow(){
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('tendrils') as HTMLCanvasElement | null;
  if (!canvas) return;

  destroy();

  if (reduce){
    const ctx = canvas.getContext('2d');
    if (ctx){
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width; canvas.height = r.height;
      ctx.fillStyle = '#0b0f11';
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    return;
  }

  smoke = new Smoke(canvas);
  smoke.start();
  initFog();

  // Astro SPA navigation lifecycle
  document.addEventListener('astro:before-swap', destroy);
  document.addEventListener('astro:page-load', () => { destroy(); initBackgroundFlow(); });
}

function destroy(){
  try { smoke?.destroy?.(); } catch {}
  try { fog?.destroy?.(); }   catch {}
  smoke = null; fog = null;
}