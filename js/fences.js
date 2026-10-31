// Esteet: pystyeste, okseri, trippeli, muuri, ristikko ja vesihauta.
// Paikallinen koordinaatisto: hyppysuunta on -z. s = etäisyys hyppysuunnassa (= -z), l = sivuttaissuunta (= x).
import * as THREE from 'three';
import { GeoBuilder, vcolStd } from './builder.js';
import * as T from './textures.js';
import { FENCE_W } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);
const railGeo = new THREE.CylinderGeometry(0.045, 0.045, FENCE_W + 0.14, 14, 1);
const matCache = new Map();
function stripeMat(a, b) {
  const k = a + b;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ map: T.stripeTexture(a, b), roughness: 0.45 }));
  return matCache.get(k);
}
let brickMat, waterMat;
const staticMat = vcolStd({ roughness: 0.6 });

export class Fence {
  constructor(def, type, H, theme, index) {
    this.def = def; this.id = def.id; this.label = def.id; this.type = type; this.H = H;
    this.combo = def.combo || null; this.index = index;
    this.w = FENCE_W;
    this.cos = Math.cos(def.dir); this.sin = Math.sin(def.dir);
    this.group = new THREE.Group();
    this.group.position.set(def.x, 0, def.z);
    this.group.rotation.y = def.dir;
    this.rails = [];      // { s, hAt(l), movers: [] }
    this.movers = [];
    this.theme = theme;
    this.isWater = type === 'vesihauta';
    this.standH = Math.max(1.25, H + 0.4);
    const b = new GeoBuilder();
    this.b = b;
    switch (type) {
      case 'ristikko': this.buildCross(); break;
      case 'okseri': this.buildSpread([[-0.45, 0.92], [0.45, 1.0]]); break;
      case 'trippeli': this.buildSpread([[-0.7, 0.72], [0, 0.86], [0.7, 1.0]]); break;
      case 'muuri': this.buildWall(); break;
      case 'vesihauta': this.buildWater(); break;
      default: this.buildSpread([[0, 1.0]]);
    }
    this.frontS = this.isWater ? -0.2 : Math.min(...this.rails.map(r => r.s));
    this.backS = this.isWater ? this.waterLen : Math.max(...this.rails.map(r => r.s));
    this.midS = this.isWater ? this.waterLen * 0.5 : (this.frontS + this.backS) / 2;
    this.group.add(b.build(staticMat));
    this.buildNumber();
    this.resetState();
  }

  // ---------- rakentaminen ----------
  standard(x, z, h) {
    const b = this.b, side = Math.sign(x), th = this.theme;
    b.add(new THREE.BoxGeometry(0.1, h, 0.1), '#ffffff', [x, h / 2, z]);
    b.add(new THREE.SphereGeometry(0.07, 10, 8), th.b === '#ffffff' ? th.a : th.b, [x, h + 0.04, z]);
    b.add(new THREE.BoxGeometry(0.12, 0.05, 0.6), '#dddddd', [x, 0.025, z]);
    // siipi
    const wx = x + side * 0.42, wh = h * 0.82;
    b.add(new THREE.BoxGeometry(0.07, wh, 0.07), th.wing, [x + side * 0.8, wh / 2, z]);
    for (let i = 1; i <= 4; i++) {
      const y = (wh * i) / 4.4;
      b.add(new THREE.BoxGeometry(0.76, 0.05, 0.035), i % 2 ? th.wing : '#ffffff', [wx, y, z], [0, 0, side * -0.12 * (i / 4)]);
    }
    b.add(new THREE.BoxGeometry(0.76, 0.06, 0.06), th.wing, [wx, wh, z]);
  }

  cups(x, z, h) {
    this.b.add(new THREE.BoxGeometry(0.08, 0.05, 0.1), '#9aa3ad', [x - Math.sign(x) * 0.07, h - 0.05, z]);
  }

  flowers(z) {
    const b = this.b;
    for (const side of [-1, 1]) {
      const x = side * (this.w / 2 + 0.55);
      b.add(new THREE.BoxGeometry(0.62, 0.22, 0.28), '#ffffff', [x, 0.11, z]);
      b.add(new THREE.BoxGeometry(0.56, 0.12, 0.22), '#3f7d2b', [x, 0.25, z]);
      for (let i = 0; i < 6; i++) b.add(new THREE.IcosahedronGeometry(0.06, 0), i % 2 ? this.theme.flower : '#ffffff', [x + rand(-0.24, 0.24), 0.33, z + rand(-0.08, 0.08)]);
    }
  }

  addRail(z, h, mesh, flatEuler = null) {
    const rail = { s: -z, h, hAt: () => h, movers: [], knocked: false };
    if (mesh) rail.movers.push(this.addMover(mesh, flatEuler));
    this.rails.push(rail);
    return rail;
  }

