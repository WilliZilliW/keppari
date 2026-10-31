// Pelin perusasetukset: kenttä, rata, luokat ja keppihevoset.
const PI = Math.PI;

export const EYE = 1.5;                 // silmien korkeus (ratsastaja hieman kumarassa)
export const ARENA = { minX: -18, maxX: 18, minZ: -30, maxZ: 30 };
export const SPAWN = { x: 11, z: 26.5, heading: 0 };
export const START_LINE = { x: 11, z: 17, dir: 0, w: 5 };
export const FINISH_LINE = { x: 4, z: -17, dir: 0, w: 5 };
export const FENCE_W = 3.2;             // esteen leveys (tolppien väli)

// dir = hyppysuunta (yaw). 0 = kohti -z, PI = kohti +z, PI/2 = kohti -x, -PI/2 = kohti +x
export const LAYOUT = [
  { id: '1',  x: 11,  z: 7,   dir: 0 },
  { id: '2',  x: 11,  z: -9,  dir: 0 },
  { id: '3',  x: -1,  z: -21, dir: PI / 2 },
  { id: '4',  x: -10, z: -9,  dir: PI },
  { id: '5a', x: -10, z: 3,   dir: PI, combo: '5' },
  { id: '5b', x: -10, z: 10,  dir: PI, combo: '5' },
  { id: '6',  x: -1,  z: 19,  dir: -PI / 2 },
  { id: '7',  x: 4,   z: 4,   dir: 0 },
  { id: '8',  x: 4,   z: -8,  dir: 0 },
];

// Estetyypit: pysty, okseri, trippeli, muuri, ristikko, vesihauta
export const CLASSES = [
  {
    id: 'ristikko', name: 'Ristikkoluokka', short: 'Ristikot 30 cm', height: 0.30, margin: 0.30,
    canter: 5.2, refSpeed: 3.6, method: 'A.2.0', clearChance: 0.72,
    types: { 1: 'ristikko', 2: 'ristikko', 3: 'ristikko', 4: 'ristikko', '5a': 'ristikko', 6: 'ristikko', 7: 'ristikko', 8: 'ristikko' },
    desc: 'Aloittelijoille. Matalat ristikot, ei sarjaestettä.'
  },
  {
    id: '50', name: '50 cm', short: '50 cm', height: 0.50, margin: 0.24,
    canter: 5.4, refSpeed: 3.8, method: 'A.2.0', clearChance: 0.58,
    types: { 1: 'pysty', 2: 'okseri', 3: 'muuri', 4: 'pysty', '5a': 'pysty', '5b': 'pysty', 6: 'pysty', 7: 'ristikko', 8: 'okseri' },
    desc: 'Pystyesteitä, okserit, muuri ja sarjaeste.'
  },
  {
    id: '70', name: '70 cm', short: '70 cm', height: 0.70, margin: 0.19,
    canter: 5.6, refSpeed: 4.0, method: 'A.2.0', clearChance: 0.46,
    types: { 1: 'pysty', 2: 'okseri', 3: 'muuri', 4: 'pysty', '5a': 'pysty', '5b': 'okseri', 6: 'vesihauta', 7: 'pysty', 8: 'okseri' },
    desc: 'Mukana vesihauta – älä astu veteen!'
  },
  {
    id: '90', name: '90 cm', short: '90 cm', height: 0.90, margin: 0.15,
    canter: 5.8, refSpeed: 4.2, method: 'A.2.0', clearChance: 0.36,
    types: { 1: 'pysty', 2: 'okseri', 3: 'muuri', 4: 'pysty', '5a': 'okseri', '5b': 'pysty', 6: 'vesihauta', 7: 'pysty', 8: 'trippeli' },
    desc: 'Korkeat esteet ja trippeli. Ajoitus ratkaisee.'
  },
  {
    id: '110', name: '110 cm Grand Prix', short: 'GP 110 cm', height: 1.10, margin: 0.12,
    canter: 6.0, refSpeed: 4.4, method: 'A.2.1', clearChance: 0.30, jumpOff: ['1', '2', '3', '4', '6', '7', '8'],
    jumpOffVia: { 6: [[-6.6, -1], [-6.6, 14.5]] }, // uusinnan oikotie: kierrä sarjaeste oikealta
    types: { 1: 'pysty', 2: 'okseri', 3: 'muuri', 4: 'pysty', '5a': 'okseri', '5b': 'pysty', 6: 'vesihauta', 7: 'pysty', 8: 'trippeli' },
    desc: 'Mestaruusluokka. Puhtaat ratsukot uusintaan, jossa aika ratkaisee.'
  },
];

