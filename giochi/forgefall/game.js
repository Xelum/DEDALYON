(() => {
  'use strict';

  const SIZE = 6;
  const START_MOVES = 5;
  const START_HP = 5;
  const TYPES = ['ice', 'copper', 'iron', 'fire', 'wood', 'gold'];
  const DATA = {
    ice: {
      material: 'Cristallo di ghiaccio', structure: 'Muro glaciale', short: 'Ghiaccio',
      description: 'Tre cristalli creano un muro. Durante l’orda blocca e rallenta i mostri della stessa corsia.',
      color: '#72ddff', role: 'Controllo', damage: (lv) => `${(1.6 + lv * .7).toFixed(1)}/s`, cadence: 'Continua', target: 'Stessa corsia', effect: (lv) => `Rallenta ${Math.round(26 + lv * 7)}%`
    },
    copper: {
      material: 'Rame', structure: 'Torre degli arcieri', short: 'Rame',
      description: 'Tre pezzi di rame creano una torre. Gli arcieri coprono la propria corsia e quelle adiacenti.',
      color: '#df8a52', role: 'Copertura', damage: (lv) => `${Math.round(8 + lv * 6)}`, cadence: (lv) => `${Math.max(.30, .86 - lv * .08).toFixed(2)}s`, target: 'Corsia ±1', effect: () => 'Tiro singolo'
    },
    iron: {
      material: 'Ferro', structure: 'Cannone d’assedio', short: 'Ferro',
      description: 'Tre blocchi di ferro creano un cannone. Spara in orizzontale sulla propria riga e fa danno ad area.',
      color: '#c3cfdb', role: 'Danno area', damage: (lv) => `${Math.round(18 + lv * 11)}`, cadence: (lv) => `${Math.max(.62, 1.55 - lv * .11).toFixed(2)}s`, target: 'Stessa riga', effect: (lv) => `Area ${Math.round(44 + lv * 5)} px`
    },
    fire: {
      material: 'Brace', structure: 'Balestra ardente', short: 'Fuoco',
      description: 'Tre braci creano una balestra. Attacca rapidamente in verticale lungo la propria corsia.',
      color: '#ff6951', role: 'DPS', damage: (lv) => `${Math.round(13 + lv * 8)}`, cadence: (lv) => `${Math.max(.38, 1.05 - lv * .08).toFixed(2)}s`, target: 'Stessa corsia', effect: () => 'Tiro rapido'
    },
    wood: {
      material: 'Legno', structure: 'Cassa del fabbro', short: 'Legno',
      description: 'Tre pezzi di legno creano una cassa. Aprila per ottenere casualmente +2, +3 o +4 mosse.',
      color: '#bc7b3d', role: 'Supporto', damage: () => '—', cadence: '—', target: '—', effect: () => '+2 / +3 / +4 mosse'
    },
    gold: {
      material: 'Oro', structure: 'Idolo aureo', short: 'Oro',
      description: 'Tre pezzi d’oro creano un idolo. Potenzia le difese adiacenti senza attaccare direttamente.',
      color: '#f0c449', role: 'Potenziamento', damage: () => '—', cadence: '—', target: 'Adiacenti', effect: (lv) => `+${18 * lv}% potenza`
    }
  };

  const root = document.getElementById('game-root');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const infoDialog = document.getElementById('info-dialog');
  const infoBtn = document.getElementById('info-btn');
  const infoClose = document.getElementById('info-close');
  const selectionActions = document.getElementById('selection-actions');
  const selectedKicker = document.getElementById('selected-kicker');
  const selectedName = document.getElementById('selected-name');
  const openChestBtn = document.getElementById('open-chest-btn');
  const restartBtn = document.getElementById('restart-btn');
  const workshopBtn = document.getElementById('workshop-btn');
  const toastEl = document.getElementById('toast');
  const soundBtn = document.getElementById('sound-btn');
  const gameoverDialog = document.getElementById('gameover-dialog');
  const againBtn = document.getElementById('again-btn');

  let board = [];
  let day = 1;
  let moves = START_MOVES;
  let hp = START_HP;
  let score = 0;
  let phase = 'build';
  let selected = null;
  let pointer = null;
  let busy = false;
  let bossLane = 0;
  let wave = null;
  let layout = null;
  let dpr = 1;
  let raf = 0;
  let prev = 0;
  let toastTimer = 0;
  let audioCtx = null;

  const textures = {};
  const textureNames = ['water', 'grass', 'cliff'];
  textureNames.forEach((name) => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    img.onload = () => { textures[name] = img; };
  });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (n) => Math.floor(Math.random() * n);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
  const idx = (r, c) => r * SIZE + c;
  const empty = () => ({ kind: 'empty' });
  const material = () => ({ kind: 'material', type: TYPES[rand(TYPES.length)] });
  const adjacent = (a, b) => {
    const A = rc(a), B = rc(b);
    return Math.abs(A.r - B.r) + Math.abs(A.c - B.c) === 1;
  };
  const same = (a, b) => a && b && a.kind !== 'empty' && b.kind !== 'empty' && a.kind === b.kind && a.type === b.type && (a.kind === 'material' || a.level === b.level);

  
function fitCanvas() {
  const w = Math.max(320, innerWidth);
  const h = Math.max(480, innerHeight);
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  layout = computeLayout(w, h);
}

  
function computeLayout(w, h) {
  const desktop = w >= 920 && w / h > 1.08;
  const safeTop = desktop ? 70 : 54;
  const safeBottom = desktop ? 18 : 10;
  const stageH = h - safeTop - safeBottom;
  const hudH = desktop ? 88 : 78;
  const castleH = desktop ? 132 : 112;
  const chromeY = safeTop + hudH + castleH + (desktop ? 24 : 20);
  const availableH = h - chromeY - (desktop ? 84 : 74);
  const availableW = desktop ? Math.min(w * 0.94, h * 1.18) : w - 18;
  const boardSize = Math.floor(Math.min(availableW, availableH));
  const boardX = Math.round((w - boardSize) / 2);
  const boardY = Math.round(chromeY);
  const cell = boardSize / SIZE;
  const islandPad = Math.max(12, cell * 0.18);
  const islandX = boardX - islandPad;
  const islandY = safeTop + hudH + castleH * 0.26;
  const islandW = boardSize + islandPad * 2;
  const islandH = boardY + boardSize - islandY + cell * 0.95;
  const stageW = islandW;
  const stageX = islandX;
  const stageY = safeTop;
  return { w, h, desktop, stageX, stageY, stageW, stageH, hudH, castleH, boardX, boardY, boardSize, cell, islandX, islandY, islandW, islandH };
}

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1700);
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    audioCtx = new A();
    return audioCtx;
  }

  async function tone(freq = 440, dur = .08, gain = .025, type = 'square') {
    if (soundBtn.getAttribute('aria-pressed') !== 'true') return;
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === 'suspended') await ac.resume();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ac.destination);
    const now = ac.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(.001, now + dur);
    o.start(now); o.stop(now + dur);
  }

  soundBtn.addEventListener('click', async () => {
    const on = soundBtn.getAttribute('aria-pressed') === 'true';
    soundBtn.setAttribute('aria-pressed', String(!on));
    soundBtn.textContent = on ? '♪' : '♫';
    if (!on) await tone(640, .08, .03, 'sine');
  });

  function makeInitialBoard() {
    board = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const { r, c } = rc(i);
      let t, guard = 0;
      do {
        t = material();
        guard++;
      } while (guard < 30 && (
        (c >= 2 && board[idx(r, c - 1)]?.type === t.type && board[idx(r, c - 2)]?.type === t.type) ||
        (r >= 2 && board[idx(r - 1, c)]?.type === t.type && board[idx(r - 2, c)]?.type === t.type)
      ));
      board.push(t);
    }
  }

  function findMatches() {
    const runs = [];
    for (let r = 0; r < SIZE; r++) {
      let start = 0;
      for (let c = 1; c <= SIZE; c++) {
        const a = board[idx(r, c - 1)];
        const b = c < SIZE ? board[idx(r, c)] : null;
        if (c < SIZE && same(a, b)) continue;
        if (c - start >= 3 && board[idx(r, start)].kind !== 'empty') runs.push(Array.from({ length: c - start }, (_, k) => idx(r, start + k)));
        start = c;
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let start = 0;
      for (let r = 1; r <= SIZE; r++) {
        const a = board[idx(r - 1, c)];
        const b = r < SIZE ? board[idx(r, c)] : null;
        if (r < SIZE && same(a, b)) continue;
        if (r - start >= 3 && board[idx(start, c)].kind !== 'empty') runs.push(Array.from({ length: r - start }, (_, k) => idx(start + k, c)));
        start = r;
      }
    }
    const groups = [];
    runs.forEach((run) => {
      const hits = [];
      groups.forEach((g, gi) => { if (run.some((i) => g.includes(i))) hits.push(gi); });
      if (!hits.length) groups.push([...run]);
      else {
        const merged = new Set(run);
        hits.reverse().forEach((gi) => { groups[gi].forEach((i) => merged.add(i)); groups.splice(gi, 1); });
        groups.push([...merged]);
      }
    });
    return groups;
  }

  function collapse(refill) {
    const spawned = [];
    for (let c = 0; c < SIZE; c++) {
      const kept = [];
      for (let r = SIZE - 1; r >= 0; r--) {
        const t = board[idx(r, c)];
        if (t.kind !== 'empty') kept.push(t);
      }
      let r = SIZE - 1;
      kept.forEach((t) => { board[idx(r--, c)] = t; });
      while (r >= 0) {
        const i = idx(r--, c);
        board[i] = refill ? material() : empty();
        if (refill) spawned.push(i);
      }
    }
    return spawned;
  }

  function chooseTarget(group, preferred) {
    if (preferred != null && group.includes(preferred)) return preferred;
    const sorted = [...group].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  async function resolveMatches(preferred = null, refill = true) {
    let loops = 0;
    while (loops++ < 12) {
      const groups = findMatches();
      if (!groups.length) break;
      await tone(720 + loops * 55, .07, .025);
      await wait(150);
      groups.forEach((group) => {
        const src = board[group[0]];
        if (!src || src.kind === 'empty') return;
        const target = chooseTarget(group, preferred);
        const next = src.kind === 'material'
          ? { kind: 'structure', type: src.type, level: 1 }
          : { kind: 'structure', type: src.type, level: src.level + 1 };
        if (next.type === 'wood') next.bonus = 2 + rand(3);
        group.forEach((i) => board[i] = empty());
        board[target] = next;
        score += src.kind === 'material' ? 100 + Math.max(0, group.length - 3) * 40 : 220 * next.level;
        if (src.kind === 'structure') showToast(`${DATA[next.type].structure.toUpperCase()} · LIVELLO ${next.level}`);
        else if (next.type === 'wood') showToast('CASSA DEL FABBRO CREATA · SELEZIONALA PER APRIRLA');
      });
      collapse(refill);
      selected = null;
      updateSelectionUI();
      await wait(160);
      preferred = null;
      if (!refill) break;
    }
  }

  async function performSwap(a, b) {
    if (busy || !adjacent(a, b) || !['build', 'workshop'].includes(phase)) return;
    busy = true;
    selected = null;
    updateSelectionUI();
    [board[a], board[b]] = [board[b], board[a]];
    await tone(420, .04, .02);
    if (phase === 'build') moves = Math.max(0, moves - 1);
    await wait(80);
    await resolveMatches(b, phase === 'build');
    busy = false;
    if (phase === 'build' && moves <= 0) {
      await wait(320);
      startWave();
    }
  }

  async function openChest(index) {
    if (busy || !['build', 'workshop'].includes(phase)) return;
    const t = board[index];
    if (!t || t.kind !== 'structure' || t.type !== 'wood') return;
    busy = true;
    const bonus = t.bonus || 2 + rand(3);
    await tone(920, .12, .04, 'sine');
    await wait(180);
    moves += bonus;
    score += 50 * t.level;
    board[index] = empty();
    collapse(phase === 'build');
    selected = null;
    updateSelectionUI();
    showToast(`CASSA APERTA · +${bonus} MOSSE`);
    await resolveMatches(null, phase === 'build');
    busy = false;
  }

  function selectTile(index) {
    const t = board[index];
    if (!t || t.kind === 'empty') {
      selected = null;
      updateSelectionUI();
      return;
    }
    if (selected === index && t.kind === 'structure' && t.type === 'wood' && ['build', 'workshop'].includes(phase)) {
      openChest(index);
      return;
    }
    selected = index;
    updateSelectionUI();
    tone(300, .035, .015);
  }

  function updateSelectionUI() {
    const t = selected != null ? board[selected] : null;
    const show = !!t && t.kind !== 'empty';
    selectionActions.hidden = !show;
    if (!show) return;
    selectedKicker.textContent = t.kind === 'material' ? 'MATERIALE' : `DIFESA · LIVELLO ${t.level}`;
    selectedName.textContent = t.kind === 'material' ? DATA[t.type].material : DATA[t.type].structure;
    openChestBtn.hidden = !(t.kind === 'structure' && t.type === 'wood' && ['build', 'workshop'].includes(phase));
  }

  function openInfo() {
    if (selected == null) return;
    const t = board[selected];
    if (!t || t.kind === 'empty') return;
    const d = DATA[t.type];
    document.getElementById('info-kind').textContent = t.kind === 'material' ? 'MATERIALE' : `DIFESA · LIVELLO ${t.level}`;
    document.getElementById('info-title').textContent = t.kind === 'material' ? d.material : d.structure;
    document.getElementById('info-subtitle').textContent = t.kind === 'material' ? `Crea: ${d.structure}` : `${d.role} · livello ${t.level}`;
    document.getElementById('info-description').textContent = d.description;
    const level = t.kind === 'structure' ? t.level : 1;
    const tierName = level <= 1 ? 'Base' : level === 2 ? 'Ferro' : 'Dorato';
    const stats = t.kind === 'material'
      ? [
          ['RISULTATO', d.structure], ['RUOLO', d.role], ['FUSIONE', '3 uguali']
        ]
      : [
          ['DANNO', typeof d.damage === 'function' ? d.damage(level) : d.damage],
          ['CADENZA', typeof d.cadence === 'function' ? d.cadence(level) : d.cadence],
          ['BERSAGLIO', d.target],
          ['EFFETTO', d.effect(level)],
          ['ASPETTO', tierName],
          ['UPGRADE', '3 difese uguali']
        ];
    document.getElementById('info-stats').innerHTML = stats.map(([k, v]) => `<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`).join('');
    const wrap = document.getElementById('info-sprite');
    wrap.replaceChildren();
    const mini = document.createElement('canvas');
    mini.width = 220; mini.height = 220;
    const mc = mini.getContext('2d');
    mc.imageSmoothingEnabled = false;
    drawSprite(mc, { x: 110, y: 110 }, t, 150, performance.now(), true);
    wrap.append(mini);
    if (!infoDialog.open) infoDialog.showModal();
  }

  infoBtn.addEventListener('click', openInfo);
  infoClose.addEventListener('click', () => infoDialog.close());
  openChestBtn.addEventListener('click', () => selected != null && openChest(selected));

  function snapshotTowers() {
    const towers = [];
    board.forEach((t, i) => {
      if (t.kind !== 'structure') return;
      const { r, c } = rc(i);
      towers.push({ type: t.type, level: t.level, r, c, cooldown: Math.random() * .25, boost: 1, hp: t.type === 'ice' ? 70 + t.level * 48 : 0, maxHp: t.type === 'ice' ? 70 + t.level * 48 : 0 });
    });
    towers.forEach((tower) => {
      towers.forEach((idol) => {
        if (idol === tower || idol.type !== 'gold') return;
        if (Math.abs(idol.r - tower.r) + Math.abs(idol.c - tower.c) <= 1) tower.boost += .18 * idol.level;
      });
    });
    return towers;
  }

  function startWave() {
    phase = 'wave';
    selected = null;
    updateSelectionUI();
    const count = 5 + day * 2;
    wave = {
      towers: snapshotTowers(),
      enemies: [], shots: [], particles: [],
      spawnLeft: count + (day % 10 === 0 ? 1 : 0),
      spawnTimer: .35,
      bossPending: day % 10 === 0,
      nextId: 1,
      cleared: false
    };
  }

  function cellCenter(r, c) {
    return {
      x: layout.boardX + (c + .5) * layout.cell,
      y: layout.boardY + (r + .5) * layout.cell
    };
  }

  function spawnEnemy(forceBoss) {
    const lane = forceBoss ? bossLane : rand(SIZE);
    const base = 34 + day * 8;
    const roll = Math.random();
    const type = forceBoss ? 'boss' : roll < .18 && day >= 3 ? 'runner' : roll > .78 && day >= 4 ? 'brute' : 'shade';
    const stats = {
      shade: { hp: base, speed: .50 + day * .009, damage: 1 },
      runner: { hp: base * .72, speed: .76 + day * .011, damage: 1 },
      brute: { hp: base * 1.8, speed: .36 + day * .006, damage: 1 },
      boss: { hp: 310 + day * 34, speed: .25 + day * .003, damage: 2 }
    }[type];
    wave.enemies.push({
      id: wave.nextId++, type, lane,
      y: layout.boardY + layout.boardSize + layout.cell * .6,
      hp: stats.hp, maxHp: stats.hp, speed: stats.speed * layout.cell,
      damage: stats.damage, bob: Math.random() * Math.PI * 2,
      side: wave.nextId % 2 ? -.20 : .20
    });
  }

  function towerPos(t) { return cellCenter(t.r, t.c); }
  function enemyPos(e) {
    const x = layout.boardX + (e.lane + .5 + e.side) * layout.cell;
    return { x, y: e.y };
  }

  function addShot(tower, enemy, color, width = 2) {
    const a = towerPos(tower), b = enemyPos(enemy);
    wave.shots.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, color, width, life: .14, max: .14 });
  }

  function hit(enemy, damage, tower, color, splash = 0) {
    enemy.hp -= damage;
    addShot(tower, enemy, color, splash ? 4 : 2.5);
    if (splash > 0) {
      const p = enemyPos(enemy);
      wave.enemies.forEach((other) => {
        if (other === enemy) return;
        const q = enemyPos(other);
        if (Math.hypot(q.x - p.x, q.y - p.y) <= splash) other.hp -= damage * .38;
      });
    }
  }

  function updateWave(dt) {
    if (!wave || phase !== 'wave') return;
    wave.spawnTimer -= dt;
    if (wave.spawnLeft > 0 && wave.spawnTimer <= 0) {
      const boss = wave.bossPending;
      spawnEnemy(boss);
      wave.bossPending = false;
      wave.spawnLeft--;
      wave.spawnTimer = boss ? 1.35 : Math.max(.42, .92 - day * .012) + Math.random() * .18;
    }

    wave.enemies.forEach((e) => {
      e.bob += dt * 5;
      let speed = e.speed;
      const walls = wave.towers.filter((t) => t.type === 'ice' && t.c === e.lane && t.hp > 0);
      const wall = walls.find((t) => {
        const p = towerPos(t);
        return e.y > p.y - layout.cell * .15 && e.y < p.y + layout.cell * .55;
      });
      if (wall) {
        speed *= Math.max(.25, .72 - wall.level * .08);
        wall.hp -= dt * (5 + e.damage * 2.2);
        e.hp -= dt * (1.5 + wall.level * .7);
      }
      e.y -= speed * dt;
    });
    wave.towers = wave.towers.filter((t) => t.type !== 'ice' || t.hp > 0);

    wave.towers.forEach((t) => {
      if (['ice', 'wood', 'gold'].includes(t.type)) return;
      t.cooldown -= dt;
      if (t.cooldown > 0) return;
      const tp = towerPos(t);
      const living = wave.enemies.filter((e) => e.hp > 0 && e.y > layout.boardY - layout.cell * .3 && e.y < layout.boardY + layout.boardSize + layout.cell);
      let candidates = [];
      if (t.type === 'copper') candidates = living.filter((e) => Math.abs(e.lane - t.c) <= 1);
      if (t.type === 'iron') candidates = living.filter((e) => Math.abs(enemyPos(e).y - tp.y) <= layout.cell * .72);
      if (t.type === 'fire') candidates = living.filter((e) => e.lane === t.c);
      if (!candidates.length) return;
      candidates.sort((a, b) => a.y - b.y);
      const target = candidates[0];
      const boost = t.boost || 1;
      if (t.type === 'copper') {
        hit(target, (8 + t.level * 6) * boost, t, DATA.copper.color);
        t.cooldown = Math.max(.3, .86 - t.level * .08);
      } else if (t.type === 'iron') {
        hit(target, (18 + t.level * 11) * boost, t, DATA.iron.color, layout.cell * (.55 + t.level * .05));
        t.cooldown = Math.max(.62, 1.55 - t.level * .11);
      } else if (t.type === 'fire') {
        hit(target, (13 + t.level * 8) * boost, t, DATA.fire.color);
        t.cooldown = Math.max(.38, 1.05 - t.level * .08);
      }
    });

    for (let i = wave.enemies.length - 1; i >= 0; i--) {
      const e = wave.enemies[i];
      if (e.hp <= 0) {
        const p = enemyPos(e);
        score += e.type === 'boss' ? 1000 + day * 40 : 30 + day * 4;
        wave.particles.push({ x: p.x, y: p.y, life: .6, color: e.type === 'boss' ? '#ffd36a' : '#ff795b', r: e.type === 'boss' ? 22 : 13 });
        wave.enemies.splice(i, 1);
        tone(e.type === 'boss' ? 760 : 340, .05, .02);
      } else if (e.y < layout.boardY - layout.cell * .8) {
        hp = Math.max(0, hp - e.damage);
        wave.enemies.splice(i, 1);
        showToast(e.type === 'boss' ? 'IL BOSS HA COLPITO IL BASTIONE · -2 ♥' : 'IL BASTIONE È STATO COLPITO');
        tone(95, .2, .05, 'sawtooth');
        if (hp <= 0) return gameOver();
      }
    }

    wave.shots.forEach((s) => s.life -= dt);
    wave.shots = wave.shots.filter((s) => s.life > 0);
    wave.particles.forEach((p) => p.life -= dt);
    wave.particles = wave.particles.filter((p) => p.life > 0);
    if (wave.spawnLeft <= 0 && wave.enemies.length === 0 && !wave.cleared) completeWave();
  }

  function completeWave() {
    if (!wave || wave.cleared) return;
    wave.cleared = true;
    const clearedDay = day;
    day++;
    moves = START_MOVES;
    bossLane = rand(SIZE);
    wave = null;
    phase = clearedDay % 10 === 0 ? 'workshop' : 'build';
    workshopBtn.hidden = phase !== 'workshop';
    selected = null;
    updateSelectionUI();
    showToast(phase === 'workshop' ? 'BOSS SCONFITTO · OFFICINA SBLOCCATA' : 'ORDA RESPINTA · ALTRE 5 MOSSE');
  }

  function gameOver() {
    phase = 'gameover';
    wave = null;
    workshopBtn.hidden = true;
    selected = null;
    updateSelectionUI();
    document.getElementById('final-day').textContent = day;
    document.getElementById('final-score').textContent = score.toLocaleString('it-IT');
    if (!gameoverDialog.open) gameoverDialog.showModal();
  }

  function resetGame() {
    day = 1; moves = START_MOVES; hp = START_HP; score = 0;
    phase = 'build'; selected = null; pointer = null; busy = false; wave = null; bossLane = rand(SIZE);
    makeInitialBoard();
    workshopBtn.hidden = true;
    updateSelectionUI();
    if (gameoverDialog.open) gameoverDialog.close();
  }

  restartBtn.addEventListener('click', resetGame);
  againBtn.addEventListener('click', resetGame);
  workshopBtn.addEventListener('click', () => {
    if (phase !== 'workshop') return;
    phase = 'build';
    moves = START_MOVES;
    workshopBtn.hidden = true;
    showToast('OFFICINA TERMINATA · ALTRE 5 MOSSE');
  });

  function pixelRect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function shadowEllipse(c, x, y, rx, ry, alpha = .22) {
    c.save();
    c.fillStyle = `rgba(0,0,0,${alpha})`;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function shinyStroke(fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
  }


  function paletteForLevel(type, level) {
    const tier = level <= 1 ? 1 : level === 2 ? 2 : 3;
    if (tier === 1) {
      return {
        primary: { ice:'#a9f0ff', copper:'#a95f37', iron:'#a9b6c5', fire:'#a75a38', wood:'#a76231', gold:'#e6b73c' }[type],
        secondary: { ice:'#4bc0dc', copper:'#d98852', iron:'#5f6d7d', fire:'#e99a54', wood:'#d18a46', gold:'#fff09a' }[type],
        outline:'#273243'
      };
    }
    if (tier === 2) return { primary:'#8c9db5', secondary:'#d4ddea', outline:'#344155' };
    return { primary:'#d7a936', secondary:'#fff0a0', outline:'#725117' };
  }

  
function drawMaterial(c, p, type, s, t) {
  const x = p.x, y = p.y;
  const u = s / 100;
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  shadowEllipse(c, 0, 24 * u, 24 * u, 8 * u, .18);

  if (type === 'ice') {
    c.beginPath();
    c.moveTo(0, -34 * u); c.lineTo(20 * u, -12 * u); c.lineTo(14 * u, 30 * u); c.lineTo(-14 * u, 30 * u); c.lineTo(-20 * u, -12 * u); c.closePath();
    c.fillStyle = '#dff9ff'; c.strokeStyle = '#42b5d5'; c.lineWidth = 3 * u; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, -28*u); c.lineTo(11*u, -10*u); c.lineTo(9*u, 20*u); c.lineTo(-9*u, 20*u); c.lineTo(-11*u, -10*u); c.closePath();
    c.fillStyle = '#8ae5ff'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2*u;
    c.beginPath(); c.moveTo(0,-30*u); c.lineTo(0,30*u); c.moveTo(-9*u,-10*u); c.lineTo(10*u,4*u); c.moveTo(-8*u,8*u); c.lineTo(8*u,-7*u); c.stroke();
  } else if (type === 'copper') {
    c.beginPath();
    c.moveTo(-24*u, -18*u); c.lineTo(24*u, -18*u); c.lineTo(18*u, 22*u); c.lineTo(-18*u, 22*u); c.closePath();
    c.fillStyle = '#cf8651'; c.strokeStyle = '#8d5433'; c.lineWidth = 4*u; c.fill(); c.stroke();
    c.strokeStyle = '#f0c19a'; c.lineWidth = 3*u;
    [-6, 4, 14].forEach((yy)=>{c.beginPath(); c.moveTo(-12*u, yy*u); c.lineTo(12*u, yy*u); c.stroke();});
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(-14*u,-14*u,24*u,4*u);
  } else if (type === 'iron') {
    c.beginPath();
    c.moveTo(-30*u, -14*u); c.lineTo(26*u, -14*u); c.lineTo(18*u, 16*u); c.lineTo(-24*u, 16*u); c.closePath();
    c.fillStyle = '#cfd5dd'; c.strokeStyle = '#7b8798'; c.lineWidth = 4*u; c.fill(); c.stroke();
    c.fillStyle = '#eef2f5'; c.beginPath(); c.moveTo(-18*u,-9*u); c.lineTo(20*u,-9*u); c.lineTo(12*u,5*u); c.lineTo(-22*u,5*u); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2*u; c.beginPath(); c.moveTo(-16*u,-6*u); c.lineTo(11*u,10*u); c.stroke();
  } else if (type === 'fire') {
    c.fillStyle = '#ff5f45'; c.strokeStyle = '#ad3527'; c.lineWidth = 3*u;
    c.beginPath(); c.moveTo(0,-34*u); c.bezierCurveTo(16*u,-16*u,18*u,-5*u,14*u,8*u); c.bezierCurveTo(10*u,24*u,1*u,32*u,-8*u,30*u); c.bezierCurveTo(-20*u,26*u,-20*u,12*u,-13*u,2*u); c.bezierCurveTo(-8*u,-4*u,-5*u,-12*u,0,-34*u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd162'; c.beginPath(); c.moveTo(0,-16*u); c.bezierCurveTo(8*u,-6*u,8*u,5*u,4*u,14*u); c.bezierCurveTo(1*u,22*u,-6*u,24*u,-10*u,18*u); c.bezierCurveTo(-14*u,9*u,-8*u,0*u,0,-16*u); c.closePath(); c.fill();
  } else if (type === 'wood') {
    c.fillStyle = '#9a6238'; c.strokeStyle = '#6b4022'; c.lineWidth = 4*u;
    for (const [ox, oy, rot] of [[-8,-10,-.12],[7,0,.14],[-3,12,-.08]]) {
      c.save(); c.translate(ox*u, oy*u); c.rotate(rot);
      c.beginPath(); c.roundRect(-24*u,-7*u,48*u,14*u,5*u); c.fill(); c.stroke();
      c.strokeStyle = '#d69a5f'; c.lineWidth = 3*u; c.beginPath(); c.moveTo(-10*u,0); c.lineTo(12*u,0); c.stroke();
      c.restore();
      c.strokeStyle = '#6b4022'; c.lineWidth = 4*u;
    }
  } else {
    c.beginPath();
    c.moveTo(-28*u, -14*u); c.lineTo(18*u, -14*u); c.lineTo(28*u, 8*u); c.lineTo(-18*u, 8*u); c.closePath();
    c.fillStyle = '#f3c848'; c.strokeStyle = '#b28116'; c.lineWidth = 4*u; c.fill(); c.stroke();
    c.fillStyle = '#ffe48d'; c.beginPath(); c.moveTo(-18*u,-10*u); c.lineTo(14*u,-10*u); c.lineTo(19*u,1*u); c.lineTo(-12*u,1*u); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2*u; c.beginPath(); c.moveTo(-7*u,-8*u); c.lineTo(7*u,5*u); c.stroke();
  }
  c.restore();
}

  
function drawTower(c, p, tile, s, t, preview = false) {
  const { type, level } = tile;
  const x = p.x, y = p.y;
  const u = s / 100;
  const tier = level <= 1 ? 1 : level === 2 ? 2 : 3;
  const metal = tier === 1 ? '#556270' : tier === 2 ? '#8f9caf' : '#d7a936';
  const trim = tier === 1 ? '#d9e1ea' : tier === 2 ? '#dfe7ef' : '#fff1a2';
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (!preview) shadowEllipse(c, 0, 28*u, 26*u, 8*u, .22);

  if (type === 'iron') {
    c.fillStyle = '#7b563e'; c.strokeStyle = '#513526'; c.lineWidth = 3*u;
    c.beginPath(); c.roundRect(-26*u, 10*u, 52*u, 10*u, 4*u); c.fill(); c.stroke();
    c.fillStyle = '#4b5562'; c.beginPath(); c.arc(-12*u, 24*u, 11*u, 0, Math.PI*2); c.arc(12*u, 24*u, 11*u, 0, Math.PI*2); c.fill();
    c.fillStyle = metal; c.strokeStyle = '#394654'; c.lineWidth = 4*u;
    c.beginPath(); c.roundRect(-8*u, -2*u, 22*u, 12*u, 4*u); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(6*u,-3*u); c.lineTo(34*u,-10*u); c.lineTo(37*u,1*u); c.lineTo(9*u,8*u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = trim; c.beginPath(); c.roundRect(1*u,0*u,9*u,4*u,2*u); c.fill();
    c.fillStyle = '#7b563e'; c.beginPath(); c.roundRect(-6*u,7*u,18*u,5*u,2*u); c.fill();
  } else if (type === 'copper') {
    c.fillStyle = tier === 3 ? '#d8b04d' : '#58733c'; c.strokeStyle = '#3c5130'; c.lineWidth = 3*u;
    c.beginPath(); c.roundRect(-22*u, 2*u, 44*u, 28*u, 5*u); c.fill(); c.stroke();
    c.fillStyle = metal; c.beginPath(); c.roundRect(-28*u,-16*u,56*u,20*u,4*u); c.fill(); c.strokeStyle='#394654'; c.stroke();
    for (const ox of [-18,-6,6,18]) { c.fillStyle = metal; c.fillRect(ox*u, -26*u, 6*u, 10*u); c.strokeRect(ox*u,-26*u,6*u,10*u); }
    c.fillStyle = '#f3c2b5'; c.beginPath(); c.arc(0,-2*u,7*u,0,Math.PI*2); c.fill();
    c.fillStyle = '#9b4151'; c.beginPath(); c.arc(0,-11*u,8*u,Math.PI,0); c.fill();
    c.strokeStyle = trim; c.lineWidth = 3*u; c.beginPath(); c.moveTo(0,2*u); c.lineTo(18*u,-4*u); c.moveTo(0,2*u); c.lineTo(18*u,8*u); c.stroke();
    c.beginPath(); c.arc(0,2*u,9*u,0,Math.PI*2); c.stroke();
  } else if (type === 'fire') {
    c.strokeStyle = '#6d4228'; c.lineWidth = 5*u;
    c.beginPath(); c.moveTo(0,22*u); c.lineTo(0,-4*u); c.stroke();
    c.strokeStyle = tier === 3 ? '#d7a936' : tier === 2 ? '#8f9caf' : '#b07442';
    c.lineWidth = 6*u; c.beginPath(); c.moveTo(-26*u, -2*u); c.quadraticCurveTo(0,-28*u,26*u,-2*u); c.stroke();
    c.strokeStyle = trim; c.lineWidth = 2*u; c.beginPath(); c.moveTo(-22*u,0); c.quadraticCurveTo(0,10*u,22*u,0); c.stroke();
    c.strokeStyle = tier === 3 ? '#8d6914' : '#513526'; c.lineWidth = 4*u; c.beginPath(); c.moveTo(-10*u,-9*u); c.lineTo(10*u,5*u); c.moveTo(10*u,-9*u); c.lineTo(-10*u,5*u); c.stroke();
    c.fillStyle = '#ff6b4d'; c.beginPath(); c.moveTo(0,-28*u); c.lineTo(-8*u,-11*u); c.lineTo(8*u,-11*u); c.closePath(); c.fill();
    c.fillStyle = '#ffd269'; c.beginPath(); c.moveTo(0,-22*u); c.lineTo(-4*u,-14*u); c.lineTo(4*u,-14*u); c.closePath(); c.fill();
  } else if (type === 'ice') {
    c.fillStyle = tier === 3 ? '#edd88c' : tier === 2 ? '#cbd8ea' : '#a4ecff'; c.strokeStyle = tier === 3 ? '#b28521' : tier === 2 ? '#6e8097' : '#39a8ca'; c.lineWidth = 4*u;
    c.beginPath(); c.roundRect(-30*u, 10*u, 60*u, 14*u, 4*u); c.fill(); c.stroke();
    for (const [ox, hh] of [[-22,22],[-8,30],[8,26],[22,18]]) {
      c.beginPath(); c.moveTo(ox*u, 10*u); c.lineTo((ox+6)*u, (10-hh)*u/1); c.lineTo((ox+12)*u, 10*u); c.closePath(); c.fill(); c.stroke();
    }
  } else if (type === 'wood') {
    const lid = tier === 3 ? '#d7a936' : tier === 2 ? '#94a3b8' : '#d2a45f';
    const chest = tier === 3 ? '#64b6de' : tier === 2 ? '#8899b8' : '#67b6d3';
    c.fillStyle = chest; c.strokeStyle = '#41506a'; c.lineWidth = 4*u;
    c.beginPath(); c.roundRect(-24*u, 0, 48*u, 24*u, 8*u); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-24*u,0); c.quadraticCurveTo(0,-20*u,24*u,0); c.lineTo(24*u,8*u); c.quadraticCurveTo(0,-10*u,-24*u,8*u); c.closePath(); c.fillStyle=chest; c.fill(); c.stroke();
    c.strokeStyle = '#7b5a1e'; c.lineWidth = 5*u; c.beginPath(); c.moveTo(-22*u,6*u); c.lineTo(22*u,6*u); c.moveTo(-10*u,-6*u); c.lineTo(-10*u,24*u); c.moveTo(10*u,-6*u); c.lineTo(10*u,24*u); c.stroke();
    c.fillStyle = lid; c.strokeStyle = '#8b671a'; c.lineWidth = 4*u;
    c.beginPath(); c.roundRect(-26*u,-2*u,52*u,10*u,5*u); c.fill(); c.stroke();
    c.beginPath(); c.roundRect(-6*u,6*u,12*u,10*u,3*u); c.fill(); c.stroke();
    c.fillStyle = '#fff0b2'; c.fillRect(-2*u,9*u,4*u,3*u);
  } else {
    c.fillStyle = tier === 3 ? '#f2cc58' : tier === 2 ? '#9aa9c1' : '#f1c34d'; c.strokeStyle = tier === 3 ? '#9f7518' : '#58667c'; c.lineWidth = 4*u;
    c.beginPath(); c.moveTo(0,-28*u); c.lineTo(12*u,-7*u); c.lineTo(28*u,-2*u); c.lineTo(15*u,10*u); c.lineTo(18*u,28*u); c.lineTo(0,19*u); c.lineTo(-18*u,28*u); c.lineTo(-15*u,10*u); c.lineTo(-28*u,-2*u); c.lineTo(-12*u,-7*u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff0b0'; c.beginPath(); c.arc(0,0,12*u,0,Math.PI*2); c.fill();
    c.strokeStyle = '#c78b22'; c.lineWidth = 3*u; c.beginPath(); c.moveTo(0,-8*u); c.lineTo(0,8*u); c.moveTo(-8*u,0); c.lineTo(8*u,0); c.stroke();
  }
  c.restore();
}

  function drawSprite(c, p, tile, s, t, preview = false) {
    if (tile.kind === 'material') drawMaterial(c, p, tile.type, s, t);
    else if (tile.kind === 'structure') drawTower(c, p, tile, s, t, preview);
  }

  function roundedRect(c,x,y,w,h,r,fill,stroke=null,lw=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}

  function pattern(name, fallback) {
    const img = textures[name];
    if (!img || !img.complete) return fallback;
    return ctx.createPattern(img, 'repeat');
  }

  
function drawWater(now) {
  ctx.fillStyle = pattern('water', '#2e7398');
  ctx.fillRect(0, 0, layout.w, layout.h);
  ctx.globalAlpha = .10;
  for (let i = 0; i < 40; i++) {
    const y = ((i * 47 + now * .025) % (layout.h + 70)) - 35;
    const x = (i * 113 + Math.sin(i * 2.4) * 12) % layout.w;
    ctx.fillStyle = '#b8effa';
    ctx.beginPath(); ctx.roundRect(x, y, 32, 5, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + 18, y + 7, 18, 3, 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(layout.w * .5, layout.h * .18, 40, layout.w * .5, layout.h * .4, layout.w * .7);
  g.addColorStop(0, 'rgba(255,255,255,.08)');
  g.addColorStop(1, 'rgba(5,12,22,.20)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, layout.w, layout.h);
}

  
function drawIsland() {
  const L = layout;
  const cliff = pattern('cliff', '#70492d');
  roundedRect(ctx, L.islandX - 10, L.islandY + 12, L.islandW + 20, L.islandH + 20, 28, 'rgba(0,0,0,.22)');
  roundedRect(ctx, L.islandX - 4, L.islandY + 8, L.islandW + 8, L.islandH + 16, 24, cliff, '#5b3a26', 5);
  roundedRect(ctx, L.islandX, L.islandY, L.islandW, L.islandH, 22, pattern('grass', '#4f8e3f'), '#2b5b2f', 5);

  ctx.globalAlpha = .18;
  for (let i = 0; i < 60; i++) {
    const x = L.islandX + 18 + (i * 53) % Math.max(40, L.islandW - 36);
    const y = L.islandY + 18 + (i * 37) % Math.max(40, L.islandH - 40);
    ctx.fillStyle = i % 4 ? '#d6f2a2' : '#2f6b35';
    ctx.fillRect(x, y, 2, 5);
  }
  ctx.globalAlpha = 1;

  for (let x = L.islandX + 12, k = 0; x < L.islandX + L.islandW - 12; x += Math.max(14, L.cell * .24), k++) {
    const hh = 6 + (k % 3) * 2;
    pixelRect(ctx, x, L.islandY + L.islandH - 1, Math.max(8, L.cell * .16), hh, k % 2 ? '#6b472e' : '#875b3b');
  }

  // top gate path
  const px = L.boardX + L.boardSize * .5;
  const py = L.boardY - L.cell * .28;
  ctx.fillStyle = '#7c5b3b';
  roundedRect(ctx, px - L.cell * .9, py, L.cell * 1.8, L.cell * .34, 8, '#7d5a3f');
  ctx.fillStyle = '#b38757';
  for (let i = -5; i <= 5; i++) ctx.fillRect(px + i * (L.cell * .15), py + 4, 3, L.cell * .34 - 8);
}

  
function drawCastle() {
  const L = layout;
  const cx = L.boardX + L.boardSize / 2;
  const baseY = L.stageY + L.hudH + 8;
  const u = Math.max(1.9, Math.min(3.6, L.boardSize / 220));
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  shadowEllipse(ctx, 0, 96*u, 92*u, 12*u, .18);
  const stone = '#7f90ab', dark = '#52627b', light = '#b1bed0';
  ctx.fillStyle = stone; ctx.strokeStyle = dark; ctx.lineWidth = 4*u;
  ctx.beginPath(); ctx.roundRect(-92*u, 38*u, 184*u, 42*u, 8*u); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-44*u, 8*u, 88*u, 54*u, 8*u); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-110*u, 14*u, 40*u, 66*u, 8*u); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(70*u, 14*u, 40*u, 66*u, 8*u); ctx.fill(); ctx.stroke();
  ctx.fillStyle = light;
  ctx.fillRect(-92*u, 38*u, 184*u, 7*u); ctx.fillRect(-44*u, 8*u, 88*u, 7*u); ctx.fillRect(-110*u, 14*u, 40*u, 6*u); ctx.fillRect(70*u, 14*u, 40*u, 6*u);
  ctx.fillStyle = dark;
  for (const ox of [-106,-94,-82,-42,-30,-18,-6,6,18,30,76,88,100]) ctx.fillRect(ox*u, 1*u, 8*u, 12*u);
  [ -78,-60,-18,7,58,82 ].forEach((ox)=> ctx.fillRect(ox*u, 30*u, 10*u, 20*u));
  [ -14, 7 ].forEach((ox)=> ctx.fillRect(ox*u, 17*u, 12*u, 20*u));
  ctx.fillStyle = '#2a3446'; ctx.beginPath(); ctx.roundRect(-18*u, 46*u, 36*u, 34*u, 10*u); ctx.fill();
  ctx.fillStyle = '#ca673f'; ctx.beginPath(); ctx.roundRect(-24*u, 55*u, 48*u, 9*u, 4*u); ctx.fill();
  ctx.fillStyle = '#f3b553'; ctx.fillRect(-7*u, 57*u, 14*u, 4*u);
  [['#d06142',-103],['#d06142',102]].forEach(([col,ox])=>{ctx.strokeStyle='#39485f';ctx.lineWidth=3*u;ctx.beginPath();ctx.moveTo(ox*u,12*u);ctx.lineTo(ox*u,-18*u);ctx.stroke();ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(ox*u,-18*u);ctx.lineTo((ox+26)*u,-14*u);ctx.lineTo(ox*u,-4*u);ctx.closePath();ctx.fill();});
  ctx.restore();
}

  
function drawHUD() {
  const L = layout;
  const w = Math.min(L.boardSize + 60, L.w - 24);
  const h = L.desktop ? 68 : 60;
  const x = (L.w - w) / 2;
  const y = L.stageY + 6;
  roundedRect(ctx, x, y, w, h, 20, 'rgba(7,17,29,.90)', 'rgba(255,255,255,.12)', 1);
  const labels = ['GIORNO', 'MOSSE', 'BASTIONE', 'PUNTI'];
  const values = [String(day), phase === 'workshop' ? '∞' : String(moves), '♥'.repeat(hp) + '♡'.repeat(START_HP - hp), score.toLocaleString('it-IT')];
  for (let i = 0; i < 4; i++) {
    const cw = w / 4;
    const cx = x + cw * i + cw / 2;
    if (i > 0) { ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(x + cw * i, y + 10); ctx.lineTo(x + cw * i, y + h - 10); ctx.stroke(); }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ea2bf'; ctx.font = '900 10px system-ui'; ctx.fillText(labels[i], cx, y + 17);
    ctx.fillStyle = i === 1 ? '#ff835c' : i === 2 ? '#ff9f90' : '#fff0cf';
    ctx.font = `900 ${i===2 ? (L.desktop?18:16) : (L.desktop?25:22)}px system-ui`;
    ctx.fillText(values[i], cx, y + (L.desktop ? 46 : 42));
  }
}

  
function drawCellTerrainEffect(tile, p, s, seed) {
  if (!tile || tile.kind === 'empty') return;
  ctx.save();
  ctx.globalAlpha = tile.kind === 'material' ? .22 : .15;
  ctx.fillStyle = tile.type === 'ice' ? '#b9f2ff' : tile.type === 'copper' ? '#da9b6b' : tile.type === 'iron' ? '#c8d5e6' : tile.type === 'fire' ? '#ff8d63' : tile.type === 'wood' ? '#bf8851' : '#f4cd63';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + s * .27, s * .24, s * .09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

  
function drawBoard(now) {
  const L = layout;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = idx(r, c); const t = board[i]; const p = cellCenter(r, c); const s = L.cell;
      const pad = s * .03; const x = L.boardX + c * s + pad; const y = L.boardY + r * s + pad; const sz = s - pad * 2;
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.022)' : 'rgba(18,64,20,.08)';
      ctx.beginPath(); ctx.roundRect(x, y, sz, sz, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(36,83,38,.16)'; ctx.lineWidth = 1; ctx.stroke();
      if (t.kind !== 'empty') {
        drawCellTerrainEffect(t, p, s, i);
        drawSprite(ctx, p, t, s * .84, now);
      }
      if (t.kind === 'structure') {
        const badge = t.level <= 1 ? '#eac468' : t.level === 2 ? '#d1dbe8' : '#ffde77';
        roundedRect(ctx, x + sz - 24, y + 6, 18, 18, 7, 'rgba(7,17,29,.88)');
        ctx.fillStyle = badge; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(t.level), x + sz - 15, y + 19);
        if (t.type === 'wood') { roundedRect(ctx, p.x - s * .22, p.y + s * .22, s * .44, 16, 7, 'rgba(7,17,29,.84)'); ctx.fillStyle = '#ffe2a0'; ctx.font = '900 8px system-ui'; ctx.fillText('APRI', p.x, p.y + s * .22 + 11); }
      }
      if (selected === i) {
        ctx.strokeStyle = '#ffe178'; ctx.lineWidth = Math.max(2, s * .04); ctx.beginPath(); ctx.roundRect(x + 2, y + 2, sz - 4, sz - 4, 10); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,225,120,.28)'; ctx.lineWidth = 6; ctx.stroke();
      }
    }
  }
}

  
function drawEnemy(e, now) {
  const p = enemyPos(e); const s = layout.cell * .46; const u = s / 100;
  ctx.save(); ctx.translate(p.x, p.y + Math.sin(e.bob) * 2); ctx.lineJoin = 'round';
  shadowEllipse(ctx, 0, 26*u, 18*u, 5*u, .22);
  if (e.type === 'shade') {
    ctx.fillStyle='#7c6edc'; ctx.strokeStyle='#453b88'; ctx.lineWidth=3*u;
    ctx.beginPath(); ctx.roundRect(-20*u,-16*u,40*u,32*u,12*u); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#b7b0ff'; ctx.beginPath(); ctx.moveTo(-13*u,-16*u); ctx.lineTo(-5*u,-28*u); ctx.lineTo(0,-17*u); ctx.fill(); ctx.beginPath(); ctx.moveTo(13*u,-16*u); ctx.lineTo(5*u,-28*u); ctx.lineTo(0,-17*u); ctx.fill();
    ctx.fillStyle='#1c1e35'; ctx.fillRect(-8*u,-3*u,4*u,4*u); ctx.fillRect(4*u,-3*u,4*u,4*u);
  } else if (e.type === 'runner') {
    ctx.fillStyle='#d85e7c'; ctx.strokeStyle='#8d3147'; ctx.lineWidth=3*u; ctx.beginPath(); ctx.ellipse(0,0,22*u,16*u,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#f09ab0'; ctx.beginPath(); ctx.ellipse(0,-10*u,13*u,8*u,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#24171f'; ctx.fillRect(-7*u,-2*u,4*u,4*u); ctx.fillRect(3*u,-2*u,4*u,4*u);
  } else if (e.type === 'brute') {
    ctx.fillStyle='#66a175'; ctx.strokeStyle='#365a40'; ctx.lineWidth=3*u; ctx.beginPath(); ctx.roundRect(-24*u,-20*u,48*u,40*u,12*u); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#93cea1'; ctx.beginPath(); ctx.arc(-16*u,-18*u,6*u,0,Math.PI*2); ctx.arc(16*u,-18*u,6*u,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#223527'; ctx.fillRect(-10*u,-4*u,5*u,5*u); ctx.fillRect(5*u,-4*u,5*u,5*u);
  } else {
    ctx.fillStyle='#bf4f40'; ctx.strokeStyle='#79312b'; ctx.lineWidth=3*u; ctx.beginPath(); ctx.roundRect(-27*u,-23*u,54*u,46*u,15*u); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#f2bc5d'; ctx.beginPath(); ctx.moveTo(-18*u,-17*u); ctx.lineTo(-8*u,-34*u); ctx.lineTo(0,-18*u); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(18*u,-17*u); ctx.lineTo(8*u,-34*u); ctx.lineTo(0,-18*u); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#2b1918'; ctx.fillRect(-11*u,-6*u,6*u,6*u); ctx.fillRect(5*u,-6*u,6*u,6*u); ctx.fillRect(-4*u,8*u,8*u,3*u);
  }
  const ratio = clamp(e.hp / e.maxHp, 0, 1);
  roundedRect(ctx, -20*u, -28*u, 40*u, 5*u, 3, 'rgba(7,17,29,.75)');
  roundedRect(ctx, -20*u, -28*u, 40*u * ratio, 5*u, 3, e.type === 'boss' ? '#ffd15e' : '#8ef18d');
  ctx.restore();
}

  function drawWave(now) {
    if(!wave)return;
    wave.shots.forEach((s)=>{ctx.globalAlpha=clamp(s.life/s.max,0,1);ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.beginPath();ctx.moveTo(s.ax,s.ay);ctx.lineTo(s.bx,s.by);ctx.stroke();ctx.globalAlpha=1;});
    wave.enemies.forEach((e)=>drawEnemy(e,now));
    wave.particles.forEach((p)=>{ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1.2-p.life),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
  }

  
function drawSidePanels(now) {
  return;
}

  
function drawPhaseRibbon() {
  const L = layout;
  const text = phase === 'wave' ? `ORDA ${day}` : phase === 'workshop' ? 'OFFICINA · SCAMBI ILLIMITATI' : `GIORNO ${day} · ${moves} MOSSE`;
  const fill = phase === 'wave' ? 'rgba(142,54,39,.92)' : phase === 'workshop' ? 'rgba(154,126,43,.92)' : 'rgba(17,68,33,.88)';
  const w = Math.min(L.boardSize * .62, 320);
  const x = L.boardX + (L.boardSize - w) / 2;
  const y = L.boardY - 30;
  roundedRect(ctx, x, y, w, 24, 9, fill, 'rgba(255,255,255,.10)', 1);
  ctx.fillStyle = '#fff3d1'; ctx.textAlign = 'center'; ctx.font = '900 10px system-ui'; ctx.fillText(text, x + w / 2, y + 16);
}

  function draw(now) {
    if(!layout)fitCanvas();
    ctx.clearRect(0,0,layout.w,layout.h);
    drawWater(now);
    drawSidePanels(now);
    drawIsland();
    drawHUD();
    drawCastle();
    drawPhaseRibbon();
    drawBoard(now);
    drawWave(now);
  }

  function pointToCell(clientX, clientY) {
    const x=clientX, y=clientY;
    if(x<layout.boardX||x>layout.boardX+layout.boardSize||y<layout.boardY||y>layout.boardY+layout.boardSize)return null;
    const c=Math.floor((x-layout.boardX)/layout.cell);const r=Math.floor((y-layout.boardY)/layout.cell);
    if(r<0||r>=SIZE||c<0||c>=SIZE)return null;return idx(r,c);
  }

  function dragTarget(index, dx, dy) {
    const {r,c}=rc(index);let nr=r,nc=c;
    if(Math.abs(dx)>Math.abs(dy))nc+=dx>0?1:-1;else nr+=dy>0?1:-1;
    if(nr<0||nr>=SIZE||nc<0||nc>=SIZE)return null;return idx(nr,nc);
  }

  canvas.addEventListener('pointerdown',(ev)=>{
    if(busy||phase==='gameover')return;
    const i=pointToCell(ev.clientX,ev.clientY);if(i==null)return;
    pointer={index:i,x:ev.clientX,y:ev.clientY,id:ev.pointerId};
    try{canvas.setPointerCapture(ev.pointerId);}catch{}
  });
  canvas.addEventListener('pointerup',(ev)=>{
    if(!pointer)return;const p=pointer;pointer=null;
    const dx=ev.clientX-p.x,dy=ev.clientY-p.y;
    if(Math.hypot(dx,dy)>18){const target=dragTarget(p.index,dx,dy);if(target!=null)performSwap(p.index,target);}
    else selectTile(p.index);
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;});

  function frame(now){const dt=Math.min((now-(prev||now))/1000,.05);prev=now;if(phase==='wave')updateWave(dt);draw(now);raf=requestAnimationFrame(frame);}

  window.addEventListener('resize',fitCanvas,{passive:true});
  document.addEventListener('visibilitychange',()=>{prev=0;});
  window.addEventListener('keydown',(e)=>{if(e.key==='Escape'){if(infoDialog.open)infoDialog.close();if(gameoverDialog.open)gameoverDialog.close();}});

  fitCanvas();
  resetGame();
  raf=requestAnimationFrame(frame);
})();