  addMover(mesh, flatEuler) {
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const m = {
      obj: mesh, homeP: mesh.position.clone(), homeQ: mesh.quaternion.clone(),
      vel: new THREE.Vector3(), ang: new THREE.Vector3(), active: false,
      flatQ: new THREE.Quaternion().setFromEuler(flatEuler || new THREE.Euler(0, 0, Math.PI / 2)),
      floor: 0.05,
    };
    this.movers.push(m);
    return m;
  }

  railMesh(h, z, colorSwap = false) {
    const mesh = new THREE.Mesh(railGeo, colorSwap ? stripeMat(this.theme.b, this.theme.a) : stripeMat(this.theme.a, this.theme.b));
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(0, h, z);
    return mesh;
  }

  buildSpread(parts) {
    const H = this.H, half = this.w / 2 + 0.06;
    parts.forEach(([s, f], i) => {
      const z = -s, h = H * f;
      const sh = Math.max(1.2, h + 0.4);
      this.standard(-half, z, sh); this.standard(half, z, sh);
      this.cups(-half, z, h); this.cups(half, z, h);
      this.addRail(z, h, this.railMesh(h, z, i % 2 === 1));
      // koristeelliset alapuomit / lankut (eivät putoa)
      if (i === 0) {
        const plank = this.index % 2 === 0;
        if (plank && h > 0.45) {
          this.b.add(new THREE.BoxGeometry(this.w, 0.2, 0.04), this.theme.wing, [0, h * 0.5, z]);
          this.b.add(new THREE.BoxGeometry(this.w, 0.04, 0.045), '#ffffff', [0, h * 0.5 + 0.06, z]);
        } else if (h > 0.4) {
          const m = this.railMesh(h * 0.5, z, true); m.castShadow = true; this.group.add(m);
        }
        if (h > 0.75) { const m = this.railMesh(h * 0.22, z); m.castShadow = true; this.group.add(m); }
      }
    });
    this.flowers(-parts[0][0] + 0.45);
  }

  buildCross() {
    const H = this.H, half = this.w / 2 + 0.06;
    const hEnd = 2 * H - 0.06;
    this.standard(-half, 0, 1.2); this.standard(half, 0, 1.2);
    const len = Math.hypot(this.w, hEnd - 0.06);
    const geo = new THREE.CylinderGeometry(0.045, 0.045, len, 12);
    const ang = Math.atan2(hEnd - 0.06, this.w);
    const rail = { s: 0, h: H, hAt: (l) => H + Math.abs(l) * (hEnd - 0.06) / this.w, movers: [], knocked: false };
    [-1, 1].forEach((side, i) => {
      const mesh = new THREE.Mesh(geo, i ? stripeMat(this.theme.b, this.theme.a) : stripeMat(this.theme.a, this.theme.b));
      mesh.position.set(0, (hEnd + 0.06) / 2, side * 0.05);
      mesh.rotation.z = Math.PI / 2 + side * ang;
      rail.movers.push(this.addMover(mesh, new THREE.Euler(0, rand(-0.3, 0.3), Math.PI / 2)));
      this.cups(side * half, side * 0.05, hEnd);
    });
    this.rails.push(rail);
    // maapuomi
    const g = this.railMesh(0.05, 0.5); this.group.add(g);
    this.flowers(0.5);
  }

