// Yhdistää monta pientä staattista osaa yhdeksi meshiksi (vertex-värit) => vähemmän draw calleja puhelimella.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class GeoBuilder {
  constructor() { this.parts = []; }

  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    _p.set(pos[0], pos[1], pos[2]);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _s.set(scale[0], scale[1], scale[2]);
    _m.compose(_p, _q, _s);
    return this.addMatrix(geo, color, _m);
  }

  addMatrix(geo, color, matrix) {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g);
    return this;
  }

  build(material, { castShadow = true, receiveShadow = true } = {}) {
    if (!this.parts.length) return new THREE.Group();
    const indexed = this.parts.filter(p => p.index);
    const nonIndexed = this.parts.filter(p => !p.index);
    const group = new THREE.Group();
    for (const list of [indexed, nonIndexed]) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.parts.forEach(p => p.dispose());
    this.parts = [];
    return group.children.length === 1 ? group.children[0] : group;
  }
}

export const vcolStd = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0, ...opts });
export const vcolLambert = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
