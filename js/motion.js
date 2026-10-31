// Oikean hypyn ja puhelimen heilautuksen tunnistus liikeantureilla.
//  - 'body'  (VR-lasit): ratsastaja hyppää itse. Tunnistetaan ponnistuksen kiihtyvyyspiikki + vapaa pudotus,
//                        6DoF-laseissa myös pään nopea nousu.
//  - 'swing' (puhelin kädessä): nopea heilautus = hyppy.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const G0 = 9.81;

export class JumpDetector {
  constructor(onJump) {
    this.onJump = onJump;
    this.mode = 'body';
    this.listening = false;
    this.lastEvent = -1e9;
    this.cool = 0;
    this.pushT = -1e9; this.pushMag = 0;
    this.ffStart = 0;
    this.level = 0;           // näytettävä liiketaso (m/s²)
    this.enabled = true;
    this.baseY = null; this.prevY = null;
    this.handler = (e) => this.onMotion(e);
  }

  async requestPermission() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        return (await DeviceMotionEvent.requestPermission()) === 'granted';
      }
    } catch { return false; }
    return true;
  }

  start() {
    if (this.listening) return;
    window.addEventListener('devicemotion', this.handler);
    this.listening = true;
  }

  stop() {
    window.removeEventListener('devicemotion', this.handler);
    this.listening = false;
  }

  get active() { return performance.now() - this.lastEvent < 2500; }

  onMotion(e) {
    const g = e.accelerationIncludingGravity;
    const l = e.acceleration;
    const hasG = g && g.x != null;
    const hasL = l && l.x != null;
    if (!hasG && !hasL) return;
    const now = performance.now();
    this.lastEvent = now;
    const mag = hasG ? Math.hypot(g.x, g.y, g.z) : null;
    const lin = hasL ? Math.hypot(l.x, l.y, l.z) : Math.abs(mag - G0);
    this.level = Math.max(this.level * 0.85, lin);
    if (!this.enabled || now < this.cool) return;

    if (this.mode === 'body') {
      // ponnistus: kokonaiskiihtyvyys selvästi yli 1 g
      const total = mag != null ? mag : G0 + lin;
      if (total > 14.5) {
        if (now - this.pushT > 350) this.pushMag = 0;
        this.pushT = now;
        this.pushMag = Math.max(this.pushMag, total);
      }
      // vapaa pudotus heti ponnistuksen jälkeen => ratsastaja on ilmassa
      if (mag != null && mag < 4.5) {
        if (!this.ffStart) this.ffStart = now;
        if (now - this.ffStart >= 35 && now - this.pushT < 450) this.fire(clamp((this.pushMag - 13) / 12, 0, 1));
      } else this.ffStart = 0;
      // ilman painovoimadataa: pelkkä voimakas ponnistus
      if (mag == null && lin > 9) this.fire(clamp((lin - 9) / 12, 0, 1));
    } else {
      if (lin > 12.5) this.fire(clamp((lin - 12.5) / 15, 0, 1));
    }
  }

  // 6DoF-lasit: pään korkeus (m) referenssiavaruudessa
  updateHead(y, dt) {
    if (this.baseY == null) { this.baseY = y; this.prevY = y; return; }
    const vy = (y - this.prevY) / Math.max(dt, 1e-3);
    this.prevY = y;
    const rise = y - this.baseY;
    if (rise < 0.05) this.baseY += (y - this.baseY) * Math.min(1, dt * 1.5);
    if (this.mode === 'body' && this.enabled && performance.now() > this.cool && rise > 0.07 && vy > 0.6) {
      this.fire(clamp((vy - 0.6) / 1.2, 0, 1));
    }
  }

  fire(strength) {
    const now = performance.now();
    this.cool = now + (this.mode === 'body' ? 800 : 550);
    this.ffStart = 0; this.pushT = -1e9; this.pushMag = 0;
    this.onJump(strength, this.mode);
  }
}
