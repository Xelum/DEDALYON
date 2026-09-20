(() => {
  'use strict';

  const SIZE = 6;
  const START_MOVES = 5;
  const START_HP = 5;
  const TYPES = ['ice', 'copper', 'iron', 'fire', 'wood', 'gold'];
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const battlefield = $('battlefield');
  const canvas = $('battle-layer');
  const ctx = canvas.getContext('2d');
  const toastEl = $('toast');
  const bossWarning = $('boss-warning');
  const endWorkshopBtn = $('end-workshop');
  const soundBtn = $('sound-btn');

  const DATA = {
    ice: {
      material: 'Cristallo di ghiaccio', structure: 'Muro glaciale', color: '#84e9ff',
      help: 'Tre cristalli creano un Muro glaciale. Durante l’orda rallenta i nemici quando attraversano la sua colonna.'
    },
    copper: {
      material: 'Rame', structure: 'Torre degli arcieri', color: '#f49a56',
      help: 'Tre pezzi di rame creano una Torre degli arcieri. Colpisce la propria corsia e le due corsie adiacenti.'
    },
    iron: {
      material: 'Ferro', structure: 'Cannone', color: '#c8d0da',
      help: 'Tre blocchi di ferro creano un Cannone. Spara in orizzontale quando un nemico attraversa la sua riga e infligge danno ad area.'
    },
    fire: {
      material: 'Brace', structure: 'Balestra ardente', color: '#ff665e',
      help: 'Tre braci creano una Balestra ardente. Attacca verticalmente tutti i nemici nella propria colonna.'
    },
    wood: {
      material: 'Legno', structure: 'Cassa del fabbro', color: '#d79a5d',
      help: 'Tre tronchi creano una Cassa del fabbro. Quando nasce contiene casualmente 2, 3 o 4 mosse extra. Le casse possono essere fuse e potenziate.'
    },
    gold: {
      material: 'Oro', structure: 'Idolo aureo', color: '#ffd85b',
      help: 'Tre pepite creano un Idolo aureo. Non spara, ma aumenta il danno delle difese adiacenti. Più alto è il livello, maggiore è il bonus.'
    }
  };

  let board = [];
  let day = 1;
  let moves = START_MOVES;
  let baseHP = START_HP;
  let score = 0;
  let phase = 'build';
  let selected = null;
  let busy = false;
  let bossColumn = null;
  let wave = null;
  let raf = 0;
  let lastFrame = 0;
  let pointerStart = null;
  let audioContext = null;
  let audioEnabled = false;
  let toastTimer = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (n) => Math.floor(Math.random() * n);
  const indexOf = (r, c) => r * SIZE + c;
  const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
  const emptyTile = () => ({ kind: 'empty' });
  const randomMaterial = () => ({ kind: 'material', type: TYPES[rand(TYPES.length)] });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const adjacent = (a, b) => {
    const A = rc(a), B = rc(b);
    return Math.abs(A.r - B.r) + Math.abs(A.c - B.c) === 1;
  };

  function same(a, b) {
    if (!a || !b || a.kind === 'empty' || b.kind === 'empty') return false;
    if (a.kind !== b.kind || a.type !== b.type) return false;
    return a.kind !== 'structure' || a.level === b.level;
  }

  function tone(freq = 520, duration = .07, gain = .035, type = 'triangle') {
    if (!audioEnabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    const osc = audioContext.createOscillator();
    const vol = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, audioContext.currentTime);
    vol.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(vol); vol.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + duration);
  }

  function showToast(text, ms = 1150) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function materialSVG(type) {
    const common = 'viewBox="0 0 100 100" aria-hidden="true" class="tile-svg"';
    if (type === 'ice') return `<svg ${common}><defs><linearGradient id="i" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d9fbff"/><stop offset="1" stop-color="#55cde8"/></linearGradient></defs><path d="M50 8 78 30 69 75 50 91 27 72 21 32Z" fill="url(#i)" stroke="#2f8da9" stroke-width="5"/><path d="m50 8-4 55 23 12M21 32l25 31-19 9M78 30 46 63" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4"/></svg>`;
    if (type === 'copper') return `<svg ${common}><path d="M21 23h58v54H21z" rx="12" fill="#b85d31" stroke="#65301f" stroke-width="6"/><path d="M27 31h46v10H27zM27 48h46v10H27zM27 65h46v7H27z" fill="#ee965b"/><circle cx="37" cy="36" r="4" fill="#ffd0a9"/><circle cx="63" cy="54" r="4" fill="#ffd0a9"/></svg>`;
    if (type === 'iron') return `<svg ${common}><path d="m27 18 48 4 10 43-35 20-36-19Z" fill="#929dac" stroke="#4b5665" stroke-width="6"/><path d="m31 29 36-1 7 30-25 15-23-13Z" fill="#c8d0da"/><path d="M41 30 33 56m30-25 8 25" stroke="#eef3f8" stroke-width="4" stroke-linecap="round" opacity=".65"/></svg>`;
    if (type === 'fire') return `<svg ${common}><path d="M51 8c7 19 24 24 20 47-2 15-12 29-28 29-17 0-29-11-29-27 0-17 11-26 22-38-1 13 6 17 10 20 8-9 8-20 5-31Z" fill="#ef554d" stroke="#8b2d2d" stroke-width="5"/><path d="M49 43c3 9 10 12 8 22-1 8-6 13-14 13-8 0-14-5-14-13 0-7 5-12 10-18 0 7 4 9 6 11 4-5 5-10 4-15Z" fill="#ffd35b"/></svg>`;
    if (type === 'wood') return `<svg ${common}><path d="M19 30 74 17l8 23-56 13Z" fill="#d29354" stroke="#744728" stroke-width="6" stroke-linejoin="round"/><path d="M26 53 78 44l4 23-54 11Z" fill="#b9743e" stroke="#744728" stroke-width="6" stroke-linejoin="round"/><path d="M39 27 34 50m26-28-5 24m-9 4-2 24m22-28-2 25" stroke="#f0bf7c" stroke-width="4" opacity=".7"/></svg>`;
    return `<svg ${common}><path d="M50 10 75 25 83 52 67 79 38 87 15 65 18 35Z" fill="#f5bd42" stroke="#9c6b18" stroke-width="6"/><path d="M50 10 48 50 83 52M18 35l30 15-10 37" fill="none" stroke="#ffe9a3" stroke-width="4" opacity=".62"/><circle cx="51" cy="50" r="10" fill="#fff2b4" opacity=".55"/></svg>`;
  }

  function structureSVG(type, level = 1) {
    const common = 'viewBox="0 0 100 100" aria-hidden="true" class="tile-svg"';
    const accent = DATA[type].color;
    if (type === 'ice') return `<svg ${common}><path d="M13 72 20 37l18-12 13 11 15-15 16 13 6 38Z" fill="#bceff6" stroke="#428da2" stroke-width="5"/><path d="M19 42h65M35 30v43M62 28v45" stroke="#ecffff" stroke-opacity=".72" stroke-width="4"/><path d="M9 76h82v10H9z" fill="#4d7582" stroke="#2e4e5b" stroke-width="4"/></svg>`;
    if (type === 'copper') return `<svg ${common}><path d="M30 76h40l-5-38H35Z" fill="#87503d" stroke="#4c2d28" stroke-width="5"/><path d="M22 39h56l-7-17H29Z" fill="#c56e43" stroke="#6c3c2e" stroke-width="5"/><path d="M50 30v-16m0 0-12 9m12-9 12 9" stroke="#f8bf7e" stroke-width="5" stroke-linecap="round"/><path d="M19 83h62" stroke="#472b25" stroke-width="7" stroke-linecap="round"/><path d="m50 43 20 10-20 10-20-10Z" fill="${accent}" stroke="#5a3327" stroke-width="4"/></svg>`;
    if (type === 'iron') return `<svg ${common}><path d="M24 59h48v23H24z" fill="#727d8c" stroke="#3f4753" stroke-width="5"/><circle cx="34" cy="83" r="8" fill="#414955"/><circle cx="63" cy="83" r="8" fill="#414955"/><path d="M36 48h35c11 0 16 8 13 16H43Z" fill="#aeb7c3" stroke="#4f5965" stroke-width="5"/><path d="M48 48V35h29v13" fill="#8994a2" stroke="#4f5965" stroke-width="5"/><path d="M76 38h16v9H76" fill="#c9d1da" stroke="#4f5965" stroke-width="4"/></svg>`;
    if (type === 'fire') return `<svg ${common}><path d="M22 74 50 25l28 49" fill="none" stroke="#744333" stroke-width="9" stroke-linecap="round"/><path d="M20 48c18 13 42 13 60 0" fill="none" stroke="#c86b42" stroke-width="7"/><path d="M50 18v57" stroke="#f2d3a2" stroke-width="4"/><path d="m50 18-8 14h16Z" fill="#ff665e"/><path d="M32 80h36" stroke="#522f28" stroke-width="8" stroke-linecap="round"/></svg>`;
    if (type === 'wood') return `<svg ${common}><path d="M18 36h64v48H18z" rx="8" fill="#a66b3f" stroke="#5d3a29" stroke-width="6"/><path d="M15 36h70v17H15z" fill="#d69556" stroke="#5d3a29" stroke-width="6"/><path d="M44 48h14v18H44z" fill="#f0c16c" stroke="#745028" stroke-width="4"/><path d="M26 66h49M30 38v46m42-46v46" stroke="#e4ad6c" stroke-width="4" opacity=".55"/></svg>`;
    return `<svg ${common}><path d="M50 10 62 31l24 6-17 18 4 25-23-10-23 10 4-25-17-18 24-6Z" fill="#f5c34d" stroke="#8d651c" stroke-width="5"/><circle cx="50" cy="48" r="14" fill="#fff0a0" stroke="#b78524" stroke-width="4"/><path d="M50 33v30M35 48h30" stroke="#d18b2b" stroke-width="4"/><path d="M31 82h38" stroke="#7a5620" stroke-width="7" stroke-linecap="round"/></svg>`;
  }

  function tileIcon(tile) {
    if (tile.kind === 'empty') return '';
    return tile.kind === 'material' ? materialSVG(tile.type) : structureSVG(tile.type, tile.level);
  }

  function renderBoard(spawned = [], merging = []) {
    boardEl.replaceChildren();
    board.forEach((tile, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tile ${tile.kind}${tile.type ? ` ${tile.type}` : ''}${selected === i ? ' selected' : ''}${spawned.includes(i) ? ' spawn' : ''}${merging.includes(i) ? ' merge' : ''}`;
      button.dataset.index = i;
      button.disabled = busy || phase === 'wave' || phase === 'gameover';
      if (tile.kind === 'empty') {
        button.classList.add('empty');
        button.setAttribute('aria-label', `Casella vuota ${i + 1}`);
      } else {
        button.innerHTML = tileIcon(tile);
        const label = document.createElement('span');
        label.className = 'tile-label';
        label.textContent = tile.kind === 'material' ? DATA[tile.type].material.split(' ')[0].toUpperCase() : DATA[tile.type].structure.split(' ')[0].toUpperCase();
        button.append(label);
        if (tile.kind === 'structure') {
          const badge = document.createElement('span');
          badge.className = 'level-badge';
          badge.textContent = tile.level;
          button.append(badge);
        }
        button.setAttribute('aria-label', `${tile.kind === 'material' ? DATA[tile.type].material : DATA[tile.type].structure + ' livello ' + tile.level}`);
      }
      boardEl.append(button);
    });
  }

  function makeInitialBoard() {
    board = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const { r, c } = rc(i);
      let tile;
      let guard = 0;
      do {
        tile = randomMaterial();
        guard++;
      } while (guard < 30 && (
        (c >= 2 && board[indexOf(r, c - 1)]?.type === tile.type && board[indexOf(r, c - 2)]?.type === tile.type) ||
        (r >= 2 && board[indexOf(r - 1, c)]?.type === tile.type && board[indexOf(r - 2, c)]?.type === tile.type)
      ));
      board.push(tile);
    }
  }

  function findMatches() {
    const runs = [];
    for (let r = 0; r < SIZE; r++) {
      let start = 0;
      for (let c = 1; c <= SIZE; c++) {
        const prev = board[indexOf(r, c - 1)];
        const current = c < SIZE ? board[indexOf(r, c)] : null;
        if (c < SIZE && same(prev, current)) continue;
        if (c - start >= 3 && board[indexOf(r, start)]?.kind !== 'empty') {
          runs.push(Array.from({ length: c - start }, (_, k) => indexOf(r, start + k)));
        }
        start = c;
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let start = 0;
      for (let r = 1; r <= SIZE; r++) {
        const prev = board[indexOf(r - 1, c)];
        const current = r < SIZE ? board[indexOf(r, c)] : null;
        if (r < SIZE && same(prev, current)) continue;
        if (r - start >= 3 && board[indexOf(start, c)]?.kind !== 'empty') {
          runs.push(Array.from({ length: r - start }, (_, k) => indexOf(start + k, c)));
        }
        start = r;
      }
    }

    const groups = [];
    runs.forEach((run) => {
      const overlapping = [];
      groups.forEach((g, gi) => { if (run.some((i) => g.includes(i))) overlapping.push(gi); });
      if (!overlapping.length) groups.push([...run]);
      else {
        const merged = new Set(run);
        overlapping.reverse().forEach((gi) => {
          groups[gi].forEach((i) => merged.add(i));
          groups.splice(gi, 1);
        });
        groups.push([...merged]);
      }
    });
    return groups;
  }

  function chooseTarget(group, preferred) {
    if (preferred != null && group.includes(preferred)) return preferred;
    const sorted = [...group].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function collapse(refill) {
    const spawned = [];
    for (let c = 0; c < SIZE; c++) {
      const kept = [];
      for (let r = SIZE - 1; r >= 0; r--) {
        const tile = board[indexOf(r, c)];
        if (tile.kind !== 'empty') kept.push(tile);
      }
      let r = SIZE - 1;
      kept.forEach((tile) => { board[indexOf(r--, c)] = tile; });
      while (r >= 0) {
        const i = indexOf(r--, c);
        board[i] = refill ? randomMaterial() : emptyTile();
        if (refill) spawned.push(i);
      }
    }
    return spawned;
  }

  async function resolveMatches(preferred = null, refill = true) {
    let loops = 0;
    while (loops++ < 12) {
      const groups = findMatches();
      if (!groups.length) break;
      const merging = [...new Set(groups.flat())];
      renderBoard([], merging);
      tone(720, .08, .04);
      await wait(220);

      groups.forEach((group) => {
        const source = board[group[0]];
        if (!source || source.kind === 'empty') return;
        const target = chooseTarget(group, preferred);
        const next = source.kind === 'material'
          ? { kind: 'structure', type: source.type, level: 1 }
          : { kind: 'structure', type: source.type, level: source.level + 1 };

        group.forEach((i) => { board[i] = emptyTile(); });
        board[target] = next;

        if (source.kind === 'material') score += 90 + Math.max(0, group.length - 3) * 35;
        else score += 190 * next.level;

        if (next.type === 'wood') {
          const bonus = 2 + rand(3) + Math.max(0, next.level - 1);
          moves += bonus;
          showToast(`CASSA DEL FABBRO  +${bonus} MOSSE`);
          tone(950, .13, .05, 'sine');
        } else if (source.kind === 'structure') {
          showToast(`${DATA[next.type].structure.toUpperCase()}  LIVELLO ${next.level}`);
        }
      });

      const spawned = collapse(refill);
      updateHUD();
      renderBoard(spawned);
      await wait(190);
      preferred = null;
      if (!refill) break;
    }
  }

  function updateHUD() {
    $('hud-day').textContent = day;
    $('hud-moves').textContent = phase === 'workshop' ? '∞' : moves;
    $('hud-score').textContent = score.toLocaleString('it-IT');
    const hearts = '♥ '.repeat(baseHP).trim() + (baseHP < START_HP ? ' ' + '♡ '.repeat(START_HP - baseHP).trim() : '');
    $('hud-hearts').textContent = hearts;
    $('hud-hearts').setAttribute('aria-label', `${baseHP} vite`);
  }

  function updatePhaseUI() {
    const ribbon = $('phase-ribbon');
    ribbon.className = `phase-ribbon ${phase}`;
    endWorkshopBtn.hidden = phase !== 'workshop';
    if (phase === 'build') {
      $('phase-title').textContent = `GIORNO ${day} · PREPARA LE DIFESE`;
      $('phase-copy').textContent = 'Ogni scambio costa 1 mossa. Anche se non crea un tris.';
    } else if (phase === 'wave') {
      $('phase-title').textContent = `ORDA ${day} · DIFENDI IL BASTIONE`;
      $('phase-copy').textContent = 'La griglia è bloccata: ora combattono le strutture che hai costruito.';
    } else if (phase === 'workshop') {
      $('phase-title').textContent = 'OFFICINA · SCAMBI ILLIMITATI';
      $('phase-copy').textContent = 'Puoi riordinare tutto. Le fusioni non generano nuovi simboli finché non termini.';
    } else {
      $('phase-title').textContent = 'IL BASTIONE È CADUTO';
      $('phase-copy').textContent = 'Ricomincia e prova una disposizione diversa.';
    }
    updateBossWarning();
    updateHUD();
  }

  function updateBossWarning() {
    if (phase === 'build' && day % 10 === 0 && bossColumn != null) {
      bossWarning.hidden = false;
      $('boss-lane-copy').textContent = `Corsia ${bossColumn + 1}`;
    } else bossWarning.hidden = true;
  }

  async function performSwap(a, b) {
    if (busy || (phase !== 'build' && phase !== 'workshop') || !adjacent(a, b)) return;
    busy = true;
    selected = null;
    [board[a], board[b]] = [board[b], board[a]];
    renderBoard();
    tone(420, .045, .025);

    if (phase === 'build') {
      moves = Math.max(0, moves - 1);
      updateHUD();
      await wait(90);
      await resolveMatches(b, true);
      updateHUD();
      renderBoard();
      busy = false;
      if (moves <= 0) {
        await wait(430);
        startWave();
      }
      return;
    }

    await wait(70);
    await resolveMatches(b, false);
    renderBoard();
    busy = false;
  }

  function selectOrSwap(index) {
    if (busy || (phase !== 'build' && phase !== 'workshop')) return;
    if (selected == null) {
      selected = index;
      renderBoard();
      tone(340, .035, .02);
      return;
    }
    if (selected === index) {
      selected = null;
      renderBoard();
      return;
    }
    if (!adjacent(selected, index)) {
      selected = index;
      renderBoard();
      return;
    }
    performSwap(selected, index);
  }

  function dragTarget(index, dx, dy) {
    const { r, c } = rc(index);
    let nr = r, nc = c;
    if (Math.abs(dx) > Math.abs(dy)) nc += dx > 0 ? 1 : -1;
    else nr += dy > 0 ? 1 : -1;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return null;
    return indexOf(nr, nc);
  }

  boardEl.addEventListener('pointerdown', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || busy || phase === 'wave' || phase === 'gameover') return;
    pointerStart = { index: Number(tile.dataset.index), x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try { tile.setPointerCapture(event.pointerId); } catch {}
  });

  boardEl.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const start = pointerStart;
    pointerStart = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 18) {
      const target = dragTarget(start.index, dx, dy);
      if (target != null) performSwap(start.index, target);
    } else selectOrSwap(start.index);
  });

  boardEl.addEventListener('pointercancel', () => { pointerStart = null; });

  function snapshotTowers() {
    const towers = [];
    board.forEach((tile, i) => {
      if (tile.kind !== 'structure') return;
      const { r, c } = rc(i);
      towers.push({ type: tile.type, level: tile.level, r, c, cooldown: Math.random() * .3, boost: 1 });
    });
    towers.forEach((tower) => {
      towers.forEach((idol) => {
        if (idol.type !== 'gold' || idol === tower) return;
        if (Math.abs(idol.r - tower.r) + Math.abs(idol.c - tower.c) <= 1) tower.boost += .18 * idol.level;
      });
    });
    return towers;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function boardMetrics() {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height, cellW: rect.width / SIZE, cellH: rect.height / SIZE };
  }

  function enemyXY(enemy) {
    const m = boardMetrics();
    return { x: (enemy.col + .5) * m.cellW, y: enemy.y * m.cellH };
  }

  function towerXY(tower) {
    const m = boardMetrics();
    return { x: (tower.c + .5) * m.cellW, y: (tower.r + .5) * m.cellH };
  }

  function spawnEnemy(forceBoss = false) {
    const isBoss = forceBoss;
    const roll = Math.random();
    let type = isBoss ? 'boss' : roll < .18 && day >= 3 ? 'runner' : roll > .78 && day >= 4 ? 'brute' : 'shade';
    const col = isBoss && bossColumn != null ? bossColumn : rand(SIZE);
    const base = 30 + day * 7;
    const stats = {
      shade: { hp: base, speed: .48 + day * .008, damage: 1 },
      runner: { hp: base * .68, speed: .72 + day * .009, damage: 1 },
      brute: { hp: base * 1.85, speed: .34 + day * .005, damage: 1 },
      boss: { hp: 280 + day * 30, speed: .24 + day * .002, damage: 2 }
    }[type];
    wave.enemies.push({
      id: wave.nextEnemyId++, type, col, y: 6.42, hp: stats.hp, maxHp: stats.hp,
      speed: stats.speed, damage: stats.damage, slow: 1, bob: Math.random() * Math.PI * 2
    });
  }

  function addShot(tower, enemy, color, width = 3) {
    wave.shots.push({ tower, enemyId: enemy.id, color, width, life: .14, max: .14 });
  }

  function hit(enemy, damage, tower, color, splash = 0) {
    enemy.hp -= damage;
    addShot(tower, enemy, color, splash ? 4 : 3);
    if (splash > 0) {
      wave.enemies.forEach((other) => {
        if (other === enemy) return;
        const dist = Math.hypot((other.col - enemy.col), (other.y - enemy.y));
        if (dist <= splash) other.hp -= damage * .42;
      });
    }
  }

  function updateWave(dt) {
    if (!wave || phase !== 'wave') return;
    wave.elapsed += dt;
    wave.spawnTimer -= dt;
    if (wave.spawnLeft > 0 && wave.spawnTimer <= 0) {
      const forceBoss = wave.bossPending;
      spawnEnemy(forceBoss);
      wave.bossPending = false;
      wave.spawnLeft--;
      wave.spawnTimer = forceBoss ? 1.25 : Math.max(.46, .95 - day * .012) + Math.random() * .2;
    }

    wave.enemies.forEach((enemy) => {
      enemy.slow = 1;
      wave.towers.forEach((tower) => {
        if (tower.type !== 'ice' || tower.c !== enemy.col) return;
        if (Math.abs(enemy.y - (tower.r + .5)) < .92) {
          enemy.slow = Math.min(enemy.slow, Math.max(.35, .72 - tower.level * .08));
          enemy.hp -= (.8 + tower.level * .55) * dt;
        }
      });
      enemy.y -= enemy.speed * enemy.slow * dt;
      enemy.bob += dt * 5;
    });

    wave.towers.forEach((tower) => {
      if (tower.type === 'ice' || tower.type === 'wood' || tower.type === 'gold') return;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) return;
      const living = wave.enemies.filter((e) => e.hp > 0 && e.y > -.2 && e.y < 6.6);
      let candidates = [];
      if (tower.type === 'copper') candidates = living.filter((e) => Math.abs(e.col - tower.c) <= 1);
      if (tower.type === 'iron') candidates = living.filter((e) => Math.abs(e.y - (tower.r + .5)) <= .8);
      if (tower.type === 'fire') candidates = living.filter((e) => e.col === tower.c);
      if (!candidates.length) return;
      candidates.sort((a, b) => a.y - b.y);
      const target = candidates[0];
      const boost = tower.boost || 1;
      if (tower.type === 'copper') {
        hit(target, (8 + tower.level * 5.4) * boost, tower, DATA.copper.color);
        tower.cooldown = Math.max(.24, .82 - tower.level * .07);
      } else if (tower.type === 'iron') {
        hit(target, (18 + tower.level * 9.5) * boost, tower, DATA.iron.color, 1.05);
        tower.cooldown = Math.max(.62, 1.5 - tower.level * .1);
      } else if (tower.type === 'fire') {
        hit(target, (14 + tower.level * 7.2) * boost, tower, DATA.fire.color);
        tower.cooldown = Math.max(.42, 1.08 - tower.level * .07);
      }
    });

    for (let i = wave.enemies.length - 1; i >= 0; i--) {
      const enemy = wave.enemies[i];
      if (enemy.hp <= 0) {
        score += enemy.type === 'boss' ? 850 + day * 30 : 25 + day * 3;
        const p = enemyXY(enemy);
        wave.particles.push({ x: p.x, y: p.y, life: .55, color: enemy.type === 'boss' ? '#ffc95b' : '#ff7955' });
        wave.enemies.splice(i, 1);
        tone(enemy.type === 'boss' ? 740 : 330 + Math.random() * 80, .045, .02);
      } else if (enemy.y < -.18) {
        baseHP = Math.max(0, baseHP - enemy.damage);
        wave.enemies.splice(i, 1);
        showToast(enemy.type === 'boss' ? 'IL BOSS HA SFONDATO!  -2 ♥' : 'IL BASTIONE È STATO COLPITO!');
        tone(95, .22, .06, 'sawtooth');
        updateHUD();
        if (baseHP <= 0) {
          gameOver();
          return;
        }
      }
    }

    wave.shots.forEach((shot) => { shot.life -= dt; });
    wave.shots = wave.shots.filter((shot) => shot.life > 0);
    wave.particles.forEach((p) => { p.life -= dt; });
    wave.particles = wave.particles.filter((p) => p.life > 0);
    updateHUD();

    if (wave.spawnLeft <= 0 && wave.enemies.length === 0 && phase === 'wave') completeWave();
  }

  function drawEnemy(enemy) {
    const { x, y } = enemyXY(enemy);
    const m = boardMetrics();
    const scale = Math.min(m.cellW, m.cellH) / 78;
    ctx.save();
    ctx.translate(x, y + Math.sin(enemy.bob) * 2.5);
    ctx.scale(scale, scale);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1e2130';

    if (enemy.type === 'shade') {
      ctx.fillStyle = '#7e6ad8';
      ctx.beginPath(); ctx.roundRect(-21, -20, 42, 40, 15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#151827'; ctx.fillRect(-10, -6, 6, 7); ctx.fillRect(4, -6, 6, 7);
      ctx.strokeStyle = '#b8a8ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-24, -33, -30, -19); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -18); ctx.quadraticCurveTo(24, -33, 30, -19); ctx.stroke();
    } else if (enemy.type === 'runner') {
      ctx.fillStyle = '#da5675';
      ctx.beginPath(); ctx.moveTo(-26, 5); ctx.quadraticCurveTo(-14, -24, 0, -10); ctx.quadraticCurveTo(14, -24, 26, 5); ctx.quadraticCurveTo(13, 21, 0, 12); ctx.quadraticCurveTo(-13, 21, -26, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c1720'; ctx.fillRect(-8, -2, 5, 5); ctx.fillRect(3, -2, 5, 5);
    } else if (enemy.type === 'brute') {
      ctx.fillStyle = '#5c9f72';
      ctx.beginPath(); ctx.roundRect(-27, -25, 54, 50, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#283726'; ctx.fillRect(-12, -5, 8, 8); ctx.fillRect(4, -5, 8, 8);
      ctx.fillStyle = '#84c795'; ctx.beginPath(); ctx.arc(-22, -23, 8, 0, Math.PI * 2); ctx.arc(22, -23, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#bd4a38';
      ctx.beginPath(); ctx.roundRect(-35, -31, 70, 62, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0b855';
      ctx.beginPath(); ctx.moveTo(-26, -23); ctx.lineTo(-17, -45); ctx.lineTo(-6, -25); ctx.fill();
      ctx.beginPath(); ctx.moveTo(26, -23); ctx.lineTo(17, -45); ctx.lineTo(6, -25); ctx.fill();
      ctx.fillStyle = '#27171a'; ctx.fillRect(-15, -5, 9, 8); ctx.fillRect(6, -5, 9, 8);
      ctx.strokeStyle = '#f0b855'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 10, 13, 0, Math.PI); ctx.stroke();
    }

    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const hpW = enemy.type === 'boss' ? 62 : 44;
    ctx.fillStyle = 'rgba(13,15,23,.72)'; ctx.fillRect(-hpW / 2, -39, hpW, 6);
    ctx.fillStyle = enemy.type === 'boss' ? '#ffc95b' : '#7ef28e'; ctx.fillRect(-hpW / 2, -39, hpW * ratio, 6);
    ctx.restore();
  }

  function drawWave() {
    resizeCanvas();
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!wave) return;

    wave.enemies.forEach(drawEnemy);

    wave.shots.forEach((shot) => {
      const target = wave.enemies.find((e) => e.id === shot.enemyId);
      if (!target) return;
      const A = towerXY(shot.tower);
      const B = enemyXY(target);
      ctx.save();
      ctx.globalAlpha = clamp(shot.life / shot.max, 0, 1);
      ctx.strokeStyle = shot.color;
      ctx.lineWidth = shot.width;
      ctx.shadowColor = shot.color;
      ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.restore();
    });

    wave.particles.forEach((p) => {
      const t = 1 - p.life / .55;
      ctx.save(); ctx.globalAlpha = clamp(p.life / .55, 0, 1); ctx.fillStyle = p.color;
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        ctx.fillRect(p.x + Math.cos(a) * t * 34, p.y + Math.sin(a) * t * 34, 4, 4);
      }
      ctx.restore();
    });
  }

  function waveFrame(now) {
    if (phase !== 'wave' || !wave) return;
    const dt = Math.min(.04, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    updateWave(dt);
    drawWave();
    if (phase === 'wave') raf = requestAnimationFrame(waveFrame);
  }

  async function startWave() {
    if (phase !== 'build' || busy) return;
    busy = true;
    selected = null;
    phase = 'wave';
    updatePhaseUI();
    renderBoard();
    bossWarning.hidden = true;

    const isBossDay = day % 10 === 0;
    const count = Math.min(5 + Math.floor(day * 1.35), 30) + (isBossDay ? 1 : 0);
    wave = {
      towers: snapshotTowers(), enemies: [], shots: [], particles: [], nextEnemyId: 1,
      spawnLeft: count, spawnTimer: .25, elapsed: 0, bossPending: isBossDay
    };

    $('wave-number').textContent = day;
    $('wave-banner').hidden = false;
    tone(160, .28, .055, 'sawtooth');
    await wait(760);
    $('wave-banner').hidden = true;
    busy = false;
    lastFrame = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(waveFrame);
  }

  function completeWave() {
    cancelAnimationFrame(raf);
    const completed = day;
    score += completed * 120;
    wave = null;
    day++;
    moves = START_MOVES;
    tone(880, .18, .045, 'sine');
    showToast(`GIORNO ${completed} SUPERATO!`);

    if (completed % 10 === 0) {
      phase = 'workshop';
      selected = null;
      bossColumn = null;
      updatePhaseUI();
      renderBoard();
      drawWave();
      return;
    }

    phase = 'build';
    selected = null;
    bossColumn = day % 10 === 0 ? rand(SIZE) : null;
    updatePhaseUI();
    renderBoard();
    drawWave();
  }

  function fillWorkshopEmpties() {
    for (let i = 0; i < board.length; i++) {
      if (board[i].kind !== 'empty') continue;
      let candidate;
      let tries = 0;
      do {
        candidate = randomMaterial();
        board[i] = candidate;
        tries++;
      } while (tries < 30 && findMatches().some((g) => g.includes(i)));
    }
  }

  function finishWorkshop() {
    if (phase !== 'workshop' || busy) return;
    fillWorkshopEmpties();
    phase = 'build';
    moves = START_MOVES;
    selected = null;
    bossColumn = day % 10 === 0 ? rand(SIZE) : null;
    updatePhaseUI();
    renderBoard([...board.keys()].filter((i) => board[i].kind === 'material'));
    showToast('OFFICINA CHIUSA · 5 NUOVE MOSSE');
    tone(640, .14, .04, 'sine');
  }

  function gameOver() {
    cancelAnimationFrame(raf);
    phase = 'gameover';
    busy = false;
    wave = null;
    updatePhaseUI();
    renderBoard();
    drawWave();
    $('final-day').textContent = day;
    $('final-score').textContent = score.toLocaleString('it-IT');
    const dialog = $('gameover-dialog');
    if (!dialog.open) dialog.showModal();
  }

  function resetGame() {
    cancelAnimationFrame(raf);
    day = 1;
    moves = START_MOVES;
    baseHP = START_HP;
    score = 0;
    phase = 'build';
    selected = null;
    busy = false;
    bossColumn = null;
    wave = null;
    makeInitialBoard();
    updatePhaseUI();
    renderBoard([...board.keys()]);
    drawWave();
    const dialog = $('gameover-dialog');
    if (dialog.open) dialog.close();
    showToast('5 MOSSE. COSTRUISCI BENE.');
  }

  function showHelp(type) {
    const data = DATA[type];
    $('help-icon').innerHTML = materialSVG(type);
    $('help-type').textContent = `${data.material.toUpperCase()} → ${data.structure.toUpperCase()}`;
    $('help-title').textContent = data.structure;
    $('help-copy').textContent = data.help;
    const dialog = $('help-dialog');
    if (!dialog.open) dialog.showModal();
  }

  document.querySelectorAll('[data-help]').forEach((button) => {
    button.addEventListener('click', () => showHelp(button.dataset.help));
  });
  $('help-close').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', (e) => { if (e.target === $('help-dialog')) $('help-dialog').close(); });
  endWorkshopBtn.addEventListener('click', finishWorkshop);
  $('restart-btn').addEventListener('click', resetGame);
  $('again-btn').addEventListener('click', resetGame);

  soundBtn.addEventListener('click', async () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    await audioContext.resume();
    audioEnabled = !audioEnabled;
    soundBtn.setAttribute('aria-pressed', String(audioEnabled));
    soundBtn.textContent = audioEnabled ? '♫' : '♪';
    if (audioEnabled) tone(650, .12, .05, 'sine');
  });

  window.addEventListener('resize', () => { resizeCanvas(); drawWave(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'wave') cancelAnimationFrame(raf);
    else if (!document.hidden && phase === 'wave' && wave) {
      lastFrame = 0;
      raf = requestAnimationFrame(waveFrame);
    }
  });

  resetGame();
  requestAnimationFrame(() => { resizeCanvas(); drawWave(); });
})();
