
(() => {
  'use strict';

  const SIZE = 6;
  const START_MOVES = 5;
  const START_HP = 5;
  const TYPES = ['ice', 'copper', 'iron', 'fire', 'wood', 'gold'];

  const DATA = {
    ice: {
      material: 'Cristallo di ghiaccio', structure: 'Muro glaciale', color: '#6fd7ff',
      help: 'Rallenta i mostri sulla stessa corsia e li consuma mentre spingono contro il muro.'
    },
    copper: {
      material: 'Rame', structure: 'Torre degli arcieri', color: '#e89862',
      help: 'Spara sulla propria corsia e su quelle adiacenti. È la difesa più flessibile.'
    },
    iron: {
      material: 'Ferro', structure: 'Cannone d’assedio', color: '#cbd8e8',
      help: 'Colpisce in orizzontale la sua corsia e infligge danno ad area.'
    },
    fire: {
      material: 'Brace', structure: 'Balestra ardente', color: '#ff6a53',
      help: 'Tira rapido e lontano sulla propria corsia. Ottima contro i nemici veloci.'
    },
    wood: {
      material: 'Legno', structure: 'Cassa del fabbro', color: '#b97a42',
      help: 'Non attacca: toccala o cliccala per aprirla e ottenere da +2 a +4 mosse.'
    },
    gold: {
      material: 'Oro', structure: 'Idolo aureo', color: '#f4c34f',
      help: 'Non attacca, ma potenzia le strutture adiacenti sulla griglia.'
    }
  };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const canvas = $('battle-canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = $('toast');
  const restartBtn = $('restart-btn');
  const againBtn = $('again-btn');
  const endWorkshopBtn = $('end-workshop');
  const helpDialog = $('help-dialog');
  const gameoverDialog = $('gameover-dialog');
  const bossWarning = $('boss-warning');
  const waveBadge = $('wave-badge');
  const soundBtn = $('sound-btn');
  let audioCtx = null;

  let board = [];
  let selected = null;
  let dragStart = null;
  let busy = false;
  let day = 1;
  let moves = START_MOVES;
  let baseHP = START_HP;
  let score = 0;
  let phase = 'build';
  let bossLane = 0;
  let wave = null;
  let toastTimer = 0;
  let raf = 0;
  let prev = 0;

  const helpMap = {
    ice: { type: 'MATERIALE / STRUTTURA', title: 'Ghiaccio → Muro glaciale', copy: DATA.ice.help },
    copper: { type: 'MATERIALE / STRUTTURA', title: 'Rame → Torre degli arcieri', copy: DATA.copper.help },
    iron: { type: 'MATERIALE / STRUTTURA', title: 'Ferro → Cannone d’assedio', copy: DATA.iron.help },
    fire: { type: 'MATERIALE / STRUTTURA', title: 'Fuoco → Balestra ardente', copy: DATA.fire.help },
    wood: { type: 'MATERIALE / STRUTTURA', title: 'Legno → Cassa del fabbro', copy: DATA.wood.help },
    gold: { type: 'MATERIALE / STRUTTURA', title: 'Oro → Idolo aureo', copy: DATA.gold.help }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (n) => Math.floor(Math.random() * n);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
  const idx = (r, c) => r * SIZE + c;
  const adjacent = (a, b) => {
    const A = rc(a), B = rc(b);
    return Math.abs(A.r - B.r) + Math.abs(A.c - B.c) === 1;
  };
  const emptyTile = () => ({ kind: 'empty' });
  const randomMaterial = () => ({ kind: 'material', type: TYPES[rand(TYPES.length)] });

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    audioCtx = new A();
    return audioCtx;
  }

  async function tone(freq = 440, dur = 0.08, gain = 0.03, type = 'sine') {
    if (soundBtn.getAttribute('aria-pressed') !== 'true') return;
    const ctxA = ensureAudio();
    if (!ctxA) return;
    if (ctxA.state === 'suspended') await ctxA.resume();
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g); g.connect(ctxA.destination);
    const now = ctxA.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now); osc.stop(now + dur);
  }

  soundBtn.addEventListener('click', async () => {
    const current = soundBtn.getAttribute('aria-pressed') === 'true';
    soundBtn.setAttribute('aria-pressed', String(!current));
    soundBtn.textContent = !current ? '♫' : '♪';
    if (!current) await tone(520, 0.09, 0.04);
  });

  function same(a, b) {
    return a && b && a.kind !== 'empty' && b.kind !== 'empty' && a.kind === b.kind && a.type === b.type && ((a.kind === 'material') || a.level === b.level);
  }

  function tileTier(level = 1) {
    if (level <= 1) return 'tier-1';
    if (level === 2) return 'tier-2';
    return 'tier-3';
  }

  function materialSVG(type) {
    const common = 'class="tile-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"';
    if (type === 'ice') return `<svg ${common}><path d="M50 12 68 27l1 22-19 39-18-18 1-25Z" fill="#dcfbff" stroke="#3ea7c8" stroke-width="5"/><path d="M50 12v76M32 45h37M41 22l18 54" stroke="#70d7f6" stroke-width="3"/></svg>`;
    if (type === 'copper') return `<svg ${common}><path d="M26 20h48l8 12-10 49H28L18 32Z" fill="#eaa274" stroke="#8e4f2f" stroke-width="6"/><path d="M34 36h32M31 50h38M28 64h44" stroke="#f4cbad" stroke-width="4"/></svg>`;
    if (type === 'iron') return `<svg ${common}><path d="M50 16 73 28l-8 43-31 10-12-16 9-37Z" fill="#e3ebf4" stroke="#6c7c90" stroke-width="6"/><path d="M36 44h22M44 36l-6 24" stroke="#9fb0c4" stroke-width="4"/></svg>`;
    if (type === 'fire') return `<svg ${common}><path d="M49 12c9 11 15 17 15 29 0 10-7 19-18 19s-19-9-19-20c0-10 6-17 14-28 0 9 2 13 8 19-1-7 0-11 0-19Z" fill="#ffca61" stroke="#b94431" stroke-width="5"/><path d="M48 37c6 7 8 10 8 16a11 11 0 0 1-21 0c0-5 3-9 8-15 0 4 2 6 5 10 0-4 0-7 0-11Z" fill="#ff7055"/></svg>`;
    if (type === 'wood') return `<svg ${common}><path d="M18 24 82 14l6 20-65 15Z" fill="#d18b49" stroke="#7f4a28" stroke-width="6"/><path d="M22 55 85 43l4 20-66 16Z" fill="#b56f38" stroke="#7f4a28" stroke-width="6"/><path d="M33 22 28 51m24-35-5 28m20-31-5 27M43 50l-3 28m27-32-3 28" stroke="#f1c183" stroke-width="4"/></svg>`;
    return `<svg ${common}><path d="M50 14 67 24l16 25-8 25-25 10-25-10-8-25 16-25Z" fill="#ffd86e" stroke="#be8f22" stroke-width="6"/><path d="M50 20v56M27 51h46" stroke="#fff1b5" stroke-width="4"/></svg>`;
  }

  function structureSVG(type, level) {
    const common = 'class="tile-svg" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg"';
    const tier = level <= 1 ? 1 : level === 2 ? 2 : 3;
    if (type === 'ice') {
      const top = tier === 1 ? '#dffcff' : tier === 2 ? '#dde6f7' : '#fff0b8';
      const line = tier === 1 ? '#39a3c8' : tier === 2 ? '#6f8096' : '#b98a23';
      const base = tier === 1 ? '#69d0ef' : tier === 2 ? '#8fa1b8' : '#d2aa41';
      return `<svg ${common}><path d="M12 93h86v10H12z" fill="#3b5f6d" opacity=".55"/><path d="M18 89V42l12-12 10 9 13-15 10 13 13-9 16 14v47Z" fill="${top}" stroke="${line}" stroke-width="6" stroke-linejoin="round"/><path d="M18 89h80" stroke="#24434d" stroke-width="6"/><path d="M36 38v51M56 25v64M77 34v55" stroke="${base}" stroke-width="4" opacity=".8"/></svg>`;
    }
    if (type === 'copper') {
      const roof = tier === 1 ? '#cc7048' : tier === 2 ? '#7a879b' : '#d3ac47';
      const body = tier === 1 ? '#9b5c3d' : tier === 2 ? '#76849a' : '#c49738';
      const bow = tier === 1 ? '#f7d19d' : tier === 2 ? '#d7e2ef' : '#fff2b3';
      return `<svg ${common}><path d="M26 98h58" stroke="#452d24" stroke-width="9" stroke-linecap="round"/><path d="M33 95h44l-4-50H37Z" fill="${body}" stroke="#482f28" stroke-width="6"/><path d="M26 48h58l-7-18H33Z" fill="${roof}" stroke="#482f28" stroke-width="6"/><path d="M31 30h11V20h9v10h8V20h9v10h11v18H31Z" fill="${body}" stroke="#482f28" stroke-width="5"/><circle cx="55" cy="61" r="10" fill="#253245" stroke="#482f28" stroke-width="4"/><path d="M55 61 76 51M55 61 76 71" stroke="${bow}" stroke-width="4" stroke-linecap="round"/><path d="M76 51q10 10 0 20M55 61h27" stroke="${bow}" stroke-width="3" fill="none"/><path d="m84 61-9-5v10Z" fill="#ffe58a"/></svg>`;
    }
    if (type === 'iron') {
      const metal = tier === 1 ? '#ccd7e2' : tier === 2 ? '#94a2b8' : '#e4c15a';
      const stroke = tier === 1 ? '#4c5a6d' : tier === 2 ? '#48566b' : '#8d691c';
      return `<svg ${common}><path d="M26 84h56v16H26z" rx="4" fill="#74513a" stroke="#4e3527" stroke-width="5"/><circle cx="38" cy="98" r="13" fill="#4a5461" stroke="#283039" stroke-width="6"/><circle cx="74" cy="98" r="13" fill="#4a5461" stroke="#283039" stroke-width="6"/><circle cx="38" cy="98" r="4" fill="#b8c5d1"/><circle cx="74" cy="98" r="4" fill="#b8c5d1"/><path d="M38 66h36c12 0 19 8 19 17H45Z" fill="${metal}" stroke="${stroke}" stroke-width="6"/><path d="M48 66V51h27v15" fill="${metal}" stroke="${stroke}" stroke-width="6"/><path d="M69 48 102 43l4 13-31 10Z" fill="${metal}" stroke="${stroke}" stroke-width="6"/><ellipse cx="103" cy="49" rx="6" ry="8" fill="#263140" stroke="${stroke}" stroke-width="4"/></svg>`;
    }
    if (type === 'fire') {
      const wood = tier === 1 ? '#cb8451' : tier === 2 ? '#808ea4' : '#d2ad48';
      const line = tier === 1 ? '#743a2d' : tier === 2 ? '#526075' : '#8c6518';
      return `<svg ${common}><path d="M18 97h74" stroke="#4e3028" stroke-width="9" stroke-linecap="round"/><path d="M55 94V41" stroke="${line}" stroke-width="10" stroke-linecap="round"/><path d="M22 49q33-34 66 0" fill="none" stroke="${wood}" stroke-width="9" stroke-linecap="round"/><path d="M22 49q33 18 66 0" fill="none" stroke="#f2d1a5" stroke-width="3"/><path d="M55 18v63" stroke="#edd0a7" stroke-width="4"/><path d="m55 16-10 18h20Z" fill="#ff6d4d" stroke="#8b332c" stroke-width="4"/><path d="M51 13c6 7 9 12 5 18-3 4-8 5-12 1-3-5 1-10 7-19Z" fill="#ffd15c"/></svg>`;
    }
    if (type === 'wood') {
      const lid = tier === 1 ? '#c67d3c' : tier === 2 ? '#8d99ac' : '#d3a944';
      const box = tier === 1 ? '#af6836' : tier === 2 ? '#7d8aa0' : '#be9031';
      const metal = tier === 1 ? '#f1b869' : tier === 2 ? '#d7e3f0' : '#fff0a5';
      return `<svg ${common}><path d="M18 47q0-19 18-19h38q18 0 18 19v10H18Z" fill="${lid}" stroke="#5d3927" stroke-width="7"/><path d="M16 55h76v40H16Z" fill="${box}" stroke="#5d3927" stroke-width="7"/><path d="M16 63h76M35 55v40m38-40v40" stroke="${metal}" stroke-width="4" opacity=".7"/><path d="M48 57h13v20H48z" rx="4" fill="#ffd06a" stroke="#7b531f" stroke-width="4"/><circle cx="55" cy="67" r="2.5" fill="#67431e"/></svg>`;
    }
    const gold = tier === 1 ? '#f2c04f' : tier === 2 ? '#9eaec6' : '#ffdf7b';
    const edge = tier === 1 ? '#8c661b' : tier === 2 ? '#58657c' : '#ab7a1e';
    return `<svg ${common}><path d="M55 16 69 38l26 6-19 18 5 26-26-10-26 10 5-26-19-18 26-6Z" fill="${gold}" stroke="${edge}" stroke-width="6"/><circle cx="55" cy="56" r="15" fill="#fff3b8" stroke="${edge}" stroke-width="5"/><path d="M55 42v28M41 56h28" stroke="#c78d2a" stroke-width="5"/><path d="M31 97h48" stroke="#664817" stroke-width="9" stroke-linecap="round"/></svg>`;
  }

  function makeInitialBoard() {
    board = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const { r, c } = rc(i);
      let tile, tries = 0;
      do {
        tile = randomMaterial();
        tries++;
      } while (
        tries < 24 && (
          (c >= 2 && board[idx(r, c - 1)]?.type === tile.type && board[idx(r, c - 2)]?.type === tile.type) ||
          (r >= 2 && board[idx(r - 1, c)]?.type === tile.type && board[idx(r - 2, c)]?.type === tile.type)
        )
      );
      board.push(tile);
    }
  }

  function findMatches() {
    const runs = [];
    for (let r = 0; r < SIZE; r++) {
      let start = 0;
      for (let c = 1; c <= SIZE; c++) {
        const prev = board[idx(r, c - 1)];
        const cur = c < SIZE ? board[idx(r, c)] : null;
        if (c < SIZE && same(prev, cur)) continue;
        if (c - start >= 3 && board[idx(r, start)].kind !== 'empty') runs.push(Array.from({ length: c - start }, (_, k) => idx(r, start + k)));
        start = c;
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let start = 0;
      for (let r = 1; r <= SIZE; r++) {
        const prev = board[idx(r - 1, c)];
        const cur = r < SIZE ? board[idx(r, c)] : null;
        if (r < SIZE && same(prev, cur)) continue;
        if (r - start >= 3 && board[idx(start, c)].kind !== 'empty') runs.push(Array.from({ length: r - start }, (_, k) => idx(start + k, c)));
        start = r;
      }
    }
    const groups = [];
    runs.forEach((run) => {
      const hits = [];
      groups.forEach((group, gi) => { if (run.some((i) => group.includes(i))) hits.push(gi); });
      if (!hits.length) groups.push([...run]);
      else {
        const merged = new Set(run);
        hits.reverse().forEach((gi) => { groups[gi].forEach((i) => merged.add(i)); groups.splice(gi, 1); });
        groups.push([...merged]);
      }
    });
    return groups;
  }

  function chooseTarget(group, preferred = null) {
    if (preferred != null && group.includes(preferred)) return preferred;
    const sorted = [...group].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function collapse(refill = true) {
    const spawned = [];
    for (let c = 0; c < SIZE; c++) {
      const kept = [];
      for (let r = SIZE - 1; r >= 0; r--) {
        const t = board[idx(r, c)];
        if (t.kind !== 'empty') kept.push(t);
      }
      let r = SIZE - 1;
      kept.forEach((tile) => { board[idx(r--, c)] = tile; });
      while (r >= 0) {
        const slot = idx(r--, c);
        board[slot] = refill ? randomMaterial() : emptyTile();
        if (refill) spawned.push(slot);
      }
    }
    return spawned;
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function updateHUD() {
    $('hud-day').textContent = day;
    $('hud-moves').textContent = phase === 'workshop' ? '∞' : moves;
    $('hud-score').textContent = score.toLocaleString('it-IT');
    $('hud-hearts').textContent = '♥ '.repeat(baseHP).trim() + (baseHP < START_HP ? ' ' + '♡ '.repeat(START_HP - baseHP).trim() : '');
    $('final-day').textContent = day;
    $('final-score').textContent = score.toLocaleString('it-IT');
  }

  function updatePhaseUI() {
    const pill = $('phase-title');
    pill.className = `phase-pill ${phase}`;
    if (phase === 'build') {
      pill.textContent = `GIORNO ${day} · PREPARA LE DIFESE`;
      $('phase-copy').textContent = 'Ogni scambio costa 1 mossa. Anche se non crea un tris.';
      waveBadge.textContent = 'CALMA';
      waveBadge.className = 'wave-badge';
    } else if (phase === 'wave') {
      pill.textContent = `ORDA ${day} · DIFENDI IL BASTIONE`;
      $('phase-copy').textContent = 'I mostri entrano da destra e marciano verso il bastione.';
      waveBadge.textContent = 'ORDA ATTIVA';
      waveBadge.className = 'wave-badge wave';
    } else if (phase === 'workshop') {
      pill.textContent = 'OFFICINA · SCAMBI ILLIMITATI';
      $('phase-copy').textContent = 'Riordina la griglia: non entrano nuovi materiali finché non termini.';
      waveBadge.textContent = 'OFFICINA';
      waveBadge.className = 'wave-badge workshop';
    } else {
      pill.textContent = 'IL BASTIONE È CADUTO';
      $('phase-copy').textContent = 'Ricomincia e prova una disposizione diversa.';
      waveBadge.textContent = 'SCONFITTA';
      waveBadge.className = 'wave-badge wave';
    }
    endWorkshopBtn.hidden = phase !== 'workshop';
    updateBossWarning();
    updateHUD();
  }

  function updateBossWarning() {
    const active = phase === 'build' && day % 10 === 0;
    bossWarning.hidden = !active;
    if (active) $('boss-lane-copy').textContent = `Corsia ${bossLane + 1}`;
  }

  function renderBoard(spawned = [], merging = [], opening = []) {
    boardEl.replaceChildren();
    board.forEach((tile, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tile ${tile.kind}${tile.type ? ` ${tile.type}` : ''}${tile.kind === 'structure' ? ' ' + tileTier(tile.level) : ''}${selected === i ? ' selected' : ''}${spawned.includes(i) ? ' spawn' : ''}${merging.includes(i) ? ' merge' : ''}${opening.includes(i) ? ' opening' : ''}`;
      btn.dataset.index = String(i);
      btn.disabled = busy || phase === 'wave' || phase === 'gameover';
      if (tile.kind !== 'empty') {
        btn.innerHTML = tile.kind === 'material' ? materialSVG(tile.type) : structureSVG(tile.type, tile.level);
        const label = document.createElement('span');
        label.className = 'tile-label';
        label.textContent = tile.kind === 'material' ? DATA[tile.type].material.split(' ')[0] : DATA[tile.type].structure.split(' ')[0];
        btn.append(label);
        if (tile.kind === 'structure') {
          const badge = document.createElement('span');
          badge.className = 'level-badge';
          badge.textContent = tile.level;
          btn.append(badge);
          if (tile.type === 'wood') {
            const hint = document.createElement('span');
            hint.className = 'chest-hint';
            hint.textContent = 'APRI';
            btn.append(hint);
          }
        }
      } else {
        btn.classList.add('empty');
      }
      boardEl.append(btn);
    });
  }

  async function resolveMatches(preferred = null, refill = true) {
    let loops = 0;
    while (loops++ < 12) {
      const groups = findMatches();
      if (!groups.length) break;
      const all = [...new Set(groups.flat())];
      renderBoard([], all);
      tone(700, 0.08, 0.03);
      await wait(170);

      groups.forEach((group) => {
        const source = board[group[0]];
        if (!source || source.kind === 'empty') return;
        const target = chooseTarget(group, preferred);
        const next = source.kind === 'material'
          ? { kind: 'structure', type: source.type, level: 1 }
          : { kind: 'structure', type: source.type, level: source.level + 1 };
        if (next.type === 'wood') next.bonus = 2 + rand(3);
        group.forEach((i) => board[i] = emptyTile());
        board[target] = next;
        score += source.kind === 'material' ? 90 + (group.length - 3) * 30 : 150 * next.level;
        if (next.type === 'wood') showToast('CASSA DEL FABBRO CREATA · TOCCA PER APRIRLA');
        else if (source.kind === 'structure') showToast(`${DATA[next.type].structure.toUpperCase()} · LIVELLO ${next.level}`);
      });

      const spawned = collapse(refill);
      updateHUD();
      renderBoard(spawned);
      await wait(170);
      preferred = null;
      if (!refill) break;
    }
  }

  async function openChest(index) {
    if (busy || (phase !== 'build' && phase !== 'workshop')) return false;
    const tile = board[index];
    if (!tile || tile.kind !== 'structure' || tile.type !== 'wood') return false;
    busy = true;
    selected = null;
    const bonus = tile.bonus || 2 + rand(3);
    renderBoard([], [], [index]);
    await tone(950, 0.11, 0.05);
    await wait(280);
    moves += bonus;
    score += 45 * Math.max(1, tile.level);
    board[index] = emptyTile();
    const refill = phase === 'build';
    const spawned = collapse(refill);
    renderBoard(spawned);
    updateHUD();
    showToast(`CASSA APERTA · +${bonus} MOSSE`);
    await wait(130);
    await resolveMatches(null, refill);
    renderBoard();
    busy = false;
    return true;
  }

  async function performSwap(a, b) {
    if (busy || !adjacent(a, b) || (phase !== 'build' && phase !== 'workshop')) return;
    busy = true;
    selected = null;
    [board[a], board[b]] = [board[b], board[a]];
    renderBoard();
    await tone(420, 0.04, 0.02);
    if (phase === 'build') {
      moves = Math.max(0, moves - 1);
      updateHUD();
      await wait(80);
      await resolveMatches(b, true);
      renderBoard();
      busy = false;
      if (moves <= 0) {
        await wait(380);
        startWave();
      }
    } else {
      await wait(80);
      await resolveMatches(b, false);
      renderBoard();
      busy = false;
    }
  }

  function selectOrSwap(index) {
    if (busy || (phase !== 'build' && phase !== 'workshop')) return;
    if (selected == null) {
      selected = index;
      renderBoard();
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
    return idx(nr, nc);
  }

  boardEl.addEventListener('pointerdown', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || busy || phase === 'wave' || phase === 'gameover') return;
    dragStart = { index: Number(tile.dataset.index), x: event.clientX, y: event.clientY };
  });
  boardEl.addEventListener('pointerup', (event) => {
    if (!dragStart) return;
    const start = dragStart;
    dragStart = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 18) {
      const target = dragTarget(start.index, dx, dy);
      if (target != null) performSwap(start.index, target);
      return;
    }
    const tile = board[start.index];
    if (tile?.kind === 'structure' && tile.type === 'wood') openChest(start.index);
    else selectOrSwap(start.index);
  });

  function snapshotDefenses() {
    const towers = [];
    board.forEach((tile, i) => {
      if (tile.kind !== 'structure') return;
      const { r, c } = rc(i);
      towers.push({ type: tile.type, level: tile.level, row: r, col: c, x: 0, cooldown: Math.random() * 0.3, boost: 1, hp: tile.type === 'ice' ? 50 + tile.level * 38 : 0, maxHp: tile.type === 'ice' ? 50 + tile.level * 38 : 0 });
    });
    towers.forEach((tower) => {
      towers.forEach((idol) => {
        if (idol === tower || idol.type !== 'gold') return;
        if (Math.abs(idol.row - tower.row) + Math.abs(idol.col - tower.col) <= 1) tower.boost += 0.18 * idol.level;
      });
    });
    return towers;
  }

  function startWave() {
    phase = 'wave';
    wave = {
      towers: snapshotDefenses(),
      enemies: [],
      shots: [],
      particles: [],
      spawnLeft: 4 + day * 2,
      spawnTimer: 0.3,
      bossPending: day % 10 === 0,
      nextId: 1,
      cleared: false
    };
    if (wave.bossPending) wave.spawnLeft += 1;
    updatePhaseUI();
    renderBoard();
  }

  function fieldMetrics() {
    const rect = canvas.getBoundingClientRect();
    const laneH = rect.height / SIZE;
    const castleX = rect.width * 0.08;
    const startX = rect.width * 0.22;
    const endX = rect.width * 0.94;
    const colGap = (rect.width * 0.38) / Math.max(1, SIZE - 1);
    return { rect, laneH, castleX, startX, endX, colGap };
  }

  function syncTowerPositions() {
    if (!wave) return;
    const m = fieldMetrics();
    wave.towers.forEach((t) => {
      t.x = m.startX + t.col * m.colGap;
      t.y = m.laneH * (t.row + 0.5);
    });
  }

  function spawnEnemy(forceBoss = false) {
    const m = fieldMetrics();
    const type = forceBoss ? 'boss' : (Math.random() < 0.18 && day >= 3 ? 'runner' : Math.random() > 0.78 && day >= 4 ? 'brute' : 'shade');
    const lane = forceBoss ? bossLane : rand(SIZE);
    const base = 34 + day * 8;
    const stats = {
      shade: { hp: base, speed: 52 + day * 2, damage: 1 },
      runner: { hp: base * 0.72, speed: 76 + day * 2.5, damage: 1 },
      brute: { hp: base * 1.75, speed: 42 + day * 1.6, damage: 1 },
      boss: { hp: 280 + day * 32, speed: 34 + day, damage: 2 }
    }[type];
    wave.enemies.push({ id: wave.nextId++, type, lane, x: m.endX + 40, hp: stats.hp, maxHp: stats.hp, speed: stats.speed, damage: stats.damage, bob: Math.random() * Math.PI * 2 });
  }

  function nearestWall(enemy) {
    return wave.towers
      .filter((t) => t.type === 'ice' && t.row === enemy.lane && t.hp > 0 && enemy.x > t.x - 12)
      .sort((a, b) => a.x - b.x)[0] || null;
  }

  function addShot(fromX, fromY, toX, toY, color, width = 3) {
    wave.shots.push({ fromX, fromY, toX, toY, color, width, life: 0.16, max: 0.16 });
  }

  function damageEnemy(enemy, dmg, splash = 0, tower = null, color = '#fff') {
    enemy.hp -= dmg;
    if (tower) addShot(tower.x, tower.y, enemy.x, laneY(enemy.lane), color, splash ? 4 : 3);
    if (splash > 0) {
      wave.enemies.forEach((other) => {
        if (other === enemy || other.lane !== enemy.lane) return;
        if (Math.abs(other.x - enemy.x) <= splash) other.hp -= dmg * 0.35;
      });
    }
  }

  function laneY(row) {
    return fieldMetrics().laneH * (row + 0.5);
  }

  function updateWave(dt) {
    if (!wave || phase !== 'wave') return;
    syncTowerPositions();
    wave.spawnTimer -= dt;
    if (wave.spawnLeft > 0 && wave.spawnTimer <= 0) {
      const boss = wave.bossPending;
      spawnEnemy(boss);
      if (boss) wave.bossPending = false;
      wave.spawnLeft--;
      wave.spawnTimer = boss ? 1.45 : Math.max(0.4, 0.92 - day * 0.01) + Math.random() * 0.18;
    }

    wave.enemies.forEach((enemy) => {
      enemy.bob += dt * 5;
      const wall = nearestWall(enemy);
      if (wall && enemy.x <= wall.x + 26) {
        wall.hp -= dt * (6 + enemy.damage * 2);
        enemy.x -= dt * Math.max(12, enemy.speed * 0.18);
        enemy.hp -= dt * (1.8 + wall.level * 0.6);
      } else {
        enemy.x -= dt * enemy.speed;
      }
    });

    wave.towers = wave.towers.filter((t) => t.type !== 'ice' || t.hp > 0);

    wave.towers.forEach((tower) => {
      if (tower.type === 'ice' || tower.type === 'gold' || tower.type === 'wood') return;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) return;
      const boost = tower.boost || 1;
      let candidates = [];
      if (tower.type === 'copper') candidates = wave.enemies.filter((e) => Math.abs(e.lane - tower.row) <= 1 && e.x >= tower.x - 10);
      if (tower.type === 'iron') candidates = wave.enemies.filter((e) => e.lane === tower.row && e.x >= tower.x - 10);
      if (tower.type === 'fire') candidates = wave.enemies.filter((e) => e.lane === tower.row && e.x >= tower.x - 10);
      if (!candidates.length) return;
      candidates.sort((a, b) => a.x - b.x);
      const target = candidates[0];
      if (tower.type === 'copper') {
        damageEnemy(target, (9 + tower.level * 5.2) * boost, 0, tower, DATA.copper.color);
        tower.cooldown = Math.max(0.34, 0.82 - tower.level * 0.08);
      } else if (tower.type === 'iron') {
        damageEnemy(target, (18 + tower.level * 10.5) * boost, 54, tower, DATA.iron.color);
        tower.cooldown = Math.max(0.68, 1.58 - tower.level * 0.12);
      } else if (tower.type === 'fire') {
        damageEnemy(target, (14 + tower.level * 7.3) * boost, 0, tower, DATA.fire.color);
        tower.cooldown = Math.max(0.42, 1.04 - tower.level * 0.08);
      }
    });

    for (let i = wave.enemies.length - 1; i >= 0; i--) {
      const enemy = wave.enemies[i];
      if (enemy.hp <= 0) {
        score += enemy.type === 'boss' ? 850 + day * 35 : 25 + day * 3;
        wave.particles.push({ x: enemy.x, y: laneY(enemy.lane), color: enemy.type === 'boss' ? '#ffc95b' : '#ff7f60', life: 0.55, r: enemy.type === 'boss' ? 22 : 14 });
        wave.enemies.splice(i, 1);
        tone(enemy.type === 'boss' ? 760 : 380, 0.05, 0.03);
      } else if (enemy.x <= fieldMetrics().castleX) {
        baseHP = Math.max(0, baseHP - enemy.damage);
        wave.enemies.splice(i, 1);
        showToast(enemy.type === 'boss' ? 'IL BOSS HA SFONDATO · -2 ♥' : 'IL BASTIONE È STATO COLPITO');
        tone(110, 0.22, 0.06, 'sawtooth');
        if (baseHP <= 0) {
          gameOver();
          return;
        }
      }
    }

    wave.shots.forEach((s) => s.life -= dt);
    wave.shots = wave.shots.filter((s) => s.life > 0);
    wave.particles.forEach((p) => p.life -= dt);
    wave.particles = wave.particles.filter((p) => p.life > 0);

    if (!wave.spawnLeft && !wave.enemies.length && phase === 'wave') completeWave();
    updateHUD();
  }

  function completeWave() {
    if (!wave || wave.cleared) return;
    wave.cleared = true;
    day += 1;
    moves = START_MOVES;
    bossLane = rand(SIZE);
    phase = (day - 1) % 10 === 0 ? 'workshop' : 'build';
    wave = null;
    selected = null;
    updatePhaseUI();
    renderBoard();
    showToast(phase === 'workshop' ? 'GIORNO BOSS SUPERATO · OFFICINA SBLOCCATA' : 'ORDA RESPINTA · ALTRE 5 MOSSE');
  }

  function gameOver() {
    phase = 'gameover';
    updatePhaseUI();
    renderBoard();
    if (!gameoverDialog.open) gameoverDialog.showModal();
  }

  function drawCastle(m) {
    const { rect, laneH, castleX } = m;
    ctx.save();
    ctx.translate(castleX - 24, rect.height * 0.5 - 72);
    ctx.fillStyle = '#5d6f8e';
    ctx.strokeStyle = '#344256';
    ctx.lineWidth = 4;
    ctx.fillRect(0, 28, 68, 118);
    ctx.strokeRect(0, 28, 68, 118);
    ctx.fillRect(16, 2, 36, 142);
    ctx.strokeRect(16, 2, 36, 142);
    ctx.fillRect(76, 28, 68, 118);
    ctx.strokeRect(76, 28, 68, 118);
    ctx.fillStyle = '#35435b';
    ctx.fillRect(44, 94, 30, 52);
    ctx.beginPath();
    ctx.moveTo(44, 94); ctx.arc(59, 94, 15, Math.PI, 0); ctx.lineTo(74, 94); ctx.fill();
    ctx.restore();
    for (let r = 0; r < SIZE; r++) {
      const y = laneH * r;
      ctx.fillStyle = r % 2 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)';
      ctx.fillRect(0, y, rect.width, laneH);
      ctx.strokeStyle = 'rgba(53,72,59,.18)';
      ctx.beginPath(); ctx.moveTo(0, y + laneH); ctx.lineTo(rect.width, y + laneH); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(32,50,68,.18)';
    for (let i = 0; i < SIZE; i++) {
      const x = m.startX + i * m.colGap;
      ctx.fillRect(x - 18, 0, 1, rect.height);
    }
  }

  function drawStructure(tower) {
    const x = tower.x, y = tower.y;
    const tier = tower.level <= 1 ? 1 : tower.level === 2 ? 2 : 3;
    ctx.save();
    ctx.translate(x, y);
    if (tower.type === 'ice') {
      ctx.fillStyle = tier === 1 ? '#dffcff' : tier === 2 ? '#dce5f7' : '#fff0b5';
      ctx.strokeStyle = tier === 1 ? '#40a9c8' : tier === 2 ? '#6f8097' : '#b28522';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-24, 18); ctx.lineTo(-24, -14); ctx.lineTo(-16, -24); ctx.lineTo(-8, -18); ctx.lineTo(0, -28); ctx.lineTo(8, -15); ctx.lineTo(16, -22); ctx.lineTo(24, -12); ctx.lineTo(24, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(-8, 16); ctx.moveTo(4, -25); ctx.lineTo(4, 17); ctx.stroke();
      const ratio = tower.hp / tower.maxHp;
      ctx.fillStyle = 'rgba(13,15,23,.58)'; ctx.fillRect(-22, 22, 44, 5);
      ctx.fillStyle = '#80f2ff'; ctx.fillRect(-22, 22, 44 * ratio, 5);
    } else if (tower.type === 'copper') {
      const roof = tier === 1 ? '#cc7048' : tier === 2 ? '#8090a7' : '#d4aa46';
      const body = tier === 1 ? '#91583c' : tier === 2 ? '#6f7d93' : '#bd9433';
      ctx.fillStyle = body; ctx.strokeStyle = '#412a24'; ctx.lineWidth = 3;
      ctx.fillRect(-16, -3, 32, 27); ctx.strokeRect(-16, -3, 32, 27);
      ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(20, -3); ctx.lineTo(14, -18); ctx.lineTo(-14, -18); ctx.closePath(); ctx.fillStyle = roof; ctx.fill(); ctx.stroke();
      ctx.fillStyle = body; ctx.fillRect(-18, -28, 6, 10); ctx.fillRect(-4, -28, 6, 10); ctx.fillRect(10, -28, 6, 10);
      ctx.strokeRect(-18, -28, 6, 10); ctx.strokeRect(-4, -28, 6, 10); ctx.strokeRect(10, -28, 6, 10);
      ctx.strokeStyle = tier === 1 ? '#f3d0a0' : tier === 2 ? '#d8e2ee' : '#fff0b3';
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(16, -1); ctx.moveTo(0, 7); ctx.lineTo(16, 15); ctx.stroke(); ctx.beginPath(); ctx.arc(0,7,8,0,Math.PI*2); ctx.stroke();
    } else if (tower.type === 'iron') {
      const metal = tier === 1 ? '#cfd8e4' : tier === 2 ? '#96a4ba' : '#dec05a';
      const edge = tier === 1 ? '#48566b' : tier === 2 ? '#4d5a70' : '#8c6a1c';
      ctx.fillStyle = '#77523b'; ctx.fillRect(-20, 12, 44, 12); ctx.strokeStyle = '#4e3527'; ctx.strokeRect(-20, 12, 44, 12);
      ctx.fillStyle = '#46505b'; ctx.beginPath(); ctx.arc(-10, 26, 10, 0, Math.PI*2); ctx.arc(16, 26, 10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = metal; ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.fillRect(-10, -2, 22, 14); ctx.strokeRect(-10,-2,22,14); ctx.beginPath(); ctx.moveTo(0,-2); ctx.lineTo(30,-9); ctx.lineTo(33,0); ctx.lineTo(5,8); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tower.type === 'fire') {
      const wood = tier === 1 ? '#ca8350' : tier === 2 ? '#8391a8' : '#d4ad48';
      const edge = tier === 1 ? '#6e382d' : tier === 2 ? '#4f5d72' : '#8d6718';
      ctx.strokeStyle = edge; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0,20); ctx.lineTo(0,-8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-20,-1); ctx.quadraticCurveTo(0,-25,20,-1); ctx.strokeStyle = wood; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-20,-1); ctx.quadraticCurveTo(0,12,20,-1); ctx.strokeStyle = '#f2d1a5'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ff6b4e'; ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(-7,-12); ctx.lineTo(7,-12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd15c'; ctx.beginPath(); ctx.moveTo(0,-23); ctx.lineTo(-4,-15); ctx.lineTo(4,-15); ctx.closePath(); ctx.fill();
    } else if (tower.type === 'wood') {
      const lid = tier === 1 ? '#c67d3c' : tier === 2 ? '#8d99ac' : '#d3a944';
      const box = tier === 1 ? '#af6836' : tier === 2 ? '#7d8aa0' : '#be9031';
      ctx.fillStyle = lid; ctx.strokeStyle = '#5d3927'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-22,-6,44,16,8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = box; ctx.beginPath(); ctx.roundRect(-24,8,48,24,8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd068'; ctx.fillRect(-6,11,12,14); ctx.strokeRect(-6,11,12,14);
    } else if (tower.type === 'gold') {
      const gold = tier === 1 ? '#efc14d' : tier === 2 ? '#9facbf' : '#ffde78';
      const edge = tier === 1 ? '#8c651b' : tier === 2 ? '#59667c' : '#aa791e';
      ctx.fillStyle = gold; ctx.strokeStyle = edge; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(11,-6); ctx.lineTo(29,-1); ctx.lineTo(15,12); ctx.lineTo(18,29); ctx.lineTo(0,20); ctx.lineTo(-18,29); ctx.lineTo(-15,12); ctx.lineTo(-29,-1); ctx.lineTo(-11,-6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fillStyle = '#fff2b8'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c48724'; ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,10); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const y = laneY(enemy.lane);
    ctx.save();
    ctx.translate(enemy.x, y + Math.sin(enemy.bob) * 2.4);
    ctx.lineWidth = 3; ctx.strokeStyle = '#1f2231';
    if (enemy.type === 'shade') {
      ctx.fillStyle = '#7c67d7'; ctx.beginPath(); ctx.roundRect(-18,-18,36,36,12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#151827'; ctx.fillRect(-8,-3,5,5); ctx.fillRect(3,-3,5,5);
      ctx.strokeStyle = '#b7a7ff'; ctx.beginPath(); ctx.moveTo(-12,-18); ctx.quadraticCurveTo(-22,-28,-28,-17); ctx.moveTo(12,-18); ctx.quadraticCurveTo(22,-28,28,-17); ctx.stroke();
    } else if (enemy.type === 'runner') {
      ctx.fillStyle = '#d65676'; ctx.beginPath(); ctx.moveTo(-22,6); ctx.quadraticCurveTo(-10,-18,0,-9); ctx.quadraticCurveTo(10,-18,22,6); ctx.quadraticCurveTo(12,18,0,12); ctx.quadraticCurveTo(-12,18,-22,6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c1720'; ctx.fillRect(-6,-1,4,4); ctx.fillRect(2,-1,4,4);
    } else if (enemy.type === 'brute') {
      ctx.fillStyle = '#5c9f72'; ctx.beginPath(); ctx.roundRect(-24,-22,48,44,11); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#84c795'; ctx.beginPath(); ctx.arc(-19,-21,7,0,Math.PI*2); ctx.arc(19,-21,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#293827'; ctx.fillRect(-11,-4,7,7); ctx.fillRect(4,-4,7,7);
    } else {
      ctx.fillStyle = '#bd4a38'; ctx.beginPath(); ctx.roundRect(-30,-28,60,56,18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0b855'; ctx.beginPath(); ctx.moveTo(-22,-19); ctx.lineTo(-14,-38); ctx.lineTo(-4,-21); ctx.fill(); ctx.beginPath(); ctx.moveTo(22,-19); ctx.lineTo(14,-38); ctx.lineTo(4,-21); ctx.fill();
      ctx.fillStyle = '#24171b'; ctx.fillRect(-13,-5,8,7); ctx.fillRect(5,-5,8,7);
      ctx.strokeStyle = '#f0b855'; ctx.beginPath(); ctx.arc(0,10,12,0,Math.PI); ctx.stroke();
    }
    const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const w = enemy.type === 'boss' ? 58 : 40;
    ctx.fillStyle = 'rgba(13,15,23,.7)'; ctx.fillRect(-w/2,-33,w,5);
    ctx.fillStyle = enemy.type === 'boss' ? '#ffc95b' : '#88f295'; ctx.fillRect(-w/2,-33,w*ratio,5);
    ctx.restore();
  }

  function drawBattlefield() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const m = fieldMetrics();
    drawCastle(m);

    if (wave) syncTowerPositions();
    const towers = wave ? wave.towers : snapshotDefenses().map((t) => ({ ...t, x: m.startX + t.col * m.colGap, y: laneY(t.row) }));
    towers.forEach(drawStructure);

    if (wave) {
      wave.shots.forEach((shot) => {
        const alpha = shot.life / shot.max;
        ctx.strokeStyle = shot.color;
        ctx.lineWidth = shot.width;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(shot.fromX, shot.fromY); ctx.lineTo(shot.toX, shot.toY); ctx.stroke();
        ctx.globalAlpha = 1;
      });
      wave.enemies.forEach(drawEnemy);
      wave.particles.forEach((p) => {
        ctx.globalAlpha = clamp(p.life * 2, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - p.life), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  }

  function frame(now) {
    const dt = Math.min((now - (prev || now)) / 1000, 0.05);
    prev = now;
    if (phase === 'wave') updateWave(dt);
    drawBattlefield();
    raf = requestAnimationFrame(frame);
  }

  function resetGame() {
    selected = null;
    busy = false;
    day = 1;
    moves = START_MOVES;
    baseHP = START_HP;
    score = 0;
    phase = 'build';
    wave = null;
    bossLane = rand(SIZE);
    makeInitialBoard();
    updatePhaseUI();
    renderBoard();
    if (gameoverDialog.open) gameoverDialog.close();
  }

  restartBtn.addEventListener('click', resetGame);
  againBtn.addEventListener('click', () => { gameoverDialog.close(); resetGame(); });
  endWorkshopBtn.addEventListener('click', () => {
    if (phase !== 'workshop') return;
    phase = 'build';
    moves = START_MOVES;
    updatePhaseUI();
    showToast('OFFICINA TERMINATA · ALTRE 5 MOSSE');
  });

  document.querySelectorAll('[data-help]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.help;
      const info = helpMap[key];
      $('help-type').textContent = info.type;
      $('help-title').textContent = info.title;
      $('help-copy').textContent = info.copy;
      $('help-icon').innerHTML = structureSVG(key, 1);
      if (!helpDialog.open) helpDialog.showModal();
    });
  });
  $('help-close').addEventListener('click', () => helpDialog.close());

  window.addEventListener('resize', drawBattlefield, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (helpDialog.open) helpDialog.close();
      if (gameoverDialog.open) gameoverDialog.close();
    }
  });

  resetGame();
  raf = requestAnimationFrame(frame);
})();
