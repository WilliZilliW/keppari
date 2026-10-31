// SKHH ry:n esteratsastussäännöt (2023) – virhepisteet, hylkäykset, arvostelu A.2.0 / A.2.1.
import { AI_RIDERS, AI_HORSES } from './config.js';

export const VP = {
  KNOCK: 4,          // puomin / lankun pudotus, muurin hajottaminen
  REFUSAL: 4,        // ensimmäinen kieltäytyminen / ohiratsastus / ylimääräinen voltti
  WATER: 4,          // vesihaudan tai maton koskettaminen
  TROT: 4,           // huomattava määrä ravi-/juoksuaskeleita
};
export const START_WINDOW = 45;   // s lähtömerkistä

export const ELIM = {
  SECOND_DISOBEDIENCE: 'Toinen tottelemattomuus',
  WRONG_FENCE: 'Väärä este',
  WRONG_DIRECTION: 'Este hypätty väärästä suunnasta',
  LEFT_ARENA: 'Poistui rajatulta rata-alueelta',
  DOUBLE_TIME: 'Kaksinkertainen enimmäisajan ylitys',
  EARLY_START: 'Lähtö ennen tuomarin lupaa',
  LATE_START: 'Lähtö yli 45 s lähtömerkistä',
  JUMP_BEFORE_START: 'Esteen hyppääminen ennen lähtöä',
};

// Aikavirheet: perusradalla 1 vp jokaisesta alkavasta 4 sekunnista, uusinnassa 1 vp / alkava sekunti
export function timeFaults(time, allowed, jumpOff = false) {
  if (time <= allowed) return 0;
  const over = time - allowed;
  return jumpOff ? Math.ceil(over - 1e-9) : Math.ceil(over / 4 - 1e-9);
}

export function fmtTime(t) { return t == null ? '–' : t.toFixed(2); }

function pick(arr, used) {
  for (let i = 0; i < 50; i++) { const v = arr[Math.floor(Math.random() * arr.length)]; if (!used.has(v)) { used.add(v); return v; } }
  return arr[0];
}

// Luo kilpakumppanit uskottavilla tuloksilla
export function generateField(cls, TA, TAjo, count = 9) {
  const used = new Set(), usedH = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = { name: pick(AI_RIDERS, used), horse: pick(AI_HORSES, usedH), ai: true };
    const r = Math.random();
    if (r < 0.07) { e.elim = Math.random() < 0.5 ? 'Toinen tottelemattomuus' : 'Väärä este'; }
    else {
      const clear = Math.random() < cls.clearChance;
      e.vp = clear ? 0 : [4, 4, 4, 8, 8, 12, 5, 1][Math.floor(Math.random() * 8)];
      e.time = TA * (0.74 + Math.random() * 0.22) + (e.vp >= 8 ? 2 : 0);
      if (e.vp === 1 || e.vp === 5) e.time = TA + 0.3 + Math.random() * 3;
      e.time = Math.round(e.time * 100) / 100;
    }
    if (cls.jumpOff && e.vp === 0 && !e.elim) {
      const r2 = Math.random();
      e.jo = { vp: r2 < 0.55 ? 0 : (r2 < 0.9 ? 4 : 8), time: Math.round(TAjo * (0.72 + Math.random() * 0.2) * 100) / 100 };
    }
    out.push(e);
  }
  return out;
}

// Järjestys A.2.0 (tai A.2.1 uusinnalla): hylätyt viimeisenä, sitten virhepisteet, sitten aika
export function rank(entries, jumpOffClass) {
  const key = (e) => {
    if (e.elim) return [3, 0, 0];
    if (jumpOffClass && e.jo) return e.jo.elim ? [1, 999, 0] : [0, e.jo.vp, e.jo.time];
    return [2, e.vp, e.time];
  };
  const sorted = [...entries].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[0] === 1) return a.time - b.time;
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] - kb[2];
  });
  let place = 0;
  sorted.forEach((e, i) => { e.place = e.elim ? null : (place = i + 1); });
  return sorted;
}
