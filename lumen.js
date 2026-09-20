(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const dialog = $('game-dialog'), canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const overlay = $('game-overlay'), startButton = $('start-game'), pauseButton = $('pause-game');
  const H = 650, PI = Math.PI;
  let W = 1000;
  const storageKey = 'nadir-lumen-best-v1';
  let state = 'ready', player, objects = [], sparks = [], keys = new Set(), score = 0, best = 0, lives = 3;
  let elapsed = 0, nextRow = .7, nextOrb = .45, invulnerable = 0, targetX = null;
  let previous = 0, raf = 0, background;
  const backdrop = document.querySelector('.scene-cave img');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const random = (a, b) => a + Math.random() * (b - a);
  try { best = Math.max(0, Number(localStorage.getItem(storageKey)) || 0); } catch { /* Storage may be unavailable for private/file browsing. */ }
  $('game-best').textContent = String(Math.floor(best)).padStart(4, '0');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !ctx) return;
    const oldWidth = W;
    W = H * rect.width / rect.height;
    const ratio = W / oldWidth;
    if (player) { player.x *= ratio; player.trail.forEach((p) => p.x *= ratio); }
    objects.forEach((object) => object.x *= ratio);
    sparks.forEach((spark) => spark.x *= ratio);
    if (targetX !== null) targetX *= ratio;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    // Uniform world scaling preserves circular lights and fair hitboxes on portrait screens.
    background = null;
  }
  function updateHUD() {
    $('game-score').textContent = String(Math.floor(score)).padStart(4, '0');
    $('game-best').textContent = String(Math.floor(best)).padStart(4, '0');
    $('game-lives').textContent = '● '.repeat(lives).trim() + (lives < 3 ? ' ' + '○ '.repeat(3 - lives).trim() : '');
    $('game-lives').setAttribute('aria-label', `${lives} ${lives === 1 ? 'vita' : 'vite'}`);
  }
  function announce(text) { $('game-announcement').textContent = text; }
  function showOverlay(kicker, title, copy, button) {
    $('game-overlay-kicker').textContent = kicker;
    $('game-overlay-title').innerHTML = title;
    $('game-overlay-copy').innerHTML = copy;
    startButton.replaceChildren(document.createTextNode(button + ' '));
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); startButton.append(arrow);
    overlay.hidden = false; startButton.focus();
  }
  function reset() {
    player = { x: W / 2, y: H * .79, trail: [] }; objects = []; sparks = []; keys.clear();
    score = 0; lives = 3; elapsed = 0; nextRow = .7; nextOrb = .4; invulnerable = 0; targetX = null;
    updateHUD();
  }
  function start() {
    if (state === 'paused') { resume(); return; }
    reset(); state = 'playing'; overlay.hidden = true; pauseButton.disabled = false;
    pauseButton.setAttribute('aria-label', 'Metti in pausa'); pauseButton.textContent = 'Ⅱ';
    canvas.focus(); announce('Partita iniziata. Raccogli la luce ed evita i frammenti. Hai tre vite.');
  }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; keys.clear(); targetX = null;
    pauseButton.setAttribute('aria-label', 'Riprendi il gioco'); pauseButton.textContent = '▷';
    showOverlay('IL MONDO PUÒ ASPETTARE.', 'Un respiro, poi si riparte.', 'La tua discesa è in pausa.', 'Riprendi');
    announce('Gioco in pausa.');
  }
  function resume() {
    state = 'playing'; overlay.hidden = true; pauseButton.textContent = 'Ⅱ';
    pauseButton.setAttribute('aria-label', 'Metti in pausa'); canvas.focus(); announce('Partita ripresa.');
  }
  function finish() {
    state = 'over'; pauseButton.disabled = true; keys.clear();
    const record = Math.floor(score) > best;
    if (record) { best = Math.floor(score); try { localStorage.setItem(storageKey, String(best)); } catch {} }
    updateHUD();
    showOverlay(record ? 'UN NUOVO RECORD NELL’ABISSO.' : 'OGNI DISCESA È UN NUOVO INIZIO.', `${Math.floor(score)} punti.`, `${Math.floor(elapsed * 8)} metri di discesa.<br>La luce può sempre tornare.`, 'Riprova');
    announce(`Partita conclusa. ${Math.floor(score)} punti. ${record ? 'Nuovo record locale.' : ''}`);
  }
  function open() {
    if (!ctx || !dialog.showModal) return;
    if (dialog.open) return;
    state = 'ready'; reset();
    document.body.classList.add('game-open'); dialog.showModal(); resize();
    pauseButton.disabled = true;
    showOverlay('UNA LUCE. NESSUN PASSO INDIETRO.', 'Quanto in basso<br>riesci ad arrivare?', 'Raccogli la luce. Evita i frammenti.<br>Hai tre vite per trovare la tua strada.', 'Inizia la discesa');
    previous = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function close() {
    cancelAnimationFrame(raf); state = 'ready'; keys.clear(); targetX = null;
    dialog.close(); document.body.classList.remove('game-open');
  }

  function addRow() {
    const safeLane = Math.floor(random(0, 5));
    const difficulty = Math.min(1, elapsed / 55);
    for (let lane = 0; lane < 5; lane++) {
      if (lane === safeLane || Math.random() > .46 + difficulty * .3) continue;
      objects.push({ kind: 'rock', x: W * (.14 + lane * .18 + random(-.02, .02)), y: -65,
        r: random(29, 42) * Math.min(1, W / 760), angle: random(0, PI * 2), spin: random(-.6, .6), shape: Array.from({ length: 6 }, () => random(.75, 1.2)) });
    }
    // An orb marks the guaranteed gap in each obstacle row.
    objects.push({ kind: 'orb', x: W * (.14 + safeLane * .18), y: -65, r: 10, phase: Math.random() * PI });
  }
  function burst(x, y, count, color) {
    for (let i = 0; i < count; i++) sparks.push({ x, y, vx: random(-140, 140), vy: random(-130, 90), life: random(.3, .75), color });
  }
  function update(dt) {
    elapsed += dt; score += dt * 8; invulnerable = Math.max(0, invulnerable - dt);
    const left = keys.has('arrowleft') || keys.has('a'), right = keys.has('arrowright') || keys.has('d');
    if (left || right) { player.x += (Number(right) - Number(left)) * W * .56 * dt; targetX = null; }
    else if (targetX !== null) player.x += (targetX - player.x) * Math.min(1, dt * 12);
    player.x = clamp(player.x, 35, W - 35);
    player.trail.unshift({ x: player.x, y: player.y }); if (player.trail.length > 25) player.trail.pop();
    const speed = 145 + Math.min(190, elapsed * 2.4);
    nextRow -= dt; nextOrb -= dt;
    if (nextRow <= 0) { addRow(); nextRow = Math.max(.85, 1.5 - elapsed * .006); }
    if (nextOrb <= 0) { objects.push({ kind: 'orb', x: random(W * .08, W * .92), y: -20, r: 8, phase: random(0, PI) }); nextOrb = random(1.8, 3); }
    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i]; object.y += speed * dt;
      if (object.kind === 'rock') object.angle += object.spin * dt;
      if (object.y > H + 90) { objects.splice(i, 1); continue; }
      const distance = Math.hypot(object.x - player.x, object.y - player.y);
      if (distance < object.r + 10) {
        if (object.kind === 'orb') {
          score += 50; burst(object.x, object.y, 12, '#a9f4ff'); objects.splice(i, 1); window.NadirAudio?.tone(660, .12);
        } else if (invulnerable <= 0) {
          lives--; invulnerable = 1.6; burst(player.x, player.y, 25, '#ffbdae'); objects.splice(i, 1); window.NadirAudio?.tone(100, .2);
          announce(`${lives} ${lives === 1 ? 'vita rimasta' : 'vite rimaste'}.`);
          if (lives <= 0) { finish(); break; }
        }
      }
    }
    sparks.forEach((spark) => { spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.life -= dt; });
    sparks = sparks.filter((spark) => spark.life > 0);
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#030815'; ctx.fillRect(0, 0, W, H);
    if (backdrop.complete && backdrop.naturalWidth) {
      if (!background) {
        background = document.createElement('canvas'); background.width = W; background.height = H;
        const b = background.getContext('2d'); const scale = Math.max(W / backdrop.naturalWidth, H / backdrop.naturalHeight);
        b.globalAlpha = .24; b.drawImage(backdrop, (W - backdrop.naturalWidth * scale) / 2, (H - backdrop.naturalHeight * scale) / 2, backdrop.naturalWidth * scale, backdrop.naturalHeight * scale);
      }
      ctx.drawImage(background, 0, 0, W, H);
    }
    const glow = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 290);
    glow.addColorStop(0, '#18538935'); glow.addColorStop(1, '#06112100'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const time = state === 'playing' ? elapsed : now * .0002;
    ctx.strokeStyle = '#3977a72b'; ctx.lineWidth = 1;
    for (let i = 0; i < 35; i++) {
      const x = (i * 137.73) % W, y = (i * 53.24 + time * (26 + i % 5 * 8)) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 4 + i % 7); ctx.stroke();
    }
    for (const object of objects) {
      ctx.save(); ctx.translate(object.x, object.y);
      if (object.kind === 'orb') {
        const pulse = 1 + Math.sin(now * .004 + object.phase) * .15;
        ctx.shadowBlur = 25; ctx.shadowColor = '#69e4ff'; ctx.fillStyle = '#d8ffff';
        ctx.beginPath(); ctx.arc(0, 0, object.r * pulse * .58, 0, PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#8ce9ff80'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, object.r * 1.9, 0, PI * 2); ctx.stroke();
      } else {
        ctx.rotate(object.angle); ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2, r = object.r * object.shape[i]; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.closePath(); ctx.fillStyle = '#142b43'; ctx.fill(); ctx.strokeStyle = '#7897b2'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-object.r * .5, -object.r * .6); ctx.lineTo(object.r * .25, object.r * .1); ctx.lineTo(object.r * .5, object.r * .65); ctx.strokeStyle = '#91c8e144'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    player.trail.forEach((point, i) => {
      ctx.fillStyle = `rgba(101,219,255,${(1 - i / 25) * .21})`;
      ctx.beginPath(); ctx.arc(point.x, point.y - i * 4, Math.max(.7, 7 * (1 - i / 25)), 0, PI * 2); ctx.fill();
    });
    // A steady shield communicates temporary protection without blinking.
    if (invulnerable > 0) { ctx.strokeStyle = '#ffd0bcaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 26, 0, PI * 2); ctx.stroke(); }
    ctx.shadowBlur = 24; ctx.shadowColor = '#4bd4ff'; ctx.fillStyle = '#efffff'; ctx.beginPath(); ctx.arc(player.x, player.y, 8, 0, PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#81e6ffb0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(player.x, player.y, 15, 0, PI * 2); ctx.stroke(); ctx.restore();
    sparks.forEach((spark) => { ctx.globalAlpha = Math.min(1, spark.life * 2); ctx.fillStyle = spark.color; ctx.fillRect(spark.x, spark.y, 3, 3); }); ctx.globalAlpha = 1;
    const shade = ctx.createLinearGradient(0, 0, W, 0); shade.addColorStop(0, '#010610bb'); shade.addColorStop(.13, '#01061000'); shade.addColorStop(.87, '#01061000'); shade.addColorStop(1, '#010610bb'); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  }
  function frame(now) {
    if (!dialog.open) return;
    let dt = Math.min((now - (previous || now)) / 1000, .15); previous = now;
    // Small physics steps keep collisions reliable even when rendering is slower.
    if (state === 'playing') {
      while (dt > 0 && state === 'playing') { const step = Math.min(dt, 1 / 90); update(step); dt -= step; }
      updateHUD();
    }
    draw(now); raf = requestAnimationFrame(frame);
  }
  function point(event) {
    if (state !== 'playing') return;
    const rect = canvas.getBoundingClientRect(); targetX = clamp((event.clientX - rect.left) / rect.width * W, 35, W - 35);
  }
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', (event) => { if (state !== 'playing') return; canvas.setPointerCapture(event.pointerId); point(event); });
  canvas.addEventListener('pointerup', (event) => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); });
  document.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'a', 'd'].includes(key) && state === 'playing') { event.preventDefault(); keys.add(key); }
    if (key === 'p' && !event.repeat) { event.preventDefault(); if (state === 'playing') pause(); else if (state === 'paused') resume(); }
  });
  document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  startButton.addEventListener('click', start);
  pauseButton.addEventListener('click', () => { if (state === 'playing') pause(); else if (state === 'paused') resume(); });
  dialog.querySelector('.close-game').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => { keys.clear(); pause(); });
  window.addEventListener('resize', () => { if (dialog.open) resize(); });
  window.NadirLumen = { open };
  // Optional browser-native agent access; normal browsers need no extension or dependency.
  const registry = document.modelContext;
  if (registry?.registerTool) {
    const lifecycle = new AbortController();
    try {
      Promise.resolve(registry.registerTool({
        name: 'open_lumen_game', title: 'Apri Lumen',
        description: 'Open the Lumen instructions and play area. Does not start a round or enable sound.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
          open(); return { opened: dialog.open, game: 'Lumen' };
        }
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional experimental API: the visible UI remains fully usable. */ }
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
