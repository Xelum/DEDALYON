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
    ctx.imageSmoothingEnabled = false;
    layout = computeLayout(w, h);
  }

  function computeLayout(w, h) {
    const desktop = w >= 900 && w / h > 1.05;
    const top = desktop ? 64 : 54;
    const bottom = desktop ? 18 : 8;
    const stageH = h - top - bottom;
    const stageW = desktop ? Math.min(w * .57, stageH * .74) : Math.min(w - 12, stageH * .72);
    const stageX = (w - stageW) / 2;
    const stageY = top;
    const hudH = desktop ? 88 : 76;
    const castleH = desktop ? 118 : 104;
    const boardMaxByW = stageW * (desktop ? .84 : .92);
    const boardMaxByH = stageH - hudH - castleH - (desktop ? 150 : 122);
    const boardSize = Math.min(boardMaxByW, boardMaxByH);
    const boardX = stageX + (stageW - boardSize) / 2;
    const boardY = stageY + hudH + castleH + (desktop ? 36 : 26);
    const cell = boardSize / SIZE;
    const islandPad = cell * .34;
    const islandX = boardX - islandPad;
    const islandY = stageY + hudH + castleH * .42;
    const islandW = boardSize + islandPad * 2;
    const islandH = boardY + boardSize - islandY + cell * 1.15;
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
    c.save(); c.translate(x, y); c.lineJoin = 'miter'; c.lineCap = 'butt';
    const u = s / 16;
    if (type === 'ice') {
      pixelRect(c,-2*u,-7*u,4*u,14*u,'#e5fbff'); pixelRect(c,-4*u,-3*u,2*u,7*u,'#6ed6ef'); pixelRect(c,2*u,-3*u,2*u,8*u,'#3da7cb');
      pixelRect(c,-1*u,-8*u,2*u,2*u,'#ffffff'); pixelRect(c,-5*u,4*u,10*u,2*u,'#48bad8');
    } else if (type === 'copper') {
      pixelRect(c,-6*u,-5*u,12*u,3*u,'#8a4a2d'); pixelRect(c,-7*u,-2*u,14*u,8*u,'#d88752'); pixelRect(c,-5*u,0,10*u,2*u,'#f3bd8d'); pixelRect(c,-4*u,4*u,8*u,2*u,'#9e5a38');
    } else if (type === 'iron') {
      pixelRect(c,-6*u,-4*u,3*u,8*u,'#76869a'); pixelRect(c,-3*u,-6*u,8*u,12*u,'#c5d0dc'); pixelRect(c,5*u,-3*u,2*u,6*u,'#67778b'); pixelRect(c,-1*u,-3*u,3*u,2*u,'#eef4fa');
    } else if (type === 'fire') {
      pixelRect(c,-3*u,0,6*u,7*u,'#d43e2f'); pixelRect(c,-5*u,-1*u,10*u,4*u,'#ef5a3d'); pixelRect(c,-3*u,-6*u,6*u,7*u,'#ff7b49'); pixelRect(c,-1*u,-8*u,3*u,6*u,'#ffd65f'); pixelRect(c,-1*u,1*u,3*u,4*u,'#ffd65f');
    } else if (type === 'wood') {
      pixelRect(c,-7*u,-5*u,14*u,4*u,'#8c4d28'); pixelRect(c,-6*u,-4*u,12*u,3*u,'#c77c3d'); pixelRect(c,-5*u,0,11*u,4*u,'#a75e31'); pixelRect(c,-4*u,1*u,9*u,2*u,'#d9944c'); pixelRect(c,-4*u,-5*u,2*u,4*u,'#f0b878'); pixelRect(c,2*u,0,2*u,4*u,'#e3a160');
    } else {
      pixelRect(c,-6*u,2*u,5*u,4*u,'#bf8d1d'); pixelRect(c,-2*u,-2*u,7*u,8*u,'#e6b73b'); pixelRect(c,2*u,-5*u,5*u,11*u,'#ffd868'); pixelRect(c,3*u,-4*u,2*u,5*u,'#fff1ad'); pixelRect(c,-1*u,0,2*u,2*u,'#fff4b6');
    }
    c.restore();
  }

  function drawTower(c, p, tile, s, t, preview = false) {
    const { type, level } = tile;
    const pal = paletteForLevel(type, level);
    const x=p.x,y=p.y,u=s/18;
    c.save(); c.translate(x,y); c.lineJoin='miter'; c.lineCap='butt';
    const shadow = preview ? null : 'rgba(0,0,0,.24)';
    if (shadow) { c.fillStyle=shadow; c.beginPath(); c.ellipse(0,8*u,7*u,2.5*u,0,0,Math.PI*2); c.fill(); }
    if (type === 'ice') {
      pixelRect(c,-8*u,-1*u,16*u,7*u,pal.primary); pixelRect(c,-8*u,-1*u,16*u,2*u,pal.secondary); pixelRect(c,-6*u,-7*u,4*u,8*u,pal.primary); pixelRect(c,-1*u,-9*u,4*u,10*u,pal.secondary); pixelRect(c,4*u,-6*u,3*u,7*u,pal.primary); pixelRect(c,-8*u,5*u,16*u,2*u,pal.outline);
    } else if (type === 'copper') {
      pixelRect(c,-6*u,-1*u,12*u,8*u,pal.primary); pixelRect(c,-7*u,-4*u,14*u,4*u,pal.secondary); pixelRect(c,-6*u,-7*u,3*u,3*u,pal.primary); pixelRect(c,-1*u,-7*u,3*u,3*u,pal.primary); pixelRect(c,4*u,-7*u,3*u,3*u,pal.primary); pixelRect(c,-2*u,1*u,4*u,4*u,'#1d2b39'); pixelRect(c,2*u,1*u,5*u,1*u,pal.secondary); pixelRect(c,6*u,0,1*u,5*u,pal.secondary);
    } else if (type === 'iron') {
      pixelRect(c,-7*u,3*u,12*u,3*u,'#72503a'); pixelRect(c,-5*u,-2*u,8*u,5*u,pal.primary); pixelRect(c,2*u,-3*u,8*u,3*u,pal.secondary); pixelRect(c,8*u,-4*u,2*u,5*u,pal.outline); pixelRect(c,-6*u,6*u,3*u,3*u,'#303a48'); pixelRect(c,2*u,6*u,3*u,3*u,'#303a48'); pixelRect(c,-5*u,7*u,2*u,1*u,'#b6c2cf'); pixelRect(c,2*u,7*u,2*u,1*u,'#b6c2cf');
    } else if (type === 'fire') {
      pixelRect(c,-1*u,-4*u,2*u,11*u,pal.outline); pixelRect(c,-7*u,-4*u,5*u,2*u,pal.secondary); pixelRect(c,2*u,-4*u,5*u,2*u,pal.secondary); pixelRect(c,-6*u,-2*u,4*u,1*u,'#f1d6af'); pixelRect(c,2*u,-2*u,4*u,1*u,'#f1d6af'); pixelRect(c,-1*u,-9*u,2*u,5*u,'#ff7048'); pixelRect(c,0,-11*u,2*u,4*u,'#ffd768'); pixelRect(c,-5*u,6*u,10*u,2*u,pal.outline);
    } else if (type === 'wood') {
      pixelRect(c,-7*u,-2*u,14*u,8*u,pal.primary); pixelRect(c,-8*u,-5*u,16*u,4*u,pal.secondary); pixelRect(c,-7*u,-1*u,14*u,2*u,'#f0b86d'); pixelRect(c,-1*u,0,3*u,4*u,'#ffd16d'); pixelRect(c,0,1*u,1*u,2*u,'#6b451f');
    } else {
      pixelRect(c,-1*u,-8*u,2*u,15*u,pal.outline); pixelRect(c,-7*u,-3*u,14*u,3*u,pal.primary); pixelRect(c,-4*u,-6*u,8*u,12*u,pal.secondary); pixelRect(c,-2*u,-4*u,4*u,8*u,'#fff4bd'); pixelRect(c,-6*u,6*u,12*u,2*u,pal.outline);
    }
    if (level >= 2) { pixelRect(c,-8*u,-8*u,2*u,2*u,level===2?'#dbe5ef':'#fff1a5'); pixelRect(c,6*u,-8*u,2*u,2*u,level===2?'#dbe5ef':'#fff1a5'); }
    if (level >= 3) { pixelRect(c,-1*u,-13*u,2*u,3*u,'#ffda5b'); pixelRect(c,-3*u,-12*u,6*u,1*u,'#a97516'); }
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
    ctx.fillStyle = pattern('water', '#185d7d');
    ctx.fillRect(0,0,layout.w,layout.h);
    ctx.globalAlpha=.14;
    for(let i=0;i<28;i++){
      const y=((i*53+now*.018)% (layout.h+80))-40;
      const x=(i*97)%layout.w;
      ctx.fillStyle='#8cddf0';
      ctx.fillRect(x,y,24,2);
      ctx.fillRect(x+22,y-2,8,2);
    }
    ctx.globalAlpha=1;
    const g=ctx.createRadialGradient(layout.w*.5,layout.h*.35,40,layout.w*.5,layout.h*.45,layout.w*.7);
    g.addColorStop(0,'rgba(255,255,255,.04)');g.addColorStop(1,'rgba(3,10,22,.55)');ctx.fillStyle=g;ctx.fillRect(0,0,layout.w,layout.h);
  }

  function drawIsland() {
    const L = layout;
    const cliff = pattern('cliff', '#70492d');
    // rocky foundation and soft shadow
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    roundedRect(ctx, L.islandX - 13, L.islandY + 20, L.islandW + 26, L.islandH + 18, 20, 'rgba(0,0,0,.24)');
    roundedRect(ctx, L.islandX - 8, L.islandY + 13, L.islandW + 16, L.islandH + 18, 18, cliff, '#3f2d22', 4);
    roundedRect(ctx, L.islandX, L.islandY, L.islandW, L.islandH, 17, pattern('grass', '#427739'), '#214a29', 4);

    // pixel cliff teeth around the edge
    ctx.globalAlpha = .9;
    const step = Math.max(15, L.cell * .28);
    for (let x = L.islandX + 10, k = 0; x < L.islandX + L.islandW - 10; x += step, k++) {
      const hh = 5 + (k % 3) * 2;
      pixelRect(ctx, x, L.islandY + L.islandH - 2, step * .7, hh, k % 2 ? '#5b3b27' : '#765037');
    }
    ctx.globalAlpha = 1;

    // grass details: intentionally subtle and non-repeating looking
    ctx.globalAlpha = .25;
    for (let i = 0; i < 44; i++) {
      const x = L.islandX + 16 + (i * 71) % Math.max(30, L.islandW - 32);
      const y = L.islandY + 20 + (i * 43) % Math.max(30, L.islandH - 46);
      pixelRect(ctx, x, y, 2, 5, i % 3 ? '#b0d47c' : '#2d672f');
      if (i % 5 === 0) pixelRect(ctx, x + 3, y + 2, 1, 3, '#d7e99b');
    }
    ctx.globalAlpha = 1;

    // incoming rift / bridge at the bottom, where monsters enter
    const bx = L.stageX + L.stageW / 2;
    const by = L.boardY + L.boardSize + L.cell * .55;
    const bw = Math.min(L.cell * 1.45, 98);
    pixelRect(ctx, bx - bw / 2, by - 6, bw, 12, '#70452e');
    pixelRect(ctx, bx - bw / 2 + 5, by - 3, bw - 10, 5, '#a76a3a');
    for (let xx = bx - bw/2 + 10; xx < bx + bw/2 - 6; xx += 14) pixelRect(ctx, xx, by - 6, 2, 12, '#d89a55');
    ctx.fillStyle = 'rgba(105,60,175,.36)';
    ctx.beginPath(); ctx.ellipse(bx, by + 14, bw * .34, 8, 0, 0, Math.PI * 2); ctx.fill();
    pixelRect(ctx, bx - 7, by + 9, 14, 2, '#b390ff');

    // decorative rocks just outside the island to break the rectangular silhouette
    const rocks = [
      [-18,.16,8,5], [L.islandW+11,.22,7,4], [-16,.48,6,4], [L.islandW+12,.58,9,5],
      [-12,.80,7,4], [L.islandW+10,.86,6,4]
    ];
    rocks.forEach(([ox, py, rw, rh], i) => {
      const rx = L.islandX + ox;
      const ry = L.islandY + L.islandH * py;
      pixelRect(ctx, rx, ry, rw, rh, i % 2 ? '#6a533f' : '#7d6550');
      pixelRect(ctx, rx + 1, ry, Math.max(2, rw - 3), 1, '#aa9178');
    });
  }

  function drawCastle() {
    const L = layout;
    const cx = L.stageX + L.stageW / 2;
    const baseY = L.stageY + L.hudH + L.castleH * .18;
    const u = Math.max(1.7, Math.min(3.15, L.stageW / 188));
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.lineJoin = 'miter';
    const stone = '#647895', dark = '#334259', light = '#8798b3', roof = '#485a75';

    // rear keep
    pixelRect(ctx, -22*u, 2*u, 44*u, 31*u, stone);
    pixelRect(ctx, -18*u, -4*u, 36*u, 7*u, light);
    [-17,-7,3,13].forEach((xx) => pixelRect(ctx, xx*u, -8*u, 7*u, 6*u, roof));
    // towers
    pixelRect(ctx, -47*u, 10*u, 23*u, 31*u, stone);
    pixelRect(ctx, 24*u, 10*u, 23*u, 31*u, stone);
    [-45,-36,-27,26,35,44].forEach((xx) => pixelRect(ctx, xx*u, 4*u, 6*u, 8*u, roof));
    // front wall
    pixelRect(ctx, -39*u, 26*u, 78*u, 18*u, stone);
    pixelRect(ctx, -39*u, 26*u, 78*u, 4*u, light);
    // windows
    [-35,-28,-12,8,27,34].forEach((xx) => pixelRect(ctx, xx*u, 18*u, 4*u, 7*u, '#1a2639'));
    [-14,10].forEach((xx) => pixelRect(ctx, xx*u, 9*u, 5*u, 8*u, '#1a2639'));
    // gate
    pixelRect(ctx, -7*u, 30*u, 14*u, 14*u, '#1a2639');
    pixelRect(ctx, -5*u, 32*u, 10*u, 12*u, '#27344a');
    pixelRect(ctx, -6*u, 29*u, 12*u, 3*u, '#a64b31');
    pixelRect(ctx, -3*u, 29*u, 6*u, 2*u, '#f2b34c');
    // flags
    pixelRect(ctx, -31*u, -7*u, 2*u, 11*u, '#2c3b52');
    pixelRect(ctx, -29*u, -7*u, 9*u, 5*u, '#c94f37');
    pixelRect(ctx, 30*u, -7*u, 2*u, 11*u, '#2c3b52');
    pixelRect(ctx, 32*u, -7*u, 9*u, 5*u, '#c94f37');
    // ground shadow
    pixelRect(ctx, -50*u, 44*u, 100*u, 3*u, '#25432a');
    ctx.restore();
  }

  function drawHUD() {
    const L=layout;
    const top=L.stageY+6;
    const h=L.hudH-12;
    const x=L.stageX+10, w=L.stageW-20;
    roundedRect(ctx,x,top,w,h,14,'rgba(6,17,30,.88)','rgba(255,255,255,.11)',1);
    const cells=L.desktop?4:4;
    const labels=['GIORNO','MOSSE','BASTIONE','PUNTI'];
    const values=[String(day),phase==='workshop'?'∞':String(moves),'♥'.repeat(hp)+'♡'.repeat(START_HP-hp),score.toLocaleString('it-IT')];
    for(let i=0;i<cells;i++){
      const cw=w/cells; const cx=x+cw*i+cw/2;
      if(i>0){ctx.strokeStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.moveTo(x+cw*i,top+10);ctx.lineTo(x+cw*i,top+h-10);ctx.stroke();}
      ctx.textAlign='center';ctx.fillStyle='#8091aa';ctx.font='900 8px system-ui';ctx.fillText(labels[i],cx,top+19);
      ctx.fillStyle=i===1?'#ff8060':i===2?'#ff9c88':'#fff0cf';ctx.font=`900 ${i===2?16:22}px system-ui`;ctx.fillText(values[i],cx,top+46);
    }
  }

  function drawCellTerrainEffect(tile, p, s, seed) {
    if (!tile || tile.kind === 'empty') return;
    const type = tile.type;
    ctx.save();
    ctx.globalAlpha = tile.kind === 'material' ? .42 : .28;
    const u = s / 18;
    if (type === 'ice') {
      ctx.fillStyle = '#9eeaff';
      pixelRect(ctx, p.x - 6*u, p.y + 5*u, 12*u, 1*u, '#9eeaff');
      pixelRect(ctx, p.x - 4*u, p.y + 3*u, 2*u, 1*u, '#dffbff');
      pixelRect(ctx, p.x + 3*u, p.y + 4*u, 3*u, 1*u, '#dffbff');
    } else if (type === 'copper') {
      pixelRect(ctx, p.x - 7*u, p.y + 5*u, 4*u, 1*u, '#be6d3c');
      pixelRect(ctx, p.x + 2*u, p.y + 4*u, 5*u, 1*u, '#e19a65');
    } else if (type === 'iron') {
      pixelRect(ctx, p.x - 7*u, p.y + 5*u, 3*u, 2*u, '#8796a8');
      pixelRect(ctx, p.x + 4*u, p.y + 4*u, 3*u, 2*u, '#9ba9b8');
    } else if (type === 'fire') {
      ctx.fillStyle = '#2e3f29';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 5*u, 7*u, 2.3*u, 0, 0, Math.PI*2); ctx.fill();
      pixelRect(ctx, p.x - 2*u, p.y + 4*u, 2*u, 1*u, '#bd5036');
    } else if (type === 'wood') {
      ctx.fillStyle = '#7d5b36';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 5*u, 7*u, 2*u, 0, 0, Math.PI*2); ctx.fill();
      pixelRect(ctx, p.x + 4*u, p.y + 2*u, 2*u, 1*u, '#b78b53');
    } else if (type === 'gold') {
      pixelRect(ctx, p.x - 7*u, p.y + 4*u, 2*u, 2*u, '#e8c34e');
      pixelRect(ctx, p.x + 5*u, p.y + 2*u, 1*u, 3*u, '#ffe99a');
      pixelRect(ctx, p.x + 1*u, p.y + 6*u, 3*u, 1*u, '#c69d27');
    }
    ctx.restore();
  }

  function drawBoard(now) {
    const L=layout;
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const i=idx(r,c); const t=board[i]; const p=cellCenter(r,c); const s=L.cell;
        const margin=s*.08; const x=L.boardX+c*s+margin; const y=L.boardY+r*s+margin; const sz=s-margin*2;
        ctx.fillStyle=(r+c)%2?'rgba(21,77,31,.10)':'rgba(255,255,255,.025)';ctx.fillRect(x,y,sz,sz);
        ctx.strokeStyle='rgba(17,54,26,.17)';ctx.lineWidth=1;ctx.strokeRect(x,y,sz,sz);
        if(t.kind!=='empty') { drawCellTerrainEffect(t,p,s,i); drawSprite(ctx,p,t,s*.73,now); }
        if(t.kind==='structure'){
          const tier=t.level<=1?'#f5d26c':t.level===2?'#cbd7e5':'#ffdf78';
          pixelRect(ctx,x+sz-16,y+5,12,12,'rgba(6,17,29,.82)');ctx.fillStyle=tier;ctx.font='900 9px system-ui';ctx.textAlign='center';ctx.fillText(String(t.level),x+sz-10,y+14);
          if(t.type==='wood'){ctx.fillStyle='rgba(6,17,29,.78)';roundedRect(ctx,p.x-s*.20,p.y+s*.23,s*.40,16,6,'rgba(6,17,29,.82)');ctx.fillStyle='#ffe29a';ctx.font='900 8px system-ui';ctx.fillText('APRI',p.x,p.y+s*.23+11);}
        }
        if(selected===i){ctx.strokeStyle='#ffe178';ctx.lineWidth=Math.max(2,s*.035);ctx.strokeRect(x+2,y+2,sz-4,sz-4);ctx.strokeStyle='rgba(255,225,120,.35)';ctx.lineWidth=5;ctx.strokeRect(x+7,y+7,sz-14,sz-14);}
      }
    }
  }

  function drawEnemy(e, now) {
    const p=enemyPos(e); const s=layout.cell*.42; const u=s/16;
    ctx.save();ctx.translate(p.x,p.y+Math.sin(e.bob)*2);ctx.lineJoin='miter';
    const shadowY=7*u;ctx.fillStyle='rgba(0,0,0,.26)';ctx.beginPath();ctx.ellipse(0,shadowY,6*u,2*u,0,0,Math.PI*2);ctx.fill();
    if(e.type==='shade'){
      pixelRect(ctx,-5*u,-4*u,10*u,9*u,'#795fc8');pixelRect(ctx,-6*u,-2*u,2*u,5*u,'#a18de3');pixelRect(ctx,4*u,-2*u,2*u,5*u,'#a18de3');pixelRect(ctx,-3*u,-6*u,2*u,3*u,'#bba8ff');pixelRect(ctx,1*u,-6*u,2*u,3*u,'#bba8ff');pixelRect(ctx,-2*u,-1*u,1*u,1*u,'#171827');pixelRect(ctx,1*u,-1*u,1*u,1*u,'#171827');
    } else if(e.type==='runner'){
      pixelRect(ctx,-6*u,-2*u,12*u,6*u,'#d95073');pixelRect(ctx,-4*u,-5*u,8*u,4*u,'#ee7390');pixelRect(ctx,-7*u,1*u,3*u,2*u,'#7f2b42');pixelRect(ctx,4*u,1*u,3*u,2*u,'#7f2b42');pixelRect(ctx,-2*u,-2*u,1*u,1*u,'#23151c');pixelRect(ctx,1*u,-2*u,1*u,1*u,'#23151c');
    } else if(e.type==='brute'){
      pixelRect(ctx,-6*u,-5*u,12*u,11*u,'#5e9d6d');pixelRect(ctx,-8*u,-2*u,2*u,6*u,'#39724d');pixelRect(ctx,6*u,-2*u,2*u,6*u,'#39724d');pixelRect(ctx,-5*u,-7*u,3*u,3*u,'#8bc797');pixelRect(ctx,2*u,-7*u,3*u,3*u,'#8bc797');pixelRect(ctx,-3*u,-1*u,2*u,2*u,'#203126');pixelRect(ctx,2*u,-1*u,2*u,2*u,'#203126');
    } else {
      pixelRect(ctx,-8*u,-6*u,16*u,13*u,'#b74336');pixelRect(ctx,-6*u,-9*u,4*u,4*u,'#edb751');pixelRect(ctx,2*u,-9*u,4*u,4*u,'#edb751');pixelRect(ctx,-4*u,-1*u,2*u,2*u,'#24161a');pixelRect(ctx,2*u,-1*u,2*u,2*u,'#24161a');pixelRect(ctx,-2*u,3*u,4*u,1*u,'#f0c15e');
    }
    const ratio=clamp(e.hp/e.maxHp,0,1);pixelRect(ctx,-6*u,-10*u,12*u,1.6*u,'rgba(8,13,20,.8)');pixelRect(ctx,-6*u,-10*u,12*u*ratio,1.6*u,e.type==='boss'?'#ffd15e':'#86ef8e');
    ctx.restore();
  }

  function drawWave(now) {
    if(!wave)return;
    wave.shots.forEach((s)=>{ctx.globalAlpha=clamp(s.life/s.max,0,1);ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.beginPath();ctx.moveTo(s.ax,s.ay);ctx.lineTo(s.bx,s.by);ctx.stroke();ctx.globalAlpha=1;});
    wave.enemies.forEach((e)=>drawEnemy(e,now));
    wave.particles.forEach((p)=>{ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1.2-p.life),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
  }

  function drawSidePanels(now) {
    if(!layout.desktop)return;
    const margin=24; const leftW=layout.stageX-margin*1.4; const rightX=layout.stageX+layout.stageW+18; const rightW=layout.w-rightX-margin;
    if(leftW>180){
      roundedRect(ctx,margin,86,leftW,layout.h-120,18,'rgba(5,14,26,.70)','rgba(255,255,255,.08)',1);
      ctx.textAlign='left';ctx.fillStyle='#ffd66c';ctx.font='900 9px system-ui';ctx.fillText('FORGEFALL / FIELD MANUAL',margin+18,116);
      ctx.fillStyle='#fff0cf';ctx.font='900 28px system-ui';ctx.fillText(phase==='wave'?'ORDA ATTIVA':phase==='workshop'?'OFFICINA':'COSTRUISCI',margin+18,151);
      ctx.fillStyle='#95a6bb';ctx.font='600 12px system-ui';const lines=phase==='wave'?['I mostri avanzano verso','il bastione. Le difese','combattono automaticamente.']:['Scambia liberamente due','caselle vicine. Ogni swap','costa una mossa.'];lines.forEach((ln,i)=>ctx.fillText(ln,margin+18,181+i*18));
      ctx.fillStyle='#718399';ctx.font='800 9px system-ui';ctx.fillText('FUSIONE',margin+18,260);ctx.fillStyle='#dce6f4';ctx.font='700 11px system-ui';ctx.fillText('3 materiali → 1 difesa',margin+18,281);ctx.fillText('3 difese uguali → upgrade',margin+18,300);
      ctx.fillStyle='#718399';ctx.font='800 9px system-ui';ctx.fillText('LIVELLI VISIVI',margin+18,340);ctx.fillStyle='#dce6f4';ctx.fillText('Lv 1 · base',margin+18,361);ctx.fillText('Lv 2 · ferro',margin+18,379);ctx.fillStyle='#ffe18a';ctx.fillText('Lv 3+ · dorato',margin+18,397);
      if(day%10===0){ctx.fillStyle='#ff9876';ctx.font='900 12px system-ui';ctx.fillText(`⚠ BOSS · CORSIA ${bossLane+1}`,margin+18,447);}
    }
    if(rightW>180){
      roundedRect(ctx,rightX,86,rightW,layout.h-120,18,'rgba(5,14,26,.70)','rgba(255,255,255,.08)',1);
      ctx.fillStyle='#ffd66c';ctx.font='900 9px system-ui';ctx.fillText('ELEMENTO SELEZIONATO',rightX+18,116);
      const t=selected!=null?board[selected]:null;
      if(t&&t.kind!=='empty'){
        const d=DATA[t.type];ctx.fillStyle='#fff0cf';ctx.font='900 22px system-ui';ctx.fillText(t.kind==='material'?d.material:d.structure,rightX+18,151);
        ctx.fillStyle='#91a5bb';ctx.font='600 11px system-ui';ctx.fillText(t.kind==='material'?`Crea: ${d.structure}`:`Livello ${t.level} · ${d.role}`,rightX+18,177);
        const pp={x:rightX+rightW/2,y:255};drawSprite(ctx,pp,t,Math.min(110,rightW*.55),now,true);
        ctx.fillStyle='#718399';ctx.font='800 9px system-ui';ctx.fillText('AZIONE',rightX+18,335);ctx.fillStyle='#dce6f4';ctx.font='700 11px system-ui';ctx.fillText('Premi INFO per dettagli,',rightX+18,356);ctx.fillText('danni ed effetti.',rightX+18,374);
      }else{
        ctx.fillStyle='#7d90a8';ctx.font='600 12px system-ui';ctx.fillText('Seleziona un materiale o',rightX+18,151);ctx.fillText('una difesa sulla griglia.',rightX+18,170);
      }
    }
  }

  function drawPhaseRibbon() {
    const L=layout; const y=L.boardY-28; const x=L.boardX; const w=L.boardSize;
    const text=phase==='wave'?`ORDA ${day}`:phase==='workshop'?'OFFICINA · SCAMBI ILLIMITATI':`GIORNO ${day} · ${moves} MOSSE`;
    const fill=phase==='wave'?'rgba(142,54,39,.88)':phase==='workshop'?'rgba(154,126,43,.88)':'rgba(14,52,28,.80)';
    roundedRect(ctx,x+w*.18,y,w*.64,22,8,fill,'rgba(255,255,255,.08)',1);ctx.fillStyle='#fff3d1';ctx.textAlign='center';ctx.font='900 9px system-ui';ctx.fillText(text,x+w*.5,y+15);
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