export const HORSES = [
  { name: 'Tuulispää', coat: '#9a4a22', mane: '#5a230c', muzzle: '#7a3618', blaze: true,  bridle: '#2a1a12', brow: '#e63946', glove: '#e63946', desc: 'rautias' },
  { name: 'Salama',    coat: '#5e341b', mane: '#120c0a', muzzle: '#2b1810', blaze: false, bridle: '#111111', brow: '#ffd60a', glove: '#1d3557', desc: 'ruunikko' },
  { name: 'Lumikki',   coat: '#e3e0da', mane: '#f7f7f5', muzzle: '#b9b2ad', blaze: false, bridle: '#3a2a20', brow: '#9b5de5', glove: '#9b5de5', desc: 'kimo' },
  { name: 'Musti',     coat: '#1f1b1b', mane: '#0a0a0a', muzzle: '#2b2626', blaze: true,  bridle: '#5a3a22', brow: '#00b4d8', glove: '#222222', desc: 'musta' },
  { name: 'Kaneli',    coat: '#d9b46a', mane: '#f6ecd2', muzzle: '#b8945a', blaze: true,  bridle: '#5a3a22', brow: '#2a9d8f', glove: '#f4a261', desc: 'voikko' },
  { name: 'Usva',      coat: '#f4f1fb', mane: 'rainbow', muzzle: '#e0d6ef', blaze: false, bridle: '#ff70a6', brow: '#ffd60a', glove: '#ff70a6', desc: 'yksisarvinen', horn: true },
];

export const FENCE_THEMES = [
  { a: '#ffffff', b: '#d62828', wing: '#1d3557', flower: '#ff4d6d' },
  { a: '#ffffff', b: '#1d4ed8', wing: '#ffffff', flower: '#ffd60a' },
  { a: '#ffd60a', b: '#1b263b', wing: '#1b263b', flower: '#ffffff' },
  { a: '#ffffff', b: '#2a9d8f', wing: '#2a9d8f', flower: '#ff70a6' },
  { a: '#ff8fab', b: '#ffffff', wing: '#ffffff', flower: '#c77dff' },
  { a: '#ffffff', b: '#7b2cbf', wing: '#7b2cbf', flower: '#ffd60a' },
  { a: '#f77f00', b: '#ffffff', wing: '#003049', flower: '#ffffff' },
  { a: '#ffffff', b: '#2b9348', wing: '#2b9348', flower: '#ff4d6d' },
  { a: '#e63946', b: '#f1faee', wing: '#e63946', flower: '#4cc9f0' },
];

export const AI_RIDERS = ['Aino', 'Iida', 'Venla', 'Onni', 'Lumi', 'Helmi', 'Siiri', 'Elsa', 'Oona', 'Pihla', 'Veeti', 'Ella', 'Minea', 'Eeli', 'Nelli', 'Sofia'];
export const AI_HORSES = ['Myrsky', 'Pilvi', 'Tähtisilmä', 'Sointu', 'Karamelli', 'Ruska', 'Kuura', 'Hopea', 'Mansikka', 'Viima', 'Kipinä', 'Taika', 'Vilja', 'Hilla', 'Revontuli', 'Peppi'];
