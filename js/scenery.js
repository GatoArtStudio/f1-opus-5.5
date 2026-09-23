import * as THREE from 'three';

// Builds everything static: ground, asphalt, kerbs, barriers, start gantry,
// grandstands, trees and sky. Returns handles the game needs to animate.
export function buildScenery(scene, track, renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  buildSky(scene);
  buildGround(scene, aniso);
  buildRoad(scene, track, aniso);
  buildKerbs(scene, track);
  buildWalls(scene, track, aniso);
  buildStartLine(scene, track);
  const lights = buildGantry(scene, track);
  buildGrandstands(scene, track);
  buildTrees(scene, track);
  return { startLights: lights };
}

// Ground-level layers are drawn in a fixed order without writing depth, so
// they never z-fight with each other regardless of depth-buffer precision.
const FLAT = { sky: -10, ground: -9, road: -8, marks: -7 };

function canvasTexture(size, draw, aniso, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso || 1;
  return tex;
}

function noise(g, size, base, spread, count) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const l = Math.random() * spread - spread / 2;
    g.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const colors = [];
  const top = new THREE.Color(0x2f6fc4), horizon = new THREE.Color(0xcfe3f2), below = new THREE.Color(0x9fb8a0);
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 4000;
    if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6));
    else c.copy(horizon).lerp(below, Math.min(1, -y * 8));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = FLAT.sky;
  scene.add(sky);
}

function buildGround(scene, aniso) {
  const tex = canvasTexture(256, (g, s) => {
    noise(g, s, '#4b7d2e', 0.18, 9000);
    // mowing stripes
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, s / 2, s);
  }, aniso);
  tex.repeat.set(200, 200);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = FLAT.ground;
  scene.add(ground);
}

// Ribbon along the track between two lateral offsets (functions of index).
function ribbon(track, inner, outer, y, vScale) {
  const N = track.n;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const uv = new Float32Array((N + 1) * 2 * 2);
  const idx = [];
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    const a = inner(i), b = outer(i);
    pos.set([track.px[i] + track.rx[i] * a, y, track.pz[i] + track.rz[i] * a,
             track.px[i] + track.rx[i] * b, y, track.pz[i] + track.rz[i] * b], k * 6);
    uv.set([0, (k * track.ds) / vScale, 1, (k * track.ds) / vScale], k * 4);
    if (k < N) {
      const o = k * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRoad(scene, track, aniso) {
  const hw = track.halfWidth;
  const tex = canvasTexture(256, (g, s) => {
    noise(g, s, '#3a3b3e', 0.22, 14000);
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, 6, s);
    g.fillRect(s - 6, 0, 6, s);
  }, aniso);
  const road = new THREE.Mesh(
    ribbon(track, (i) => -hw, (i) => hw, 0.02, 10),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, depthWrite: false }),
  );
  road.receiveShadow = true;
  road.renderOrder = FLAT.road;
  scene.add(road);
  // Darker rubbered-in racing line.
  const line = new THREE.Mesh(
    ribbon(track, (i) => track.lineOffset[i] - 1.2, (i) => track.lineOffset[i] + 1.2, 0.025, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  line.renderOrder = FLAT.marks;
  scene.add(line);
}

function buildKerbs(scene, track) {
  const N = track.n, hw = track.halfWidth, kw = track.kerbWidth;
  // Kerbs only where the track bends (dilated so they cover entry/exit).
  const on = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(track.curv[i]) > 1 / 320) {
    for (let k = -8; k <= 8; k++) on[track.wrap(i + k)] = 1;
  }
  const pos = [], col = [];
  const red = new THREE.Color(0xd4161c), white = new THREE.Color(0xf2f2f2);
  for (let i = 0; i < N; i++) {
    if (!on[i]) continue;
    const j = track.wrap(i + 1);
    const c = Math.floor(i / 2) % 2 ? red : white;
    for (const s of [-1, 1]) {
      const pts = [];
      for (const [k, off, y] of [[i, hw, 0.03], [i, hw + kw, 0.09], [j, hw, 0.03], [j, hw + kw, 0.09]]) {
        pts.push([track.px[k] + track.rx[k] * off * s, y, track.pz[k] + track.rz[k] * off * s]);
      }
      const tri = s > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
      for (const t of tri) { pos.push(...pts[t]); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, depthWrite: false }));
  m.receiveShadow = true;
  m.renderOrder = FLAT.marks;
  scene.add(m);
}

function buildWalls(scene, track, aniso) {
  // Red/white blocks along the barrier with a blue advertising band on top.
  const tex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, s / 2, s);
    g.fillStyle = '#eeeeee';
    g.fillRect(s / 2, 0, s / 2, s);
    g.fillStyle = '#0d47a1';
    g.fillRect(0, 0, s, s * 0.3);
    g.fillStyle = '#ffffff';
    g.font = 'bold 48px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('WEB GP', 36, s * 0.15);
  }, aniso);
  const N = track.n, H = 1.1;
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 });
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const off = side > 0 ? track.wallR[i] : -track.wallL[i];
      const x = track.px[i] + track.rx[i] * off, z = track.pz[i] + track.rz[i] * off;
      pos.push(x, 0, z, x, H, z);
      const u = (k * track.ds) / 2;
      uv.push(u, 0, u, 1);
      if (k < N) { const o = k * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

function buildStartLine(scene, track) {
  const tex = canvasTexture(128, (g, s) => {
    const n = 8;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      g.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
    }
  }, 1);
  tex.repeat.set(4, 1);
  const w = track.halfWidth * 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, depthWrite: false }));
  line.renderOrder = FLAT.marks;
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, track.headingAt(0), 0);
  line.position.set(track.px[0], 0.03, track.pz[0]);
  scene.add(line);

  // Grid slot markings.
  const slotMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, depthWrite: false });
  for (let k = 0; k < 14; k++) {
    const d = track.length - 12 - k * 8;
    const lat = k % 2 ? 3.5 : -3.5;
    const p = track.pointAt(d + 3.2, lat);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.25), slotMat);
    bar.rotation.order = 'YXZ';
    bar.rotation.set(-Math.PI / 2, track.headingAt(track.wrap(Math.round(d / track.ds))), 0);
    bar.position.set(p.x, 0.03, p.z);
    bar.renderOrder = FLAT.marks;
    scene.add(bar);
  }
}

