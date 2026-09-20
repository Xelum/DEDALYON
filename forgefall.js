(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const dialog = $('game-dialog');
  const boardEl = $('board');
  const canvas = $('battle-canvas');
  const ctx = canvas.getContext('2d');
  const finishWorkshopBtn = $('finish-workshop');
  const overlay = $('battle-overlay');
  const W = 900, H = 480, SIZE = 6;

  const TYPES = ['ice','copper','iron','fire','wood','gold'];
  const DATA = {
    ice:   { material:'❄', structure:'▰', mat:'GHIACCIO', name:'MURO', color:'#65dfff' },
    copper:{ material:'⌁', structure:'♜', mat:'RAME', name:'ARCIERI', color:'#ff995a' },
    iron:  { material:'⬢', structure:'●', mat:'FERRO', name:'CANNONE', color:'#c5ccd5' },
    fire:  { material:'◆', structure:'✦', mat:'FUOCO', name:'BALESTRA', color:'#ff6265' },
    wood:  { material:'▤', structure:'▣', mat:'LEGNO', name:'CASSA', color:'#dda56d' },
    gold:  { material:'✦', structure:'♢', mat:'ORO', name:'TOTEM', color:'#ffd25d' }
  };

  let board = [];
  let selected = null;
  let phase = 'build'; // build | wave | workshop | gameover
  let moves = 5, level = 1, baseHP = 5, score = 0, best = 1;
  let initialized = false, opened = false;
  let wave = null, raf = 0, lastTime = 0;
  let toastTimer = 0;
  const storageKey = 'medusa-forgefall-best-v1';
  try { best = Math.max(1, Number(localStorage.getItem(storageKey)) || 1); } catch {}

  const rand = (n) => Math.floor(Math.random() * n);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const pos = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
  const idx = (r, c) => r * SIZE + c;
  const adjacent = (a, b) => {
    const p = pos(a), q = pos(b);
    return Math.abs(p.r - q.r) + Math.abs(p.c - q.c) === 1;
  };
  const sameTile = (a, b) => a && b && a.kind !== 'empty' && b.kind !== 'empty' && a.kind === b.kind && a.type === b.type && (a.kind !== 'structure' || a.level === b.level);
  const randomMaterial = () => ({ kind:'material', type:TYPES[rand(TYPES.length)], level:0 });
  const emptyTile = () => ({ kind:'empty', type:null, level:0 });

  function tone(freq = 550, duration = .08) { window.MedusaAudio?.tone(freq, duration, .045); }
  function announce(text) { $('game-announcement').textContent = text; }
  function showToast(text) {
    let toast = document.querySelector('.toast');
    if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.append(toast); }
    toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1300);
  }

  function initBoard() {
    board = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        let tile, attempts = 0;
        do {
          tile = randomMaterial(); attempts++;
        } while (attempts < 20 && (
          (c >= 2 && board[idx(r,c-1)]?.type === tile.type && board[idx(r,c-2)]?.type === tile.type) ||
          (r >= 2 && board[idx(r-1,c)]?.type === tile.type && board[idx(r-2,c)]?.type === tile.type)
        ));
        board.push(tile);
      }
    }
  }

  function hasValidMove() {
    for (let i = 0; i < board.length; i++) {
      const {r,c} = pos(i);
      for (const j of [c < SIZE-1 ? i+1 : -1, r < SIZE-1 ? i+SIZE : -1]) {
        if (j < 0 || board[i].kind === 'empty' || board[j].kind === 'empty') continue;
        [board[i],board[j]] = [board[j],board[i]];
        const ok = findMatches().length > 0;
        [board[i],board[j]] = [board[j],board[i]];
        if (ok) return true;
      }
    }
    return false;
  }

  function ensurePlayable() {
    if (phase !== 'build' || hasValidMove()) return;
    const materialIndexes = board.map((t,i)=>t.kind === 'material' ? i : -1).filter(i=>i>=0);
    for (let attempt=0; attempt<80; attempt++) {
      materialIndexes.forEach(i => board[i] = randomMaterial());
      if (!findMatches().length && hasValidMove()) { showToast('Griglia rimescolata: nessuna mossa disponibile'); return; }
    }
  }

  function resetGame() {
    cancelAnimationFrame(raf); wave = null; lastTime = 0;
    selected = null; phase = 'build'; moves = 5; level = 1; baseHP = 5; score = 0;
    initBoard(); initialized = true;
    ensurePlayable();
    updateHUD(); renderBoard(); setPhaseUI(); drawIdle();
    showToast('Nuova partita: hai 5 mosse');
  }

  function updateHUD() {
    $('hud-level').textContent = level;
    $('hud-moves').textContent = phase === 'workshop' ? '∞' : moves;
    $('hud-base').textContent = '♥ '.repeat(baseHP).trim() + (baseHP < 5 ? ' ' + '♡ '.repeat(5 - baseHP).trim() : '');
    $('hud-score').textContent = String(score).padStart(4, '0');
    $('hud-best').textContent = best;
  }

  function setOverlay(title, copy, hidden = false) {
    $('overlay-title').textContent = title;
    $('overlay-copy').textContent = copy;
    overlay.classList.toggle('hidden', hidden);
  }

  function setPhaseUI() {
    const phaseLabel = $('phase-label');
    const waveLabel = $('wave-label');
    finishWorkshopBtn.hidden = phase !== 'workshop';
    boardEl.setAttribute('aria-disabled', String(phase === 'wave' || phase === 'gameover'));
    if (phase === 'build') {
      phaseLabel.textContent = 'CREA LE DIFESE';
      waveLabel.textContent = 'ORDA IN ATTESA';
      $('selection-help').textContent = 'Seleziona due caselle adiacenti per scambiarle.';
      setOverlay('PREPARA LA GRIGLIA', 'Quando finiscono le mosse, l’orda parte automaticamente.', false);
    } else if (phase === 'workshop') {
      phaseLabel.textContent = 'OFFICINA — MOSSE INFINITE';
      waveLabel.textContent = 'RIORDINA LE DIFESE';
      $('selection-help').textContent = 'Scambia liberamente: durante l’officina non compaiono nuovi simboli.';
      setOverlay('OFFICINA SBLOCCATA', 'Riordina la griglia senza limite. Termina quando sei pronto.', false);
    } else if (phase === 'wave') {
      phaseLabel.textContent = 'GRIGLIA BLOCCATA';
      waveLabel.textContent = `ORDA ${level} IN CORSO`;
      $('selection-help').textContent = 'Le difese stanno combattendo.';
      setOverlay('', '', true);
    } else {
      phaseLabel.textContent = 'BASE DISTRUTTA';
      waveLabel.textContent = 'PARTITA TERMINATA';
      $('selection-help').textContent = 'Premi “Ricomincia” per una nuova partita.';
      setOverlay('GAME OVER', `Sei arrivato al livello ${level}. Premi “Ricomincia” per riprovare.`, false);
    }
    updateHUD();
  }

  function renderBoard(merging = []) {
    boardEl.innerHTML = '';
    board.forEach((tile, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tile ${tile.kind}${tile.type ? ' '+tile.type : ''}${selected === i ? ' selected' : ''}${merging.includes(i) ? ' merging' : ''}`;
      button.dataset.index = i;
      button.disabled = phase === 'wave' || phase === 'gameover' || tile.kind === 'empty' && phase !== 'workshop';
      const p = pos(i);
      if (tile.kind === 'empty') {
        button.classList.add('empty');
        button.setAttribute('aria-label', `Casella vuota riga ${p.r+1}, colonna ${p.c+1}`);
      } else {
        const d = DATA[tile.type];
        const symbol = document.createElement('span'); symbol.className = 'tile-symbol'; symbol.textContent = tile.kind === 'material' ? d.material : d.structure;
        const label = document.createElement('span'); label.className = 'tile-label'; label.textContent = tile.kind === 'material' ? d.mat : d.name;
        button.append(symbol, label);
        if (tile.kind === 'structure') {
          const lv = document.createElement('span'); lv.className = 'tile-level'; lv.textContent = `L${tile.level}`; button.append(lv);
        }
        button.setAttribute('aria-label', `${tile.kind === 'material' ? 'Materiale' : 'Struttura'} ${tile.kind === 'material' ? d.mat : d.name}${tile.kind === 'structure' ? ', livello '+tile.level : ''}, riga ${p.r+1}, colonna ${p.c+1}`);
      }
      boardEl.append(button);
    });
  }

  function findMatches() {
    const runs = [];
    // horizontal
    for (let r = 0; r < SIZE; r++) {
      let start = 0;
      for (let c = 1; c <= SIZE; c++) {
        const a = c < SIZE ? board[idx(r,c)] : null;
        const b = board[idx(r,c-1)];
        if (c < SIZE && sameTile(a,b)) continue;
        const len = c - start;
        if (len >= 3 && board[idx(r,start)]?.kind !== 'empty') runs.push(Array.from({length:len},(_,k)=>idx(r,start+k)));
        start = c;
      }
    }
    // vertical
    for (let c = 0; c < SIZE; c++) {
      let start = 0;
      for (let r = 1; r <= SIZE; r++) {
        const a = r < SIZE ? board[idx(r,c)] : null;
        const b = board[idx(r-1,c)];
        if (r < SIZE && sameTile(a,b)) continue;
        const len = r - start;
        if (len >= 3 && board[idx(start,c)]?.kind !== 'empty') runs.push(Array.from({length:len},(_,k)=>idx(start+k,c)));
        start = r;
      }
    }
    // merge crossing runs into one group
    const groups = [];
    runs.forEach(run => {
      const hits = [];
      groups.forEach((g, gi) => { if (run.some(i => g.includes(i))) hits.push(gi); });
      if (!hits.length) groups.push([...run]);
      else {
        const merged = new Set(run);
        hits.reverse().forEach(gi => { groups[gi].forEach(i => merged.add(i)); groups.splice(gi,1); });
        groups.push([...merged]);
      }
    });
    return groups;
  }

  function chooseMergeTarget(group, preferred) {
    if (preferred != null && group.includes(preferred)) return preferred;
    const sorted = [...group].sort((a,b) => a-b);
    return sorted[Math.floor(sorted.length/2)];
  }

  function collapse(refill) {
    for (let c = 0; c < SIZE; c++) {
      const kept = [];
      for (let r = SIZE-1; r >= 0; r--) {
        const tile = board[idx(r,c)];
        if (tile.kind !== 'empty') kept.push(tile);
      }
      let r = SIZE-1;
      kept.forEach(tile => { board[idx(r--,c)] = tile; });
      while (r >= 0) board[idx(r--,c)] = refill ? randomMaterial() : emptyTile();
    }
  }

  async function applyMatches(groups, preferred, refill) {
    const all = [...new Set(groups.flat())];
    renderBoard(all); tone(720, .09); await wait(220);
    groups.forEach(group => {
      const target = chooseMergeTarget(group, preferred);
      const source = board[group[0]];
      if (!source || source.kind === 'empty') return;
      const next = source.kind === 'material'
        ? { kind:'structure', type:source.type, level:1 }
        : { kind:'structure', type:source.type, level:source.level + 1 };
      group.forEach(i => board[i] = emptyTile());
      board[target] = next;
      score += source.kind === 'material' ? 60 + group.length * 10 : 150 * next.level;
      if (next.type === 'wood') {
        const bonus = 2 + rand(3) + Math.max(0, next.level - 1);
        moves += bonus;
        showToast(`Cassa! +${bonus} mosse`); tone(920, .12);
      } else if (source.kind === 'structure') {
        showToast(`${DATA[next.type].name} potenziata → L${next.level}`);
      }
    });
    updateHUD();
    await wait(120);
    collapse(refill);
    renderBoard();
    await wait(140);
  }

  async function resolveMatches(preferred = null, refill = true) {
    let loops = 0;
    while (loops++ < 12) {
      const groups = findMatches();
      if (!groups.length) break;
      await applyMatches(groups, preferred, refill);
      preferred = null;
      if (!refill) break; // workshop: do not cascade through empty gaps repeatedly
    }
  }

  async function handleTile(index) {
    if (phase !== 'build' && phase !== 'workshop') return;
    if (selected == null) {
      selected = index; renderBoard(); tone(420,.04); return;
    }
    if (selected === index) { selected = null; renderBoard(); return; }
    if (!adjacent(selected,index)) {
      selected = index; renderBoard(); return;
    }
    const first = selected; selected = null;
    [board[first],board[index]] = [board[index],board[first]];
    renderBoard();

    if (phase === 'workshop') {
      tone(500,.05);
      await resolveMatches(index, false);
      renderBoard(); updateHUD();
      return;
    }

    const groups = findMatches();
    if (!groups.length) {
      await wait(140);
      [board[first],board[index]] = [board[index],board[first]];
      renderBoard();
      showToast('Quello scambio non crea un tris'); tone(180,.08);
      return;
    }
    moves = Math.max(0, moves - 1);
    updateHUD();
    await resolveMatches(index, true);
    ensurePlayable();
    renderBoard(); updateHUD();
    if (moves <= 0 && phase === 'build') {
      await wait(420);
      startWave();
    }
  }

  function towerX(c) { return 118 + c * 92; }
  function laneY(r) { return 58 + r * 70; }
  function structureSnapshot() {
    const towers = [];
    board.forEach((tile,i) => {
      if (tile.kind !== 'structure') return;
      const {r,c} = pos(i);
      towers.push({r,c,type:tile.type,level:tile.level,cooldown:Math.random()*.4});
    });
    towers.forEach(t => {
      let boost = 1;
      towers.forEach(g => {
        if (g.type !== 'gold' || g === t) return;
        if (Math.abs(g.r-t.r)+Math.abs(g.c-t.c) <= 1) boost += .16 * g.level;
      });
      t.boost = boost;
    });
    return towers;
  }

  function startWave() {
    if (phase !== 'build') return;
    phase = 'wave'; selected = null;
    const total = Math.min(7 + level * 2, 34);
    wave = {
      towers: structureSnapshot(), enemies:[], shots:[], particles:[],
      spawnRemaining:total, spawnTimer:.25, total, elapsed:0
    };
    $('enemy-count').textContent = `${total} nemici`;
    setPhaseUI(); renderBoard();
    announce(`Orda ${level} iniziata con ${total} nemici.`);
    tone(190,.25); lastTime = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(waveFrame);
  }

  function spawnEnemy() {
    const lane = rand(SIZE);
    const variants = ['slime','bat','golem'];
    const type = level > 3 && Math.random() < .25 ? variants[1+rand(2)] : variants[0];
    const scale = type === 'golem' ? 1.8 : type === 'bat' ? .78 : 1;
    wave.enemies.push({
      lane, x: W + 35 + Math.random()*90, hp:(32 + level*10)*scale, maxHp:(32 + level*10)*scale,
      speed:(31 + level*1.45) * (type === 'golem' ? .65 : type === 'bat' ? 1.28 : 1),
      type, bob:Math.random()*Math.PI*2, slow:1
    });
  }

  function columnForX(x) { return Math.max(0, Math.min(5, Math.round((x - 118) / 92))); }
  function hitEnemy(enemy, damage, color, tower, splash = false) {
    enemy.hp -= damage;
    wave.shots.push({x1:towerX(tower.c),y1:laneY(tower.r),x2:enemy.x,y2:laneY(enemy.lane),life:.16,max:.16,color});
    if (splash) {
      wave.enemies.forEach(other => {
        if (other !== enemy && other.lane === enemy.lane && Math.abs(other.x-enemy.x)<58) other.hp -= damage*.42;
      });
    }
  }

  function updateWave(dt) {
    if (!wave) return;
    wave.elapsed += dt;
    wave.spawnTimer -= dt;
    if (wave.spawnRemaining > 0 && wave.spawnTimer <= 0) {
      spawnEnemy(); wave.spawnRemaining--; wave.spawnTimer = Math.max(.42, .95 - level*.018) + Math.random()*.25;
    }

    // Passive ice walls.
    wave.enemies.forEach(e => {
      e.slow = 1;
      wave.towers.forEach(t => {
        if (t.type !== 'ice' || t.r !== e.lane) return;
        if (Math.abs(e.x - towerX(t.c)) < 110) e.slow = Math.min(e.slow, Math.max(.42, .73 - t.level*.07));
      });
      e.x -= e.speed * e.slow * dt;
      e.bob += dt*4;
    });

    // Active towers.
    wave.towers.forEach(t => {
      if (t.type === 'ice' || t.type === 'wood' || t.type === 'gold') return;
      t.cooldown -= dt;
      if (t.cooldown > 0) return;
      let candidates = [];
      if (t.type === 'copper') candidates = wave.enemies.filter(e => Math.abs(e.lane-t.r)<=1 && e.x > 35);
      if (t.type === 'iron') candidates = wave.enemies.filter(e => e.lane===t.r && e.x > 35);
      if (t.type === 'fire') candidates = wave.enemies.filter(e => columnForX(e.x)===t.c && e.x > 35);
      if (!candidates.length) return;
      candidates.sort((a,b)=>a.x-b.x);
      const target = candidates[0];
      const boost = t.boost || 1;
      if (t.type === 'copper') {
        hitEnemy(target,(7+t.level*5)*boost,DATA.copper.color,t,false);
        t.cooldown = Math.max(.28,.83-t.level*.07);
      } else if (t.type === 'iron') {
        hitEnemy(target,(16+t.level*9)*boost,DATA.iron.color,t,true);
        t.cooldown = Math.max(.65,1.55-t.level*.1);
      } else if (t.type === 'fire') {
        hitEnemy(target,(13+t.level*7)*boost,DATA.fire.color,t,false);
        t.cooldown = Math.max(.48,1.15-t.level*.07);
      }
    });

    // Dead enemies and score.
    for (let i=wave.enemies.length-1;i>=0;i--) {
      const e = wave.enemies[i];
      if (e.hp <= 0) {
        score += 20 + level*4;
        wave.particles.push({x:e.x,y:laneY(e.lane),life:.55,color:'#ff8a3d'});
        wave.enemies.splice(i,1); tone(350+Math.random()*120,.04);
      } else if (e.x < 48) {
        baseHP = Math.max(0,baseHP-1);
        wave.enemies.splice(i,1);
        showToast('Un mostro ha colpito la base!'); tone(100,.18);
        if (baseHP <= 0) { endGame(); return; }
      }
    }
    wave.shots.forEach(s => s.life -= dt); wave.shots = wave.shots.filter(s=>s.life>0);
    wave.particles.forEach(p => p.life -= dt); wave.particles = wave.particles.filter(p=>p.life>0);
    $('enemy-count').textContent = `${wave.enemies.length + wave.spawnRemaining} nemici`;
    updateHUD();

    if (wave.spawnRemaining <= 0 && wave.enemies.length === 0 && phase === 'wave') winWave();
  }

  function drawBattle() {
    ctx.clearRect(0,0,W,H);
    const bg = ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#14141c'); bg.addColorStop(1,'#09090d'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    // lane grid
    ctx.strokeStyle='rgba(255,255,255,.055)'; ctx.lineWidth=1;
    for(let r=0;r<SIZE;r++){const y=laneY(r)+31;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(let c=0;c<SIZE;c++){const x=towerX(c);ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,H-18);ctx.stroke();}
    // base
    ctx.fillStyle='#211317';ctx.fillRect(18,23,42,H-46);ctx.fillStyle='#ff5a1f';ctx.fillRect(52,23,4,H-46);
    ctx.fillStyle='#ff8650';ctx.font='900 13px system-ui';ctx.save();ctx.translate(40,H/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText('MEDUSA BASE',0,0);ctx.restore();

    const towers = wave?.towers || structureSnapshot();
    towers.forEach(t=>{
      const x=towerX(t.c),y=laneY(t.r),d=DATA[t.type];
      ctx.save();ctx.translate(x,y);ctx.fillStyle='rgba(8,8,12,.8)';ctx.strokeStyle=d.color;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-22,-22,44,44,10);ctx.fill();ctx.stroke();
      ctx.fillStyle=d.color;ctx.font='900 22px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d.structure,0,0);
      ctx.fillStyle='#fff';ctx.font='800 8px system-ui';ctx.fillText('L'+t.level,15,-15);ctx.restore();
    });

    (wave?.enemies||[]).forEach(e=>{
      const y=laneY(e.lane)+Math.sin(e.bob)*3;
      ctx.save();ctx.translate(e.x,y);
      const color=e.type==='golem'?'#a26bff':e.type==='bat'?'#ff67a8':'#7dff8a';
      ctx.fillStyle=color;ctx.strokeStyle='#08080c';ctx.lineWidth=3;
      if(e.type==='bat'){
        ctx.beginPath();ctx.moveTo(-19,0);ctx.quadraticCurveTo(-7,-18,0,-3);ctx.quadraticCurveTo(7,-18,19,0);ctx.quadraticCurveTo(8,9,0,5);ctx.quadraticCurveTo(-8,9,-19,0);ctx.fill();ctx.stroke();
      }else{
        const s=e.type==='golem'?25:18;ctx.beginPath();ctx.roundRect(-s,-s*.8,s*2,s*1.6,10);ctx.fill();ctx.stroke();
        ctx.fillStyle='#0b0b0e';ctx.fillRect(-9,-4,5,5);ctx.fillRect(4,-4,5,5);
      }
      const hp=Math.max(0,e.hp/e.maxHp);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(-20,-31,40,4);ctx.fillStyle=color;ctx.fillRect(-20,-31,40*hp,4);ctx.restore();
    });
    (wave?.shots||[]).forEach(s=>{ctx.globalAlpha=Math.max(0,s.life/s.max);ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();ctx.globalAlpha=1;});
    (wave?.particles||[]).forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.55);ctx.fillStyle=p.color;for(let k=0;k<7;k++){const a=k/7*Math.PI*2;ctx.fillRect(p.x+Math.cos(a)*(1-p.life)*35,p.y+Math.sin(a)*(1-p.life)*35,4,4);}ctx.globalAlpha=1;});
  }

  function drawIdle() { wave = null; drawBattle(); }

  function waveFrame(now) {
    if (!opened || phase !== 'wave' || !wave) return;
    const dt = Math.min(.05,(now-(lastTime||now))/1000); lastTime=now;
    updateWave(dt); drawBattle();
    if (phase === 'wave') raf=requestAnimationFrame(waveFrame);
  }

  function winWave() {
    cancelAnimationFrame(raf);
    const completed = level;
    score += 100 * completed;
    level++;
    if (level > best) { best=level; try{localStorage.setItem(storageKey,String(best));}catch{} }
    moves = 5;
    wave = null;
    updateHUD();
    tone(880,.18); showToast(`Orda ${completed} superata!`);
    if (completed % 10 === 0) {
      phase='workshop';
      setPhaseUI(); renderBoard(); drawIdle();
      announce(`Livello ${completed} completato. Officina sbloccata.`);
    } else {
      phase='build';
      setPhaseUI(); renderBoard(); drawIdle();
      announce(`Orda superata. Livello ${level}. Hai cinque nuove mosse.`);
    }
  }

  function endGame() {
    cancelAnimationFrame(raf); phase='gameover'; wave=null;
    if (level > best) { best=level; try{localStorage.setItem(storageKey,String(best));}catch{} }
    setPhaseUI(); renderBoard(); drawIdle();
    announce(`Partita terminata al livello ${level}.`);
  }

  async function finishWorkshop() {
    if (phase !== 'workshop') return;
    board = board.map(t => t.kind === 'empty' ? randomMaterial() : t);
    renderBoard();
    await resolveMatches(null,true);
    phase='build'; moves=5; selected=null; ensurePlayable(); setPhaseUI(); renderBoard();
    showToast('Officina chiusa: 5 nuove mosse');
  }

  function open() {
    if (!dialog.showModal) return;
    if (!initialized) resetGame();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('game-open'); opened=true;
    renderBoard(); setPhaseUI();
    if (phase==='wave' && wave) { lastTime=0; cancelAnimationFrame(raf); raf=requestAnimationFrame(waveFrame); } else drawBattle();
  }
  function close() {
    opened=false; cancelAnimationFrame(raf); dialog.close(); document.body.classList.remove('game-open');
  }

  boardEl.addEventListener('click', e => {
    const tile=e.target.closest('.tile'); if(!tile || tile.disabled) return;
    handleTile(Number(tile.dataset.index));
  });
  finishWorkshopBtn.addEventListener('click', finishWorkshop);
  $('restart-game').addEventListener('click', resetGame);
  $('close-game').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => { if(e.target===dialog) close(); });
  window.addEventListener('keydown', e => { if(e.key==='Escape' && dialog.open){e.preventDefault();close();} });

  window.Forgefall={open,reset:resetGame};
})();
