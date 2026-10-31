// Ratsastajan oma keppihevonen (näkyy ensimmäisestä persoonasta), hanskat ja ohjat.
import * as THREE from 'three';

const RAINBOW = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
const rand = (a, b) => a + Math.random() * (b - a);

export class Mount {
  constructor() {
    this.group = new THREE.Group();     // kiinnitetään kehon suuntaan (ei pään)
    this.bob = new THREE.Group();
    this.group.add(this.bob);
    this.def = null;
  }

  std(color, rough = 0.85) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); }

  setHorse(def) {
    this.def = def;
    this.bob.clear();
    const coat = this.std(def.coat, 0.95);
    const muzzleM = this.std(def.muzzle, 0.9);
    const dark = this.std('#111111', 0.3);
    const strap = this.std(def.bridle, 0.55);
    const brow = new THREE.MeshStandardMaterial({ color: def.brow, roughness: 0.25, metalness: 0.4 });
    const metal = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.25, metalness: 0.9 });

    // --- kaula ja keppi (kehon koordinaatisto: eteenpäin -z, jalat y=0) ---
    const neckBase = new THREE.Vector3(0, 0.84, -0.42);
    const poll = new THREE.Vector3(0, 1.05, -0.60);
    const stickEnd = new THREE.Vector3(0, 0.12, 0.55);

    const stick = cylinderBetween(neckBase, stickEnd, 0.017, this.std('#c08a4f', 0.6));
    this.bob.add(stick);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), this.std('#e63946', 0.5));
    tip.position.copy(stickEnd); this.bob.add(tip);

    const neck = cylinderBetween(neckBase, poll, 0.075, coat, 0.06);
    this.bob.add(neck);
    const neckCuff = cylinderBetween(neckBase.clone().add(new THREE.Vector3(0, -0.02, 0.01)), neckBase.clone().add(new THREE.Vector3(0, 0.03, -0.01)), 0.08, this.std(def.brow, 0.6));
    this.bob.add(neckCuff);

    // --- pää ---
    const head = new THREE.Group();
    head.position.copy(poll);
    head.rotation.x = -0.4;
    this.bob.add(head);
    this.head = head;

    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.095, 0.30, 18, 1), coat);
    face.rotation.x = -Math.PI / 2; face.position.z = -0.15; face.scale.set(0.8, 1, 1);
    head.add(face);
    const jowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), coat);
    jowl.position.set(0, -0.025, -0.02); jowl.scale.set(0.82, 1.0, 1.0);
    head.add(jowl);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.068, 18, 14), muzzleM);
    muzzle.position.set(0, -0.012, -0.30); muzzle.scale.set(0.85, 0.85, 1.12);
    head.add(muzzle);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark);
      n.position.set(s * 0.03, 0.02, -0.365); n.scale.set(1, 0.7, 0.6);
      head.add(n);
      // silmät + kiilto + ripset
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), dark);
      eye.position.set(s * 0.07, 0.03, -0.075);
      head.add(eye);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      hl.position.set(s * 0.083, 0.042, -0.082);
      head.add(hl);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, 4, 10, Math.PI), dark);
      lash.position.copy(eye.position); lash.rotation.set(0, s * Math.PI / 2, 0);
      head.add(lash);
      // korvat
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 10), coat);
      ear.position.set(s * 0.045, 0.06, 0.04);
      ear.rotation.set(0.5, 0, -s * 0.25);
      head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.07, 8), this.std('#f2b5b5'));
      inner.position.set(s * 0.045, 0.062, 0.032); inner.rotation.copy(ear.rotation);
      head.add(inner);
      this['ear' + (s > 0 ? 'R' : 'L')] = ear;
      // poskihihnat + kuolaimen renkaat
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.27), strap);
      cheek.position.set(s * 0.078, -0.01, -0.15); cheek.rotation.x = 0.05;
      head.add(cheek);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), metal);
      ring.position.set(s * 0.062, -0.045, -0.3); ring.rotation.y = Math.PI / 2;
      head.add(ring);
    }
    // otsapanta (bling) ja turparemmi
    const browband = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 8, 28), brow);
    browband.position.set(0, 0.005, 0.0); browband.scale.set(0.85, 1.05, 1);
    head.add(browband);
    const nose = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.01, 8, 24), strap);
    nose.position.set(0, -0.005, -0.235); nose.scale.set(0.82, 1.0, 1);
    head.add(nose);
    if (def.blaze) {
      const blaze = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.24), this.std('#f5f2ea'));
      blaze.rotation.x = -Math.PI / 2 - 0.12; blaze.position.set(0, 0.083, -0.16);
      head.add(blaze);
      const star = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.std('#f5f2ea'));
      star.rotation.x = -Math.PI / 2 + 0.25; star.position.set(0, 0.095, -0.04);
      head.add(star);
    }
    if (def.horn) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2, 14), new THREE.MeshStandardMaterial({ color: '#ffe066', metalness: 0.7, roughness: 0.25, emissive: '#5a4500' }));
      horn.position.set(0, 0.12, -0.03); horn.rotation.x = -0.5;
      head.add(horn);
    }

    // --- harja ja otsatukka ---
    const maneColor = (i) => def.mane === 'rainbow' ? RAINBOW[i % RAINBOW.length] : def.mane;
    const maneMats = new Map();
    const mm = (c) => { if (!maneMats.has(c)) maneMats.set(c, this.std(c, 1)); return maneMats.get(c); };
    // pehmeä lankaharja: ohuita säikeitä, jotka laskeutuvat kaulan oikealle puolelle
    const strandGeo = new THREE.BoxGeometry(0.007, 0.13, 0.016);
    strandGeo.translate(0, -0.065, 0);
    this.strands = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = new THREE.Vector3().lerpVectors(poll, neckBase, t);
      p.z += 0.055; p.y += 0.035;
      for (let k = 0; k < 3; k++) {
        const side = k === 2 ? -1 : 1;
        const st = new THREE.Mesh(strandGeo, mm(maneColor(i + k)));
        st.position.set(side * (0.012 + k * 0.006), p.y + rand(-0.008, 0.008), p.z + rand(-0.012, 0.012));
        st.rotation.set(rand(-0.25, 0.05), 0, -side * rand(0.25, 0.55));
        st.scale.y = rand(0.75, 1.25) * (1 - t * 0.25);
        st.userData.base = st.rotation.z;
        st.userData.bx = st.rotation.x;
        this.bob.add(st); this.strands.push(st);
      }
    }
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(strandGeo, mm(maneColor(i + 2)));
      st.position.set(rand(-0.015, 0.015), 0.085, 0.01);
      st.rotation.set(1.3 + rand(-0.15, 0.1), rand(-0.3, 0.3), rand(-0.2, 0.2));
      st.scale.y = 0.8;
      head.add(st);
    }

    // --- hanskat ja hihat ---
    const glove = this.std(def.glove, 0.7);
    const sleeve = this.std('#102a54', 0.8);
    this.hands = [];
    for (const s of [-1, 1]) {
      const hand = new THREE.Group();
      hand.position.set(s * 0.1, 0.93, -0.27);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), glove);
      fist.scale.set(0.95, 0.8, 1.15);
      hand.add(fist);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 8), glove);
      thumb.position.set(-s * 0.03, 0.03, -0.02); thumb.rotation.set(0.6, 0, s * 0.9);
      hand.add(thumb);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.04, 12), this.std('#ffffff', 0.8));
      cuff.position.set(s * 0.012, -0.005, 0.06); cuff.rotation.x = Math.PI / 2 - 0.4;
      hand.add(cuff);
      this.bob.add(hand);
      const arm = cylinderBetween(new THREE.Vector3(s * 0.112, 0.92, -0.2), new THREE.Vector3(s * 0.21, 1.02, 0.1), 0.042, sleeve, 0.05);
      this.bob.add(arm);
      this.hands.push(hand);
    }

    // --- ohjat: kuolaimesta käsiin ---
    this.bob.updateMatrixWorld(true);
    const reinMat = this.std(def.bridle, 0.6);
    for (const s of [-1, 1]) {
      const bit = new THREE.Vector3(s * 0.065, -0.045, -0.3);
      head.updateMatrix();
      bit.applyMatrix4(head.matrix);
      const hand = new THREE.Vector3(s * 0.1, 0.93, -0.3);
      const mid = bit.clone().lerp(hand, 0.5); mid.y -= 0.06; mid.x += s * 0.03;
      const curve = new THREE.CatmullRomCurve3([bit, mid, hand]);
      const rein = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 6, false), reinMat);
      this.bob.add(rein);
    }
    // ohjien yhdistävä lenkki
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 20, Math.PI), reinMat);
    loop.position.set(0, 0.91, -0.28); loop.rotation.set(Math.PI / 2 + 0.6, 0, 0);
    this.bob.add(loop);

    this.bob.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  // phase = laukka-askeleen vaihe (0..1), speed m/s, air = hypyn korkeus
  update(dt, t, phase, speedFactor, airH, airing) {
    const ph = phase * Math.PI * 2;
    const k = Math.min(1, speedFactor);
    const nod = airing ? -0.25 * Math.min(1, airH * 2) : Math.sin(ph) * 0.09 * k;
    this.head.rotation.x = -0.4 + nod;
    this.bob.position.y = (airing ? 0.05 : Math.sin(ph + 0.6) * 0.022 * k);
    this.bob.position.z = airing ? -0.05 : Math.cos(ph) * 0.012 * k;
    this.bob.rotation.x = airing ? -0.12 : Math.sin(ph) * 0.03 * k;
    for (let i = 0; i < this.strands.length; i++) {
      const st = this.strands[i];
      const sway = Math.sin(ph * 2 + i * 0.7) * 0.1 * k + Math.sin(t * 7 + i) * 0.03;
      st.rotation.z = st.userData.base + sway + (airing ? Math.sign(st.userData.base) * -0.15 : 0);
      st.rotation.x = st.userData.bx - k * 0.25 - (airing ? 0.25 : 0);
    }
    const ear = Math.sin(t * 0.7) > 0.95 ? 0.25 : 0;
    this.earL.rotation.y = ear; this.earR.rotation.y = -ear;
  }
}

function cylinderBetween(a, b, r, mat, r2) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r2 ?? r, r, len, 14, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