function buildGantry(scene, track) {
  const i = track.wrap(Math.round(6 / track.ds));
  const h = track.headingAt(i);
  const group = new THREE.Group();
  group.position.set(track.px[i], 0, track.pz[i]);
  group.rotation.y = h;
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.5, metalness: 0.6 });
  const span = track.halfWidth + 3;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), metal);
    post.position.set(s * span, 4, 0);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.6, 1.4, 0.8), metal);
  beam.position.set(0, 7.4, 0);
  beam.castShadow = true;
  group.add(beam);
  const lights = [];
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    pod.position.set((k - 2) * 1.6, 6.2, -0.4);
    group.add(pod);
    const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000 });
    for (const y of [0.5, -0.5]) {
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), m);
      bulb.position.set((k - 2) * 1.6, 6.2 + y, -0.66);
      bulb.rotation.y = Math.PI;
      group.add(bulb);
    }
    lights.push(m);
  }
  scene.add(group);
  return lights;
}

function buildGrandstands(scene, track) {
  const crowd = canvasTexture(256, (g, s) => {
    g.fillStyle = '#3a3f4a';
    g.fillRect(0, 0, s, s);
    const cols = ['#e53935', '#fdd835', '#ffffff', '#1e88e5', '#fb8c00', '#43a047', '#f06292', '#222'];
    for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 6) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect(x + Math.random() * 2, y + Math.random() * 2, 4, 5);
    }
  }, 1);
  const seatMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb0b6bf, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, side: THREE.DoubleSide });
  const len = 70, depth = 18, height = 12, hl = len / 2;

  // Wedge-shaped stand in local space: +Z along the track, the track lies
  // toward -X (stands sit on the left of the main straight), rising to +X.
  const wedge = new THREE.BufferGeometry();
  wedge.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -hl, 0, 0, hl, 0, 1.5, -hl, 0, 1.5, hl,
    depth, height, -hl, depth, height, hl, depth, 0, -hl, depth, 0, hl,
  ], 3));
  wedge.setIndex([0, 1, 2, 2, 1, 3, 6, 4, 7, 7, 4, 5, 0, 6, 1, 1, 6, 7, 0, 2, 6, 6, 2, 4, 1, 7, 3, 3, 7, 5]);
  wedge.computeVertexNormals();
  const seats = new THREE.BufferGeometry();
  seats.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.05, 1.55, -hl, -0.05, 1.55, hl, depth - 0.05, height + 0.05, -hl, depth - 0.05, height + 0.05, hl,
  ], 3));
  seats.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, len / 12, 0, 0, depth / 10, len / 12, depth / 10], 2));
  seats.setIndex([0, 2, 1, 1, 2, 3]);
  seats.computeVertexNormals();
  const roofGeo = new THREE.PlaneGeometry(depth + 4, len).rotateX(-Math.PI / 2);
  const postGeo = new THREE.BoxGeometry(0.4, height + 6, 0.4);

  for (const d of [-260, -180, -100, -20, 60, 140]) {
    const dist = (d + track.length) % track.length;
    const i = track.wrap(Math.round(dist / track.ds));
    const g = new THREE.Group();
    g.position.copy(track.pointAt(dist, -(track.wallL[i] + 5)));
    g.rotation.y = track.headingAt(i);
    const body = new THREE.Mesh(wedge, frameMat);
    body.castShadow = true;
    g.add(body, new THREE.Mesh(seats, seatMat));
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(depth / 2 - 1, height + 6, 0);
    roof.castShadow = true;
    g.add(roof);
    for (const z of [-hl + 1, 0, hl - 1]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(depth - 0.5, (height + 6) / 2, z);
      g.add(post);
    }
    scene.add(g);
  }
}

function buildTrees(scene, track) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
  }
  const pad = 250, count = 900;
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 6).translate(0, 1.5, 0);
  const leafGeo = new THREE.ConeGeometry(2.8, 8, 8).translate(0, 7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b3a21 }), count);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), count);
  leaves.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const proj = {};
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const x = minX - pad + Math.random() * (maxX - minX + pad * 2);
    const z = minZ - pad + Math.random() * (maxZ - minZ + pad * 2);
    track.project(x, z, -1, proj);
    const i = proj.index;
    const wall = proj.lateral > 0 ? track.wallR[i] : track.wallL[i];
    if (Math.abs(proj.lateral) < wall + 10 + Math.random() * 20) continue;
    // Keep grandstand area on the main straight clear.
    if (Math.abs(proj.lateral) < 60 && (proj.dist < 220 || proj.dist > track.length - 320)) continue;
    const sc = 0.7 + Math.random() * 0.8;
    s.set(sc, sc * (0.8 + Math.random() * 0.5), sc);
    q.setFromAxisAngle(p.set(0, 1, 0), Math.random() * Math.PI);
    m.compose(p.set(x, 0, z), q, s);
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    leaves.setColorAt(placed, c.setHSL(0.27 + Math.random() * 0.08, 0.5, 0.2 + Math.random() * 0.12));
    placed++;
  }
  trunks.count = leaves.count = placed;
  scene.add(trunks, leaves);
}
