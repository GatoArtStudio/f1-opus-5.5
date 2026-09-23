import * as THREE from 'three';
import { CAR, DRIVERS, PLAYER_DRIVER, DIFFICULTY } from './config.js';
import { Track, clamp, angleDiff } from './track.js';
import { Car } from './car.js';
import { BotDriver } from './ai.js';
import { buildScenery } from './scenery.js';
import { Input } from './input.js';
import { Hud, formatTime } from './hud.js';
import { EngineAudio } from './audio.js';

const STEP = 1 / 120;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Renderer / scene

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe3f2, 350, 2200);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 6000);

scene.add(new THREE.HemisphereLight(0xdcecff, 0x3d5a2a, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const track = new Track();
const scenery = buildScenery(scene, track, renderer);
const hud = new Hud(track);
const input = new Input();
const audio = new EngineAudio();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// Race setup

let state = 'menu'; // menu | countdown | racing | paused | finished
let race = null;
let cameraMode = 0;
const CAMERA_MODES = ['Persecución', 'Persecución lejana', 'Cámara T (onboard)'];
let options = { laps: 3, bots: 7, difficulty: 'medium', grid: 'back' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rand = ([a, b]) => a + Math.random() * (b - a);

function setupRace(opts, demo = false) {
  if (race) for (const c of race.cars) scene.remove(c.mesh);
  const diff = DIFFICULTY[opts.difficulty];
  const n = opts.bots + 1;
  let playerSlot = { pole: 0, middle: Math.floor(n / 2), back: n - 1 }[opts.grid];
  if (playerSlot === undefined) playerSlot = Math.floor(Math.random() * n);

  const drivers = shuffle([...DRIVERS]).slice(0, opts.bots);
  const cars = [], bots = [];
  let player = null;
  let d = 0;
  for (let slot = 0; slot < n; slot++) {
    const isPlayer = slot === playerSlot;
    const driver = isPlayer ? PLAYER_DRIVER : drivers[d++];
    const car = new Car(driver, track, { isPlayer, topFactor: isPlayer ? 1 : rand(diff.top) });
    car.placeAt(track.length - 12 - slot * 8, slot % 2 ? 3.5 : -3.5);
    car.grid = slot + 1;
    scene.add(car.mesh);
    cars.push(car);
    if (isPlayer) player = car;
    else bots.push(new BotDriver(car, track, rand(diff.skill)));
  }
  // Takes over the player's car in demo mode and after the chequered flag.
  const playerBot = new BotDriver(player, track, 0.9);
  if (player.mesh.userData.label) player.mesh.userData.label.visible = false;

  race = {
    cars, bots, player, playerBot, demo,
    totalLaps: demo ? 999 : opts.laps,
    time: 0,            // race clock since lights out
    countdown: 0,
    holdTime: 0.6 + Math.random() * 1.6,
    firstTimes: [],     // time the leader first reached each 10 m bucket
    fastestLap: Infinity,
    resultsShown: false,
    finishedAt: 0,
  };
  for (const c of cars) c.prevIndex = c.index;
  camYaw = player.heading;
  camPos.set(player.x, 3, player.z).addScaledVector(new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)), -9);
  hud.setLights(0, !demo);
  scenery.startLights.forEach((m) => { m.emissive.setHex(0); m.color.setHex(0x220000); });
}

// ---------------------------------------------------------------------------
// Simulation

function onCrossLine(car) {
  car.lap++;
  if (car.lap <= (car.maxLap || 0)) return; // re-crossing after reversing
  car.maxLap = car.lap;
  const t = race.time;
  if (car.lap >= 2) {
    const lapTime = t - car.lapStart;
    car.lastLap = lapTime;
    if (!car.bestLap || lapTime < car.bestLap) car.bestLap = lapTime;
    if (lapTime < race.fastestLap) {
      race.fastestLap = lapTime;
      race.fastestBy = car;
      if (!race.demo && car.lap <= race.totalLaps + 1) {
        hud.message(car.isPlayer ? `¡VUELTA RÁPIDA! ${formatTime(lapTime)}` : `Vuelta rápida: ${car.driver.code} ${formatTime(lapTime)}`, 2.5, car.isPlayer ? 'purple' : 'small');
      }
    }
  }
  car.lapStart = car.lap >= 2 ? t : 0; // lap 1 is timed from lights out
  if (car.lap > race.totalLaps && !car.finished) {
    car.finished = true;
    car.finishTime = t;
    if (car.isPlayer && !race.demo) {
      state = 'finished';
      race.finishedAt = performance.now();
      const pos = race.cars.filter((c) => c.finished).length;
      hud.message(`🏁 ¡META! Posición P${pos}`, 4, 'big');
    }
  } else if (car.isPlayer && !race.demo && car.lap === race.totalLaps && race.totalLaps > 1) {
    hud.message('ÚLTIMA VUELTA', 2.5, 'big');
  }
}

const OFFS = [-1.8, 0, 1.8];
function collideCars(cars) {
  const r2 = CAR.collisionRadius * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
      const sa = Math.sin(a.heading), ca = Math.cos(a.heading);
      const sb = Math.sin(b.heading), cb = Math.cos(b.heading);
      for (const oa of OFFS) for (const ob of OFFS) {
        const dx = b.x + sb * ob - (a.x + sa * oa);
        const dz = b.z + cb * ob - (a.z + ca * oa);
        const d2 = dx * dx + dz * dz;
        if (d2 >= r2 * r2 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (r2 - d) / 2;
        a.x -= nx * pen; a.z -= nz * pen;
        b.x += nx * pen; b.z += nz * pen;
        const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vrel < 0) {
          const jImp = (-(1 + 0.3) * vrel) / 2;
          a.vx -= nx * jImp; a.vz -= nz * jImp;
          b.vx += nx * jImp; b.vz += nz * jImp;
          a.impact = Math.max(a.impact, -vrel);
          b.impact = Math.max(b.impact, -vrel);
        }
      }
    }
  }
}

