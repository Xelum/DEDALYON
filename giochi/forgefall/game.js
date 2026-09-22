(() => {
  'use strict';

  const SIZE = 6;
  const START_MOVES = 5;
  const START_HP = 5;
  const TYPES = ['ice','copper','iron','fire','wood'];

  const DATA = {
    ice: {
      material: 'Cristallo di ghiaccio', structure: 'Muro glaciale', role: 'Controllo',
      description: 'Tre cristalli generano un muro glaciale. Durante l’orda rallenta i mostri nella sua corsia e li danneggia mentre lo colpiscono.',
      damage: lv => `${(1.6 + lv * .7).toFixed(1)}/s`, cadence: () => 'Continua', target: () => 'Stessa corsia', effect: lv => `Rallenta ${26 + lv * 7}%`
    },
    copper: {
      material: 'Lingotto di rame', structure: 'Torre degli arcieri', role: 'Copertura',
      description: 'Tre lingotti di rame generano una torre degli arcieri. Copre la propria corsia e le due corsie adiacenti.',
      damage: lv => `${8 + lv * 6}`, cadence: lv => `${Math.max(.3,.86-lv*.08).toFixed(2)} s`, target: () => 'Corsia ±1', effect: () => 'Tiro rapido'
    },
    iron: {
      material: 'Lingotto di ferro', structure: 'Cannone d’assedio', role: 'Danno ad area',
      description: 'Tre lingotti di ferro generano un cannone. Colpisce i nemici sulla stessa fascia con un’esplosione ad area.',
      damage: lv => `${18 + lv * 11}`, cadence: lv => `${Math.max(.62,1.55-lv*.11).toFixed(2)} s`, target: () => 'Stessa fascia', effect: lv => `Area ${44 + lv * 5}px`
    },
    fire: {
      material: 'Nucleo di fuoco', structure: 'Balestra ardente', role: 'DPS',
      description: 'Tre nuclei di fuoco generano una balestra ardente. Spara rapidamente lungo la propria corsia.',
      damage: lv => `${13 + lv * 8}`, cadence: lv => `${Math.max(.38,1.05-lv*.08).toFixed(2)} s`, target: () => 'Stessa corsia', effect: () => 'Tiro rapido'
    },
    wood: {
      material: 'Fascio di legname', structure: 'Cassa del fabbro', role: 'Supporto',
      description: 'Tre fasci di legname generano una cassa. Tocca APRI per ottenere casualmente +2, +3 o +4 mosse.',
      damage: () => '—', cadence: () => '—', target: () => '—', effect: () => '+2 / +3 / +4 mosse'
    },
  };

  const ASSET = {
    mat_ice: 'assets/opt/mat_ice.webp',
    mat_copper: 'assets/opt/mat_copper.webp',
    mat_iron: 'assets/opt/mat_iron.webp',
    mat_fire: 'assets/opt/mat_fire.webp',
    mat_wood: 'assets/opt/mat_wood.webp',
    copper_1: 'assets/opt/copper_1.webp',
    copper_2: 'assets/opt/copper_2.webp',
    copper_3: 'assets/opt/copper_3.webp',
    copper_4: 'assets/opt/copper_4.webp',
    copper_5: 'assets/opt/copper_5.webp',
    iron_1: 'assets/opt/iron_1.webp',
    iron_2: 'assets/opt/iron_2.webp',
    iron_3: 'assets/opt/iron_3.webp',
    iron_4: 'assets/opt/iron_4.webp',
    iron_5: 'assets/opt/iron_5.webp',
    fire_1: 'assets/opt/fire_1.webp',
    fire_2: 'assets/opt/fire_2.webp',
    fire_3: 'assets/opt/fire_3.webp',
    fire_4: 'assets/opt/fire_4.webp',
    fire_5: 'assets/opt/fire_5.webp',
    wood_1: 'assets/opt/wood_1.webp',
    wood_2: 'assets/opt/wood_2.webp',
    wood_3: 'assets/opt/wood_3.webp',
    wood_4: 'assets/opt/wood_4.webp',
    wood_5: 'assets/opt/wood_5.webp',
    ice_1: 'assets/opt/ice_1.webp',
    ice_2: 'assets/opt/ice_2.webp',
    ice_3: 'assets/opt/ice_3.webp',
    ice_4: 'assets/opt/ice_4.webp',
    ice_5: 'assets/opt/ice_5.webp',
    enemy_shade: 'assets/opt/enemy_shade_back.webp',
    enemy_runner: 'assets/opt/enemy_runner_back.webp',
    enemy_brute: 'assets/opt/enemy_brute_back.webp',
    enemy_boss: 'assets/opt/enemy_boss_back.webp'
  };

  const isMobileLite = matchMedia('(max-width: 820px)').matches || ((navigator.deviceMemory || 8) <= 4);
  document.documentElement.classList.toggle('mobile-lite', isMobileLite);

  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const enemyLayer = $('enemy-layer');
  const shotLayer = $('shot-layer');
  const selectionDock = $('selection-dock');
  const selectionImg = $('selection-img');
  const selectionKind = $('selection-kind');
  const selectionName = $('selection-name');
  const infoBtn = $('info-btn');
  const openChestBtn = $('open-chest-btn');
  const infoDialog = $('info-dialog');
  const gameoverDialog = $('gameover-dialog');
  const soundBtn = $('sound-btn');
  const toastEl = $('toast');
  const announceEl = $('announce');
  const announceKicker = $('announce-kicker');
  const announceTitle = $('announce-title');
  const announceSubtitle = $('announce-subtitle');
  const workshopBtn = $('workshop-btn');
  const preloader = $('preloader');
  const loadBar = $('load-progress-bar');
  const loadPercent = $('load-percent');
  const loadStatus = $('load-status');
  let audioCtx = null;
  const BG_NATIVE_W = 1920;
  const BG_NATIVE_H = 1080;
  // Exact 6x6 grass grid region inside arena_bg.png.
  const GRID_NATIVE = { x: 500, y: 270, w: 990, h: 525 };

  function syncBoardGeometry(){
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const root = document.documentElement;

    // Desktop / landscape: align hitboxes exactly over the generated 6x6 grass board.
    if(vw >= 900 && vw / vh >= 1.18){
      const scale = Math.max(vw / BG_NATIVE_W, vh / BG_NATIVE_H);
      const renderedW = BG_NATIVE_W * scale;
      const renderedH = BG_NATIVE_H * scale;
      const offsetX = (vw - renderedW) / 2;
      const offsetY = (vh - renderedH) / 2;
      const left = offsetX + GRID_NATIVE.x * scale;
      const top = offsetY + GRID_NATIVE.y * scale;
      const width = GRID_NATIVE.w * scale;
      const height = GRID_NATIVE.h * scale;
      root.style.setProperty('--board-left', `${left}px`);
      root.style.setProperty('--board-top', `${top}px`);
      root.style.setProperty('--board-width', `${width}px`);
      root.style.setProperty('--board-height', `${height}px`);
      root.style.setProperty('--board-transform', 'none');
      root.style.setProperty('--phase-top', `${Math.max(92, top - 42)}px`);
    } else {
      // Mobile fallback keeps all 36 positions usable without overflow.
      const width = Math.min(vw * .92, 560);
      const height = Math.min(vh * .47, width * .86);
      const left = (vw - width) / 2;
      const top = Math.max(130, vh * .235);
      root.style.setProperty('--board-left', `${left}px`);
      root.style.setProperty('--board-top', `${top}px`);
      root.style.setProperty('--board-width', `${width}px`);
      root.style.setProperty('--board-height', `${height}px`);
      root.style.setProperty('--board-transform', 'none');
      root.style.setProperty('--phase-top', `${Math.max(92, top - 34)}px`);
    }
  }
  syncBoardGeometry();
  window.addEventListener('resize', syncBoardGeometry, {passive:true});


  let board = [];
  let selected = null;
  let dragStart = null;
  let busy = false;
  let day = 1;
  let moves = START_MOVES;
  let hp = START_HP;
  let score = 0;
  let phase = 'build';
  let wave = null;
  let toastTimer = 0;
  let announceTimer = 0;

  const rc = i => ({r:Math.floor(i/SIZE),c:i%SIZE});
  const idx = (r,c) => r*SIZE+c;
  const rand = n => Math.floor(Math.random()*n);
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  let nextUid = 1;
  const tag = tile => tile.kind==='empty' ? tile : ({...tile, uid: tile.uid || nextUid++});
  const empty = () => ({kind:'empty'});
  const material = () => tag({kind:'material',type:TYPES[rand(TYPES.length)]});
  const adjacent = (a,b) => {
    const A=rc(a),B=rc(b);
    return Math.abs(A.r-B.r)+Math.abs(A.c-B.c)===1;
  };
  const same = (a,b) => !!a && !!b && a.kind!=='empty' && b.kind!=='empty' && a.kind===b.kind && a.type===b.type && (a.kind==='material' || a.level===b.level);

  function assetFor(tile){
    if(!tile || tile.kind==='empty') return '';
    if(tile.kind==='material') return ASSET[`mat_${tile.type}`];
    return ASSET[`${tile.type}_${Math.min(tile.level||1,5)}`] || ASSET[`${tile.type}_5`] || ASSET[`${tile.type}_1`];
  }

  function boardCellEl(i){ return boardEl.querySelector(`.cell[data-index="${i}"]`); }
  function towerCellEl(t){ return boardCellEl(idx(t.r,t.c)); }
  function pulseTower(t,type){
    const cell=towerCellEl(t); if(!cell) return;
    const cls = type==='iron' ? 'firing-iron' : type==='fire' ? 'firing-fire' : 'firing-copper';
    cell.classList.remove(cls); void cell.offsetWidth; cell.classList.add(cls);
    setTimeout(()=>cell.classList.remove(cls), 220);
  }

  async function animateSwapVisual(a,b){
    const ca=boardCellEl(a), cb=boardCellEl(b);
    if(!ca || !cb) return wait(180);
    const ra=ca.getBoundingClientRect(), rb=cb.getBoundingClientRect(), rp=boardEl.getBoundingClientRect();
    const layer=document.createElement('div'); layer.className='board-fx';
    const ga=ca.cloneNode(true), gb=cb.cloneNode(true);
    ga.classList.add('ghost'); gb.classList.add('ghost');
    [ga,gb].forEach(g=>{g.style.width=`${ra.width}px`; g.style.height=`${ra.height}px`;});
    ga.style.left=`${ra.left-rp.left}px`; ga.style.top=`${ra.top-rp.top}px`;
    gb.style.left=`${rb.left-rp.left}px`; gb.style.top=`${rb.top-rp.top}px`;
    layer.append(ga,gb); boardEl.append(layer);
    ca.classList.add('swap-hide'); cb.classList.add('swap-hide');
    requestAnimationFrame(()=>{
      ga.style.transform=`translate(${rb.left-ra.left}px, ${rb.top-ra.top}px)`;
      gb.style.transform=`translate(${ra.left-rb.left}px, ${ra.top-rb.top}px)`;
    });
    await wait(220);
    ca.classList.remove('swap-hide'); cb.classList.remove('swap-hide');
    layer.remove();
  }


  function loadImage(url){
    return new Promise(resolve=>{
      const img=new Image();
      img.decoding='async';
      img.onload=async()=>{try{if(img.decode) await img.decode();}catch(_){} resolve(true);};
      img.onerror=()=>resolve(false);
      img.src=url;
    });
  }

  async function preloadGameAssets(){
    const bg = isMobileLite ? 'assets/arena_bg_mobile.webp' : 'assets/arena_bg.webp';
    const urls=[bg,...new Set(Object.values(ASSET))];
    let done=0;
    const update=()=>{
      const pct=Math.round((done/urls.length)*100);
      if(loadBar) loadBar.style.width=`${pct}%`;
      if(loadPercent) loadPercent.textContent=`${pct}%`;
      if(loadStatus) loadStatus.textContent=pct<35?'Caricamento della mappa…':pct<80?'Preparazione delle difese…':'Il bastione è quasi pronto…';
    };
    update();
    const queue=[...urls];
    const workers=Array.from({length:Math.min(isMobileLite?4:8,queue.length)},async()=>{
      while(queue.length){
        const url=queue.shift();
        await loadImage(url);
        done++; update();
      }
    });
    await Promise.all(workers);
  }

  function registerAssetCache(){
    if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const run=()=>navigator.serviceWorker.register('./sw.js').catch(()=>{});
    if('requestIdleCallback' in window) requestIdleCallback(run,{timeout:2500}); else setTimeout(run,1200);
  }

  function ensureAudio(){
    if(audioCtx) return audioCtx;
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A) return null;
    audioCtx=new A();
    return audioCtx;
  }
  async function tone(freq=440,dur=.07,gain=.025,type='sine'){
    if(soundBtn.getAttribute('aria-pressed')!=='true') return;
    const ac=ensureAudio(); if(!ac) return;
    if(ac.state==='suspended') await ac.resume();
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;g.gain.value=gain;o.connect(g);g.connect(ac.destination);
    const now=ac.currentTime;g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.001,now+dur);o.start(now);o.stop(now+dur);
  }
  soundBtn.addEventListener('click',async()=>{
    const on=soundBtn.getAttribute('aria-pressed')==='true';
    soundBtn.setAttribute('aria-pressed',String(!on));
    soundBtn.textContent=on?'♪':'♫';
    if(!on) await tone(620,.1,.04);
  });

  function showToast(text){
    toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2800);
  }
  function showAnnouncement(title, subtitle='', kicker='FORGEFALL', duration=2400){
    announceKicker.textContent=kicker;
    announceTitle.textContent=title;
    announceSubtitle.textContent=subtitle;
    announceEl.hidden=false;
    announceEl.classList.add('show');
    clearTimeout(announceTimer);
    announceTimer=setTimeout(()=>{ announceEl.classList.remove('show'); setTimeout(()=>announceEl.hidden=true, 220); }, duration);
  }

  function updateHUD(){
    $('hud-day').textContent=day;
    $('hud-moves').textContent=phase==='workshop'?'∞':moves;
    $('hud-hearts').textContent='♥'.repeat(hp)+'♡'.repeat(Math.max(0,START_HP-hp));
    $('hud-score').textContent=score.toLocaleString('it-IT');
    $('final-day').textContent=day;
    $('final-score').textContent=score.toLocaleString('it-IT');
    const pill=$('phase-pill');
    if(phase==='build'){pill.textContent=`GIORNO ${day} · PREPARA LE DIFESE`;pill.style.background='rgba(24,89,44,.90)';}
    else if(phase==='wave'){pill.textContent=`ORDA ${day} · RESISTI`;pill.style.background='rgba(176,65,45,.92)';}
    else if(phase==='workshop'){pill.textContent='OFFICINA · SCAMBI ILLIMITATI';pill.style.background='rgba(169,132,39,.92)';}
    else {pill.textContent='IL BASTIONE È CADUTO';pill.style.background='rgba(129,35,31,.92)';}
    workshopBtn.hidden=phase!=='workshop';
  }

  function makeInitialBoard(){
    board=[];
    for(let i=0;i<SIZE*SIZE;i++){
      const {r,c}=rc(i); let t,guard=0;
      do{t=material();guard++;}while(guard<30 && ((c>=2&&board[idx(r,c-1)]?.type===t.type&&board[idx(r,c-2)]?.type===t.type)||(r>=2&&board[idx(r-1,c)]?.type===t.type&&board[idx(r-2,c)]?.type===t.type)));
      board.push(t);
    }
  }

  function renderBoard(spawned=[],matching=[]){
    const frag=document.createDocumentFragment();
    board.forEach((tile,i)=>{
      const cell=document.createElement('button');
      cell.type='button';cell.className='cell';cell.dataset.index=i;
      if(tile.kind) cell.classList.add(tile.kind);
      if(tile.type) cell.classList.add(`type-${tile.type}`);
      if(selected===i) cell.classList.add('selected');
      if(spawned.includes(i)) cell.classList.add('spawn');
      if(matching.includes(i)) cell.classList.add('matching');
      if(tile.kind==='structure') cell.classList.add(`level-${tile.level}`);
      cell.disabled=busy||phase==='wave'||phase==='gameover';
      if(tile.kind!=='empty'){
        const img=document.createElement('img');img.className='asset';img.src=assetFor(tile);img.alt='';img.decoding='async';img.draggable=false;cell.append(img);
        if(tile.kind==='structure'){
          const badge=document.createElement('span');badge.className='level-badge';badge.textContent=tile.level;cell.append(badge);
          if(tile.type==='wood'){
            const hint=document.createElement('span');hint.className='chest-open-hint';hint.textContent='APRI';cell.append(hint);
          }
        }
      }
      frag.append(cell);
    });
    boardEl.replaceChildren(frag);
  }

  function findMatches(){
    const runs=[];
    for(let r=0;r<SIZE;r++){
      let start=0;
      for(let c=1;c<=SIZE;c++){
        const a=board[idx(r,c-1)],b=c<SIZE?board[idx(r,c)]:null;
        if(c<SIZE&&same(a,b)) continue;
        if(c-start>=3&&board[idx(r,start)].kind!=='empty') runs.push(Array.from({length:c-start},(_,k)=>idx(r,start+k)));
        start=c;
      }
    }
    for(let c=0;c<SIZE;c++){
      let start=0;
      for(let r=1;r<=SIZE;r++){
        const a=board[idx(r-1,c)],b=r<SIZE?board[idx(r,c)]:null;
        if(r<SIZE&&same(a,b)) continue;
        if(r-start>=3&&board[idx(start,c)].kind!=='empty') runs.push(Array.from({length:r-start},(_,k)=>idx(start+k,c)));
        start=r;
      }
    }
    const groups=[];
    runs.forEach(run=>{
      const hits=[];groups.forEach((g,gi)=>{if(run.some(i=>g.includes(i))) hits.push(gi);});
      if(!hits.length) groups.push([...run]);
      else{const merged=new Set(run);hits.reverse().forEach(gi=>{groups[gi].forEach(i=>merged.add(i));groups.splice(gi,1);});groups.push([...merged]);}
    });
    return groups;
  }

  function collapse(refill=true){
    const spawned=[];
    for(let c=0;c<SIZE;c++){
      const kept=[];
      for(let r=SIZE-1;r>=0;r--){const t=board[idx(r,c)];if(t.kind!=='empty') kept.push(t);}
      let r=SIZE-1;kept.forEach(t=>board[idx(r--,c)]=t);
      while(r>=0){const i=idx(r--,c);board[i]=refill?material():empty();if(refill) spawned.push(i);}
    }
    return spawned;
  }

  async function resolveMatches(preferred=null,refill=true){
    let loops=0;
    while(loops++<12){
      const groups=findMatches();if(!groups.length) break;
      const all=[...new Set(groups.flat())];renderBoard([],all);await tone(760,.07,.025);await wait(160);
      groups.forEach((group, gi)=>{
        const source=board[group[0]];if(!source||source.kind==='empty') return;
        let target=(preferred!=null&&group.includes(preferred))?preferred:group[Math.floor(group.length/2)];
        const next=source.kind==='material'?{kind:'structure',type:source.type,level:1}:{kind:'structure',type:source.type,level:Math.min((source.level||1)+1,5)};
        if(next.type==='wood') next.bonus=2+rand(3);
        group.forEach(i=>board[i]=empty());board[target]=tag(next);
        score+=source.kind==='material'?100+(group.length-3)*35:170*next.level;
        const builtText = source.kind==='material' ? `Hai appena costruito ${DATA[next.type].structure}` : `${DATA[next.type].structure} livello ${next.level}`;
        showToast(source.kind==='material'?`${DATA[next.type].structure.toUpperCase()} CREATA`:`${DATA[next.type].structure.toUpperCase()} · LIVELLO ${next.level}`);
        if(gi===0){
          showAnnouncement(source.kind==='material' ? 'Grande!' : 'Upgrade!', builtText, source.kind==='material' ? 'NUOVA STRUTTURA' : 'STRUTTURA POTENZIATA');
        }
      });
      const spawned=collapse(refill);updateHUD();renderBoard(spawned);await wait(180);preferred=null;if(!refill) break;
    }
  }

  async function performSwap(a,b){
    if(busy||!adjacent(a,b)||!['build','workshop'].includes(phase)) return;
    busy=true;selected=null;updateSelection();await animateSwapVisual(a,b);[board[a],board[b]]=[board[b],board[a]];renderBoard();await tone(420,.04,.02);
    if(phase==='build'){moves=Math.max(0,moves-1);updateHUD();}
    await wait(80);await resolveMatches(b,phase==='build');renderBoard();busy=false;
    if(phase==='build'&&moves<=0){await wait(350);startWave();}
  }

  async function openChest(index){
    if(busy||!['build','workshop'].includes(phase)) return;
    const tile=board[index];if(!tile||tile.kind!=='structure'||tile.type!=='wood') return;
    busy=true;
    const bonus=tile.bonus||2+rand(3);
    const cell=boardCellEl(index);
    showAnnouncement('Stai aprendo', 'Cassa del fabbro', 'CASSA SPECIALE', 1700);
    if(cell){ cell.classList.add('matching'); setTimeout(()=>cell.classList.remove('matching'), 240); }
    await tone(980,.1,.04);
    await wait(320);
    moves+=bonus;score+=50*Math.max(1,tile.level);board[index]=empty();collapse(phase==='build');selected=null;updateSelection();
    showToast(`CASSA APERTA · +${bonus} MOSSE`);
    showAnnouncement(`+${bonus} MOSSE`, 'La cassa del fabbro ti aiuta', 'RICOMPENSA', 1900);
    updateHUD();
    await resolveMatches(null,phase==='build');renderBoard();busy=false;
  }

  function updateSelection(){
    const tile=selected!=null?board[selected]:null;
    if(!tile||tile.kind==='empty'){selectionDock.hidden=true;return;}
    selectionDock.hidden=false;selectionImg.src=assetFor(tile);
    selectionKind.textContent=tile.kind==='material'?'MATERIALE':`DIFESA · LIVELLO ${tile.level}`;
    selectionName.textContent=tile.kind==='material'?DATA[tile.type].material:DATA[tile.type].structure;
    openChestBtn.hidden=!(tile.kind==='structure'&&tile.type==='wood'&&['build','workshop'].includes(phase));
  }

  function selectTile(index){
    if(busy||phase==='wave'||phase==='gameover') return;
    const tile=board[index];if(!tile||tile.kind==='empty'){selected=null;updateSelection();renderBoard();return;}
    if(selected===index&&tile.kind==='structure'&&tile.type==='wood'){openChest(index);return;}
    selected=index;updateSelection();renderBoard();tone(320,.035,.015);
  }

  boardEl.addEventListener('pointerdown',e=>{
    const cell=e.target.closest('.cell');if(!cell||busy||phase==='wave'||phase==='gameover') return;
    dragStart={index:+cell.dataset.index,x:e.clientX,y:e.clientY};
  });
  boardEl.addEventListener('pointerup',e=>{
    if(!dragStart) return;const s=dragStart;dragStart=null;const dx=e.clientX-s.x,dy=e.clientY-s.y;
    if(Math.hypot(dx,dy)>18){const {r,c}=rc(s.index);let nr=r,nc=c;if(Math.abs(dx)>Math.abs(dy))nc+=dx>0?1:-1;else nr+=dy>0?1:-1;if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE)performSwap(s.index,idx(nr,nc));}
    else selectTile(s.index);
  });
  boardEl.addEventListener('pointercancel',()=>dragStart=null);

  function openInfo(){
    if(selected==null) return;const tile=board[selected];if(!tile||tile.kind==='empty') return;const d=DATA[tile.type];const level=tile.kind==='structure'?tile.level:1;
    $('info-img').src=assetFor(tile);$('info-kind').textContent=tile.kind==='material'?'MATERIALE':`DIFESA · LIVELLO ${level}`;$('info-title').textContent=tile.kind==='material'?d.material:d.structure;$('info-subtitle').textContent=tile.kind==='material'?`Crea: ${d.structure}`:`${d.role} · livello ${level}`;$('info-description').textContent=d.description;
    const stats=tile.kind==='material'?[['RISULTATO',d.structure],['RUOLO',d.role],['FUSIONE','3 uguali']]:[['DANNO',d.damage(level)],['CADENZA',d.cadence(level)],['BERSAGLIO',d.target(level)],['EFFETTO',d.effect(level)],['LIVELLO',String(level)],['UPGRADE','3 difese uguali']];
    $('info-stats').innerHTML=stats.map(([k,v])=>`<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`).join('');
    if(!infoDialog.open) infoDialog.showModal();
  }
  infoBtn.addEventListener('click',openInfo);$('info-close').addEventListener('click',()=>infoDialog.close());openChestBtn.addEventListener('click',()=>selected!=null&&openChest(selected));

  function snapshotDefenses(){
    const towers=[];board.forEach((t,i)=>{if(t.kind!=='structure')return;const {r,c}=rc(i);towers.push({type:t.type,level:t.level,r,c,cooldown:Math.random()*.25,boost:1,hp:t.type==='ice'?75+t.level*48:0,maxHp:t.type==='ice'?75+t.level*48:0});});
    return towers;
  }

  function startWave(){
    phase='wave';selected=null;updateSelection();renderBoard();updateHUD();
    const count=5+day*2;wave={towers:snapshotDefenses(),enemies:[],spawnLeft:count+(day%10===0?1:0),spawnTimer:.3,nextId:1,bossPending:day%10===0,ended:false};
    showToast(day%10===0?'BOSS IN ARRIVO':'L’ORDA È IN MARCIA');
  }

  function boardRect(){return boardEl.getBoundingClientRect();}
  function enemyElement(e){
    const el=document.createElement('div');el.className=`enemy ${e.type} ${e.type==='boss'?'boss':''}`;el.dataset.id=e.id;
    el.style.setProperty('--flip', e.flip < 0 ? -1 : 1);
    el.style.setProperty('--yaw', `${e.yaw}deg`);
    const img=document.createElement('img');img.src=ASSET[`enemy_${e.type}`]||ASSET.enemy_shade;
    const hpbar=document.createElement('span');hpbar.className='enemy-health';hpbar.innerHTML='<i></i>';
    el.append(img,hpbar);enemyLayer.append(el);e.el=el;return el;
  }
  function spawnEnemy(forceBoss=false){
    const type=forceBoss ? 'boss' : (day>=5 && Math.random()>.74 ? 'brute' : day>=3 && Math.random()<.28 ? 'runner' : 'shade');
    const lane=rand(SIZE);const base=42+day*8;const stat={shade:{hp:base,speed:.066,damage:1},runner:{hp:base*.72,speed:.092,damage:1},brute:{hp:base*1.75,speed:.052,damage:1},boss:{hp:320+day*34,speed:.038,damage:2}}[type];
    const baseX=(lane+.5)/SIZE;
    const side = lane < (SIZE/2) ? 1 : -1;
    const yaw = side > 0 ? 4 : -4;
    const e={id:wave.nextId++,type,lane,baseX,x:baseX,y:1.08,hp:stat.hp,maxHp:stat.hp,speed:stat.speed,damage:stat.damage,blocked:false,step:Math.random()*6.28,flip:1,yaw};
    wave.enemies.push(e);enemyElement(e);
  }

  function towerCenter(t){return {x:(t.c+.5)/SIZE,y:(t.r+.5)/SIZE};}
  function addImpact(e,type='iron'){
    const rect=boardRect(); const fx=document.createElement('i'); fx.className=`impact ${type}`;
    fx.style.left=`${e.x*rect.width}px`; fx.style.top=`${e.y*rect.height}px`;
    shotLayer.append(fx); setTimeout(()=>fx.remove(), 280);
  }
  function addShot(t,e,type='iron'){
    const a=towerCenter(t), rect=boardRect(), s=document.createElement('i');
    s.className=`shot ${type}`;
    const ax=a.x*rect.width, ay=a.y*rect.height, bx=e.x*rect.width, by=e.y*rect.height;
    const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy), ang=Math.atan2(dy,dx)*180/Math.PI;
    s.style.left=`${ax}px`; s.style.top=`${ay}px`; s.style.width=`${len}px`; s.style.transform=`rotate(${ang}deg)`;
    shotLayer.append(s);
    setTimeout(()=>{ addImpact(e,type); s.remove(); }, type==='iron' ? 145 : 120);
  }

  function damageEnemy(e,dmg,tower,type){ e.hp-=dmg; if(tower){ pulseTower(tower,type); addShot(tower,e,type); } }

  function updateWave(dt){
    if(!wave||phase!=='wave') return;
    wave.spawnTimer-=dt;if(wave.spawnLeft>0&&wave.spawnTimer<=0){const boss=wave.bossPending;spawnEnemy(boss);if(boss)wave.bossPending=false;wave.spawnLeft--;wave.spawnTimer=boss?1.25:Math.max(.45,.9-day*.01);}

    wave.enemies.forEach(e=>{
      e.step += dt * (e.type==='runner' ? 10 : e.type==='boss' ? 4.2 : 6.2);
      const wall=wave.towers.filter(t=>t.type==='ice'&&t.c===e.lane&&t.hp>0).sort((a,b)=>b.r-a.r).find(t=>e.y>=t.r/SIZE-.02);
      const slow=wall?.level?Math.max(.35,1-(.26+wall.level*.07)):1;
      e.y-=e.speed*slow*dt;
      const swayAmp = e.type==='runner' ? .012 : e.type==='boss' ? .006 : .009;
      e.x = Math.max(.08, Math.min(.92, e.baseX + Math.sin(e.step) * swayAmp));
      if(wall&&Math.abs(e.y-(wall.r+.5)/SIZE)<.055){wall.hp-=dt*(8+e.damage*3);e.hp-=dt*(1.6+wall.level*.7);e.y+=(e.speed*slow*dt)*.65; e.x = e.baseX + Math.sin(e.step*1.5) * swayAmp*.4;}
    });
    wave.towers=wave.towers.filter(t=>t.type!=='ice'||t.hp>0);

    wave.towers.forEach(t=>{
      if(['ice','wood'].includes(t.type)) return;t.cooldown-=dt;if(t.cooldown>0)return;const tc=towerCenter(t);let cand=[];
      if(t.type==='copper')cand=wave.enemies.filter(e=>Math.abs(e.lane-t.c)<=1&&e.y<=tc.y+.45&&e.y>=tc.y-.38);
      if(t.type==='iron')cand=wave.enemies.filter(e=>Math.abs(e.y-tc.y)<.11);
      if(t.type==='fire')cand=wave.enemies.filter(e=>e.lane===t.c&&e.y<=tc.y+.5);
      if(!cand.length)return;cand.sort((a,b)=>a.y-b.y);const target=cand[0];
      if(t.type==='copper'){damageEnemy(target,(8+t.level*6)*t.boost,t,'copper');t.cooldown=Math.max(.3,.86-t.level*.08);}
      if(t.type==='iron'){const dmg=(18+t.level*11)*t.boost;damageEnemy(target,dmg,t,'iron');wave.enemies.forEach(o=>{if(o!==target&&Math.abs(o.y-target.y)<.08){o.hp-=dmg*.34;}});t.cooldown=Math.max(.62,1.55-t.level*.11);}
      if(t.type==='fire'){damageEnemy(target,(13+t.level*8)*t.boost,t,'fire');t.cooldown=Math.max(.38,1.05-t.level*.08);}
    });

    for(let i=wave.enemies.length-1;i>=0;i--){
      const e=wave.enemies[i];
      if(e.hp<=0){score+=e.type==='boss'?900+day*40:30+day*3;e.el?.remove();wave.enemies.splice(i,1);tone(e.type==='boss'?760:360,.05,.02);continue;}
      if(e.y<=-.06){hp=Math.max(0,hp-e.damage);e.el?.remove();wave.enemies.splice(i,1);showToast(e.type==='boss'?'IL BOSS HA SFONDATO · -2 ♥':'IL BASTIONE È STATO COLPITO');tone(120,.18,.05,'sawtooth');if(hp<=0){gameOver();return;}}
    }

    const rect=boardRect();wave.enemies.forEach(e=>{
      if(!e.el) return;
      const lean = (Math.sin(e.step*1.35) * (e.type==='runner' ? 3.6 : e.type==='brute' ? 3.1 : e.type==='boss' ? 2.5 : 2.8)) + (e.lane < (SIZE/2) ? 0.8 : -0.8);
      const scale = Math.max(.88, 1.08 - (1-e.y)*.18);
      e.el.style.left=`${e.x*100}%`; e.el.style.top=`${e.y*100}%`;
      e.el.style.setProperty('--lean', `${lean}deg`);
      e.el.style.setProperty('--scale', scale.toFixed(3));
      const bar=e.el.querySelector('.enemy-health i'); if(bar) bar.style.width=`${Math.max(0,e.hp/e.maxHp)*100}%`;
    });
    updateHUD();
    if(wave.spawnLeft===0&&wave.enemies.length===0&&!wave.ended){wave.ended=true;setTimeout(completeWave,350);}
  }

  function completeWave(){
    if(!wave)return;wave.enemies.forEach(e=>e.el?.remove());wave=null;enemyLayer.replaceChildren();shotLayer.replaceChildren();day++;moves=START_MOVES;phase=(day-1)%10===0?'workshop':'build';updateHUD();renderBoard();showToast(phase==='workshop'?'BOSS SUPERATO · OFFICINA SBLOCCATA':'ORDA RESPINTA · ALTRE 5 MOSSE');
  }

  function gameOver(){phase='gameover';updateHUD();renderBoard();enemyLayer.replaceChildren();wave=null;if(!gameoverDialog.open)gameoverDialog.showModal();}

  workshopBtn.addEventListener('click',()=>{if(phase!=='workshop')return;phase='build';moves=START_MOVES;updateHUD();showToast('OFFICINA TERMINATA · 5 MOSSE');});
  $('restart-btn').addEventListener('click',resetGame);$('again-btn').addEventListener('click',()=>{gameoverDialog.close();resetGame();});

  function resetGame(){
    enemyLayer.replaceChildren();shotLayer.replaceChildren();selected=null;busy=false;day=1;moves=START_MOVES;hp=START_HP;score=0;phase='build';wave=null;makeInitialBoard();updateSelection();updateHUD();renderBoard();if(gameoverDialog.open)gameoverDialog.close();
  }

  let last=performance.now();
  let lastPaint=0;
  const frameInterval=isMobileLite ? 1000/30 : 1000/60;
  function loop(now){
    if(now-lastPaint < frameInterval){requestAnimationFrame(loop);return;}
    const dt=Math.min((now-last)/1000,.05);last=now;lastPaint=now;
    if(phase==='wave') updateWave(dt);
    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange',()=>{
    document.documentElement.classList.toggle('tab-hidden',document.hidden);
    last=performance.now();
  });
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(infoDialog.open)infoDialog.close();if(gameoverDialog.open)gameoverDialog.close();}});

  async function boot(){
    await preloadGameAssets();
    resetGame();
    if(loadStatus) loadStatus.textContent='Pronto!';
    if(loadBar) loadBar.style.width='100%';
    if(loadPercent) loadPercent.textContent='100%';
    requestAnimationFrame(loop);
    setTimeout(()=>{if(preloader){preloader.classList.add('done');setTimeout(()=>preloader.remove(),420);}},120);
    registerAssetCache();
  }
  boot();
})();
