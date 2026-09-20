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
      help: 'Tre tronchi creano una Cassa del fabbro. La cassa resta chiusa sulla griglia: toccala o cliccala per aprirla e ottenere casualmente 2, 3 o 4 mosse extra. Puoi anche trascinarla per spostarla o fonderla.'
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
    const common = 'viewBox="0 0 120 120" aria-hidden="true" class="tile-svg"';
    if (type === 'ice') return `<svg ${common}><defs><linearGradient id="iceG" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edfeff"/><stop offset=".45" stop-color="#8eeaff"/><stop offset="1" stop-color="#3aa9cf"/></linearGradient></defs><path d="M60 8 91 35 80 91 58 108 29 88 22 37Z" fill="url(#iceG)" stroke="#287d9e" stroke-width="6" stroke-linejoin="round"/><path d="M60 9 54 73 80 91M22 37l32 36-25 15M91 35 54 73" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4"/><path d="M50 25 38 45m39-12-13 17" stroke="#d9fbff" stroke-width="5" stroke-linecap="round"/></svg>`;
    if (type === 'copper') return `<svg ${common}><defs><linearGradient id="cuG" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffbe82"/><stop offset="1" stop-color="#b9582e"/></linearGradient></defs><path d="M24 27h72l-7 20H31Z" fill="url(#cuG)" stroke="#6d321f" stroke-width="6"/><path d="M31 50h58l-5 18H36Z" fill="#d8753f" stroke="#6d321f" stroke-width="6"/><path d="M37 72h46l-4 17H41Z" fill="#b85a31" stroke="#6d321f" stroke-width="6"/><circle cx="42" cy="37" r="5" fill="#ffd7b0"/><circle cx="73" cy="58" r="4" fill="#ffd7b0"/><path d="M31 96h58" stroke="#5d2d1e" stroke-width="7" stroke-linecap="round"/></svg>`;
    if (type === 'iron') return `<svg ${common}><defs><linearGradient id="feG" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eef3f7"/><stop offset=".5" stop-color="#a8b3c0"/><stop offset="1" stop-color="#697686"/></linearGradient></defs><path d="M31 19 83 23 97 70 62 101 20 82Z" fill="url(#feG)" stroke="#485463" stroke-width="7"/><path d="M38 31 75 33 86 65 59 88 33 75Z" fill="none" stroke="#f8fbff" stroke-opacity=".55" stroke-width="5"/><path d="m47 26-8 49m37-45 8 36" stroke="#5e6a78" stroke-width="4" opacity=".55"/></svg>`;
    if (type === 'fire') return `<svg ${common}><defs><linearGradient id="fiG" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffcf5b"/><stop offset=".48" stop-color="#ff6b4f"/><stop offset="1" stop-color="#c83232"/></linearGradient></defs><path d="M64 10c7 20 31 31 25 59-4 21-18 38-41 38-24 0-40-16-40-38 0-22 16-35 31-52-1 16 6 23 14 28 11-13 14-25 11-35Z" fill="url(#fiG)" stroke="#8c2c2e" stroke-width="6"/><path d="M59 51c3 10 12 15 9 28-2 9-8 16-18 16-11 0-19-7-19-17 0-9 7-16 13-23 0 8 4 12 8 14 5-6 8-12 7-18Z" fill="#ffe269"/></svg>`;
    if (type === 'wood') return `<svg ${common}><path d="M20 34 91 16l8 26-73 19Z" fill="#d68c49" stroke="#754324" stroke-width="7" stroke-linejoin="round"/><path d="M27 63 94 49l5 27-70 16Z" fill="#b96c35" stroke="#754324" stroke-width="7" stroke-linejoin="round"/><path d="M43 29 37 57m31-35-6 29M49 58l-3 30m29-35-4 31" stroke="#f1bd77" stroke-width="5" opacity=".7"/><circle cx="81" cy="30" r="4" fill="#6d3b22"/><circle cx="40" cy="75" r="4" fill="#6d3b22"/></svg>`;
    return `<svg ${common}><defs><linearGradient id="auG" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0a5"/><stop offset=".38" stop-color="#ffd45c"/><stop offset="1" stop-color="#e39b25"/></linearGradient></defs><path d="M60 8 91 28 102 61 82 96 48 108 17 82 20 38Z" fill="url(#auG)" stroke="#94651b" stroke-width="7"/><path d="M60 10 58 62 102 61M20 38l38 24-10 46" fill="none" stroke="#fff6bf" stroke-width="5" opacity=".65"/><circle cx="60" cy="61" r="12" fill="#fff8c9" opacity=".72"/></svg>`;
  }

  function structureSVG(type, level = 1) {
    const common = 'viewBox="0 0 120 120" aria-hidden="true" class="tile-svg"';
    const lv = Math.max(1, Math.min(level, 9));
    if (type === 'ice') return `<svg ${common}><defs><linearGradient id="wallIce" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e7fdff"/><stop offset="1" stop-color="#62cbe5"/></linearGradient></defs><path d="M12 92h96v12H12z" fill="#365a68" stroke="#24424e" stroke-width="5"/><path d="M17 88 20 45l16-9 10 8 15-16 13 14 13-9 12 10 5 45Z" fill="url(#wallIce)" stroke="#388ca6" stroke-width="6" stroke-linejoin="round"/><path d="M20 51h79M39 39v49M65 35v53M87 42v46" stroke="#fff" stroke-opacity=".7" stroke-width="4"/><path d="M28 56 18 71m57-22 18 18" stroke="#73dff3" stroke-width="5"/><text x="97" y="22" text-anchor="end" fill="#e9feff" font-size="15" font-weight="900">${lv}</text></svg>`;
    if (type === 'copper') return `<svg ${common}><defs><linearGradient id="towerCu" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#eaa06b"/><stop offset="1" stop-color="#7d4430"/></linearGradient></defs><path d="M32 101h56" stroke="#3d2925" stroke-width="9" stroke-linecap="round"/><path d="M38 96h44l-5-47H43Z" fill="url(#towerCu)" stroke="#4d3028" stroke-width="6"/><path d="M31 49h58l-6-18H37Z" fill="#c76b43" stroke="#563126" stroke-width="6"/><path d="M34 31h10V20h10v11h12V20h10v11h10v14H34Z" fill="#88503a" stroke="#4c3028" stroke-width="5"/><circle cx="60" cy="58" r="11" fill="#283039" stroke="#442c25" stroke-width="4"/><path d="M60 58 78 48M60 58 78 68" stroke="#f4c27f" stroke-width="4" stroke-linecap="round"/><path d="M78 48q9 10 0 20M61 58h25" fill="none" stroke="#f7d8a0" stroke-width="3"/><path d="m85 58-9-5v10Z" fill="#ffda7d"/><text x="101" y="19" text-anchor="end" fill="#ffd7a2" font-size="15" font-weight="900">${lv}</text></svg>`;
    if (type === 'iron') return `<svg ${common}><defs><linearGradient id="gunFe" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#dbe3eb"/><stop offset="1" stop-color="#6e7b8b"/></linearGradient></defs><path d="M26 83h58v16H26z" rx="4" fill="#6f4c35" stroke="#493224" stroke-width="5"/><circle cx="38" cy="98" r="13" fill="#46505b" stroke="#252c34" stroke-width="6"/><circle cx="75" cy="98" r="13" fill="#46505b" stroke="#252c34" stroke-width="6"/><circle cx="38" cy="98" r="4" fill="#b9c1c9"/><circle cx="75" cy="98" r="4" fill="#b9c1c9"/><path d="M38 66h37c12 0 19 8 19 17H45Z" fill="url(#gunFe)" stroke="#424c58" stroke-width="6"/><path d="M49 66V51h28v15" fill="#7f8b99" stroke="#424c58" stroke-width="6"/><path d="M70 49 103 43l4 13-32 10Z" fill="#c9d1d9" stroke="#424c58" stroke-width="6"/><ellipse cx="105" cy="49.5" rx="7" ry="9" fill="#2c333b" stroke="#596572" stroke-width="4"/><path d="M31 86h63" stroke="#d29b5c" stroke-width="4" opacity=".55"/><text x="100" y="23" text-anchor="end" fill="#eff5fa" font-size="15" font-weight="900">${lv}</text></svg>`;
    if (type === 'fire') return `<svg ${common}><defs><linearGradient id="xbow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d98a58"/><stop offset="1" stop-color="#73392f"/></linearGradient></defs><path d="M60 101V42" stroke="#6f3b2d" stroke-width="10" stroke-linecap="round"/><path d="M22 48q38-39 76 0" fill="none" stroke="url(#xbow)" stroke-width="9" stroke-linecap="round"/><path d="M24 48q36 20 72 0" fill="none" stroke="#f1d0a0" stroke-width="3"/><path d="M60 20v70" stroke="#e9c598" stroke-width="4"/><path d="m60 17-10 18h20Z" fill="#ff6a4e" stroke="#8c332e" stroke-width="4"/><path d="M45 82h30M38 101h44" stroke="#4c3029" stroke-width="9" stroke-linecap="round"/><path d="M60 12c6 7 9 12 5 18-2 4-8 5-11 1-4-5 0-10 6-19Z" fill="#ffd05c"/><text x="103" y="22" text-anchor="end" fill="#ffd7ba" font-size="15" font-weight="900">${lv}</text></svg>`;
    if (type === 'wood') return `<svg ${common}><defs><linearGradient id="chestW" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e4a35d"/><stop offset="1" stop-color="#985a32"/></linearGradient></defs><path d="M18 50q0-20 20-20h44q20 0 20 20v10H18Z" fill="#c77b3e" stroke="#5f3827" stroke-width="7"/><path d="M16 56h88v47H16Z" fill="url(#chestW)" stroke="#5f3827" stroke-width="7"/><path d="M16 65h88M35 56v47m50-47v47" stroke="#f1b86f" stroke-width="5" opacity=".55"/><path d="M51 57h19v24H51z" rx="4" fill="#ffd06a" stroke="#815522" stroke-width="5"/><circle cx="60" cy="68" r="3" fill="#6c481f"/><path d="M23 46h74" stroke="#ffd08a" stroke-width="4" opacity=".45"/><text x="101" y="23" text-anchor="end" fill="#ffe2a7" font-size="15" font-weight="900">${lv}</text></svg>`;
    return `<svg ${common}><defs><linearGradient id="idolAu" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff09a"/><stop offset="1" stop-color="#d08b20"/></linearGradient></defs><path d="M60 14 74 38l28 7-20 20 5 29-27-12-27 12 5-29-20-20 28-7Z" fill="url(#idolAu)" stroke="#815b19" stroke-width="6"/><circle cx="60" cy="60" r="17" fill="#fff2a3" stroke="#b17a22" stroke-width="5"/><path d="M60 43v34M43 60h34" stroke="#d38e29" stroke-width="5"/><path d="M34 105h52" stroke="#664817" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="60" r="6" fill="#fffbe0"/><text x="104" y="22" text-anchor="end" fill="#fff1a7" font-size="15" font-weight="900">${lv}</text></svg>`;
  }

  function tileIcon(tile) {
    if (tile.kind === 'empty') return '';
    return tile.kind === 'material' ? materialSVG(tile.type) : structureSVG(tile.type, tile.level);
  }

  function renderBoard(spawned = [], merging = [], opening = []) {
    boardEl.replaceChildren();
    board.forEach((tile, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tile ${tile.kind}${tile.type ? ` ${tile.type}` : ''}${selected === i ? ' selected' : ''}${spawned.includes(i) ? ' spawn' : ''}${merging.includes(i) ? ' merge' : ''}${opening.includes(i) ? ' opening' : ''}`;
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
          if (tile.type === 'wood') {
            const hint = document.createElement('span');
            hint.className = 'chest-hint';
            hint.textContent = 'APRI';
            button.append(hint);
            button.setAttribute('title', 'Apri la Cassa del fabbro');
          }
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
        if (next.type === 'wood') next.bonus = 2 + rand(3);

        group.forEach((i) => { board[i] = emptyTile(); });
        board[target] = next;

        if (source.kind === 'material') score += 90 + Math.max(0, group.length - 3) * 35;
        else score += 190 * next.level;

        if (next.type === 'wood') {
          showToast('CASSA DEL FABBRO CREATA · TOCCA PER APRIRLA');
          tone(760, .09, .035, 'sine');
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

  async function openChest(index) {
    if (busy || (phase !== 'build' && phase !== 'workshop')) return false;
    const tile = board[index];
    if (!tile || tile.kind !== 'structure' || tile.type !== 'wood') return false;
    busy = true;
    selected = null;
    const bonus = tile.bonus || (2 + rand(3));
    renderBoard([], [], [index]);
    tone(920, .1, .045, 'sine');
    await wait(280);
    moves += bonus;
    score += 45 * Math.max(1, tile.level || 1);
    board[index] = emptyTile();
    const refill = phase === 'build';
    const spawned = collapse(refill);
    updateHUD();
    renderBoard(spawned);
    showToast(`CASSA APERTA · +${bonus} MOSSE`);
    await wait(150);
    await resolveMatches(null, refill);
    renderBoard();
    busy = false;
    return true;
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
    } else {
      const tile = board[start.index];
      if (tile?.kind === 'structure' && tile.type === 'wood') openChest(start.index);
      else selectOrSwap(start.index);
    }
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
      const t = 1 - clamp(shot.life / shot.max, 0, 1);
      const px = A.x + (B.x - A.x) * Math.min(1, .25 + t * .75);
      const py = A.y + (B.y - A.y) * Math.min(1, .25 + t * .75);
      ctx.fillStyle = shot.color;
      ctx.beginPath(); ctx.arc(px, py, shot.width + 1.5, 0, Math.PI * 2); ctx.fill();
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
    moves = Math.max(START_MOVES, moves);
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