function step(dt) {
  const { cars, bots, player } = race;
  const green = state !== 'countdown';

  if (green) {
    for (const b of bots) b.update(dt, cars, race.time);
    if (race.demo || player.finished) race.playerBot.update(dt, cars, race.time);
    else Object.assign(player.input, input.read(dt));
  } else {
    // On the grid: nobody moves, but the player can rev the engine.
    const inp = input.read(dt);
    for (const c of cars) c.input.throttle = c.input.brake = c.input.steer = 0;
    player.revs = inp.throttle;
  }

  if (green) for (const c of cars) c.update(dt);
  if (green) {
    collideCars(cars);
    for (const c of cars) {
      c.updateTrackPosition();
      c.collideWalls();
    }
  }

  const N = track.n;
  for (const c of cars) {
    if (c.prevIndex > N * 0.75 && c.index < N * 0.25) onCrossLine(c);
    else if (c.prevIndex < N * 0.25 && c.index > N * 0.75) c.lap--;
    c.prevIndex = c.index;
    c.progress = (c.lap - 1) * track.length + c.trackDist; // grid (lap 0) is slightly negative
  }
  if (green) race.time += dt;
}

// Order: finished cars by finish time, then everyone else by distance covered.
function computeOrder() {
  const order = [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });
  order.forEach((c, i) => (c.position = i + 1));

  // Gap to leader using the time the leader passed the same point.
  const ft = race.firstTimes;
  const leader = order[0];
  const lb = Math.floor(Math.max(0, leader.progress) / 10);
  for (let b = ft.length; b <= lb; b++) ft[b] = race.time;
  const gaps = order.map((c, i) => {
    if (i === 0) return '';
    if (c.finished) return '+' + (c.finishTime - leader.finishTime).toFixed(3);
    const behind = leader.progress - c.progress;
    if (!leader.finished && behind > track.length) return `+${Math.floor(behind / track.length)} V`;
    if (leader.finished && c.lap < race.totalLaps) return `+${race.totalLaps - c.lap + 1} V`;
    const b = Math.floor(Math.max(0, c.progress) / 10);
    const t0 = ft[b];
    return t0 === undefined ? '' : '+' + Math.max(0, race.time - t0).toFixed(1);
  });
  return { order, gaps };
}

