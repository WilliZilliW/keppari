// Proseduraaliset tekstuurit canvasilla – ei ulkoisia kuvatiedostoja.
import * as THREE from 'three';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(c, repeat, anisotropy = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rand(a, b) { return a + Math.random() * (b - a); }

export function sandTexture() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#cfae7c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const l = rand(-28, 22);
    g.fillStyle = `rgba(${150 + l},${118 + l},${78 + l},${rand(0.25, 0.7)})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(1, 3), rand(1, 3));
  }
  // haravan jäljet
  g.lineWidth = 2;
  for (let y = 0; y < 512; y += 9) {
    g.strokeStyle = `rgba(120,88,52,${rand(0.06, 0.16)})`;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.012 + y) * 1.5);
    g.stroke();
  }
  return toTexture(c, [6, 10], 8);
}

export function grassTexture() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#4c8a35'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = rand(-30, 30);
    g.strokeStyle = `rgba(${60 + v},${130 + v},${45 + v * 0.5},0.6)`;
    const x = rand(0, 256), y = rand(0, 256);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(2, 6)); g.stroke();
  }
  return toTexture(c, [160, 160], 8);
}

export function stripeTexture(a, b, bands = 8) {
  const [c, g] = makeCanvas(16, 256);
  const h = 256 / bands;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, i * h, 16, h);
  }
  // pieni kiilto
  const grd = g.createLinearGradient(0, 0, 16, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.12)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  return toTexture(c);
}

export function brickTexture() {
  const [c, g] = makeCanvas(256, 128);
  g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, 256, 128);
  const bw = 42, bh = 20;
  for (let row = 0; row < 7; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 256 + bw; x += bw) {
      const r = 160 + rand(-25, 25), gg = 52 + rand(-12, 12), bb = 40 + rand(-10, 10);
      g.fillStyle = `rgb(${r},${gg},${bb})`;
      g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  return toTexture(c);
}

export function birchTexture() {
  const [c, g] = makeCanvas(64, 256);
  g.fillStyle = '#ecebe4'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(20,20,20,${rand(0.5, 0.9)})`;
    g.fillRect(rand(0, 64), rand(0, 256), rand(6, 22), rand(2, 5));
  }
  return toTexture(c);
}

export function finnishFlagTexture() {
  const [c, g] = makeCanvas(180, 110);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 180, 110);
  g.fillStyle = '#002f6c';
  g.fillRect(50, 0, 30, 110);
  g.fillRect(0, 40, 180, 30);
  return toTexture(c);
}

export function cloudTexture() {
  const [c, g] = makeCanvas(256, 128);
  for (let i = 0; i < 26; i++) {
    const x = rand(50, 206), y = rand(45, 85), r = rand(18, 42);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c);
}

export function bannerTexture(text, bg, fg, sub) {
  const [c, g] = makeCanvas(512, 96);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 88);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${sub ? 40 : 50}px system-ui, sans-serif`;
  g.fillText(text, 256, sub ? 38 : 50);
  if (sub) { g.font = '600 22px system-ui, sans-serif'; g.fillText(sub, 256, 74); }
  return toTexture(c);
}

export function numberTexture(label, highlight = false) {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = highlight ? '#ffd60a' : '#ffffff';
  g.beginPath(); g.roundRect(4, 4, 120, 120, 18); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#102a54'; g.stroke();
  g.fillStyle = '#102a54'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${label.length > 1 ? 64 : 80}px system-ui, sans-serif`;
  g.fillText(label, 64, 70);
  return toTexture(c);
}

export function signTexture(text, bg = '#102a54', fg = '#fff') {
  const [c, g] = makeCanvas(256, 96);
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, 256, 96, 14); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 46px system-ui, sans-serif'; g.fillText(text, 128, 52);
  return toTexture(c);
}

export function waterTexture() {
  const [c, g] = makeCanvas(256, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#1e6fb8'); grd.addColorStop(1, '#3fa3e0');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(255,255,255,${rand(0.1, 0.35)})`; g.lineWidth = rand(1, 3);
    const x = rand(0, 256), y = rand(0, 128);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 22, y); g.stroke();
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(0, 0, 256, 128);
  return toTexture(c);
}
