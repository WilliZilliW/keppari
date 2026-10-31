// 3D-paneelit VR:ään: piirretään canvasille, valitaan katseella (viive) tai napautuksella.
import * as THREE from 'three';
import { makeCanvas, toTexture } from './textures.js';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export class Panel {
  constructor({ width = 1.6, pxW = 1024, pxH = 720, draw, transparent = true }) {
    const [c, g] = makeCanvas(pxW, pxH);
    this.canvas = c; this.ctx = g; this.pxW = pxW; this.pxH = pxH;
    this.tex = toTexture(c, null, 8);
    const height = width * pxH / pxW;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent, toneMapped: false, depthWrite: false, side: THREE.FrontSide }));
    this.mesh.renderOrder = 10;
    this.mesh.userData.panel = this;
    this.drawFn = draw;
    this.buttons = [];
    this.hover = null;
    this.progress = 0;
    this.redraw();
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }

  redraw() {
    const g = this.ctx;
    g.clearRect(0, 0, this.pxW, this.pxH);
    this.buttons = [];
    this.drawFn(g, this);
    this.tex.needsUpdate = true;
  }

  // nappi: piirretään ja rekisteröidään osumatestiin
  button(id, x, y, w, h, label, { primary = false, small = false, disabled = false, color } = {}) {
    const g = this.ctx;
    const hov = this.hover === id && !disabled;
    this.buttons.push({ id, x, y, w, h, disabled });
    g.save();
    g.fillStyle = disabled ? 'rgba(255,255,255,0.08)' : primary ? (hov ? '#ffe28a' : '#ffd666') : color ? color : (hov ? '#3d68b3' : '#24467f');
    g.strokeStyle = hov ? '#ffffff' : 'rgba(255,255,255,0.25)';
    g.lineWidth = hov ? 6 : 3;
    roundRect(g, x, y, w, h, 18); g.fill(); g.stroke();
    if (hov && this.progress > 0) {
      g.fillStyle = primary ? 'rgba(160,82,45,0.35)' : 'rgba(255,214,102,0.35)';
      roundRect(g, x, y, w * this.progress, h, 18); g.fill();
    }
    g.fillStyle = disabled ? 'rgba(255,255,255,0.3)' : primary ? '#3a1e00' : '#ffffff';
    g.font = `800 ${small ? 30 : 40}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2 + 2);
    g.restore();
  }

  hit(uv) {
    const x = uv.x * this.pxW, y = (1 - uv.y) * this.pxH;
    for (const b of this.buttons) if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  setHover(id, progress = 0) {
    const p = Math.round(progress * 20) / 20;
    if (id === this.hover && p === this.progress) return;
    this.hover = id; this.progress = p;
    this.redraw();
  }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function panelBg(g, w, h, accent = '#ffd666') {
  g.fillStyle = 'rgba(8,20,44,0.92)';
  roundRect(g, 4, 4, w - 8, h - 8, 36); g.fill();
  g.strokeStyle = accent; g.lineWidth = 5; g.stroke();
}

export function text(g, str, x, y, { size = 36, weight = 700, color = '#fff', align = 'left', base = 'middle', max } = {}) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  if (max) g.fillText(str, x, y, max); else g.fillText(str, x, y);
}

export function wrapText(g, str, x, y, maxW, lineH, opts) {
  g.font = `${opts.weight || 600} ${opts.size || 30}px ${FONT}`;
  const words = str.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { text(g, line, x, y, opts); y += lineH; line = w; }
    else line = test;
  }
  if (line) text(g, line, x, y, opts);
  return y + lineH;
}

// Katsekohdistin: rengas + täyttyvä keskusta
export class Reticle {
  constructor() {
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.013, 32), mat);
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(0.009, 32), new THREE.MeshBasicMaterial({ color: '#ffd666', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false }));
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.003, 16), mat);
    for (const m of [this.ring, this.fill, this.dot]) { m.renderOrder = 999; this.group.add(m); }
    this.group.position.z = -1.2;
    this.setProgress(0);
  }
  setProgress(p) {
    this.fill.visible = p > 0;
    this.fill.scale.setScalar(Math.max(0.001, p));
    this.ring.scale.setScalar(p > 0 ? 1.25 : 1);
  }
}