// ---------------------------------------------------------------------------
// Camera

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camYaw = 0, shake = 0, orbit = 0;

function updateCamera(dt) {
  const { player } = race;
  if (state === 'menu') {
    // Slow orbit following the lead car in attract mode.
    const lead = [...race.cars].sort((a, b) => b.progress - a.progress)[0];
    orbit += dt * 0.12;
    const tx = lead.x + Math.sin(orbit) * 30, tz = lead.z + Math.cos(orbit) * 30;
    camPos.lerp(new THREE.Vector3(tx, 12, tz), 1 - Math.exp(-dt * 2));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(lead.x, 1, lead.z), 1 - Math.exp(-dt * 4));
    camera.lookAt(camLook);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    return;
  }
  const car = player;
  camYaw += angleDiff(car.heading, camYaw) * (1 - Math.exp(-dt * (cameraMode === 2 ? 30 : 5)));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const speed = Math.abs(car.speed);
  let fov = 66 + (speed / CAR.maxSpeed) * 14;
  if (cameraMode === 2) {
    const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
    camera.position.set(car.x - hx * 0.4, 1.42, car.z - hz * 0.4);
    camera.lookAt(car.x + hx * 30, 1.0, car.z + hz * 30);
    fov += 4;
  } else {
    const dist = cameraMode === 0 ? 8.5 : 14;
    const height = cameraMode === 0 ? 2.7 : 4.8;
    const target = new THREE.Vector3(car.x - fx * dist, height, car.z - fz * dist);
    camPos.lerp(target, 1 - Math.exp(-dt * 12));
    camera.position.copy(camPos);
    camLook.set(car.x + fx * 5, 1.1, car.z + fz * 5);
    camera.lookAt(camLook);
  }
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Countdown (5 red lights, then lights out)

function updateCountdown(dt) {
  race.countdown += dt;
  const t = race.countdown;
  const lit = clamp(Math.floor(t - 0.5) + 1, 0, 5) * (t > 1 ? 1 : 0);
  const out = t > 5.5 + race.holdTime;
  hud.setLights(out ? 0 : lit, !out);
  scenery.startLights.forEach((m, i) => {
    const on = !out && i < lit;
    m.emissive.setHex(on ? 0xff1010 : 0x000000);
    m.emissiveIntensity = on ? 3 : 0;
    m.color.setHex(on ? 0xff2020 : 0x220000);
  });
  if (out) {
    state = 'racing';
    race.time = 0;
    hud.message('¡YA!', 1.2, 'big green');
  }
}

// ---------------------------------------------------------------------------
// Results / menus

