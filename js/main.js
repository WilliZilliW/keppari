// KEPPARI VR – esteratsastus ratsastajan silmin. WebXR (Android + VR-lasit) + Cardboard-varatila + ruutu.
import * as THREE from 'three';
import { EYE, ARENA, SPAWN, START_LINE, FINISH_LINE, LAYOUT, CLASSES, HORSES, FENCE_THEMES, FENCE_W } from './config.js';
import { World } from './world.js';
import { Fence } from './fences.js';
import { Mount } from './horse.js';
import { GameAudio } from './audio.js';
import { Panel, Reticle, panelBg, text, wrapText, roundRect } from './ui3d.js';
import { VP, ELIM, START_WINDOW, timeFaults, fmtTime, generateField, rank } from './rules.js';
import { makeCanvas, toTexture } from './textures.js';
import { JumpDetector } from './motion.js';

// ---------------------------------------------------------------- asetukset
const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has('auto');
const AP_NOISE = parseFloat(params.get('auto') || '0') || 0;
const SIM = params.has('sim');
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const rand = (a, b) => a + Math.random() * (b - a);

const store = {
  get(k, d) { try { const v = localStorage.getItem('keppari.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('keppari.' + k, JSON.stringify(v)); } catch { /* yksityinen tila */ } },
};
const settings = Object.assign({
  name: '', shadows: true, bob: true, voice: true, music: true,
  assist: true, takeoffHelp: true, guide: true, classIdx: 0, horseIdx: 0,
  vrJump: 'body', phoneJump: 'swing',
}, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------------------------------------------------------------- renderöijä ja kohtaus
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.cameraAutoUpdate = false;
renderer.xr.setReferenceSpaceType('local');
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
const eye = new THREE.Group();
eye.position.y = EYE;
rig.add(eye); eye.add(camera); scene.add(rig);

const body = new THREE.Group();
scene.add(body);
const mount = new Mount();
body.add(mount.group);
mount.setHorse(HORSES[settings.horseIdx % HORSES.length]);

const world = new World(scene, { quality: settings.shadows ? 'high' : 'low' });
const audio = new GameAudio();
audio.voiceOn = settings.voice; audio.musicOn = settings.music;

const stereo = new THREE.StereoCamera();
stereo.eyeSep = 0.064;

// ---------------------------------------------------------------- pelin tila
const G = {
  state: 'title', mode: null, cls: CLASSES[settings.classIdx % CLASSES.length],
  allFences: [], course: [], nextIdx: 0, round: null, base: null, field: [],
  countdown: 0, voltAcc: 0, msg: null, time: 0, finishT: 0, readyT: 0,
  results: null, lastResult: null, lookYaw: 0, lookPitch: 0, apBack: false,
};
const P = { x: SPAWN.x, z: SPAWN.z, heading: 0, speed: 0, stun: 0, air: false, airT: 0, airDur: 0.6, peak: 0, h: 0, phase: 0, landT: -9, dip: 0 };
const JUDGE = { x: world.judgePos.x, z: world.judgePos.z, h: 5.2 };
const courseGroup = new THREE.Group();
scene.add(courseGroup);

// ---------------------------------------------------------------- rata
function buildCourse(cls) {
  for (const f of G.allFences) courseGroup.remove(f.group);
  G.allFences = [];
  const hasB = !!cls.types['5b'];
  LAYOUT.forEach((def, i) => {
    const type = cls.types[def.id];
    if (!type) return;
    const d = { ...def };
    if (!hasB && def.id === '5a') { d.id = '5'; d.combo = null; }
    const f = new Fence(d, type, cls.height, FENCE_THEMES[i % FENCE_THEMES.length], i);
    courseGroup.add(f.group);
    G.allFences.push(f);
  });
  G.course = G.allFences.slice();
  G.TA = computeTA(G.course, cls.refSpeed);
  G.TAjo = cls.jumpOff ? computeTA(G.allFences.filter(f => cls.jumpOff.includes(f.id)), cls.refSpeed * 1.08) : null;
  renderer.shadowMap.needsUpdate = true;
}

function computeTA(list, ref) {
  let L = 0, px = START_LINE.x, pz = START_LINE.z;
  for (const f of [...list.map(f => f.def), FINISH_LINE]) { L += Math.hypot(f.x - px, f.z - pz); px = f.x; pz = f.z; }
  return Math.ceil((L * 1.18) / ref);
}

function jumpParams(speed) {
  const cls = G.cls;
  const sf = clamp(0.72 + 0.3 * speed / cls.canter, 0.72, 1.04);
  const peak = (cls.height + cls.margin) * sf;
  return { peak, dur: 0.40 + 0.42 * peak };
}

// ---------------------------------------------------------------- 3D-käyttöliittymä
const reticle = new Reticle();
camera.add(reticle.group);

const hud = new Panel({ width: 0.66, pxW: 1024, pxH: 190, draw: drawHud });
hud.mesh.material.depthTest = false; hud.mesh.renderOrder = 50;
hud.mesh.position.set(0, -0.34, -1.15); hud.mesh.rotation.x = 0.28;
camera.add(hud.mesh);

const msgPanel = new Panel({ width: 0.95, pxW: 1024, pxH: 230, draw: drawMsg });
msgPanel.mesh.material.depthTest = false; msgPanel.mesh.renderOrder = 51;
msgPanel.mesh.position.set(0, 0.16, -1.25);
camera.add(msgPanel.mesh);
msgPanel.visible = false;

const menuPanel = new Panel({ width: 1.7, pxW: 1024, pxH: 800, draw: drawMenu });
const mapPanel = new Panel({ width: 0.95, pxW: 512, pxH: 820, draw: drawMap });
const rulesPanel = new Panel({ width: 0.95, pxW: 512, pxH: 820, draw: drawRules });
const resultPanel = new Panel({ width: 1.8, pxW: 1024, pxH: 900, draw: drawResults });
const worldPanels = [menuPanel, mapPanel, rulesPanel, resultPanel];
for (const p of worldPanels) { scene.add(p.mesh); p.visible = false; }
const interactive = [menuPanel, resultPanel];

// Seuraavan esteen opastusnuoli + ponnistusapu
const guide = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd666', emissive: '#a06a00', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), mat);
  cone.rotation.x = Math.PI;
  guide.add(cone);
  scene.add(guide);
}
const takeoff = new THREE.Group();
{
  const [c, g] = makeCanvas(256, 64);
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(124,252,0,0)'); grd.addColorStop(0.5, 'rgba(124,252,0,0.85)'); grd.addColorStop(1, 'rgba(124,252,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(FENCE_W, 0.7), new THREE.MeshBasicMaterial({ map: toTexture(c), transparent: true, depthWrite: false }));
  band.rotation.x = -Math.PI / 2; band.position.y = 0.03;
  takeoff.add(band);
  scene.add(takeoff);
}

// Ruusuke ja konfetti
const rosette = new THREE.Group();
scene.add(rosette); rosette.visible = false;
function buildRosette(place) {
  rosette.clear();
  const col = ['#1d4ed8', '#e63946', '#ffd60a'][place - 1] || '#ffffff';
  const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.32), std(col));
    tail.position.set(i ? 0.05 : -0.05, -0.2, -0.01); tail.rotation.z = i ? -0.25 : 0.25;
    rosette.add(tail);
  }
  const ruffle = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), std(col));
  rosette.add(ruffle);
  const ruffle2 = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 24), std('#ffffff'));
  ruffle2.position.z = 0.003; rosette.add(ruffle2);
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#ffd666'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#102a54'; g.font = '900 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(place + '.', 64, 68);
  const center = new THREE.Mesh(new THREE.CircleGeometry(0.095, 24), new THREE.MeshBasicMaterial({ map: toTexture(c) }));
  center.position.z = 0.006; rosette.add(center);
}
const CONF_N = 260;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_N);
confetti.visible = false; confetti.frustumCulled = false;
scene.add(confetti);
const confData = [];
{
  const cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff', '#ff70a6'];
  const c = new THREE.Color();
  for (let i = 0; i < CONF_N; i++) { confetti.setColorAt(i, c.set(cols[i % cols.length])); confData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }); }
}
function launchConfetti() {
  confetti.visible = true;
  G.confettiT = 9;
  for (const d of confData) {
    d.p.set(P.x + rand(-4, 4), rand(3.5, 7), P.z + rand(-4, 4));
    d.v.set(rand(-0.3, 0.3), rand(-1.2, -0.5), rand(-0.3, 0.3));
    d.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
    d.w.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
  }
}
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(1, 1, 1);
function updateConfetti(dt) {
  if (!confetti.visible) return;
  G.confettiT -= dt;
  if (G.confettiT <= 0) { confetti.visible = false; return; }
  confData.forEach((d, i) => {
    d.p.addScaledVector(d.v, dt);
    d.p.x += Math.sin(G.time * 2 + i) * dt * 0.3;
    if (d.p.y < 0.02) { d.p.y = 0.02; d.v.set(0, 0, 0); d.w.set(0, 0, 0); }
    d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
    _cq.setFromEuler(d.r);
    _cm.compose(d.p, _cq, _cs); confetti.setMatrixAt(i, _cm);
  });
  confetti.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- piirtofunktiot
function horseDef() { return HORSES[settings.horseIdx % HORSES.length]; }
function riderName() { return (settings.name || '').trim() || 'Sinä'; }

function drawMenu(g, p) {
  panelBg(g, 1024, 800);
  const cls = G.cls, h = horseDef();
  text(g, 'KEPPARI CUP 2026', 512, 62, { size: 56, weight: 900, color: '#ffd666', align: 'center' });
  text(g, 'Esteratsastus • SKHH ry:n säännöt', 512, 112, { size: 28, color: '#9fd3ff', align: 'center' });
  text(g, 'LUOKKA', 60, 190, { size: 26, color: '#9fb3d9' });
  p.button('clsPrev', 290, 155, 84, 70, '◀');
  text(g, cls.name, 627, 182, { size: 42, weight: 800, align: 'center' });
  text(g, cls.desc, 627, 226, { size: 22, color: '#cfd8ea', align: 'center', max: 480 });
  p.button('clsNext', 880, 155, 84, 70, '▶');
  text(g, 'KEPPIHEVONEN', 60, 312, { size: 26, color: '#9fb3d9' });
  p.button('horsePrev', 290, 277, 84, 70, '◀');
  text(g, h.name, 627, 302, { size: 42, weight: 800, align: 'center' });
  text(g, `(${h.desc}) – katso alas!`, 627, 342, { size: 22, color: '#cfd8ea', align: 'center' });
  p.button('horseNext', 880, 277, 84, 70, '▶');
  p.button('help', 60, 392, 290, 66, `Ponnistusapu: ${settings.takeoffHelp ? 'ON' : 'OFF'}`, { small: true });
  p.button('guide', 367, 392, 290, 66, `Opastus: ${settings.guide ? 'ON' : 'OFF'}`, { small: true });
  p.button('assist', 674, 392, 290, 66, settings.assist ? 'Kääntö: istuen' : 'Kääntö: seisten', { small: true });
  // hyppytapa + hyppytesti
  const jm = jumpMode();
  const canToggle = G.mode !== 'mono' || IS_TOUCH;
  const jlabel = { body: 'Hyppy: hyppää itse', swing: 'Hyppy: heilauta', tap: 'Hyppy: napautus', keys: 'Hyppy: välilyönti' }[jm];
  p.button('jumpMode', 60, 478, 430, 66, jlabel, { small: true, disabled: !canToggle });
  let test, tcol = '#cfd8ea';
  if (G.time - (G.jumpTestT || -9) < 1.6) { test = jm === 'swing' ? '✔ Heilautus tunnistettu!' : '✔ Hyppy tunnistettu!'; tcol = '#7CFC00'; }
  else if (G.sensorFallback && (jm === 'tap')) { test = 'Liikeanturi ei vastaa – käytä napautusta'; tcol = '#ff9f43'; }
  else if (jm === 'body') test = 'Testaa: hyppää nyt paikallasi!';
  else if (jm === 'swing') test = 'Testaa: heilauta puhelinta ylös!';
  else if (jm === 'tap') test = G.mode === 'mono' ? 'Napauta ruutua hypätäksesi' : 'Napauta näyttöä / lasien nappia';
  else test = 'Välilyönti tai hiiren klikkaus';
  text(g, test, 740, 511, { size: 26, weight: 700, color: tcol, align: 'center', max: 480 });
  const best = store.get('best.' + cls.id, null);
  text(g, `Enimmäisaika ${G.TA} s · Arvostelu ${cls.method} · Korkeus ${Math.round(cls.height * 100)} cm`, 512, 584, { size: 26, color: '#ffffff', align: 'center' });
  text(g, best ? `Oma ennätys: ${best.elim ? 'hylätty' : `${best.vp} vp / ${fmtTime(best.time)} s`}${best.place ? ` · ${best.place}. sija` : ''}` : 'Ei vielä tulosta tässä luokassa', 512, 622, { size: 24, color: '#ffd666', align: 'center' });
  p.button('start', 262, 648, 500, 106, 'ALOITA RATA ▶', { primary: true });
  text(g, G.mode === 'mono' ? (IS_TOUCH ? 'Napauta nappia' : 'Klikkaa nappia') : 'Valitse katsomalla nappia hetki tai napauta', 512, 778, { size: 22, color: '#8fa3c8', align: 'center' });
}

function drawMap(g) {
  panelBg(g, 512, 820, '#9fd3ff');
  text(g, 'RATAPIIRROS', 256, 48, { size: 40, weight: 900, color: '#9fd3ff', align: 'center' });
  text(g, G.cls.name, 256, 86, { size: 24, color: '#cfd8ea', align: 'center' });
  const sc = 10.6, left = 256 - 18 * sc, top = 112;
  const mx = (x) => left + (x - ARENA.minX) * sc, my = (z) => top + (z - ARENA.minZ) * sc;
  g.fillStyle = '#cfae7c'; roundRect(g, mx(ARENA.minX), my(ARENA.minZ), 36 * sc, 60 * sc, 10); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
  const line = (def, label, color) => {
    const rx = Math.cos(def.dir), rz = -Math.sin(def.dir);
    g.strokeStyle = color; g.lineWidth = 4; g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(mx(def.x - rx * def.w / 2), my(def.z - rz * def.w / 2)); g.lineTo(mx(def.x + rx * def.w / 2), my(def.z + rz * def.w / 2)); g.stroke();
    g.setLineDash([]);
    text(g, label, mx(def.x + rx * (def.w / 2 + 1.6)), my(def.z + rz * (def.w / 2 + 1.6)), { size: 22, weight: 900, color, align: 'center' });
  };
  line(START_LINE, 'LÄHTÖ', '#1a7f37');
  line(FINISH_LINE, 'MAALI', '#c1121f');
  const inJO = G.round && G.round.jumpOff;
  for (const f of G.allFences) {
    const d = f.def, rx = Math.cos(d.dir), rz = -Math.sin(d.dir), fx = -Math.sin(d.dir), fz = -Math.cos(d.dir);
    const active = !inJO || G.course.includes(f);
    g.globalAlpha = active ? 1 : 0.3;
    const seg = (s, color, wdt = 6) => {
      const cx = d.x + fx * s, cz = d.z + fz * s;
      g.strokeStyle = color; g.lineWidth = wdt; g.lineCap = 'round';
      g.beginPath(); g.moveTo(mx(cx - rx * FENCE_W / 2), my(cz - rz * FENCE_W / 2)); g.lineTo(mx(cx + rx * FENCE_W / 2), my(cz + rz * FENCE_W / 2)); g.stroke();
    };
    if (f.isWater) { for (let s = 0; s <= f.waterLen; s += 0.4) seg(s, '#3fa3e0', 5); }
    else for (const r of f.rails) seg(r.s, f.type === 'muuri' ? '#b5442e' : '#102a54');
    // suuntanuoli
    const ax = d.x - fx * 3.2, az = d.z - fz * 3.2, bx = d.x - fx * 1.0, bz = d.z - fz * 1.0;
    g.strokeStyle = '#e63946'; g.fillStyle = '#e63946'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(mx(ax), my(az)); g.lineTo(mx(bx), my(bz)); g.stroke();
    g.beginPath(); g.moveTo(mx(bx), my(bz)); g.lineTo(mx(bx - fx * 0.9 + rx * 0.6), my(bz - fz * 0.9 + rz * 0.6)); g.lineTo(mx(bx - fx * 0.9 - rx * 0.6), my(bz - fz * 0.9 - rz * 0.6)); g.closePath(); g.fill();
    const lx = d.x - fx * 2.0 + rx * 2.6, lz = d.z - fz * 2.0 + rz * 2.6;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(mx(lx), my(lz), 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#102a54'; g.lineWidth = 2; g.stroke();
    text(g, f.label, mx(lx), my(lz) + 1, { size: 20, weight: 900, color: '#102a54', align: 'center' });
    g.globalAlpha = 1;
  }
  text(g, `${inJO ? 'Uusinta' : 'Perusrata'} · Enimmäisaika ${inJO ? G.TAjo : G.TA} s`, 256, 790, { size: 24, color: '#ffffff', align: 'center' });
}

function drawRules(g) {
  panelBg(g, 512, 820, '#ff9f43');
  text(g, 'SÄÄNNÖT', 256, 48, { size: 40, weight: 900, color: '#ff9f43', align: 'center' });
  text(g, 'SKHH ry – esteratsastus', 256, 86, { size: 22, color: '#cfd8ea', align: 'center' });
  const rows = [
    ['Puomin pudotus', '4 vp'], ['Kielto / ohiratsastus', '4 vp'], ['Ylimääräinen voltti', '4 vp'],
    ['Vesihaudan kosketus', '4 vp'], ['Liikaa raviaskelia', '4 vp'], ['Yli enimmäisajan', '1 vp/4 s'],
  ];
  let y = 140;
  for (const [a, b] of rows) {
    text(g, a, 36, y, { size: 26, color: '#ffffff' });
    text(g, b, 476, y, { size: 26, weight: 800, color: '#ffd666', align: 'right' });
    y += 44;
  }
  text(g, 'HYLKÄYS', 36, y + 16, { size: 28, weight: 900, color: '#ff6b6b' });
  y += 58;
  for (const s of ['Toinen tottelemattomuus', 'Väärä este tai suunta', 'Kaksinkertainen enimmäisaika', 'Lähtö ennen kelloa / yli 45 s']) {
    text(g, '• ' + s, 36, y, { size: 24, color: '#ffffff' }); y += 38;
  }
  y += 16;
  wrapText(g, 'Kielto sarjaesteellä: koko sarja hypätään uudelleen. Tasapisteissä nopein aika voittaa (A.2.0).', 36, y, 440, 32, { size: 22, color: '#cfd8ea' });
}

function drawResults(g, p) {
  panelBg(g, 1024, 900);
  const R = G.results;
  if (!R) return;
  text(g, `TULOKSET – ${G.cls.name}`, 512, 56, { size: 46, weight: 900, color: '#ffd666', align: 'center' });
  text(g, R.headline, 512, 112, { size: 40, weight: 900, color: R.headColor, align: 'center' });
  text(g, R.detail, 512, 156, { size: 26, color: '#cfd8ea', align: 'center', max: 940 });
  const jo = !!G.cls.jumpOff;
  const y0 = 205;
  text(g, '#', 60, y0, { size: 24, color: '#8fa3c8' });
  text(g, 'Ratsukko', 110, y0, { size: 24, color: '#8fa3c8' });
  text(g, 'VP', jo ? 610 : 760, y0, { size: 24, color: '#8fa3c8', align: 'right' });
  text(g, 'Aika', jo ? 730 : 940, y0, { size: 24, color: '#8fa3c8', align: 'right' });
  if (jo) { text(g, 'Uusinta', 940, y0, { size: 24, color: '#8fa3c8', align: 'right' }); }
  R.list.slice(0, 11).forEach((e, i) => {
    const y = y0 + 46 + i * 46;
    if (e.me) { g.fillStyle = 'rgba(255,214,102,0.22)'; roundRect(g, 40, y - 22, 944, 44, 10); g.fill(); }
    const col = e.me ? '#ffd666' : '#ffffff';
    text(g, e.place ? `${e.place}.` : '–', 60, y, { size: 28, weight: 800, color: col });
    text(g, `${e.name} & ${e.horse}`, 110, y, { size: 28, weight: e.me ? 800 : 600, color: col, max: jo ? 420 : 560 });
    if (e.elim) text(g, 'HYL', jo ? 730 : 940, y, { size: 26, weight: 800, color: '#ff6b6b', align: 'right' });
    else {
      text(g, `${e.vp}`, jo ? 610 : 760, y, { size: 28, weight: 800, color: col, align: 'right' });
      text(g, fmtTime(e.time), jo ? 730 : 940, y, { size: 28, color: col, align: 'right' });
      if (jo && e.jo) text(g, e.jo.elim ? 'HYL' : `${e.jo.vp} / ${fmtTime(e.jo.time)}`, 940, y, { size: 26, color: e.jo.elim ? '#ff6b6b' : '#9fd3ff', align: 'right' });
    }
  });
  const hasNext = settings.classIdx < CLASSES.length - 1;
  p.button('retry', 60, 770, 290, 100, 'Uusi yritys', {});
  p.button('next', 367, 770, 290, 100, hasNext ? 'Seuraava luokka' : 'Viimeinen luokka', { primary: hasNext, disabled: !hasNext, small: true });
  p.button('menu', 674, 770, 290, 100, 'Valikko', {});
}

function drawHud(g) {
  g.clearRect(0, 0, 1024, 190);
  const st = G.state;
  if (!['ready', 'countdown', 'riding', 'finished'].includes(st)) return;
  g.fillStyle = 'rgba(6,16,36,0.72)'; roundRect(g, 8, 8, 1008, 174, 30); g.fill();
  g.strokeStyle = 'rgba(255,214,102,0.6)'; g.lineWidth = 3; g.stroke();
  const r = G.round;
  if (st === 'ready') {
    text(g, 'Tervehdi tuomaria', 512, 58, { size: 54, weight: 900, color: '#ffd666', align: 'center' });
    const how = G.mode === 'mono' ? (IS_TOUCH ? 'katso tuomaritornia tai napauta' : 'katso tuomaritornia tai paina välilyöntiä') : 'katso tuomaritornia hetki – kello soi';
    text(g, how, 512, 114, { size: 32, color: '#ffffff', align: 'center' });
    const pr = clamp((G.saluteT || 0) / SALUTE_DWELL, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(g, 262, 146, 500, 22, 11); g.fill();
    if (pr > 0) { g.fillStyle = '#ffd666'; roundRect(g, 262, 146, Math.max(22, 500 * pr), 22, 11); g.fill(); }
    drawArrow(g);
    return;
  }
  if (st === 'countdown') {
    const c = Math.ceil(G.countdown);
    text(g, `Lähtöön ${c} s`, 512, 66, { size: 60, weight: 900, color: c <= 10 ? '#ff6b6b' : '#ffffff', align: 'center' });
    text(g, `Ratsasta LÄHTÖ-linjan läpi · ${jumpHint(true)}`, 512, 130, { size: 32, color: '#9fd3ff', align: 'center', max: 960 });
    drawArrow(g);
    return;
  }
  const t = r.time;
  text(g, `${t.toFixed(1)}`, 40, 78, { size: 78, weight: 900, color: t > r.TA ? '#ff6b6b' : '#ffffff' });
  text(g, `s / enint. ${r.TA} s`, 44, 146, { size: 28, color: '#8fa3c8' });
  text(g, `${r.vp + (r.finished ? r.timeVp : 0)}`, 560, 78, { size: 78, weight: 900, color: r.vp ? '#ff9f43' : '#7CFC00', align: 'center' });
  text(g, `virhepistettä${r.disob ? ` · kielto ${r.disob}/2` : ''}`, 560, 146, { size: 28, color: '#8fa3c8', align: 'center' });
  const nf = G.course[G.nextIdx];
  text(g, nf ? nf.label : 'MAALI', 900, 78, { size: 70, weight: 900, color: '#ffd666', align: 'center' });
  text(g, nf ? 'seuraava este' : 'ylitä maalilinja', 900, 146, { size: 28, color: '#8fa3c8', align: 'center' });
  drawArrow(g);
}

function drawArrow(g) {
  const a = G.arrow || 0;
  if (Math.abs(a) < 0.55) return;
  const left = a > 0;
  g.fillStyle = '#ffd666';
  const x = left ? 10 : 1014, d = left ? 1 : -1;
  g.beginPath(); g.moveTo(x, 95); g.lineTo(x + d * 46, 40); g.lineTo(x + d * 46, 150); g.closePath(); g.fill();
}

function drawMsg(g) {
  g.clearRect(0, 0, 1024, 230);
  const m = G.msg;
  if (!m) return;
  g.fillStyle = 'rgba(6,16,36,0.6)'; roundRect(g, 40, 10, 944, 210, 40); g.fill();
  g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.font = `900 92px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeText(m.text, 512, 90);
  g.fillStyle = m.color; g.fillText(m.text, 512, 90);
  if (m.sub) text(g, m.sub, 512, 172, { size: 36, weight: 700, color: '#ffffff', align: 'center', max: 900 });
}

let _hudKey = '';
const SALUTE_DWELL = 1.3;
function refreshHud() {
  const r = G.round;
  const key = [G.state, r && r.time.toFixed(1), r && r.vp, r && r.disob, G.nextIdx, Math.ceil(G.countdown), Math.sign(Math.abs(G.arrow) > 0.55 ? G.arrow : 0), Math.round((G.saluteT || 0) * 10)].join('|');
  if (key !== _hudKey) { _hudKey = key; hud.redraw(); }
  hud.visible = ['ready', 'countdown', 'riding', 'finished'].includes(G.state);
}

function showMessage(textStr, color = '#ffffff', sub = '', dur = 2.2) {
  G.msg = { text: textStr, color, sub, until: G.time + dur };
  msgPanel.redraw();
  msgPanel.visible = true;
}

function haptic(p) { if (G.mode !== 'xr' && G.mode !== 'cardboard') return; try { navigator.vibrate && navigator.vibrate(p); } catch { /* */ } }

// ---------------------------------------------------------------- tilat
function placePanel(panel, yawOff, dist, y, baseYaw = SPAWN.heading, at = P) {
  const yaw = baseYaw + yawOff;
  panel.mesh.position.set(at.x - Math.sin(yaw) * dist, y, at.z - Math.cos(yaw) * dist);
  panel.mesh.rotation.set(0, yaw, 0);
  panel.visible = true;
}

function setPlayer(x, z, heading) {
  Object.assign(P, { x, z, heading, speed: 0, air: false, h: 0, airT: 0, dip: 0, stun: 0 });
  alignRig(heading);
}

// Käännä rig niin, että pelaajan nykyinen katse osoittaa haluttuun suuntaan
function alignRig(worldYaw) {
  const q = camera.quaternion;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const localYaw = Math.atan2(-f.x, -f.z);
  rig.rotation.set(0, worldYaw - localYaw, 0);
  if (G.mode === 'mono') { G.lookYaw = 0; G.lookPitch = -0.12; rig.rotation.y = worldYaw; }
}

function showLobby() {
  G.state = 'lobby';
  G.round = null; G.results = null;
  for (const f of G.allFences) f.rebuild();
  G.course = G.allFences.slice();
  setPlayer(SPAWN.x, SPAWN.z, SPAWN.heading);
  for (const p of worldPanels) p.visible = false;
  menuPanel.redraw(); mapPanel.redraw(); rulesPanel.redraw();
  placePanel(menuPanel, 0, 2.3, EYE - 0.05);
  placePanel(mapPanel, 0.78, 2.1, EYE - 0.05);
  placePanel(rulesPanel, -0.78, 2.1, EYE - 0.05);
  rosette.visible = false;
  msgPanel.visible = false; G.msg = null;
  audio.setMusic(true);
  world.setScoreboard({ title: 'KEPPARI CUP 2026', line1: G.cls.name, line2: `Enimmäisaika ${G.TA} s · ${G.cls.method}`, time: '0.00', vp: '' });
  updateGuide();
}

function newRound(jumpOff) {
  const TA = jumpOff ? G.TAjo : G.TA;
  G.round = { jumpOff, TA, time: 0, vp: 0, timeVp: 0, disob: 0, trotT: 0, trotPen: false, elim: null, finished: false, log: [] };
  G.course = jumpOff ? G.allFences.filter(f => G.cls.jumpOff.includes(f.id)) : G.allFences.slice();
}

function toReady() {
  for (const f of G.allFences) f.rebuild();
  G.nextIdx = 0; G.voltAcc = 0; G.apBack = false;
  for (const p of worldPanels) p.visible = false;
  rosette.visible = false;
  setPlayer(SPAWN.x, SPAWN.z, SPAWN.heading);
  G.state = 'ready'; G.readyT = G.time;
  audio.setMusic(false);
  const h = horseDef();
  const jo = G.round.jumpOff;
  world.setScoreboard({ title: `${G.cls.name}${jo ? ' – UUSINTA' : ''}`, line1: `${riderName()} & ${h.name}`, line2: `Enimmäisaika ${G.round.TA} s`, time: '0.00', vp: '0' });
  audio.say(jo ? `Uusinnassa radalla ${riderName()} ja ${h.name}.` : `Radalla seuraavana ${riderName()} ja ${h.name}. Luokka ${G.cls.short}.`);
  showMessage(jo ? 'UUSINTA' : G.cls.name, '#ffd666', jo ? 'Aika ratkaisee – 1 vp jokaisesta alkavasta ylitetystä sekunnista' : `Enimmäisaika ${G.round.TA} s`, 3);
  updateGuide();
}

function startRound() {
  G.field = generateField(G.cls, G.TA, G.TAjo || G.TA);
  G.base = null;
  newRound(false);
  toReady();
}

function salute() {
  if (G.state !== 'ready') return;
  audio.bell(1);
  G.state = 'countdown'; G.countdown = START_WINDOW;
  showMessage('KELLO SOI!', '#ffd666', 'Ylitä lähtölinja 45 sekunnin kuluessa', 2.5);
}

function startClock() {
  G.state = 'riding';
  G.round.time = 0; G.voltAcc = 0;
  audio.tick(true);
  showMessage('MATKAAN!', '#7CFC00', jumpHint(false), 2.4);
  updateGuide();
}

function finish() {
  const r = G.round;
  r.finished = true;
  r.timeVp = timeFaults(r.time, r.TA, r.jumpOff);
  r.total = r.vp + r.timeVp;
  G.state = 'finished'; G.finishT = G.time;
  const t = fmtTime(r.time);
  if (r.total === 0) {
    showMessage('PUHDAS RATA!', '#7CFC00', `${t} s – nolla virhepistettä!`, 3.5);
    audio.applause(1, 5.5); audio.fanfare(); world.cheer(1, 5);
    audio.say(`Puhdas rata! Aika ${t.replace('.', ',')} sekuntia.`);
  } else {
    showMessage(`${r.total} VP`, '#ff9f43', `${t} s${r.timeVp ? ` (aikavirheitä ${r.timeVp})` : ''}`, 3.5);
    audio.applause(0.6, 3.5); world.cheer(0.5, 3);
    audio.say(`${r.total} virhepistettä, aika ${t.replace('.', ',')} sekuntia.`);
  }
  updateGuide();
}

function eliminate(reason) {
  if (!G.round || G.round.elim) return;
  G.round.elim = reason;
  G.state = 'finished'; G.finishT = G.time;
  audio.bell(2); haptic([100, 60, 100]);
  showMessage('HYLÄTTY', '#ff4d4d', reason, 4);
  audio.say(`Valitettavasti hylätty. ${reason}.`);
  updateGuide();
}

function afterFinish() {
  const r = G.round, cls = G.cls;
  if (!r.jumpOff && cls.jumpOff && !r.elim && r.total === 0) {
    G.base = r;
    newRound(true);
    audio.say('Puhdas perusrata, ja paikka uusintaan!');
    toReady();
    return;
  }
  showResults();
}

function showResults() {
  const cls = G.cls;
  const base = G.base || G.round;
  const me = { name: riderName(), horse: horseDef().name, me: true };
  if (base.elim) me.elim = base.elim;
  else { me.vp = base.total; me.time = Math.round(base.time * 100) / 100; }
  if (G.base) {
    const jr = G.round;
    me.jo = jr.elim ? { elim: jr.elim } : { vp: jr.total, time: Math.round(jr.time * 100) / 100 };
  }
  const list = rank([...G.field, me], !!cls.jumpOff);
  const place = me.place;
  let headline, headColor, detail;
  const last = G.round;
  if (last.elim) { headline = 'HYLÄTTY'; headColor = '#ff6b6b'; detail = last.elim + (G.base ? ' (uusinnassa)' : ''); }
  else if (place === 1) { headline = 'VOITTO! 1. SIJA'; headColor = '#ffd666'; }
  else if (place <= 3) { headline = `${place}. SIJA – PALKINTOSIJA!`; headColor = '#9fd3ff'; }
  else { headline = `${place}. sija`; headColor = '#ffffff'; }
  if (!last.elim) {
    const parts = [`${last.total} vp`, `${fmtTime(last.time)} s`];
    if (last.timeVp) parts.push(`aikavirheet ${last.timeVp}`);
    if (last.log.length) parts.push(last.log.slice(0, 3).join(', '));
    detail = (G.base ? 'Uusinta: ' : '') + parts.join(' · ');
  }
  G.results = { list, headline, headColor, detail };
  // ennätys
  const prev = store.get('best.' + cls.id, null);
  const better = !prev || (prev.elim && !me.elim) || (!me.elim && (me.vp < prev.vp || (me.vp === prev.vp && me.time < prev.time)));
  if (better) store.set('best.' + cls.id, { vp: me.vp, time: me.time, elim: me.elim || null, place });
  G.state = 'results';
  P.speed = 0;
  resultPanel.redraw();
  placePanel(resultPanel, 0, 2.4, EYE - 0.1, P.heading, P);
  if (place && place <= 3 && !last.elim) {
    buildRosette(place);
    const yaw = P.heading + 0.62;
    rosette.position.set(P.x - Math.sin(yaw) * 1.6, EYE - 0.05, P.z - Math.cos(yaw) * 1.6);
    rosette.rotation.set(0, yaw, 0);
    rosette.visible = true;
    if (place === 1) { launchConfetti(); audio.fanfare(); world.cheer(1, 6); audio.applause(1, 6); audio.say(`Ja voittaja on ${riderName()} ja ${horseDef().name}!`); }
  }
  audio.setMusic(true);
  world.setScoreboard({ title: `${cls.name} – TULOKSET`, line1: `1. ${list[0].name} & ${list[0].horse}`, line2: `Sinä: ${place ? place + '. sija' : 'hylätty'}`, time: list[0].elim ? '' : fmtTime(list[0].jo && !list[0].jo.elim ? list[0].jo.time : list[0].time), vp: '' });
}

// ---------------------------------------------------------------- säännöt ja törmäykset
function blockAt(f, s, l) {
  const w = f.toWorld(s, l);
  P.x = w.x; P.z = w.z; P.speed = 0; P.air = false; P.h = 0;
  audio.step(1.5);
}

function disobedience(f, what) {
  const r = G.round;
  r.disob++;
  audio.neigh(); haptic([60, 40, 60]);
  G.voltAcc = 0;
  if (r.disob >= 2) { eliminate(ELIM.SECOND_DISOBEDIENCE); return; }
  r.vp += VP.REFUSAL;
  r.log.push(`${what.toLowerCase()} (${f.label})`);
  let sub = '+4 vp · seuraava tottelemattomuus = hylkäys';
  if (f.combo) {
    const first = G.course.findIndex(x => x.combo === f.combo);
    if (first >= 0 && first < G.course.indexOf(f)) {
      for (let i = first; i <= G.course.indexOf(f); i++) G.course[i].rebuild();
      G.nextIdx = first;
      sub = '+4 vp · sarjaeste hypätään kokonaan uudelleen';
    }
  }
  showMessage(what.toUpperCase() + '!', '#ff6b6b', sub, 2.6);
  updateGuide();
}

function knockRail(f, r) {
  if (!f.knock(r, P.speed)) return;
  audio.knock(); haptic(70);
  const counts = G.state === 'riding' && G.course[G.nextIdx] === f;
  if (counts) {
    G.round.vp += VP.KNOCK; f.attemptKnocked = true;
    G.round.log.push(`pudotus (${f.label})`);
    showMessage('PUDOTUS', '#ff9f43', '+4 virhepistettä', 1.8);
  }
}

function completeFence(f) {
  f.inProgress = false;
  if (G.state === 'riding' && G.course[G.nextIdx] === f) {
    f.done = true; G.nextIdx++; G.voltAcc = 0;
    const clean = !f.attemptKnocked && !f.waterFault;
    if (clean) { audio.applause(0.28, 1.6); world.cheer(0.25, 1.2); }
    if (G.nextIdx >= G.course.length) showMessage('KOHTI MAALIA!', '#7CFC00', 'Ylitä MAALI-linja', 2);
    updateGuide();
  }
}

// Esteen ensimmäinen ylitys ilmassa: tarkista järjestys ja suunta
function beginJump(f, fwd, isNext) {
  if (G.state === 'ready' || G.state === 'countdown') { eliminate(ELIM.JUMP_BEFORE_START); return false; }
  if (G.state === 'riding') {
    if (!fwd) { eliminate(ELIM.WRONG_DIRECTION); return false; }
    if (!isNext) { eliminate(ELIM.WRONG_FENCE); return false; }
  }
  f.inProgress = true; f.attemptKnocked = false;
  return true;
}

function checkFences(px, pz, landed) {
  for (const f of G.allFences) {
    const a = f.toLocal(px, pz), b = f.toLocal(P.x, P.z);
    const far = Math.abs(b.l) > f.w / 2 + 6 || Math.min(a.s, b.s) > f.backS + 4 || Math.max(a.s, b.s) < f.frontS - 4;
    if (far) { if (f.inProgress) f.inProgress = false; continue; }
    const inside = Math.abs(b.l) <= f.w / 2 + 0.05;
    const isNext = G.state === 'riding' && G.course[G.nextIdx] === f;
    const fwd = b.s > a.s;
    const crossed = (p) => (fwd ? (a.s < p && b.s >= p) : (a.s > p && b.s <= p));
    const rp = f.frontS - 0.35, rpBack = f.backS + 0.35;

    if (inside) {
      if (!P.air && !f.inProgress) {
        const railHit = f.rails.some(r => crossed(r.s));
        const hitFront = fwd && (crossed(rp) || crossed(f.frontS) || railHit);
        const hitBack = !fwd && (crossed(rpBack) || crossed(f.backS) || railHit);
        if (hitFront || hitBack) {
          if (hitFront && isNext) {
            disobedience(f, 'Kielto');
            if (G.round && !G.round.elim) { blockAt(f, f.frontS - 2.2, b.l); P.stun = 1.3; }
          } else {
            blockAt(f, hitFront ? rp - 0.05 : rpBack + 0.05, b.l);
            if (G.state === 'riding' && !f.done && G.course.includes(f)) {
              const nf = G.course[G.nextIdx];
              showMessage('EI VIELÄ!', '#ffd666', nf ? `Seuraavaksi este ${nf.label}` : 'Ratsasta maaliin', 1.6);
            }
          }
          return;
        }
      }
      if (f.isWater) {
        if (P.air && !f.inProgress && crossed(0) && fwd) { if (!beginJump(f, fwd, isNext)) return; }
        else if (P.air && !f.inProgress && !fwd && crossed(f.waterLen)) { if (!beginJump(f, fwd, isNext)) return; }
        if (landed && f.inProgress && b.s >= -0.05 && b.s <= f.waterLen + 0.05) {
          audio.splash(); haptic(90);
          if (isNext && !f.waterFault) {
            f.waterFault = true; G.round.vp += VP.WATER; G.round.log.push(`vesi (${f.label})`);
            showMessage('VESI!', '#4cc9f0', 'Vesihaudan koskettaminen +4 vp', 1.8);
          }
        }
        if (f.inProgress && fwd && crossed(f.waterLen)) completeFence(f);
      } else {
        const order = fwd ? f.rails : [...f.rails].reverse();
        for (const r of order) {
          if (!crossed(r.s)) continue;
          if (!f.inProgress) { if (!P.air) continue; if (!beginJump(f, fwd, isNext)) return; }
          const clear = P.air && P.h >= r.hAt(b.l);
          if (!clear) knockRail(f, r);
        }
        if (f.inProgress && fwd && crossed(f.backS + 0.01)) completeFence(f);
        if (f.inProgress && !fwd && crossed(f.frontS - 0.01)) f.inProgress = false;
      }
    } else {
      if (isNext && fwd && crossed(f.frontS) && Math.abs(b.l) < f.w / 2 + 4 && !f.inProgress) disobedience(f, 'Ohiratsastus');
      if (f.inProgress && Math.abs(b.l) > f.w / 2 + 1.5) f.inProgress = false;
    }
  }
}

function lineCross(def, px, pz) {
  const c = Math.cos(def.dir), s = Math.sin(def.dir);
  const loc = (x, z) => { const dx = x - def.x, dz = z - def.z; return { s: -(dx * s + dz * c), l: dx * c - dz * s }; };
  const a = loc(px, pz), b = loc(P.x, P.z);
  return a.s < 0 && b.s >= 0 && Math.abs(b.l) <= def.w / 2;
}

// ---------------------------------------------------------------- liike
const _dir = new THREE.Vector3(), _pos = new THREE.Vector3();
const keys = new Set();
const STRIDE_BEATS = [0, 0.17, 0.34];

function updatePlayer(dt) {
  camera.getWorldDirection(_dir);
  const gazeYaw = Math.atan2(-_dir.x, -_dir.z);
  const pitch = Math.asin(clamp(_dir.y, -1, 1));
  G.gazeYaw = gazeYaw;
  const movable = ['ready', 'countdown', 'riding', 'finished'].includes(G.state);
  if (!movable) { P.speed = 0; return; }

  let targetYaw = gazeYaw;
  let targetSpeed = G.cls.canter;
  if (pitch < -1.0) targetSpeed = 0; else if (pitch < -0.72) targetSpeed = 1.8;
  if (G.mode === 'mono' || G.mode === 'cardboard') {
    if (keys.has('KeyS') || keys.has('ArrowDown')) targetSpeed = keys.has('ShiftLeft') ? 0 : 1.8;
  }
  if (G.brake) targetSpeed = 0;
  if (G.state === 'ready') targetSpeed = Math.min(targetSpeed, 1.5);
  if (G.state === 'finished') targetSpeed = 0;
  let wantJump = false;
  if (AUTOPILOT) { const ap = autopilot(); targetYaw = ap.yaw; targetSpeed = ap.speed; wantJump = ap.jump; }

  const diff = wrap(targetYaw - P.heading);
  const maxTurn = P.air ? 0.5 : 2.6;
  const rate = clamp(diff * 4.2, -maxTurn, maxTurn);
  P.heading = wrap(P.heading + rate * dt);
  if (G.state === 'riding') G.voltAcc += rate * dt;

  if (settings.assist && (G.mode === 'xr' || G.mode === 'cardboard') && !AUTOPILOT) {
    const local = wrap(gazeYaw - rig.rotation.y);
    const dead = 0.38;
    if (Math.abs(local) > dead) rig.rotation.y += Math.sign(local) * (Math.abs(local) - dead) * 1.5 * dt * clamp(P.speed / 2.5, 0, 1);
  }

  if (P.stun > 0) { P.stun -= dt; targetSpeed = 0; }
  if (!P.air) {
    const acc = targetSpeed > P.speed ? 3.4 : 6.5;
    P.speed += clamp(targetSpeed - P.speed, -acc * dt, acc * dt);
  }
  const px = P.x, pz = P.z;
  P.x += -Math.sin(P.heading) * P.speed * dt;
  P.z += -Math.cos(P.heading) * P.speed * dt;

  if (wantJump) tryJump();
  let landed = false;
  if (P.air) {
    P.airT += dt;
    const u = P.airT / P.airDur;
    if (u >= 1) { P.air = false; P.h = 0; landed = true; P.landT = G.time; P.speed *= 0.94; P.dip = 0.07; audio.land(); haptic(15); }
    else P.h = P.peak * 4 * u * (1 - u);
  }

  // askeleet: laukka 3-tahtinen, ravi 2-tahtinen
  if (!P.air && P.speed > 0.3) {
    const trot = P.speed < 2.6;
    const len = trot ? 1.5 : 2.8;
    const prev = P.phase % 1;
    P.phase += (P.speed / len) * dt;
    const cur = P.phase % 1;
    const beats = trot ? [0, 0.5] : STRIDE_BEATS;
    for (const bt of beats) {
      const hit = prev <= cur ? (prev < bt && cur >= bt) : (prev < bt || cur >= bt);
      if (hit) audio.step(trot ? 0.6 : 0.9 + (bt === 0.34 ? 0.3 : 0), bt === 0.17 ? 0.25 : -0.25);
    }
  }

  checkFences(px, pz, landed);
  if (G.state !== 'riding' && G.state !== 'countdown' && G.state !== 'ready' && G.state !== 'finished') return;

  // kentän aita
  const m = 0.5;
  if (P.x < ARENA.minX + m || P.x > ARENA.maxX - m || P.z < ARENA.minZ + m || P.z > ARENA.maxZ - m) {
    P.x = clamp(P.x, ARENA.minX + m, ARENA.maxX - m);
    P.z = clamp(P.z, ARENA.minZ + m, ARENA.maxZ - m);
    P.speed *= 0.6;
  }

  if (lineCross(START_LINE, px, pz)) {
    if (G.state === 'ready') {
      // ystävällinen muistutus: lähtö ennen tuomarin lupaa olisi hylkäys
      P.x = px; P.z = pz + 0.3; P.speed = 0;
      showMessage('ODOTA KELLOA!', '#ffd666', 'Lähtö ennen tuomarin lupaa = hylkäys. Tervehdi ensin.', 2.2);
    } else if (G.state === 'countdown') startClock();
  }
  if (G.state === 'riding' && G.nextIdx >= G.course.length && lineCross(FINISH_LINE, px, pz)) finish();

  const r = G.round;
  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown);
    G.countdown -= dt;
    if (Math.ceil(G.countdown) !== before && before <= 10) audio.tick(false);
    if (G.countdown <= 0) eliminate(ELIM.LATE_START);
  }
  if (G.state === 'riding') {
    r.time += dt;
    if (r.time > r.TA * 2) eliminate(ELIM.DOUBLE_TIME);
    if (!P.air && P.speed > 0.4 && P.speed < 2.4) r.trotT += dt;
    if (r.trotT > 5 && !r.trotPen) {
      r.trotPen = true; r.vp += VP.TROT; r.log.push('raviaskeleet');
      showMessage('RAVIA!', '#ff9f43', 'Huomattava määrä raviaskeleita +4 vp', 2);
    }
    if (Math.abs(G.voltAcc) > Math.PI * 2 + 0.6) {
      const nf = G.course[G.nextIdx];
      if (nf) disobedience(nf, 'Ylimääräinen voltti'); else G.voltAcc = 0;
    }
  }
}

function tryJump(opts = {}) {
  if (P.air || P.speed < 0.8 || G.time - P.landT < 0.08) return;
  const j = jumpParams(P.speed);
  P.peak = j.peak; P.airDur = j.dur; P.air = true; P.airT = 0;
  if (opts.sensor) {
    // anturiviiveen kompensointi: oikea ponnistus tapahtui hetki ennen tunnistusta
    P.airT = Math.min(0.1, j.dur * 0.15);
    // voimakkaampi oikea hyppy = hieman korkeampi hyppy
    P.peak *= 0.96 + 0.08 * (opts.strength || 0);
  }
  audio.whoosh();
}

// Hyppytapa: VR-laseilla oikea hyppy, kännykällä heilautus, tietokoneella näppäin. Napautus varalla.
function jumpMode() {
  if (G.mode === 'mono' && !IS_TOUCH) return 'keys';
  if (G.mode === 'mono') return (settings.phoneJump === 'tap' || G.sensorFallback) ? 'tap' : 'swing';
  if (G.mode === 'xr' || G.mode === 'cardboard') return (settings.vrJump === 'tap' || G.sensorFallback) ? 'tap' : 'body';
  return 'keys';
}
function jumpHint(short) {
  const m = jumpMode();
  if (m === 'body') return short ? 'hyppää itse esteellä' : 'Hyppää oikeasti itse juuri ennen estettä!';
  if (m === 'swing') return short ? 'heilauta = hyppy' : 'Heilauta puhelinta ylös juuri ennen estettä!';
  if (m === 'tap') return short ? 'napauta = hyppy' : 'Napauta juuri ennen estettä!';
  return short ? 'välilyönti = hyppy' : 'Välilyönti tai klikkaus juuri ennen estettä!';
}

const detector = new JumpDetector((strength, kind) => onBodyJump(strength, kind));
function onBodyJump(strength) {
  const m = jumpMode();
  if (m !== 'body' && m !== 'swing') return;
  if (G.state === 'lobby' || G.state === 'results') {
    G.jumpTestT = G.time; audio.whoosh(); haptic(30);
    if (G.state === 'lobby') { menuPanel.redraw(); setTimeout(() => menuPanel.redraw(), 1700); }
    return;
  }
  if (G.state === 'countdown' || G.state === 'riding') tryJump({ sensor: true, strength });
}

// Automaattiohjaus testaukseen (?auto tai ?auto=0.6 kohinalla)
function autopilot() {
  const out = { yaw: P.heading, speed: G.cls.canter, jump: false };
  if (G.state === 'ready') { if (G.time - G.readyT > 0.8) salute(); out.speed = 0; return out; }
  if (G.state !== 'countdown' && G.state !== 'riding') { out.speed = 0; return out; }
  const f = G.state === 'riding' ? G.course[G.nextIdx] : null;
  let tx, tz;
  if (!f) {
    const d = G.state === 'countdown' ? START_LINE : FINISH_LINE;
    const fx = -Math.sin(d.dir), fz = -Math.cos(d.dir);
    const c = Math.cos(d.dir), s = Math.sin(d.dir);
    const dx = P.x - d.x, dz = P.z - d.z;
    const sl = -(dx * s + dz * c);
    const k = Math.min(sl + 4, 3);
    tx = d.x + fx * k; tz = d.z + fz * k;
  } else {
    const loc = f.toLocal(P.x, P.z);
    const j = jumpParams(Math.max(P.speed, 2));
    const sOpt = f.midS - Math.max(P.speed, 2) * j.dur / 2;
    if (!P.air && (P.stun > 0 || (loc.s > sOpt + 0.15 && loc.s < f.frontS && P.speed < 1.5))) G.apBack = true;
    if (loc.s > f.backS + 0.5 && !f.done) G.apBack = true;
    if (G.apBack && loc.s < -8) G.apBack = false;
    let w;
    const via = G.round.jumpOff && G.cls.jumpOffVia && G.cls.jumpOffVia[f.id];
    if (G.apViaFor !== f) { G.apViaFor = f; G.apVia = 0; }
    if (via && G.apVia < via.length && Math.hypot(via[G.apVia][0] - P.x, via[G.apVia][1] - P.z) < 2) G.apVia++;
    if (via && G.apVia < via.length) w = { x: via[G.apVia][0], z: via[G.apVia][1] };
    else if (G.apBack) w = f.toWorld(-10, loc.l >= 0 ? 4 : -4);
    else if (loc.s < f.frontS) w = f.toWorld(Math.min(loc.s + 5, f.midS), 0);
    else w = f.toWorld(f.backS + 4, 0);
    tx = w.x; tz = w.z;
    if (!G.apBack && !P.air && loc.s >= sOpt + (Math.random() - 0.5) * AP_NOISE && loc.s < f.frontS - 0.1 && Math.abs(loc.l) < f.w / 2 - 0.2) out.jump = true;
  }
  out.yaw = Math.atan2(-(tx - P.x), -(tz - P.z));
  if (params.has('nojump')) out.jump = false;
  if (params.has('refuseAt') && G.round && G.round.disob === 0 && G.nextIdx === +params.get('refuseAt')) out.jump = false;
  return out;
}

function updateGuide() {
  const riding = ['countdown', 'riding'].includes(G.state);
  const nf = G.state === 'riding' ? G.course[G.nextIdx] : (G.state === 'countdown' || G.state === 'ready' ? G.course[0] : null);
  for (const f of G.allFences) f.setHighlight(f === nf && (riding || G.state === 'ready'));
  G.guideTarget = G.state === 'ready' ? JUDGE : (nf || (G.state === 'riding' ? FINISH_LINE : null));
  G.nextFence = nf;
}

// ---------------------------------------------------------------- syöte
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
let hoverPanel = null, hoverId = null, dwellT = 0;

function pickPanels(ray) {
  const meshes = interactive.filter(p => p.visible).map(p => p.mesh);
  if (!meshes.length) return null;
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit || !hit.uv) return null;
  const panel = hit.object.userData.panel;
  const id = panel.hit(hit.uv);
  return id ? { panel, id, point: hit.point } : null;
}

function setHover(h, progress = 0) {
  for (const p of interactive) if (p !== (h && h.panel)) p.setHover(null);
  if (h) h.panel.setHover(h.id, progress);
  hoverPanel = h ? h.panel : null; hoverId = h ? h.id : null;
}

function onUiClick(id) {
  audio.uiClick(); haptic(10);
  switch (id) {
    case 'clsPrev': case 'clsNext':
      settings.classIdx = (settings.classIdx + (id === 'clsNext' ? 1 : CLASSES.length - 1)) % CLASSES.length;
      G.cls = CLASSES[settings.classIdx]; buildCourse(G.cls); saveSettings();
      menuPanel.redraw(); mapPanel.redraw();
      world.setScoreboard({ title: 'KEPPARI CUP 2026', line1: G.cls.name, line2: `Enimmäisaika ${G.TA} s · ${G.cls.method}`, time: '0.00', vp: '' });
      break;
    case 'horsePrev': case 'horseNext':
      settings.horseIdx = (settings.horseIdx + (id === 'horseNext' ? 1 : HORSES.length - 1)) % HORSES.length;
      mount.setHorse(horseDef()); saveSettings(); menuPanel.redraw();
      break;
    case 'help': settings.takeoffHelp = !settings.takeoffHelp; saveSettings(); menuPanel.redraw(); break;
    case 'guide': settings.guide = !settings.guide; saveSettings(); menuPanel.redraw(); break;
    case 'assist': settings.assist = !settings.assist; saveSettings(); menuPanel.redraw(); break;
    case 'jumpMode':
      if (G.mode === 'mono') settings.phoneJump = jumpMode() === 'tap' ? 'swing' : 'tap';
      else settings.vrJump = jumpMode() === 'tap' ? 'body' : 'tap';
      G.sensorFallback = false; G.sensorCheckT = G.time; saveSettings(); menuPanel.redraw(); updateTouchUi();
      break;
    case 'start': startRound(); break;
    case 'retry': startRound(); break;
    case 'next':
      if (settings.classIdx < CLASSES.length - 1) { settings.classIdx++; G.cls = CLASSES[settings.classIdx]; buildCourse(G.cls); saveSettings(); startRound(); }
      break;
    case 'menu': showLobby(); break;
  }
}

function onSelect(ray) {
  audio.init();
  if (G.state === 'lobby' || G.state === 'results') {
    const h = pickPanels(ray || centerRay());
    if (h) { onUiClick(h.id); dwellT = -0.5; }
    return;
  }
  if (G.state === 'ready') { salute(); return; }
  if (G.state === 'countdown' || G.state === 'riding') {
    const m = jumpMode();
    if (m === 'tap' || m === 'keys') tryJump();
    else if (!G.msg) showMessage(m === 'body' ? 'HYPPÄÄ ITSE!' : 'HEILAUTA!', '#ffd666', m === 'body' ? 'Oikea hyppy ennen estettä – napautus ei hyppää' : 'Heilauta puhelinta ylös hypätäksesi', 1.6);
  }
}

function centerRay() {
  camera.getWorldPosition(_pos); camera.getWorldDirection(_dir);
  raycaster.set(_pos, _dir);
  return raycaster;
}

// Hiiri / kosketus (ruutu- ja cardboard-tila)
let drag = null;
const dom = renderer.domElement;
dom.addEventListener('pointerdown', (e) => {
  if (G.mode === null) return;
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
  dom.setPointerCapture(e.pointerId);
});
dom.addEventListener('pointermove', (e) => {
  if (G.mode === 'mono' && !drag && e.pointerType === 'mouse') {
    if (G.state === 'lobby' || G.state === 'results') setHover(pickPanels(pointerRay(e)));
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (G.mode === 'mono' || (G.mode === 'cardboard' && !orient.active)) {
    const k = e.pointerType === 'touch' ? 0.006 : 0.004;
    G.lookYaw += dx * k; G.lookPitch = clamp(G.lookPitch + dy * k, -1.35, 1.2);
  }
});
dom.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const tap = drag.moved < 12 && performance.now() - drag.t < 450;
  drag = null;
  if (!tap) return;
  if (G.mode === 'mono') onSelect(pointerRay(e)); else if (G.mode === 'cardboard') onSelect(centerRay());
});
function pointerRay(e) {
  _ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  return raycaster;
}
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (G.mode && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    if (e.repeat) return;
    audio.init();
    if ((G.state === 'lobby' || G.state === 'results') && hoverId) onUiClick(hoverId);
    else onSelect(centerRay());
  }
  if (e.code === 'Escape' && G.mode && G.mode !== 'xr') exitToTitle();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// Laitteen asento (cardboard-varatila)
const orient = { active: false, q: new THREE.Quaternion(), alpha: 0, beta: 0, gamma: 0, screen: 0 };
const _zee = new THREE.Vector3(0, 0, 1), _euler = new THREE.Euler(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function onOrientation(e) {
  if (e.alpha == null) return;
  orient.active = true;
  orient.alpha = THREE.MathUtils.degToRad(e.alpha); orient.beta = THREE.MathUtils.degToRad(e.beta); orient.gamma = THREE.MathUtils.degToRad(e.gamma);
}
function applyOrientation() {
  const sa = THREE.MathUtils.degToRad((screen.orientation && screen.orientation.angle) || window.orientation || 0);
  _euler.set(orient.beta, orient.alpha, -orient.gamma, 'YXZ');
  camera.quaternion.setFromEuler(_euler);
  camera.quaternion.multiply(_q1);
  camera.quaternion.multiply(_q0.setFromAxisAngle(_zee, -sa));
}

// ---------------------------------------------------------------- tilojen vaihto
let wakeLock = null;
async function requestWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* */ } }

function readMenuSettings() {
  settings.name = $('riderName').value.trim();
  settings.shadows = $('optShadows').checked;
  settings.bob = $('optBob').checked;
  settings.voice = $('optVoice').checked;
  settings.music = $('optMusic').checked;
  audio.voiceOn = settings.voice; audio.musicOn = settings.music;
  renderer.shadowMap.enabled = settings.shadows;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  saveSettings();
}

function enterGame(mode) {
  readMenuSettings();
  audio.init();
  G.mode = mode;
  $('menu').hidden = true;
  $('exitBtn').hidden = mode === 'xr';
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  if (mode === 'mono') {
    if (matchMedia('(pointer: coarse)').matches) { $('touchHint').hidden = false; setTimeout(() => { $('touchHint').style.opacity = 0; }, 6000); }
  } else if (mode === 'cardboard') camera.fov = 85;
  if (mode === 'mono' && IS_TOUCH) {
    try { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* */ }
  }
  detector.mode = mode === 'mono' ? 'swing' : 'body';
  G.sensorFallback = false; G.sensorCheckT = G.time;
  if (mode !== 'mono' || IS_TOUCH) detector.start();
  onResize();
  requestWake();
  showLobby();
  updateTouchUi();
}

// Jos liikeanturi ei vastaa, siirrytään napautukseen ja kerrotaan siitä
function checkSensor() {
  const m = jumpMode();
  if ((m === 'body' || m === 'swing') && !G.sensorFallback && G.time - (G.sensorCheckT || 0) > 3 && !detector.active && !AUTOPILOT) {
    G.sensorFallback = true;
    if (G.state === 'lobby') menuPanel.redraw();
    updateTouchUi();
    showMessage('Liikeanturi ei vastaa', '#ff9f43', 'Hyppy napauttamalla', 2.5);
  }
  detector.enabled = m === 'body' || m === 'swing';
}

function updateTouchUi() {
  const show = G.mode === 'mono' && IS_TOUCH;
  $('touchCtl').hidden = !show;
  $('tcJump').hidden = !(show && jumpMode() === 'tap');
}

async function startXR() {
  await detector.requestPermission();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    session.addEventListener('select', () => onSelect(centerRay()));
    session.addEventListener('end', () => { if (G.mode === 'xr') exitToTitle(); });
    await renderer.xr.setSession(session);
    enterGame('xr');
  } catch (err) {
    $('xrNote').textContent = 'VR-tilan avaaminen epäonnistui: ' + (err && err.message ? err.message : err) + '. Kokeile Cardboard-tilaa.';
  }
}

async function startCardboard() {
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch { /* */ }
  await detector.requestPermission();
  window.addEventListener('deviceorientation', onOrientation);
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* */ }
  try { await screen.orientation.lock('landscape'); } catch { /* */ }
  enterGame('cardboard');
}

function exitToTitle() {
  const wasXR = G.mode === 'xr';
  G.mode = null;
  G.state = 'title';
  for (const p of worldPanels) p.visible = false;
  hud.visible = false; msgPanel.visible = false; rosette.visible = false;
  $('menu').hidden = false; $('exitBtn').hidden = true; $('touchHint').hidden = true; $('rotate').hidden = true;
  window.removeEventListener('deviceorientation', onOrientation);
  orient.active = false;
  detector.stop();
  $('touchCtl').hidden = true; G.brake = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!wasXR && renderer.xr.isPresenting) renderer.xr.getSession().end();
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  audio.pause();
  onResize();
}

function onResize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, G.mode === 'cardboard' ? 1.5 : 2));
  renderer.setSize(w, h);
  camera.aspect = G.mode === 'cardboard' ? (w / 2) / h : w / h;
  if (G.mode === 'mono' || G.mode === null) camera.fov = camera.aspect < 1 ? 92 : 72;
  camera.updateProjectionMatrix();
  $('rotate').hidden = !(G.mode === 'cardboard' && h > w);
}
window.addEventListener('resize', onResize);
// sovellus taustalle / näyttö pois => äänet pois; takaisin peliin => äänet takaisin
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.pause();
  else if (G.mode) { audio.resume(); audio.setMusic(G.state === 'lobby' || G.state === 'results'); requestWake(); }
});
window.addEventListener('pagehide', () => audio.pause());
window.addEventListener('orientationchange', () => setTimeout(onResize, 300));

// ---------------------------------------------------------------- pääsilmukka
const clock = new THREE.Clock();
let firstFrame = true;

function step(dt) {
  G.time += dt;
  const t = G.time;

  if (G.state === 'title') {
    const a = t * 0.06;
    rig.position.set(Math.sin(a) * 34, 5.5, Math.cos(a) * 44);
    rig.rotation.set(0, a, 0);
    camera.rotation.set(-0.12, 0, 0);
    body.visible = false;
  } else {
    body.visible = true;
    if (G.mode === 'mono' || (G.mode === 'cardboard' && !orient.active)) {
      if (keys.has('ArrowLeft') || keys.has('KeyA')) G.lookYaw += 1.9 * dt;
      if (keys.has('ArrowRight') || keys.has('KeyD')) G.lookYaw -= 1.9 * dt;
      camera.rotation.set(G.lookPitch, G.lookYaw, 0);
    } else if (G.mode === 'cardboard') applyOrientation();
    rig.updateMatrixWorld(true);
    updatePlayer(dt);

    // tervehdys katsomalla tuomaria (ei vaadi ohjainta eikä napautusta)
    if (G.state === 'ready') {
      const a = wrap(Math.atan2(-(JUDGE.x - P.x), -(JUDGE.z - P.z)) - (G.gazeYaw || 0));
      if (Math.abs(a) < 0.22 && G.time - G.readyT > 0.8) G.saluteT = (G.saluteT || 0) + dt;
      else G.saluteT = Math.max(0, (G.saluteT || 0) - dt * 2);
      if (G.mode === 'xr' || G.mode === 'cardboard') reticle.setProgress(clamp(G.saluteT / SALUTE_DWELL, 0, 1));
      if (G.saluteT >= SALUTE_DWELL) { G.saluteT = 0; P.dip = 0.09; reticle.setProgress(0); salute(); }
    } else if (G.saluteT) { G.saluteT = 0; reticle.setProgress(0); }
    if (G.state === 'finished' && G.time - G.finishT > (G.round.elim ? 4 : 3.5) && P.speed < 0.6) afterFinish();

    // kamera ja keho
    P.dip = Math.max(0, P.dip - dt * 0.35);
    const moving = !P.air && P.speed > 0.5;
    const bobAmp = settings.bob ? (G.mode === 'mono' ? 0.035 : 0.018) : 0;
    const bob = moving ? Math.abs(Math.sin(P.phase * Math.PI)) * bobAmp * Math.min(1, P.speed / 4) : 0;
    const lift = P.h * 0.6;
    rig.position.set(P.x, lift + bob - P.dip, P.z);
    body.position.set(P.x, lift + bob * 0.6 - P.dip, P.z);
    body.rotation.y = P.heading;
    mount.update(dt, t, P.phase, P.speed / G.cls.canter, P.h, P.air);
  }

  for (const f of G.allFences) f.update(dt);
  world.update(dt, t);
  updateConfetti(dt);

  // opastus
  const tgt = G.guideTarget;
  const showGuide = settings.guide && tgt && ['ready', 'countdown', 'riding'].includes(G.state);
  guide.visible = !!showGuide;
  if (showGuide) {
    const h = tgt.h || (tgt.standH ? tgt.standH + 0.75 : 2.2);
    const x = tgt.def ? tgt.def.x : tgt.x, z = tgt.def ? tgt.def.z : tgt.z;
    guide.position.set(x, h + Math.sin(t * 3) * 0.12, z);
    const dist = Math.hypot(x - P.x, z - P.z);
    guide.visible = dist > 5 && !(G.state === 'ready' && (G.saluteT || 0) > 0);
    guide.scale.setScalar(clamp((dist - 5) / 4, 0.2, 1));
    guide.rotation.y = t * 2;
    G.arrow = wrap(Math.atan2(-(x - P.x), -(z - P.z)) - (G.gazeYaw || 0));
  } else G.arrow = 0;
  const nf = G.nextFence;
  const showTake = settings.takeoffHelp && nf && G.state === 'riding' && !P.air;
  takeoff.visible = false;
  if (showTake) {
    const loc = nf.toLocal(P.x, P.z);
    if (loc.s < nf.frontS && loc.s > -18) {
      const v = Math.max(P.speed, G.cls.canter * 0.85);
      const j = jumpParams(v);
      const sOpt = nf.midS - v * j.dur / 2;
      nf.toWorld(sOpt, 0, takeoff.position);
      takeoff.rotation.y = nf.def.dir;
      takeoff.visible = true;
    }
  }

  // viestit
  if (G.msg && G.time > G.msg.until) { G.msg = null; msgPanel.visible = false; }
  refreshHud();

  // tulostaulu
  if (G.state === 'riding' || G.state === 'countdown') {
    const r = G.round;
    world.setScoreboard({
      title: `${G.cls.name}${r.jumpOff ? ' – UUSINTA' : ''}`, line1: `${riderName()} & ${horseDef().name}`,
      line2: G.state === 'countdown' ? `Lähtöön ${Math.ceil(G.countdown)} s` : `Enimmäisaika ${r.TA} s · seuraava ${G.course[G.nextIdx] ? G.course[G.nextIdx].label : 'MAALI'}`,
      time: r.time.toFixed(1), vp: String(r.vp),
    });
  } else if (G.state === 'finished' && G.round) {
    const r = G.round;
    world.setScoreboard({
      title: G.cls.name, line1: `${riderName()} & ${horseDef().name}`, line2: r.elim ? r.elim : `Aikavirheet ${r.timeVp}`,
      time: fmtTime(r.time), vp: r.elim ? 'HYL' : String(r.total), status: r.elim ? 'HYLÄTTY' : r.total === 0 ? 'PUHDAS RATA!' : '', statusColor: r.elim ? '#ff4d4d' : '#7CFC00',
    });
  }
  if (rosette.visible) rosette.rotation.z = Math.sin(t * 2) * 0.1;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  rig.updateMatrixWorld(true);
  if (renderer.xr.isPresenting) { renderer.xr.updateCamera(camera); detector.updateHead(camera.position.y, dt); }
  camera.updateMatrixWorld(true);
  if (G.mode) checkSensor();

  // katseella valinta (VR / cardboard)
  const menus = G.state === 'lobby' || G.state === 'results';
  if (menus && (G.mode === 'xr' || G.mode === 'cardboard')) {
    const h = pickPanels(centerRay());
    if (h && h.id === hoverId && h.panel === hoverPanel) dwellT += dt; else dwellT = 0;
    const DWELL = 1.25;
    setHover(h, clamp(dwellT / DWELL, 0, 1));
    reticle.setProgress(h ? clamp(dwellT / DWELL, 0, 1) : 0);
    if (h && dwellT >= DWELL) { onUiClick(h.id); dwellT = /^(cls|horse)/.test(h.id) ? 0.55 : -1.0; }
  } else if (!menus && hoverId) { setHover(null); reticle.setProgress(0); }
  reticle.group.visible = G.mode === 'xr' || G.mode === 'cardboard' || (G.mode === 'mono' && matchMedia('(pointer: coarse)').matches && !menus);

  if (G.mode === 'cardboard') {
    const size = renderer.getSize(new THREE.Vector2());
    stereo.update(camera);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, size.x / 2, size.y); renderer.setViewport(0, 0, size.x / 2, size.y);
    renderer.render(scene, stereo.cameraL);
    renderer.setScissor(size.x / 2, 0, size.x / 2, size.y); renderer.setViewport(size.x / 2, 0, size.x / 2, size.y);
    renderer.render(scene, stereo.cameraR);
    renderer.setScissorTest(false);
  } else {
    renderer.render(scene, camera);
  }
  if (firstFrame) { firstFrame = false; $('loading').hidden = true; }
}

// ---------------------------------------------------------------- käynnistys
buildCourse(G.cls);
$('riderName').value = settings.name;
$('optShadows').checked = settings.shadows;
$('optBob').checked = settings.bob;
$('optVoice').checked = settings.voice;
$('optMusic').checked = settings.music;
$('btnScreen').onclick = async () => { if (IS_TOUCH) await detector.requestPermission(); enterGame('mono'); };
// kosketusohjaimet (kännykkä ilman laseja)
const brake = (on) => (e) => { e.preventDefault(); G.brake = on; $('tcBrake').classList.toggle('on', on); };
$('tcBrake').addEventListener('pointerdown', brake(true));
$('tcBrake').addEventListener('pointerup', brake(false));
$('tcBrake').addEventListener('pointercancel', brake(false));
$('tcBrake').addEventListener('pointerleave', brake(false));
$('tcJump').addEventListener('pointerdown', (e) => { e.preventDefault(); audio.init(); if (G.state === 'ready') salute(); else tryJump(); });
$('btnCardboard').onclick = () => startCardboard();
$('btnXR').onclick = () => startXR();
$('exitBtn').onclick = () => exitToTitle();

if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (ok) { $('btnXR').hidden = false; $('xrNote').textContent = 'VR-lasit tuettu! Aseta puhelin laseihin painettuasi nappia.'; }
    else $('xrNote').textContent = 'WebXR VR ei käytettävissä tällä laitteella – käytä Cardboard-tilaa (puhelin) tai pelaa ruudulla.';
  }).catch(() => {});
} else {
  $('xrNote').textContent = window.isSecureContext ? 'Selain ei tue WebXR:ää – Cardboard-tila toimii puhelimen asentoanturilla.' : 'Avaa peli https-osoitteesta, jotta VR-tila toimii.';
}

// testaus / debug
window.__keppari = { G, P, audio, settings, enterGame, onUiClick, CLASSES, startRound, step };

if (SIM) {
  // nopea simulaatio ilman piirtoa: ?sim&auto[=kohina]&cls=N&runs=M
  const clsIdx = parseInt(params.get('cls') || '0', 10);
  settings.classIdx = clsIdx; G.cls = CLASSES[clsIdx]; buildCourse(G.cls);
  G.mode = 'sim'; $('menu').hidden = true; $('loading').hidden = true;
  const runs = parseInt(params.get('runs') || '3', 10);
  const results = [];
  for (let k = 0; k < runs; k++) {
    startRound();
    let n = 0;
    while (G.state !== 'results' && n < 60 * 240) { step(1 / 60); rig.updateMatrixWorld(true); camera.updateMatrixWorld(true); n++; }
    const r = G.base || G.round;
    results.push({ cls: G.cls.id, state: G.state, elim: G.round.elim, vp: G.round.total, time: +G.round.time.toFixed(2), TA: G.round.TA, jumpOff: !!G.base, log: G.round.log.join('; '), base: G.base ? { vp: G.base.total, time: +G.base.time.toFixed(2) } : null, place: G.results && G.results.list.find(e => e.me).place });
  }
  window.__simResults = results;
  console.log('SIM', JSON.stringify(results));
} else {
  renderer.setAnimationLoop(frame);
}