  buildWall() {
    const H = this.H, w = this.w;
    if (!brickMat) brickMat = new THREE.MeshStandardMaterial({ map: T.brickTexture(), roughness: 0.9 });
    const bodyH = Math.max(0.12, H - 0.16);
    const tex = brickMat.map.clone(); tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 1.2, bodyH / 0.6);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    body.position.y = bodyH / 2; body.castShadow = body.receiveShadow = true;
    this.group.add(body);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, H + 0.3, 0.6), brickMat);
      p.position.set(side * (w / 2 + 0.21), (H + 0.3) / 2, 0); p.castShadow = true;
      this.group.add(p);
      this.b.add(new THREE.BoxGeometry(0.5, 0.08, 0.68), '#ffffff', [side * (w / 2 + 0.21), H + 0.34, 0]);
    }
    const rail = { s: 0, h: H, hAt: () => H, movers: [], knocked: false };
    const n = 5, bw = w / n;
    for (let i = 0; i < n; i++) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.015, 0.16, 0.47), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffffff' : this.theme.b === '#ffffff' ? this.theme.a : this.theme.b, roughness: 0.7 }));
      blk.position.set(-w / 2 + bw * (i + 0.5), H - 0.08, 0);
      const m = this.addMover(blk, new THREE.Euler(0, rand(-0.5, 0.5), 0));
      m.floor = 0.08;
      rail.movers.push(m);
    }
    this.rails.push(rail);
    this.flowers(0.6);
  }

  buildWater() {
    const L = 1.7, w = this.w;
    this.waterLen = L;
    if (!waterMat) waterMat = new THREE.MeshStandardMaterial({ map: T.waterTexture(), roughness: 0.15, metalness: 0.1 });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(w, L), waterMat);
    mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.025, -L / 2); mat.receiveShadow = true;
    this.group.add(mat);
    this.waterMesh = mat;
    const b = this.b;
    b.add(new THREE.BoxGeometry(w, 0.25, 0.3), '#2f6b2a', [0, 0.125, 0.2]); // harja
    for (let i = 0; i < 18; i++) b.add(new THREE.IcosahedronGeometry(0.07, 0), '#3f8a36', [rand(-w / 2, w / 2), 0.25, 0.2 + rand(-0.1, 0.1)]);
    for (const side of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), '#ffffff', [side * (w / 2 + 0.2), 0.55, 0]);
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), '#ffffff', [side * (w / 2 + 0.2), 0.55, -L]);
      b.add(new THREE.BoxGeometry(0.05, 0.03, L), '#ffffff', [side * (w / 2 + 0.03), 0.03, -L / 2]);
    }
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(side * 0.35, -0.12); shape.lineTo(0, -0.24);
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: side > 0 ? '#e01e37' : '#ffffff', side: THREE.DoubleSide }));
      flag.position.set(side * (w / 2 + 0.2), 1.1, 0);
      this.group.add(flag);
    }
    this.flowers(0.6);
    this.standH = 1.1;
  }

  buildNumber() {
    this.numTex = T.numberTexture(this.label, false);
    this.numTexHi = T.numberTexture(this.label, true);
    this.numMat = new THREE.MeshBasicMaterial({ map: this.numTex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), this.numMat);
    const frontZ = -this.frontS + 0.07;
    const x = this.isWater ? this.w / 2 + 0.2 : this.w / 2 + 0.06;
    plane.position.set(x, (this.isWater ? 1.1 : Math.max(1.2, this.rails[0].h + 0.4)) + 0.25, frontZ);
    this.group.add(plane);
    // punainen lippu oikealle, valkoinen vasemmalle
    if (!this.isWater) {
      const top = Math.max(1.2, this.rails[0].h + 0.4);
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(side * 0.32, -0.1); shape.lineTo(0, -0.2);
        const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: side > 0 ? '#e01e37' : '#ffffff', side: THREE.DoubleSide }));
        flag.position.set(side * (this.w / 2 + 0.06), top + (side > 0 ? 0 : 0.02), frontZ - 0.07);
        this.group.add(flag);
      }
    }
  }

  // ---------- logiikka ----------
  toLocal(x, z) {
    const dx = x - this.def.x, dz = z - this.def.z;
    const lx = dx * this.cos - dz * this.sin;
    const lz = dx * this.sin + dz * this.cos;
    return { s: -lz, l: lx };
  }

  toWorld(s, l, out = new THREE.Vector3()) {
    const lx = l, lz = -s;
    out.set(this.def.x + lx * this.cos + lz * this.sin, 0, this.def.z - lx * this.sin + lz * this.cos);
    return out;
  }

  resetState() {
    this.inProgress = false;
    this.done = false;
    this.waterFault = false;
    this.attemptKnocked = false;
  }

  rebuild() {
    for (const m of this.movers) {
      m.obj.position.copy(m.homeP); m.obj.quaternion.copy(m.homeQ);
      m.active = false; m.vel.set(0, 0, 0); m.ang.set(0, 0, 0);
    }
    for (const r of this.rails) r.knocked = false;
    this.resetState();
  }

  knock(rail, speed = 5) {
    if (rail.knocked) return false;
    rail.knocked = true;
    for (const m of rail.movers) {
      m.active = true;
      m.vel.set(rand(-0.4, 0.4), rand(0.6, 1.4), -rand(1.0, 1.8) * Math.min(1.5, speed / 4));
      m.ang.set(rand(-2.5, 2.5), rand(-1, 1), rand(-3, 3));
      const r = new THREE.Euler(0, rand(-0.5, 0.5), m.flatQ.z !== 0 ? Math.PI / 2 : 0);
      m.flatQ.setFromEuler(r);
    }
    return true;
  }

  setHighlight(on) {
    this.numMat.map = on ? this.numTexHi : this.numTex;
    this.numMat.needsUpdate = true;
  }

  update(dt) {
    const dq = new THREE.Quaternion(), e = new THREE.Euler();
    for (const m of this.movers) {
      if (!m.active) continue;
      m.vel.y -= 9.81 * dt;
      m.obj.position.addScaledVector(m.vel, dt);
      e.set(m.ang.x * dt, m.ang.y * dt, m.ang.z * dt);
      dq.setFromEuler(e);
      m.obj.quaternion.premultiply(dq);
      if (m.obj.position.y <= m.floor) {
        m.obj.position.y = m.floor;
        m.vel.y = Math.abs(m.vel.y) * 0.25;
        m.vel.x *= 0.5; m.vel.z *= 0.5;
        m.ang.multiplyScalar(0.35);
        m.obj.quaternion.slerp(m.flatQ, 0.5);
        if (m.vel.lengthSq() < 0.05) { m.obj.quaternion.copy(m.flatQ); m.active = false; }
      }
    }
  }
}