function showResults() {
  const { order } = computeOrder();
  const leader = order[0];
  $('resultsBody').innerHTML = order.map((c, i) => {
    let time;
    if (c.finished) time = i === 0 ? formatTime(c.finishTime) : '+' + (c.finishTime - leader.finishTime).toFixed(3);
    else time = `<span class="dim">en pista · V${Math.max(1, c.lap)}</span>`;
    const fl = race.fastestBy === c ? ' <span class="fl">●</span>' : '';
    const hexc = '#' + c.driver.color.toString(16).padStart(6, '0');
    return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><i style="background:${hexc}"></i>${c.driver.name} <small>${c.driver.code}</small></td><td>${time}</td><td>${formatTime(c.bestLap)}${fl}</td><td>${c.grid}</td></tr>`;
  }).join('');
  const p = race.player.position;
  $('resultsTitle').textContent = p === 1 ? '¡VICTORIA!' : p <= 3 ? `¡PODIO! P${p}` : `Terminaste P${p}`;
  $('results').classList.remove('hidden');
}

function readOptions() {
  options = {
    laps: +$('optLaps').value,
    bots: +$('optBots').value,
    difficulty: $('optDiff').value,
    grid: $('optGrid').value,
  };
}

function startRace() {
  readOptions();
  audio.start();
  setupRace(options);
  $('menu').classList.add('hidden');
  $('results').classList.add('hidden');
  $('pause').classList.add('hidden');
  hud.show(true);
  state = 'countdown';
  input.clearPressed();
}

function toMenu() {
  $('results').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('menu').classList.remove('hidden');
  hud.show(false);
  audio.update(0, 0, false);
  setupRace({ ...options, bots: 9, grid: 'random' }, true);
  state = 'menu';
}

let pausedFrom = null;
function togglePause() {
  if (state === 'paused') {
    state = pausedFrom;
    $('pause').classList.add('hidden');
  } else if (state === 'racing' || state === 'countdown' || state === 'finished') {
    pausedFrom = state;
    state = 'paused';
    $('pause').classList.remove('hidden');
  }
}

$('startBtn').addEventListener('click', startRace);
$('againBtn').addEventListener('click', startRace);
$('menuBtn').addEventListener('click', toMenu);
$('resumeBtn').addEventListener('click', togglePause);
$('restartBtn').addEventListener('click', startRace);
$('quitBtn').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state !== 'paused') togglePause();
});

// ---------------------------------------------------------------------------
// Main loop

let last = performance.now(), acc = 0, resultsRefresh = 0;
const tmpV = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (input.consumePressed('Escape') || input.consumePressed('KeyP')) togglePause();
  if (input.consumePressed('KeyC')) {
    cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
    if (state !== 'menu') hud.message('Cámara: ' + CAMERA_MODES[cameraMode], 1.2, 'small');
  }
  if (input.consumePressed('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.message(audio.muted ? 'Sonido: OFF' : 'Sonido: ON', 1, 'small');
  }
  if (input.consumePressed('KeyR') && state === 'racing') {
    race.player.respawn();
    hud.message('Coche recolocado', 1, 'small');
  }
  if (input.consumePressed('Enter') && state === 'menu') startRace();
  input.clearPressed();

  if (state !== 'paused') {
    if (state === 'countdown') updateCountdown(dt);
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
  }

  const { player } = race;
  for (const c of race.cars) {
    c.syncMesh(dt);
    const label = c.mesh.userData.label;
    if (label && !c.isPlayer) {
      const d = camera.position.distanceTo(tmpV.set(c.x, 1, c.z));
      label.visible = state !== 'menu' && d > 6 && d < 160;
    }
    if (c.isPlayer && c.impact > 3 && state !== 'menu') {
      shake = Math.min(0.6, c.impact * 0.04);
      audio.impact(c.impact);
    }
    c.impact = 0;
  }
  // Hide the player's own car body in the onboard camera except the nose.
  player.mesh.userData.body.children.forEach((m) => { m.visible = cameraMode !== 2 || m.position.z > 1.2; });

  updateCamera(dt);
  sun.position.set(camera.position.x + 80, 140, camera.position.z + 50);
  sun.target.position.set(camera.position.x, 0, camera.position.z);

  if (state !== 'menu') {
    const { order, gaps } = computeOrder();
    const i = player.index;
    const dot = Math.sin(player.heading) * track.tx[i] + Math.cos(player.heading) * track.tz[i];
    hud.update(dt, {
      player, order, gaps, cars: race.cars, totalLaps: race.totalLaps, raceTime: race.time,
      wrongWay: dot < -0.3 && player.speed > 3 && state === 'racing',
    });
    const rpm = state === 'countdown' ? 4000 + (player.revs || 0) * 8000 : player.rpm;
    const thr = state === 'countdown' ? player.revs || 0 : player.input.throttle;
    audio.update(rpm, thr, state !== 'paused');

    if (state === 'finished') {
      if (!race.resultsShown && performance.now() - race.finishedAt > 3000) {
        race.resultsShown = true;
        showResults();
      } else if (race.resultsShown && (resultsRefresh -= dt) < 0) {
        resultsRefresh = 0.5;
        showResults();
      }
    }
  }

  renderer.render(scene, camera);
}

toMenu();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);
