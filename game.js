(function () {
  'use strict';
  const W = 420, H = 740, BASE_Y = 644, PLAYER_Y = 583;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const UPGRADES = Object.freeze({
    spread: { name: '三联散射', symbol: '⋔', desc: '一发变三发。扩大覆盖，拦下成群机械虫。' },
    pierce: { name: '钨芯穿甲', symbol: '↟', desc: '伤害提升 65%，每发可连续穿透 3 个目标。' },
    rapid: { name: '超频机芯', symbol: '»', desc: '射速提升 60%。用连续火力压制母机。' },
    cryo: { name: '低温弹药', symbol: '❄', desc: '命中减速 55%，持续 2 秒；伤害提升 25%。' },
    repair: { name: '应急装甲', symbol: '⊕', desc: '立即修复基地 30 点、机体 40 点，受伤降低 25%。' }
  });

  class GameEngine {
    constructor(seed = 7247) { this.initialSeed = seed; this.reset(); }
    reset() {
      this.seed = this.initialSeed; this.state = 'ready'; this.elapsed = 0; this.base = 100; this.shield = 100;
      this.energy = 100; this.kills = 0; this.score = 0; this.wave = 1; this.playerX = W / 2; this.targetX = W / 2;
      this.enemies = []; this.bullets = []; this.hostile = []; this.particles = []; this.rings = []; this.upgrades = [];
      this.upgradeIndex = 0; this.choices = []; this.events = []; this.nextSpawn = .65; this.shotClock = 0;
      this.invulnerable = 0; this.bossSpawned = false; this.bossDefeated = false; this.boss = null; this.nextId = 1;
      this.shake = 0; this.reason = ''; this.pulseCount = 0;
    }
    random() { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return this.seed / 4294967296; }
    start() { this.reset(); this.state = 'running'; this.events.push({ type: 'start', text: '第一波 / 虫潮来袭' }); }
    pause() { if (this.state === 'running') this.state = 'paused'; }
    resume() { if (this.state === 'paused') this.state = 'running'; }
    setTarget(x) { this.targetX = clamp(x, 26, W - 26); }
    has(id) { return this.upgrades.includes(id); }
    applyUpgrade(id) {
      if (this.state !== 'upgrade' || !this.choices.includes(id)) return false;
      this.upgrades.push(id);
      if (id === 'repair') { this.base = Math.min(100, this.base + 30); this.shield = Math.min(100, this.shield + 40); }
      this.state = 'running'; this.choices = []; this.events.push({ type: 'upgrade', text: `${UPGRADES[id].name} / 已装配` });
      this.burst(this.playerX, PLAYER_Y, '#70e2da', 24); return true;
    }
    spawnEnemy(type) {
      const roll = this.random(); type = type || (roll < .18 && this.elapsed > 12 ? 'tank' : roll > .68 ? 'drone' : 'bug');
      const hp = type === 'tank' ? 8 : type === 'drone' ? 2 : 3;
      this.enemies.push({ id: this.nextId++, type, x: 32 + this.random() * 356, y: 90, hp, maxHp: hp,
        radius: type === 'tank' ? 21 : type === 'drone' ? 17 : 16, speed: type === 'tank' ? 30 : type === 'drone' ? 48 : 38,
        clock: this.random() * 6.28, shoot: 1.8 + this.random() * 2, frozen: 0, alive: true, contacted: false });
    }
    spawnBoss() {
      this.bossSpawned = true;
      this.boss = { id: this.nextId++, type: 'boss', x: W / 2, y: 109, hp: 110, maxHp: 110, radius: 49, speed: 0,
        clock: 0, shoot: 1.9, frozen: 0, alive: true };
      this.enemies.push(this.boss); this.events.push({ type: 'boss', text: '警报 / 母机已到达' }); this.shake = .22;
    }
    burst(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) { const a = this.random() * Math.PI * 2, v = 25 + this.random() * 125;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .3 + this.random() * .4, max: .7, color, size: 1.5 + this.random() * 3 }); }
      if (this.particles.length > 350) this.particles.splice(0, this.particles.length - 350);
    }
    damageEnemy(e, amount) {
      if (!e.alive) return;
      e.hp -= amount; e.flash = .065;
      if (this.has('cryo')) e.frozen = 2;
      if (e.hp <= 0) {
        e.alive = false; this.kills++; this.score += e.type === 'boss' ? 1500 : e.type === 'tank' ? 120 : 60;
        this.energy = Math.min(100, this.energy + (e.type === 'tank' ? 9 : 6));
        this.burst(e.x, e.y, e.type === 'boss' ? '#ffbc5d' : '#ff9b3d', e.type === 'boss' ? 70 : 18);
        this.rings.push({ x: e.x, y: e.y, radius: 5, max: e.type === 'boss' ? 160 : 47, life: .45, color: '#ffa949' });
        this.events.push({ type: 'kill', boss: e.type === 'boss' });
        if (e.type === 'boss') { this.bossDefeated = true; this.shake = .6; }
      }
    }
    hurtPlayer(amount) {
      if (this.invulnerable > 0) return;
      this.shield = Math.max(0, this.shield - amount * (this.has('repair') ? .75 : 1));
      this.invulnerable = .85; this.shake = .17; this.burst(this.playerX, PLAYER_Y, '#a6e4ed', 15);
      this.events.push({ type: 'hurt' });
    }
    pulse() {
      if (this.state !== 'running' || this.energy < 100) return false;
      this.energy = 0; this.pulseCount++; this.shield = Math.min(100, this.shield + 12); this.hostile = []; this.shake = .32;
      this.rings.push({ x: this.playerX, y: PLAYER_Y, radius: 10, max: 680, life: .8, color: '#70e2da' });
      for (const e of this.enemies) this.damageEnemy(e, e.type === 'boss' ? 24 : 8);
      this.events.push({ type: 'pulse', text: '能量脉冲 / 护盾 +12' });
      if (this.bossDefeated && this.base > 0 && this.shield > 0) this.finish(true, '母机已摧毁，补给站安全。');
      return true;
    }
    fire() {
      const damage = (this.has('pierce') ? 1.65 : 1) * (this.has('cryo') ? 1.25 : 1);
      const shots = this.has('spread') ? [-1, 0, 1] : [0];
      for (const n of shots) this.bullets.push({ x: this.playerX + n * 10, y: PLAYER_Y - 25, vx: n * 49, vy: -630,
        damage, hits: new Set(), pierce: this.has('pierce') ? 3 : 1, alive: true });
      this.events.push({ type: 'shot' });
    }
    enemyFire(e) {
      const dx = this.playerX - e.x, dy = PLAYER_Y - e.y, length = Math.hypot(dx, dy), speed = e.type === 'boss' ? 166 : 133;
      const offsets = e.type === 'boss' ? [-.24, 0, .24] : [0];
      const angle = Math.atan2(dy, dx);
      for (const offset of offsets) this.hostile.push({ x: e.x, y: e.y + 15, vx: Math.cos(angle + offset) * speed,
        vy: Math.sin(angle + offset) * speed, alive: true, radius: e.type === 'boss' ? 5 : 4 });
    }
    finish(won, reason) { if (!['running', 'upgrade'].includes(this.state)) return; this.state = won ? 'victory' : 'defeat'; this.reason = reason; this.events.push({ type: 'finish', won }); }
    step(dt, direction = 0) {
      if (this.state !== 'running') return;
      dt = clamp(dt, 0, .05);
      const threshold = [20, 45][this.upgradeIndex];
      if (threshold !== undefined && this.elapsed + dt >= threshold) {
        this.elapsed = threshold; this.upgradeIndex++;
        this.choices = this.upgradeIndex === 1 ? ['spread', 'pierce', 'rapid'] : ['cryo', 'repair', ['spread', 'pierce', 'rapid'].find(id => !this.has(id))];
        this.state = 'upgrade'; this.events.push({ type: 'supply' }); return;
      }
      this.elapsed += dt;
      this.wave = this.elapsed < 30 ? 1 : this.elapsed < 65 ? 2 : 3;
      if (this.elapsed >= 30 && this.elapsed - dt < 30) this.events.push({ type: 'wave', text: '第二波 / 机械群加速' });
      if (this.elapsed >= 65 && !this.bossSpawned) this.spawnBoss();
      this.energy = Math.min(100, this.energy + dt * 1.4); this.invulnerable = Math.max(0, this.invulnerable - dt); this.shake = Math.max(0, this.shake - dt);
      if (direction) this.targetX = clamp(this.playerX + direction * 355 * dt, 26, W - 26);
      this.playerX += clamp(this.targetX - this.playerX, -480 * dt, 480 * dt);
      this.shotClock -= dt;
      if (this.shotClock <= 0) { this.fire(); this.shotClock = .19 / (this.has('rapid') ? 1.6 : 1); }
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0 && this.enemies.filter(e => e.alive && e.type !== 'boss').length < 10) {
        this.spawnEnemy(); this.nextSpawn = (this.wave === 1 ? 1.5 : this.wave === 2 ? 1.12 : 2.4) + this.random() * .4;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.clock += dt; e.frozen = Math.max(0, e.frozen - dt); e.flash = Math.max(0, (e.flash || 0) - dt);
        const slow = e.frozen > 0 ? .45 : 1;
        if (e.type === 'boss') { e.x = W / 2 + Math.sin(e.clock * .57) * 117; e.y = Math.min(164, e.y + dt * 40); }
        else { e.y += e.speed * slow * (this.wave === 2 ? 1.12 : 1) * dt; e.x = clamp(e.x + Math.sin(e.clock * (e.type === 'drone' ? 2.1 : 1.3)) * dt * 16 * slow, 25, W - 25); }
        if ((e.type === 'drone' || e.type === 'boss' || (e.type === 'tank' && this.wave > 1)) && e.y < PLAYER_Y - 65) {
          e.shoot -= dt * slow; if (e.shoot <= 0) { this.enemyFire(e); e.shoot = e.type === 'boss' ? 1.38 : 3.2; }
        }
        if (e.type !== 'boss' && !e.contacted && Math.hypot(e.x - this.playerX, e.y - PLAYER_Y) < e.radius + 13) { e.contacted = true; this.hurtPlayer(17); }
        if (e.y > BASE_Y - 12) {
          e.alive = false; this.base = Math.max(0, this.base - (e.type === 'tank' ? 16 : 8) * (this.has('repair') ? .75 : 1));
          this.burst(e.x, BASE_Y, '#ff6966', 20); this.shake = .2; this.events.push({ type: 'baseHit' });
        }
      }
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < 87 || b.x < 0 || b.x > W) b.alive = false;
        if (!b.alive) continue;
        for (const e of this.enemies) {
          if (e.alive && !b.hits.has(e.id) && Math.abs(b.x - e.x) < e.radius + 3 && Math.abs(b.y - e.y) < e.radius + 6) {
            b.hits.add(e.id); this.damageEnemy(e, b.damage); this.burst(b.x, b.y, '#bcf5e7', 3);
            if (b.hits.size >= b.pierce) { b.alive = false; break; }
          }
        }
      }
      for (const b of this.hostile) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (Math.hypot(b.x - this.playerX, b.y - PLAYER_Y) < 13 + b.radius) { b.alive = false; this.hurtPlayer(13); }
        if (b.y > BASE_Y || b.x < -20 || b.x > W + 20) b.alive = false;
      }
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; p.life -= dt; }
      for (const r of this.rings) { r.life -= dt; r.radius += r.max * dt * 1.9; }
      this.enemies = this.enemies.filter(e => e.alive); this.bullets = this.bullets.filter(b => b.alive); this.hostile = this.hostile.filter(b => b.alive);
      this.particles = this.particles.filter(p => p.life > 0); this.rings = this.rings.filter(r => r.life > 0);
      if (this.base <= 0) this.finish(false, '补给站被突破。优先拦截靠近底线的机械虫。');
      else if (this.shield <= 0) this.finish(false, '机体护盾耗尽。移动躲开红色弹道，脉冲可回复护盾。');
      else if (this.bossDefeated) this.finish(true, '母机已摧毁，补给站安全。');
      else if (this.elapsed >= 90) { this.elapsed = 90; this.finish(false, '时间耗尽，母机仍在运转。把强化火力集中在母机上。'); }
    }
    snapshot() { return Object.freeze({ state: this.state, elapsed: +this.elapsed.toFixed(2), timeRemaining: Math.max(0, 90 - this.elapsed),
      base: this.base, shield: this.shield, energy: this.energy, kills: this.kills, score: this.score, wave: this.wave, playerX: this.playerX,
      upgrades: Object.freeze([...this.upgrades]), choices: Object.freeze([...this.choices]), enemyCount: this.enemies.length,
      projectileCount: this.bullets.length, hostileCount: this.hostile.length, bossSpawned: this.bossSpawned,
      bossHp: this.boss ? Math.max(0, this.boss.hp) : null, bossDefeated: this.bossDefeated, pulseCount: this.pulseCount, reason: this.reason,
      enemies: Object.freeze(this.enemies.map(e => Object.freeze({ type: e.type, x: e.x, y: e.y, hp: e.hp }))),
      hostile: Object.freeze(this.hostile.map(b => Object.freeze({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }))) }); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { GameEngine, UPGRADES, W, H, BASE_Y, PLAYER_Y };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id), engine = new GameEngine(), canvas = $('game'), ctx = canvas.getContext('2d');
  const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = W * ratio; canvas.height = H * ratio; ctx.scale(ratio, ratio);
  Object.defineProperty(window, '__gameDebug', { configurable: false, get: () => engine.snapshot() });
  let lastTime = 0, time = 0, lastState = '', lastUpgrades = '', toastUntil = 0, pointerDown = false;
  const keys = new Set(); let soundOn = false, audioContext = null, lastShotSound = 0;
  function sound(kind) {
    if (!soundOn) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      if (kind === 'shot' && now - lastShotSound < .11) return;
      if (kind === 'shot') lastShotSound = now;
      const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.connect(gain); gain.connect(audioContext.destination);
      const settings = { shot: [640, 200, .055, .018, 'triangle'], kill: [190, 45, .12, .04, 'sawtooth'], pulse: [120, 620, .4, .06, 'sine'],
        hurt: [160, 60, .14, .05, 'square'], baseHit: [130, 45, .17, .045, 'sawtooth'], upgrade: [430, 880, .23, .045, 'sine'], supply: [520, 1040, .3, .045, 'sine'], start: [320, 800, .3, .04, 'sine'] };
      const s = settings[kind] || settings.upgrade; osc.type = s[4]; osc.frequency.setValueAtTime(s[0], now); osc.frequency.exponentialRampToValueAtTime(s[1], now + s[2]);
      gain.gain.setValueAtTime(s[3], now); gain.gain.exponentialRampToValueAtTime(.0001, now + s[2]); osc.start(now); osc.stop(now + s[2]);
    } catch (_) { soundOn = false; $('soundBtn').innerHTML = '音效 <b>不可用</b>'; $('soundBtn').setAttribute('aria-pressed', 'false'); }
  }
  const polygon = (points, fill, stroke) => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
  function line(x, y, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineWidth = 1; }
  function textAt(t, x, y, size, color, align = 'center') { ctx.font = `${size}px Bahnschrift, Microsoft YaHei, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(t, x, y); }
  function drawBackground() {
    ctx.fillStyle = '#0b1b28'; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(210, 380, 10, 210, 380, 430); glow.addColorStop(0, '#193340'); glow.addColorStop(1, '#091620'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    polygon([[71, 90], [349, 90], [405, 645], [15, 645]], '#112735');
    for (let i = 0; i < 13; i++) { const y = 95 + i * 44 + (time * 5 % 44); line(55 - i * 3, y, 365 + i * 3, y, '#29445055'); }
    for (let i = 0; i < 6; i++) line(70 + i * 56, 90, 13 + i * 79, 645, '#29445050');
    for (let i = 0; i < 130; i++) { const x = (i * 79.3 % 416), y = 108 + (i * 127.7 % 535); ctx.fillStyle = i % 3 ? '#65808a12' : '#07101c70'; ctx.fillRect(x, y, i % 4 + 1, i % 2 + 1); }
    line(67, 90, 15, 640, '#647d8245', 2); line(353, 90, 405, 640, '#647d8245', 2);
    line(71, 90, 19, 640, '#07121c', 3); line(349, 90, 401, 640, '#07121c', 3);
    for (let i = 0; i < 8; i++) { const y = 134 + i * 66, x = 62 - i * 6; ctx.fillStyle = i % 2 ? '#e59d4c65' : '#70e2da55'; ctx.fillRect(x - 5, y, 3, 12); ctx.fillRect(W - x + 2, y, 3, 12); }
    ctx.globalAlpha = .23; textAt('07', 210, 380, 112, '#6b8790'); textAt('RESTRICTED ZONE', 210, 412, 9, '#74949f'); ctx.globalAlpha = 1;
    for (const x of [8, 380]) { ctx.fillStyle = '#122835'; ctx.fillRect(x, 235, 30, 88); ctx.strokeStyle = '#304754'; ctx.strokeRect(x + 2, 237, 26, 84); for (let n = 0; n < 6; n++) line(x + 6, 246 + n * 12, x + 24, 246 + n * 12, '#0a1823', 3); }
    line(18, BASE_Y - 16, W - 18, BASE_Y - 16, '#ffac6570', 2);
    const baseLight = ctx.createLinearGradient(0, 604, 0, 648); baseLight.addColorStop(0, '#ff9b3d00'); baseLight.addColorStop(1, '#ff9b3d16'); ctx.fillStyle = baseLight; ctx.fillRect(18, 604, 384, 44);
    ctx.fillStyle = '#07131f'; ctx.fillRect(0, 646, W, H - 646);
    polygon([[0, 645], [45, 638], [375, 638], [420, 645], [420, 665], [0, 665]], '#263b45', '#52646c');
    for (let x = -12; x < 430; x += 26) polygon([[x, 641], [x + 11, 641], [x + 1, 652], [x - 10, 652]], '#c58b44');
    ctx.fillStyle = '#142a37'; ctx.fillRect(137, 633, 146, 27); ctx.strokeStyle = '#536574'; ctx.strokeRect(138, 633, 144, 27);
    textAt('最后补给站 / OUTPOST 07', 210, 650, 9, '#b9c8ca');
    [48, 340].forEach(x => { ctx.fillStyle = '#112331'; ctx.fillRect(x, 655, 32, 13); ctx.fillStyle = engine.base > 35 ? '#70e2da' : '#ff686a'; ctx.fillRect(x + 4, 658, 24, 2); });
  }
  function drawPlayer() {
    const x = engine.playerX, y = PLAYER_Y; ctx.save(); ctx.translate(x, y);
    if (engine.invulnerable > 0 && Math.floor(time * 17) % 2 === 0) ctx.globalAlpha = .45;
    ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(4, 16, 29, 11, 0, 0, Math.PI * 2); ctx.fill();
    if (engine.state === 'running' || engine.state === 'ready') {
      const flame = 6 + Math.sin(time * 35) * 3; polygon([[-11, 17], [-7, 17], [-9, 26 + flame]], '#70e2da88'); polygon([[7, 17], [11, 17], [9, 26 + flame]], '#70e2da88');
    }
    polygon([[-7, -20], [-13, -4], [-24, 6], [-24, 17], [-11, 12], [-8, 20], [8, 20], [11, 12], [24, 17], [24, 6], [13, -4], [7, -20]], '#aac1be', '#e2ebe0');
    polygon([[-6, -18], [-7, 9], [0, 17], [7, 9], [6, -18]], '#304d5a');
    polygon([[-4, -14], [0, -21], [4, -14], [3, -3], [-3, -3]], '#72e8e1');
    ctx.fillStyle = '#ff9b3d'; ctx.fillRect(-20, 5, 5, 6); ctx.fillRect(15, 5, 5, 6); ctx.fillStyle = '#d8e9de'; ctx.fillRect(-3, -28, 6, 10);
    if (engine.has('spread')) { ctx.fillStyle = '#70e2da'; ctx.fillRect(-17, -9, 3, 13); ctx.fillRect(14, -9, 3, 13); }
    if (engine.has('repair')) { ctx.strokeStyle = '#70e2da45'; ctx.beginPath(); ctx.arc(0, 0, 33, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); const freeze = e.frozen > 0, tint = e.flash > 0 ? '#edf8dd' : freeze ? '#7abdc5' : '#bd7761';
    ctx.fillStyle = '#0004'; ctx.beginPath(); ctx.ellipse(4, 10, e.radius + 4, e.radius * .65, 0, 0, Math.PI * 2); ctx.fill();
    if (e.type === 'boss') {
      polygon([[-49, -23], [-39, -39], [-18, -30], [18, -30], [39, -39], [49, -23], [56, 12], [40, 28], [24, 21], [0, 39], [-24, 21], [-40, 28], [-56, 12]], e.flash > 0 ? '#f2e2cb' : '#815b51', '#c69678');
      for (const s of [-1, 1]) { ctx.fillStyle = '#243a48'; ctx.fillRect(s * 36 - 10, -17, 20, 37); ctx.fillStyle = '#fc9b5e'; ctx.fillRect(s * 36 - 5, 16, 10, 15); for (let n = 0; n < 3; n++) line(s * 36 - 7, -11 + n * 7, s * 36 + 7, -11 + n * 7, '#0e2130', 3); }
      polygon([[-18, -22], [18, -22], [23, 6], [0, 26], [-23, 6]], '#243946', '#b9a69a');
      ctx.fillStyle = '#ff605d'; ctx.shadowColor = '#ff6966'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(0, 1, 9 + Math.sin(time * 6), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      line(-50, -49, 50, -49, '#522d36', 4); line(-50, -49, -50 + 100 * Math.max(0, e.hp / e.maxHp), -49, '#ff8c63', 4); textAt('失控母机', 0, -59, 10, '#ffc3a4');
    } else if (e.type === 'drone') {
      const wing = Math.sin(time * 22) * 2;
      polygon([[-23, -5], [-10, -10], [0, -16], [10, -10], [23, -5], [19, 7 + wing], [7, 2], [0, 13], [-7, 2], [-19, 7 + wing]], tint, '#ddad8c');
      polygon([[-5, -8], [5, -8], [7, 4], [0, 9], [-7, 4]], '#3e3d48'); ctx.fillStyle = '#ff6b62'; ctx.fillRect(-3, -3, 6, 4);
      line(-20, 9, -13, 9, '#ffb759', 2); line(13, 9, 20, 9, '#ffb759', 2);
    } else if (e.type === 'tank') {
      ctx.fillStyle = '#182b36'; ctx.fillRect(-23, -20, 11, 40); ctx.fillRect(12, -20, 11, 40);
      for (let n = 0; n < 6; n++) { line(-24, -17 + n * 7, -12, -17 + n * 7, '#697178', 2); line(12, -17 + n * 7, 24, -17 + n * 7, '#697178', 2); }
      polygon([[-15, -19], [15, -19], [18, 13], [11, 21], [-11, 21], [-18, 13]], tint, '#c7a78c');
      ctx.fillStyle = '#2c3c46'; ctx.fillRect(-11, -10, 22, 19); ctx.fillStyle = '#f99d65'; ctx.fillRect(-5, 0, 10, 6); ctx.fillStyle = '#75838a'; ctx.fillRect(-4, 7, 8, 20);
    } else {
      for (const s of [-1, 1]) { const step = Math.sin(time * 12 + e.clock) * 3; line(s * 8, -7, s * 20, -12 + step, '#be8a6c', 3); line(s * 8, 1, s * 20, 3, '#8e7465', 3); line(s * 7, 7, s * 17, 17 - step, '#be8a6c', 3); }
      polygon([[-9, -13], [9, -13], [13, 0], [8, 14], [-8, 14], [-13, 0]], tint, '#d2aa86');
      polygon([[-5, -8], [5, -8], [7, 5], [0, 11], [-7, 5]], '#343c45'); ctx.fillStyle = '#ffb870'; ctx.fillRect(-4, -2, 8, 4);
    }
    if (e.type !== 'boss' && e.hp < e.maxHp) { line(-15, -e.radius - 9, 15, -e.radius - 9, '#30454b', 2); line(-15, -e.radius - 9, -15 + 30 * e.hp / e.maxHp, -e.radius - 9, freeze ? '#70e2da' : '#ffb36c', 2); }
    if (freeze) { ctx.strokeStyle = '#70e2da80'; ctx.beginPath(); ctx.arc(0, 0, e.radius + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function draw() {
    ctx.save(); if (engine.shake > 0) ctx.translate(Math.sin(time * 96) * engine.shake * 8, Math.cos(time * 87) * engine.shake * 5);
    drawBackground();
    if (engine.state === 'ready') {
      [{ type: 'bug', x: 109, y: 164, radius: 16, hp: 3, maxHp: 3, clock: 0 }, { type: 'drone', x: 315, y: 205, radius: 17, hp: 2, maxHp: 2 }, { type: 'tank', x: 277, y: 485, radius: 21, hp: 8, maxHp: 8 }, { type: 'bug', x: 76, y: 470, radius: 16, hp: 3, maxHp: 3, clock: 2 }].forEach(drawEnemy);
    }
    for (const e of engine.enemies) drawEnemy(e);
    for (const b of engine.bullets) { ctx.shadowColor = engine.has('cryo') ? '#76dbff' : '#70e2da'; ctx.shadowBlur = 7; line(b.x, b.y + 11, b.x - b.vx * .012, b.y - 5, engine.has('pierce') ? '#ffe0a2' : '#b1fff1', engine.has('pierce') ? 3 : 2); } ctx.shadowBlur = 0;
    for (const b of engine.hostile) { ctx.fillStyle = '#ff6f68'; ctx.shadowColor = '#ff4b54'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#ffe4ca'; ctx.beginPath(); ctx.arc(b.x, b.y, 1.5, 0, Math.PI * 2); ctx.fill(); }
    drawPlayer();
    for (const p of engine.particles) { ctx.globalAlpha = Math.min(1, p.life / .3); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); } ctx.globalAlpha = 1;
    for (const r of engine.rings) { ctx.globalAlpha = Math.min(1, r.life * 1.7); ctx.strokeStyle = r.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke(); } ctx.lineWidth = 1; ctx.globalAlpha = 1;
    if (engine.state === 'running' && engine.elapsed < 5) { textAt('←  拖动机体，拦截来敌  →', W / 2, 533, 11, '#b6d0d4'); }
    ctx.restore();
  }
  function syncUI() {
    $('baseValue').textContent = `${Math.ceil(engine.base)}%`; $('baseBar').style.width = `${engine.base}%`;
    $('baseBar').style.background = engine.base < 35 ? '#ff686a' : '#70e2da';
    $('timeValue').textContent = String(Math.max(0, Math.ceil(90 - engine.elapsed))).padStart(2, '0');
    $('timeValue').style.color = engine.elapsed > 80 ? '#ff8c63' : '#eef6ed';
    $('timeBar').style.width = `${engine.elapsed / 90 * 100}%`; $('killValue').textContent = String(engine.kills).padStart(2, '0');
    $('shieldBar').style.width = `${engine.shield}%`; $('shieldValue').textContent = Math.ceil(engine.shield);
    $('shieldBar').style.background = engine.shield < 30 ? '#ff686a' : '#b7edf2';
    $('pulseValue').textContent = `${Math.floor(engine.energy)}%`; $('pulseBtn').disabled = engine.state !== 'running' || engine.energy < 100;
    $('pulseText').textContent = engine.energy >= 100 ? '清场 + 护盾回复' : '拦截机械体可加速充能';
    $('pauseBtn').disabled = !['running', 'paused'].includes(engine.state); $('pauseBtn').textContent = engine.state === 'paused' ? '▷' : 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', engine.state === 'paused' ? '继续游戏' : '暂停游戏');
    $('waveLabel').textContent = engine.state === 'ready' ? '待命 · 防线完整' : engine.wave === 3 ? '第三波 · 母机决战' : `第 ${engine.wave} / 3 波 · ${engine.wave === 1 ? '外围机械虫' : '集群入侵'}`;
    if (lastUpgrades !== engine.upgrades.join(',')) {
      lastUpgrades = engine.upgrades.join(','); $('buildCount').textContent = `0${engine.upgrades.length} / 02`;
      $('loadoutList').innerHTML = '<p class="empty-loadout">标准速射炮 <span>● ONLINE</span></p>' + engine.upgrades.map(id => `<div class="equipped"><span>${UPGRADES[id].symbol}</span>${UPGRADES[id].name}</div>`).join('');
    }
    if (lastState !== engine.state) {
      lastState = engine.state;
      $('introPanel').classList.toggle('hidden', engine.state !== 'ready'); $('upgradePanel').classList.toggle('hidden', engine.state !== 'upgrade');
      $('pausePanel').classList.toggle('hidden', engine.state !== 'paused'); $('resultPanel').classList.toggle('hidden', !['victory', 'defeat'].includes(engine.state));
      if (engine.state === 'upgrade') {
        $('upgradeTitle').textContent = engine.upgradeIndex === 1 ? '第一次进化' : '决战前的补给';
        $('upgradeOptions').innerHTML = engine.choices.map(id => { const u = UPGRADES[id]; return `<button class="upgrade-choice" data-upgrade="${id}"><span class="upgrade-symbol">${u.symbol}</span><span><strong>${u.name}</strong><small>${u.desc}</small></span><span class="arrow">↗</span></button>`; }).join('');
        $('upgradeOptions').querySelector('button').focus({ preventScroll: true });
      }
      if (engine.state === 'paused') $('resumeBtn').focus({ preventScroll: true });
      if (['victory', 'defeat'].includes(engine.state)) {
        const won = engine.state === 'victory'; $('resultKicker').textContent = won ? 'MISSION COMPLETE / 黎明已至' : 'SIGNAL LOST / 任务结束';
        $('resultTitle').textContent = won ? '补给站，守住了。' : '防线需要你。'; $('resultInsignia').textContent = won ? '✦' : '⌁';
        $('resultMessage').textContent = engine.reason; $('resultKills').textContent = engine.kills;
        $('resultTime').textContent = engine.elapsed.toFixed(1); $('resultBase').textContent = `${Math.ceil(engine.base)}%`;
        $('restartBtn').focus({ preventScroll: true });
      }
    }
    $('waveToast').classList.toggle('visible', time < toastUntil && engine.state === 'running');
  }
  function start() { keys.clear(); pointerDown = false; engine.start(); lastUpgrades = '-'; lastTime = performance.now(); syncUI(); }
  $('startBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start); $('restartPauseBtn').addEventListener('click', start);
  $('pauseBtn').addEventListener('click', () => { engine.state === 'paused' ? engine.resume() : engine.pause(); keys.clear(); syncUI(); });
  $('resumeBtn').addEventListener('click', () => { engine.resume(); syncUI(); });
  $('pulseBtn').addEventListener('click', () => { engine.pulse(); syncUI(); });
  $('upgradeOptions').addEventListener('click', e => { const b = e.target.closest('[data-upgrade]'); if (b) { engine.applyUpgrade(b.dataset.upgrade); keys.clear(); syncUI(); b.blur(); } });
  $('soundBtn').addEventListener('click', () => { soundOn = !soundOn; $('soundBtn').innerHTML = `音效 <b>${soundOn ? '开启' : '关闭'}</b>`; $('soundBtn').setAttribute('aria-pressed', String(soundOn)); if (soundOn) sound('upgrade'); });
  const pointToTarget = e => { const r = canvas.getBoundingClientRect(); engine.setTarget((e.clientX - r.left) * W / r.width); };
  canvas.addEventListener('pointerdown', e => { if (engine.state !== 'running') return; e.preventDefault(); pointerDown = true; canvas.setPointerCapture(e.pointerId); pointToTarget(e); });
  canvas.addEventListener('pointermove', e => { if (pointerDown && engine.state === 'running') pointToTarget(e); });
  canvas.addEventListener('pointerup', () => { pointerDown = false; }); canvas.addEventListener('pointercancel', () => { pointerDown = false; });
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Escape'].includes(e.code)) {
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement && engine.state !== 'running') return;
      e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) { engine.state === 'paused' ? engine.resume() : engine.pause(); keys.clear(); syncUI(); }
      else if (e.code === 'Space' && !e.repeat) engine.pulse();
      else keys.add(e.code);
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); pointerDown = false; engine.pause(); syncUI(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { engine.pause(); keys.clear(); syncUI(); } });
  function frame(now) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0; lastTime = now; time = now / 1000;
    const direction = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    engine.step(dt, direction);
    for (const event of engine.events.splice(0)) { if (event.text) { $('waveToast').textContent = event.text; toastUntil = time + 2.3; } sound(event.type); }
    draw(); syncUI(); requestAnimationFrame(frame);
  }
  syncUI(); requestAnimationFrame(frame);
})();
