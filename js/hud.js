// DOM heads-up display: speed, gear/RPM, position, laps, timing tower,
// start lights, messages and the track minimap.

const $ = (id) => document.getElementById(id);

export function formatTime(t) {
  if (!t || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  constructor(track) {
    this.track = track;
    this.el = {
      root: $('hud'), lap: $('lap'), pos: $('pos'), posTotal: $('posTotal'),
      speed: $('speed'), gear: $('gear'), cur: $('curLap'), last: $('lastLap'), best: $('bestLap'),
      tower: $('tower'), msg: $('msg'), wrong: $('wrongway'), lights: $('lights'),
    };
    this.lightDots = [...this.el.lights.querySelectorAll('.light')];
    this.msgTimer = 0;
    this.towerKey = '';

    this.rpmCanvas = $('rpm');
    this.rpmCtx = this.rpmCanvas.getContext('2d');
    this.map = $('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.setupMinimap();
    addEventListener('resize', () => this.setupMinimap());
  }

  setupMinimap() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.map, this.rpmCanvas]) {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    }
    const t = this.track;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
      minZ = Math.min(minZ, t.pz[i]); maxZ = Math.max(maxZ, t.pz[i]);
    }
    const W = this.map.width, H = this.map.height, pad = 14 * dpr;
    const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    const ox = (W - (maxX - minX) * scale) / 2, oz = (H - (maxZ - minZ) * scale) / 2;
    this.mapTf = (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];
    this.dpr = dpr;
    const path = new Path2D();
    for (let i = 0; i <= t.n; i += 3) {
      const [x, y] = this.mapTf(t.px[i % t.n], t.pz[i % t.n]);
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    path.closePath();
    this.mapPath = path;
  }

  show(v) {
    this.el.root.classList.toggle('hidden', !v);
    if (v) this.setupMinimap(); // canvases have no size while hidden
  }

  setLights(n, visible = true) {
    this.el.lights.classList.toggle('hidden', !visible);
    this.lightDots.forEach((d, i) => d.classList.toggle('on', i < n));
  }

  message(text, seconds = 2, cls = '') {
    this.el.msg.textContent = text;
    this.el.msg.className = 'msg show ' + cls;
    this.msgTimer = seconds;
  }

  update(dt, s) {
    const { player, order, totalLaps, raceTime, gaps } = s;
    const e = this.el;
    const kmh = Math.round(Math.abs(player.speed) * 3.6);
    e.speed.textContent = kmh;
    e.gear.textContent = player.gear;
    e.lap.innerHTML = `<span>VUELTA</span> ${Math.min(Math.max(player.lap, 1), totalLaps)}<small>/${totalLaps}</small>`;
    e.pos.textContent = player.position;
    e.posTotal.textContent = '/' + order.length;
    const lapTime = player.finished ? player.lastLap : raceTime - player.lapStart;
    e.cur.textContent = formatTime(lapTime);
    e.last.textContent = formatTime(player.lastLap);
    e.best.textContent = formatTime(player.bestLap);

    // Timing tower, rebuilt only when order/gaps text changes.
    const rows = order.map((c, i) => ({
      p: i + 1, code: c.driver.code, color: hex(c.driver.color), me: c.isPlayer,
      gap: i === 0 ? (c.finished ? 'FIN' : 'LÍDER') : gaps[i],
    }));
    const key = rows.map((r) => r.code + r.gap).join('|');
    if (key !== this.towerKey) {
      this.towerKey = key;
      e.tower.innerHTML = rows.map((r) =>
        `<li class="${r.me ? 'me' : ''}"><b>${r.p}</b><i style="background:${r.color}"></i><span>${r.code}</span><em>${r.gap}</em></li>`).join('');
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) e.msg.classList.remove('show');
    }
    e.wrong.classList.toggle('hidden', !s.wrongWay);

    this.drawRpm(player);
    this.drawMinimap(s.cars, player);
  }

  drawRpm(player) {
    const c = this.rpmCtx, W = this.rpmCanvas.width, H = this.rpmCanvas.height;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.56, r = Math.min(W, H) * 0.42;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const f = Math.min(1, Math.max(0, (player.rpm - 3000) / 10000));
    c.lineCap = 'round';
    c.lineWidth = r * 0.12;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    const grad = c.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#20e070');
    grad.addColorStop(0.6, '#ffd000');
    grad.addColorStop(1, '#ff2a2a');
    c.strokeStyle = grad;
    c.beginPath(); c.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); c.stroke();
    // Shift lights
    const n = 10, lw = r * 0.14;
    for (let i = 0; i < n; i++) {
      const on = f > 0.45 + (i / n) * 0.5;
      const col = i < 4 ? '#20e070' : i < 7 ? '#ff2a2a' : '#3aa0ff';
      c.fillStyle = on ? col : 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.arc(cx - ((n - 1) / 2) * lw * 1.25 + i * lw * 1.25, cy - r * 1.05, lw / 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  drawMinimap(cars, player) {
    const c = this.mapCtx, d = this.dpr;
    c.clearRect(0, 0, this.map.width, this.map.height);
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 9 * d;
    c.stroke(this.mapPath);
    c.strokeStyle = '#d9dde3';
    c.lineWidth = 4 * d;
    c.stroke(this.mapPath);
    // Start/finish marker
    const t = this.track;
    const [sx, sy] = this.mapTf(t.px[0], t.pz[0]);
    c.fillStyle = '#e10600';
    c.fillRect(sx - 2 * d, sy - 7 * d, 4 * d, 14 * d);

    for (const car of cars) {
      if (car === player) continue;
      const [x, y] = this.mapTf(car.x, car.z);
      c.fillStyle = hex(car.driver.color);
      c.strokeStyle = '#111';
      c.lineWidth = 1.5 * d;
      c.beginPath(); c.arc(x, y, 4.2 * d, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // Player: arrow pointing along heading.
    const [x, y] = this.mapTf(player.x, player.z);
    c.save();
    c.translate(x, y);
    c.rotate(-player.heading + Math.PI);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#e10600';
    c.lineWidth = 2 * d;
    c.beginPath();
    c.moveTo(0, -8 * d); c.lineTo(6 * d, 6 * d); c.lineTo(0, 3 * d); c.lineTo(-6 * d, 6 * d);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}
