// Kilpailuympäristö: taivas, maasto, kenttä, katsomo + yleisö, tuomaritorni, metsä, liput ja tulostaulu.
import * as THREE from 'three';
import { GeoBuilder, vcolLambert, vcolStd } from './builder.js';
import * as T from './textures.js';
import { ARENA, START_LINE, FINISH_LINE } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);
const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.38).normalize();

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.flags = [];
    this.cheerLevel = 0;
    this.time = 0;
    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildArenaFence();
    this.buildLines();
    this.buildGrandstand();
    this.buildJudgeBooth();
    this.buildTrees();
    this.buildHills();
    this.buildClouds();
    this.buildFlags();
    this.buildScoreboard();
    this.buildFloodlights();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(480, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#2f6fcf') },
        horizon: { value: new THREE.Color('#cfe5f6') },
        bottom: { value: new THREE.Color('#8fae80') },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0,0.92,0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#cfe5f6', 140, 420);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight('#cfe6ff', '#5d7d3c', 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 40; sc.bottom = -40; sc.near = 20; sc.far = 200;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.sun = sun;
  }

  buildGround() {
    const grass = new THREE.Mesh(new THREE.CircleGeometry(460, 48), new THREE.MeshLambertMaterial({ map: T.grassTexture() }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const w = ARENA.maxX - ARENA.minX, d = ARENA.maxZ - ARENA.minZ;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, d + 1.2), new THREE.MeshStandardMaterial({ map: T.sandTexture(), roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.012;
    sand.receiveShadow = true;
    this.scene.add(sand);

    // lämmittelyalueen ja käytävien hiekka
    const path = new THREE.Mesh(new THREE.PlaneGeometry(8, 22), new THREE.MeshLambertMaterial({ color: '#c8a774' }));
    path.rotation.x = -Math.PI / 2; path.position.set(11, 0.008, 41); path.receiveShadow = true;
    this.scene.add(path);
  }

  buildArenaFence() {
    const b = new GeoBuilder();
    const post = new THREE.BoxGeometry(0.11, 1.05, 0.11);
    const rail = new THREE.BoxGeometry(1, 0.07, 0.05);
    const cap = new THREE.SphereGeometry(0.08, 8, 6);
    const { minX, maxX, minZ, maxZ } = ARENA;
    const gate = [8, 14]; // sisäänmenoaukko +z-päädyssä
    const sides = [
      { a: [minX, minZ], b: [maxX, minZ] },
      { a: [maxX, minZ], b: [maxX, maxZ] },
      { a: [maxX, maxZ], b: [gate[1], maxZ] },
      { a: [gate[0], maxZ], b: [minX, maxZ] },
      { a: [minX, maxZ], b: [minX, minZ] },
    ];
    for (const s of sides) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.round(len / 2.5));
      const ang = Math.atan2(-dz, dx);
      for (let i = 0; i <= n; i++) {
        const x = s.a[0] + dx * i / n, z = s.a[1] + dz * i / n;
        b.add(post, '#ffffff', [x, 0.52, z]);
        b.add(cap, '#ffffff', [x, 1.07, z]);
      }
      for (const y of [0.5, 0.95]) b.add(rail, '#f4f4f4', [(s.a[0] + s.b[0]) / 2, y, (s.a[1] + s.b[1]) / 2], [0, ang, 0], [len, 1, 1]);
    }
    // portin pylväät + kukat
    for (const gx of gate) {
      b.add(new THREE.BoxGeometry(0.25, 1.8, 0.25), '#1d3557', [gx, 0.9, maxZ]);
      b.add(new THREE.SphereGeometry(0.3, 10, 8), '#ff4d6d', [gx, 2.0, maxZ]);
    }
    // kukkaruukut kulmissa
    for (const [x, z] of [[minX + 1, minZ + 1], [maxX - 1, minZ + 1], [minX + 1, maxZ - 1], [maxX - 1.2, maxZ - 1]]) {
      b.add(new THREE.CylinderGeometry(0.45, 0.35, 0.5, 10), '#8d5524', [x, 0.25, z]);
      for (let i = 0; i < 9; i++) b.add(new THREE.IcosahedronGeometry(0.14, 0), ['#ff4d6d', '#ffd60a', '#ffffff', '#c77dff'][i % 4], [x + rand(-0.3, 0.3), 0.62 + rand(0, 0.12), z + rand(-0.3, 0.3)]);
      b.add(new THREE.SphereGeometry(0.4, 8, 6), '#3a7d2c', [x, 0.55, z], [0, 0, 0], [1, 0.5, 1]);
    }
    this.scene.add(b.build(vcolStd({ roughness: 0.6 })));

    // mainosbanderollit kentän laidoilla
    const banners = [
      ['KEPPARI CUP 2026', '#102a54', '#ffd666'],
      ['Keppariseura Laukka ry', '#e63946', '#ffffff'],
      ['Heinähattu – mehua ja hyppyjä', '#2a9d8f', '#ffffff'],
      ['Kaurala – aamun voimaa', '#ffd60a', '#102a54'],
      ['Hyppää rohkeasti!', '#7b2cbf', '#ffffff'],
      ['Puhdas rata = nolla!', '#1d4ed8', '#ffffff'],
    ];
    const bw = 4.2, bh = 0.75;
    let k = 0;
    const place = (x, z, ry) => {
      const [t, bg, fg] = banners[k++ % banners.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshLambertMaterial({ map: T.bannerTexture(t, bg, fg) }));
      m.position.set(x, 0.62, z); m.rotation.y = ry;
      this.scene.add(m);
    };
    for (let x = -14; x <= 14; x += 7) place(x, minZ + 0.06, 0);
    for (let z = -24; z <= 24; z += 8) place(minX + 0.06, z, Math.PI / 2);
    for (let z = -20; z <= 20; z += 10) place(maxX - 0.06, z, -Math.PI / 2);
  }

  buildLines() {
    const make = (def, label) => {
      const g = new THREE.Group();
      g.position.set(def.x, 0, def.z); g.rotation.y = def.dir;
      const b = new GeoBuilder();
      for (const side of [-1, 1]) {
        const x = side * def.w / 2;
        b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), '#ffffff', [x, 0.85, 0]);
        b.add(new THREE.BoxGeometry(0.16, 0.22, 0.12), '#222222', [x, 0.75, 0]);       // valokenno
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), '#ff3b30', [x - side * 0.08, 0.75, 0], [0, 0, Math.PI / 2]);
        b.add(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 12), '#333333', [x, 0.03, 0]);
      }
      g.add(b.build(vcolStd()));
      // liput: punainen oikealla, valkoinen vasemmalla (ratsastussuunnassa)
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(side * 0.45, -0.15); shape.lineTo(0, -0.3);
        const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: side > 0 ? '#e01e37' : '#ffffff', side: THREE.DoubleSide }));
        flag.position.set(side * def.w / 2, 1.68, 0);
        g.add(flag);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), new THREE.MeshBasicMaterial({ map: T.signTexture(label, label === 'MAALI' ? '#e01e37' : '#1a7f37'), side: THREE.DoubleSide }));
      sign.position.set(def.w / 2 + 0.62, 1.45, 0);
      g.add(sign);
      // liitulinja
      const line = new THREE.Mesh(new THREE.PlaneGeometry(def.w, 0.08), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }));
      line.rotation.x = -Math.PI / 2; line.position.y = 0.02;
      g.add(line);
      this.scene.add(g);
    };
    make(START_LINE, 'LÄHTÖ');
    make(FINISH_LINE, 'MAALI');
  }

  buildGrandstand() {
    const b = new GeoBuilder();
    const x0 = 21, tiers = 6, depth = 1.15, rise = 0.55, len = 46;
    for (let i = 0; i < tiers; i++) {
      const top = 0.45 + i * rise;
      b.add(new THREE.BoxGeometry(depth, top, len), i % 2 ? '#d9dde3' : '#c4c9d1', [x0 + i * depth + depth / 2, top / 2, 0]);
      b.add(new THREE.BoxGeometry(0.4, 0.12, len), ['#1d4ed8', '#e63946', '#ffd60a'][i % 3], [x0 + i * depth + 0.75, top + 0.06, 0]); // istuinrivi
    }
    const backX = x0 + tiers * depth;
    b.add(new THREE.BoxGeometry(0.3, 6.5, len), '#9aa4b1', [backX + 0.15, 3.25, 0]);
    // katto
    for (let z = -len / 2; z <= len / 2; z += len / 6) b.add(new THREE.CylinderGeometry(0.1, 0.1, 6.4, 8), '#5c6b7a', [x0 + 0.3, 3.2, z]);
    b.add(new THREE.BoxGeometry(tiers * depth + 1.6, 0.18, len + 1), '#102a54', [x0 + tiers * depth / 2, 6.5, 0], [0, 0, -0.08]);
    b.add(new THREE.BoxGeometry(0.1, 0.9, len + 1), '#ffd666', [x0 - 0.35, 6.1, 0]);
    // portaat
    for (const z of [-len / 2 - 0.6, len / 2 + 0.6]) for (let i = 0; i < tiers; i++) b.add(new THREE.BoxGeometry(depth, 0.45 + i * rise, 1.1), '#aab2bd', [x0 + i * depth + depth / 2, (0.45 + i * rise) / 2, z]);
    this.scene.add(b.build(vcolLambert()));

    const nameBoard = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.85), new THREE.MeshBasicMaterial({ map: T.bannerTexture('KEPPARI CUP 2026', '#102a54', '#ffd666', 'Esteratsastuksen kilpailut') }));
    nameBoard.position.set(x0 - 0.42, 6.1, 0); nameBoard.rotation.y = -Math.PI / 2;
    this.scene.add(nameBoard);

    // yleisö (instansoitu)
    const seats = [];
    for (let i = 0; i < tiers; i++) {
      for (let z = -len / 2 + 0.6; z < len / 2 - 0.4; z += 0.72) {
        if (Math.random() < (this.quality === 'low' ? 0.5 : 0.18)) continue;
        seats.push({ x: x0 + i * depth + 0.75 + rand(-0.05, 0.05), y: 0.45 + i * rise + 0.12, z: z + rand(-0.1, 0.1) });
      }
    }
    // seisovia katsojia aidan takana
    for (let i = 0; i < 40; i++) seats.push({ x: rand(-16, 16), y: 0, z: ARENA.minZ - rand(1.6, 3.5), stand: true });
    for (let i = 0; i < 30; i++) seats.push({ x: ARENA.minX - rand(1.6, 3.5), y: 0, z: rand(-26, 4), stand: true });
    const n = seats.length;
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.42, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const hairGeo = new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.crowdBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), n);
    this.crowdHead = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), n);
    this.crowdHair = new THREE.InstancedMesh(hairGeo, new THREE.MeshLambertMaterial(), n);
    const shirt = ['#e63946', '#1d4ed8', '#ffd60a', '#2a9d8f', '#f4a261', '#ffffff', '#9b5de5', '#ff70a6', '#264653', '#90be6d'];
    const skin = ['#f1c27d', '#e0ac69', '#ffdbac', '#c68642', '#8d5524'];
    const hair = ['#2b1b10', '#5a3a22', '#e8c07a', '#1a1a1a', '#a0522d', '#d9d9d9'];
    const c = new THREE.Color();
    this.crowd = seats.map((s, i) => {
      this.crowdBody.setColorAt(i, c.set(shirt[i % shirt.length]));
      this.crowdHead.setColorAt(i, c.set(skin[(i * 7) % skin.length]));
      this.crowdHair.setColorAt(i, c.set(hair[(i * 3) % hair.length]));
      return { ...s, phase: rand(0, 10), speed: rand(6, 10), scale: rand(0.9, 1.1) * (s.stand ? 1.1 : 1) };
    });
    for (const m of [this.crowdBody, this.crowdHead, this.crowdHair]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); m.castShadow = false; }
    this.updateCrowd(0, true);
  }

  updateCrowd(t, force) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const lvl = this.cheerLevel;
    if (!force && lvl < 0.01 && (this._crowdFrame = (this._crowdFrame || 0) + 1) % 6) return;
    this.crowd.forEach((c, i) => {
      const jump = lvl * Math.max(0, Math.sin(t * c.speed + c.phase)) * 0.28;
      const sway = Math.sin(t * 1.3 + c.phase) * 0.025;
      const baseY = c.y + (c.stand ? 0.62 : 0.33) * c.scale;
      s.setScalar(c.scale);
      p.set(c.x, baseY + jump, c.z + sway);
      m.compose(p, q, s); this.crowdBody.setMatrixAt(i, m);
      p.set(c.x, baseY + (0.48 * c.scale) + jump, c.z + sway * 1.5);
      m.compose(p, q, s); this.crowdHead.setMatrixAt(i, m);
      p.y += 0.035 * c.scale;
      m.compose(p, q, s); this.crowdHair.setMatrixAt(i, m);
    });
    this.crowdBody.instanceMatrix.needsUpdate = true;
    this.crowdHead.instanceMatrix.needsUpdate = true;
    this.crowdHair.instanceMatrix.needsUpdate = true;
  }

  cheer(level = 1, duration = 3) {
    this.cheerLevel = Math.max(this.cheerLevel, level);
    this.cheerUntil = this.time + duration;
  }

  buildJudgeBooth() {
    const b = new GeoBuilder();
    const x = -22.5, z = 14, w = 3.2, d = 2.6, h = 2.8;
    const wood = '#b5651d', dark = '#7a4010';
    b.add(new THREE.BoxGeometry(d, 0.9, w), '#3d4f63', [x, 0.45, z]);               // jalusta
    b.add(new THREE.BoxGeometry(0.12, h, w), wood, [x - d / 2, 0.9 + h / 2, z]);       // takaseinä
    for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(d, h, 0.12), wood, [x, 0.9 + h / 2, z + s * w / 2]);
    b.add(new THREE.BoxGeometry(0.12, 1.0, w), dark, [x + d / 2, 0.9 + 0.5, z]);       // tiski
    b.add(new THREE.BoxGeometry(d + 0.6, 0.15, w + 0.6), '#102a54', [x, 0.9 + h + 0.08, z]);
    b.add(new THREE.BoxGeometry(d + 0.2, 0.6, w + 0.2), '#e63946', [x, 0.9 + h + 0.45, z], [0, 0, 0], [1, 1, 1]);
    // portaat
    for (let i = 0; i < 3; i++) b.add(new THREE.BoxGeometry(0.4, 0.3 * (i + 1), 1), '#3d4f63', [x + d / 2 + 0.2 + (2 - i) * 0.4, 0.15 * (i + 1), z + w / 2 + 0.6]);
    // tuomari
    b.add(new THREE.CapsuleGeometry(0.25, 0.5, 4, 8), '#1d3557', [x - 0.3, 0.9 + 0.75, z]);
    b.add(new THREE.SphereGeometry(0.16, 12, 10), '#f1c27d', [x - 0.3, 0.9 + 1.32, z]);
    b.add(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), '#3b2314', [x - 0.32, 0.9 + 1.36, z]);
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), '#ffffff', [x - 0.3, 0.9 + 1.42, z]); // hattu
    b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 16), '#ffffff', [x - 0.3, 0.9 + 1.5, z]);
    // kello
    b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), '#444', [x + 0.9, 1.9 + 0.17, z - 1.0]);
    b.add(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ffcc33', [x + 0.9, 2.08, z - 1.0], [Math.PI, 0, 0]);
    this.scene.add(b.build(vcolStd()));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: T.signTexture('TUOMARI', '#102a54') }));
    sign.position.set(x + d / 2 + 0.12, 0.9 + h + 0.45, z); sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
    this.judgePos = new THREE.Vector3(x, 2.2, z);
  }

  buildTrees() {
    const nSpruce = this.quality === 'low' ? 90 : 190, nBirch = this.quality === 'low' ? 40 : 80;
    const spots = [];
    const ok = (x, z) => !(x > 15 && x < 34 && Math.abs(z) < 30) && Math.hypot(x, z) > 46;
    while (spots.length < nSpruce + nBirch) {
      const a = rand(0, Math.PI * 2), r = rand(46, 160);
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.1;
      if (ok(x, z)) spots.push([x, z]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const tierGeo = new THREE.ConeGeometry(1, 1, 9);
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1, 6);
    const tiers = [0, 1, 2].map(() => new THREE.InstancedMesh(tierGeo, new THREE.MeshLambertMaterial({ color: '#2d5a27' }), nSpruce));
    const sTrunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#5a3a22' }), nSpruce);
    const bTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 7), new THREE.MeshLambertMaterial({ map: T.birchTexture() }), nBirch);
    const bLeaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#6aa84f', flatShading: true }), nBirch * 2);
    const col = new THREE.Color();
    for (let i = 0; i < nSpruce; i++) {
      const [x, z] = spots[i];
      const h = rand(7, 15), w = h * rand(0.28, 0.36);
      q.identity();
      m.compose(p.set(x, 1, z), q, s.set(1, 2, 1)); sTrunk.setMatrixAt(i, m);
      for (let t = 0; t < 3; t++) {
        const th = h * (0.55 - t * 0.1), ty = 1.2 + t * h * 0.24 + th / 2, tw = w * (1 - t * 0.27);
        m.compose(p.set(x, ty, z), q, s.set(tw, th, tw)); tiers[t].setMatrixAt(i, m);
        tiers[t].setColorAt(i, col.set('#2d5a27').offsetHSL(rand(-0.02, 0.02), 0, rand(-0.06, 0.05)));
      }
    }
    for (let i = 0; i < nBirch; i++) {
      const [x, z] = spots[nSpruce + i];
      const h = rand(6, 10);
      m.compose(p.set(x, h / 2, z), q.identity(), s.set(1, h, 1)); bTrunk.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        const r = rand(1.6, 2.4);
        m.compose(p.set(x + rand(-0.6, 0.6), h * 0.8 + k * 1.3, z + rand(-0.6, 0.6)), q, s.set(r, r * 1.15, r)); bLeaf.setMatrixAt(i * 2 + k, m);
        bLeaf.setColorAt(i * 2 + k, col.set('#6aa84f').offsetHSL(rand(-0.03, 0.03), 0, rand(-0.06, 0.06)));
      }
    }
    for (const mesh of [...tiers, sTrunk, bTrunk, bLeaf]) { mesh.castShadow = false; this.scene.add(mesh); }
  }

  buildHills() {
    const segs = 96, R = 330;
    const pos = [], idx = [], col = [];
    const cA = new THREE.Color('#3d6b45'), cB = new THREE.Color('#6f8fa8');
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const hgt = 18 + 14 * Math.sin(a * 3 + 1) + 9 * Math.sin(a * 7 + 2) + 5 * Math.sin(a * 13);
      pos.push(Math.cos(a) * R, -2, Math.sin(a) * R, Math.cos(a) * R, hgt, Math.sin(a) * R);
      col.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
    this.scene.add(hills);
    // lähempiä kumpuja
    const b = new GeoBuilder();
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), r = rand(170, 260);
      b.add(new THREE.SphereGeometry(1, 16, 8), '#4f7f3f', [Math.cos(a) * r, -4, Math.sin(a) * r], [0, 0, 0], [rand(30, 60), rand(10, 22), rand(30, 60)]);
    }
    this.scene.add(b.build(vcolLambert(), { castShadow: false, receiveShadow: false }));
  }

  buildClouds() {
    const tex = T.cloudTexture();
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: rand(0.6, 0.95), fog: false, depthWrite: false }));
      const a = rand(0, Math.PI * 2), r = rand(140, 300);
      sp.position.set(Math.cos(a) * r, rand(70, 130), Math.sin(a) * r);
      const s = rand(60, 120); sp.scale.set(s, s / 2, 1);
      this.scene.add(sp); this.clouds.push(sp);
    }
  }

  buildFlags() {
    const tex = T.finnishFlagTexture();
    const spots = [[-12, -36], [-4, -36], [4, -36], [12, -36], [6.5, 31.5], [15.5, 31.5]];
    const b = new GeoBuilder();
    for (const [x, z] of spots) {
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 8, 8), '#e8e8e8', [x, 4, z]);
      b.add(new THREE.SphereGeometry(0.12, 8, 6), '#ffd666', [x, 8.05, z]);
      const geo = new THREE.PlaneGeometry(2.2, 1.35, 14, 6);
      geo.translate(1.1, 0, 0);
      const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      flag.position.set(x + 0.06, 7.2, z);
      flag.rotation.y = rand(-0.3, 0.3) - 0.6;
      flag.userData.base = geo.attributes.position.array.slice();
      flag.userData.phase = rand(0, 6);
      this.scene.add(flag); this.flags.push(flag);
    }
    this.scene.add(b.build(vcolStd({ metalness: 0.3, roughness: 0.4 })));
  }

  buildFloodlights() {
    const b = new GeoBuilder();
    for (const [x, z] of [[-20, -32], [20, -32], [-20, 32], [20, 33]]) {
      b.add(new THREE.CylinderGeometry(0.15, 0.25, 14, 8), '#8a96a3', [x, 7, z]);
      b.add(new THREE.BoxGeometry(2.4, 1.2, 0.3), '#3a4654', [x, 14.2, z], [0.3 * Math.sign(-z), Math.atan2(-x, -z), 0]);
      b.add(new THREE.BoxGeometry(2.2, 1.0, 0.05), '#fffbe0', [x - Math.sign(x) * 0.12, 14.2, z - Math.sign(z) * 0.18], [0.3 * Math.sign(-z), Math.atan2(-x, -z), 0]);
    }
    this.scene.add(b.build(vcolStd({ roughness: 0.5 }), { castShadow: false }));
  }

  buildScoreboard() {
    const [c, g] = T.makeCanvas(1024, 400);
    this.sbCanvas = c; this.sbCtx = g;
    this.sbTex = T.toTexture(c);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.7), new THREE.MeshBasicMaterial({ map: this.sbTex, toneMapped: false }));
    screen.position.set(0, 5.6, -36);
    this.scene.add(screen);
    const b = new GeoBuilder();
    b.add(new THREE.BoxGeometry(12.6, 5.3, 0.4), '#1b1f27', [0, 5.6, -36.25]);
    for (const x of [-4.5, 4.5]) b.add(new THREE.BoxGeometry(0.4, 3.4, 0.4), '#3a4654', [x, 1.7, -36.3]);
    this.scene.add(b.build(vcolStd()));
    this.setScoreboard({ title: 'KEPPARI CUP 2026', line1: 'Tervetuloa kisoihin!', line2: '', time: '', vp: '' });
  }

  setScoreboard({ title = '', line1 = '', line2 = '', time = '', vp = '', status = '', statusColor = '#ffd666' }) {
    const key = [title, line1, line2, time, vp, status].join('|');
    if (key === this._sbKey) return;
    this._sbKey = key;
    const g = this.sbCtx;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 1024, 400);
    // LED-pistekuvio
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < 400; y += 6) g.fillRect(0, y, 1024, 2);
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd666'; g.font = '900 44px system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText(title, 30, 44);
    g.fillStyle = '#ffffff'; g.font = '700 50px system-ui, sans-serif';
    g.fillText(line1, 30, 124);
    g.fillStyle = '#9fd3ff'; g.font = '600 38px system-ui, sans-serif';
    g.fillText(line2, 30, 186);
    g.font = '900 120px ui-monospace, "SF Mono", Menlo, monospace';
    g.fillStyle = '#ff5a36'; g.textAlign = 'left';
    g.fillText(time, 30, 300);
    g.textAlign = 'right'; g.fillStyle = '#7CFC00';
    g.fillText(vp, 994, 300);
    if (status) { g.textAlign = 'center'; g.fillStyle = statusColor; g.font = '900 46px system-ui, sans-serif'; g.fillText(status, 512, 372); }
    g.textAlign = 'right'; g.fillStyle = '#888'; g.font = '600 26px system-ui, sans-serif';
    g.fillText('AIKA', 994 - 0, 44);
    this.sbTex.needsUpdate = true;
  }

  update(dt, t) {
    this.time = t;
    if (this.cheerUntil && t > this.cheerUntil) this.cheerLevel = Math.max(0, this.cheerLevel - dt * 0.8);
    this.updateCrowd(t);
    for (const f of this.flags) {
      const pos = f.geometry.attributes.position, base = f.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(x * 2.4 - t * 5 + f.userData.phase) * 0.12 * x;
        pos.array[i * 3 + 1] = base[i * 3 + 1] - x * 0.05;
      }
      pos.needsUpdate = true;
    }
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > 320) c.position.x = -320; }
  }
}
