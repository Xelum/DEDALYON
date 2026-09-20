(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const root = document.documentElement;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  const chapters = [...document.querySelectorAll('.chapter')];
  const sections = [...chapters, $('#giochi')];
  const navigation = [...document.querySelectorAll('.chapter-nav a')];
  const backgrounds = [$('.scene-space'), $('.scene-sky'), $('.scene-cave')];
  const reveal = $('.cave-reveal');
  const traveller = $('.light-traveller');
  const haze = $('.atmosphere-haze');
  const particles = $('#particles');
  const context = particles.getContext('2d');
  let width = innerWidth, height = innerHeight, positions = [], currentScroll = scrollY;
  let pointer = { x: .65, y: .52 }, light = { x: .65, y: .52 }, pointerUsed = false;
  let activeChapter = -1, lastDepth = '', lastPercent = '', frameId, previous = 0;
  let stars = [];

  function measure() {
    width = innerWidth; height = innerHeight;
    positions = sections.map((section) => ({ top: section.offsetTop, height: section.offsetHeight }));
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    particles.width = width * dpr; particles.height = height * dpr;
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: width < 700 ? 45 : 100 }, () => ({
      x: Math.random(), y: Math.random(), r: .35 + Math.random() * 1.05,
      depth: .2 + Math.random() * .8, phase: Math.random() * Math.PI * 2
    }));
  }

  function tick(now) {
    const dt = Math.min((now - (previous || now)) / 1000, .05); previous = now;
    if (!document.body.classList.contains('game-open')) {
      currentScroll = reduced ? scrollY : currentScroll + (scrollY - currentScroll) * Math.min(1, dt * 11);
      if (Math.abs(currentScroll - scrollY) < .1) currentScroll = scrollY;
      const skyStart = positions[1].top;
      const caveStart = positions[2].top;
      const hubStart = positions[3].top;
      const sky = smooth((currentScroll - skyStart + height * .75) / (height * .95));
      const cave = smooth((currentScroll - caveStart + height * .75) / (height * .95));
      const hub = smooth((currentScroll - hubStart + height * .8) / (height * .7));
      const progress = clamp(currentScroll / Math.max(1, document.documentElement.scrollHeight - height));
      backgrounds[0].style.opacity = 1 - sky;
      backgrounds[1].style.opacity = sky * (1 - cave);
      backgrounds[2].style.opacity = cave;
      root.style.setProperty('--cave', cave);
      root.style.setProperty('--hub', hub);
      root.style.setProperty('--progress', progress);
      haze.style.opacity = sky * (1 - cave) * .6;

      const desiredX = pointerUsed ? pointer.x : .65 + Math.sin(currentScroll / height * 1.5) * .1;
      const desiredY = pointerUsed ? pointer.y : .52 + Math.sin(currentScroll / height) * .1;
      light.x += (desiredX - light.x) * Math.min(1, dt * 5);
      light.y += (desiredY - light.y) * Math.min(1, dt * 5);
      root.style.setProperty('--x', `${(light.x * 100).toFixed(2)}%`);
      root.style.setProperty('--y', `${(light.y * 100).toFixed(2)}%`);
      const swayX = reduced ? 0 : (light.x - .5) * -8;
      const swayY = reduced ? 0 : (light.y - .5) * -5;
      const orbitZoom = reduced ? 1 : 1 + clamp(currentScroll / skyStart) * .18;
      const skyZoom = reduced ? 1 : 1.04 + clamp((currentScroll - skyStart) / (caveStart - skyStart), -.6, 1) * .16;
      const caveZoom = reduced ? 1 : 1.02 + clamp((currentScroll - caveStart) / (hubStart - caveStart), -.6, 1) * .12;
      backgrounds[0].style.transform = `translate3d(${swayX}px,${swayY - clamp(currentScroll / height, 0, 2) * 18}px,0) scale(${orbitZoom})`;
      backgrounds[1].style.transform = `translate3d(${swayX}px,${swayY}px,0) scale(${skyZoom})`;
      const caveTransform = `translate3d(${swayX}px,${swayY}px,0) scale(${caveZoom})`;
      backgrounds[2].style.transform = caveTransform; reveal.style.transform = caveTransform;
      traveller.style.left = `${(light.x * 100).toFixed(2)}%`;
      traveller.style.top = `${(light.y * 100).toFixed(2)}%`;
      traveller.style.opacity = reduced ? 0 : smooth((currentScroll / height - .25) / .7) * .85 * (1 - hub);

      chapters.forEach((section, i) => {
        const local = (currentScroll - positions[i].top) / height;
        const stay = (positions[i].height - height) / height;
        const entering = i === 0 ? 1 : smooth((local + .8) / .55);
        const leaving = smooth((local - stay) / .8);
        const copy = section.querySelector('.chapter-copy');
        copy.style.opacity = entering * (1 - leaving);
        copy.style.transform = reduced ? '' : `translate3d(0,${(1 - entering) * 32 - leaving * 30}px,0)`;
      });
      const index = currentScroll >= hubStart - height * .45 ? 3 : currentScroll >= caveStart - height * .45 ? 2 : currentScroll >= skyStart - height * .45 ? 1 : 0;
      if (index !== activeChapter) {
        activeChapter = index;
        navigation.forEach((link, i) => { if (i === index) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
      }
      const percent = String(Math.round(progress * 100)).padStart(2, '0');
      if (percent !== lastPercent) { $('#journey-percent').textContent = percent; lastPercent = percent; }
      let depth, label;
      if (currentScroll < skyStart) { depth = `+${Math.round(320 - clamp(currentScroll / skyStart) * 308)} <small>km</small>`; label = 'ALTITUDINE'; }
      else if (currentScroll < caveStart) { depth = `+${(12 * (1 - clamp((currentScroll - skyStart) / (caveStart - skyStart)))).toFixed(1)} <small>km</small>`; label = 'ALTITUDINE'; }
      else { depth = `−${Math.round(clamp((currentScroll - caveStart) / (hubStart - caveStart)) * 840)} <small>m</small>`; label = 'PROFONDITÀ'; }
      if (depth !== lastDepth) { $('#depth-value').innerHTML = depth; $('#depth-label').textContent = label; lastDepth = depth; }
      if (context && !reduced) {
        context.clearRect(0, 0, width, height);
        stars.forEach((star) => {
          const x = ((star.x * width + swayX * star.depth * 4) % width + width) % width;
          const y = ((star.y * height - currentScroll * star.depth * .085 + now * .002 * cave * star.depth) % height + height) % height;
          const alpha = (.25 + Math.sin(now * .00045 + star.phase) * .15) * (1 - sky * (1 - cave) * .8) * (1 - hub * .6);
          context.fillStyle = `rgba(186,227,255,${alpha})`;
          context.beginPath(); context.arc(x, y, star.r, 0, Math.PI * 2); context.fill();
        });
        // A quiet meteor crosses the orbit occasionally; never a flashing effect.
        const meteorPhase = (now % 15500) / 1300;
        if (meteorPhase < 1 && sky < .5) {
          const mx = width * (.64 + meteorPhase * .18), my = height * (.06 + meteorPhase * .2);
          const grad = context.createLinearGradient(mx - 90, my - 65, mx, my);
          grad.addColorStop(0, 'rgba(166,218,255,0)'); grad.addColorStop(1, `rgba(208,239,255,${Math.sin(meteorPhase * Math.PI) * .65})`);
          context.strokeStyle = grad; context.lineWidth = 1; context.beginPath(); context.moveTo(mx - 90, my - 65); context.lineTo(mx, my); context.stroke();
        }
      }
    }
    frameId = requestAnimationFrame(tick);
  }

  // Cards are the single place to connect future games: see games.js.
  const list = $('#game-list');
  (window.NADIR_GAMES || []).forEach((game, index) => {
    const card = document.createElement('article'); card.className = 'game-card';
    const art = document.createElement('div'); art.className = 'game-art'; art.setAttribute('aria-hidden', 'true');
    if (game.image) { const img = document.createElement('img'); img.src = game.image; img.alt = ''; img.loading = 'lazy'; art.append(img); }
    art.insertAdjacentHTML('beforeend', '<div class="portal-art"><div class="portal-rings"></div><div class="portal-core"></div></div>');
    const number = document.createElement('span'); number.className = 'game-number'; number.textContent = String(index + 1).padStart(2, '0'); art.append(number);
    const tag = document.createElement('span'); tag.className = 'game-art-label'; tag.textContent = 'IL TUO PROSSIMO VARCO'; art.append(tag);
    const copy = document.createElement('div'); copy.className = 'game-copy';
    const genre = document.createElement('p'); genre.className = 'eyebrow'; genre.textContent = game.genre;
    const name = document.createElement('div'); name.className = 'game-name';
    const title = document.createElement('h3'); title.textContent = game.title;
    const subtitle = document.createElement('span'); subtitle.textContent = game.subtitle; name.append(title, subtitle);
    const description = document.createElement('p'); description.className = 'game-description'; description.textContent = game.description;
    const launch = document.createElement(game.url ? 'a' : 'button'); launch.className = 'game-launch';
    if (game.url) launch.href = game.url;
    else { launch.type = 'button'; launch.addEventListener('click', () => { if (game.action === 'lumen' && window.NadirLumen) window.NadirLumen.open(); }); }
    const launchText = document.createElement('span'); launchText.textContent = game.label || `Gioca a ${game.title}`;
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); launch.append(launchText, arrow);
    copy.append(genre, name, description, launch); card.append(art, copy); list.append(card);
  });
  document.querySelectorAll('.game-count').forEach((e) => e.textContent = String((window.NADIR_GAMES || []).length).padStart(2, '0'));

  // Audio is synthesized locally and starts only following an explicit click.
  let audioContext, master, filter, oscillators = [], audioEnabled = false;
  const audioButton = $('.sound-toggle');
  function createAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    audioContext = new Audio(); master = audioContext.createGain(); master.gain.value = 0; master.connect(audioContext.destination);
    filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.connect(master);
    [55, 82.41, 110.15].forEach((frequency, i) => {
      const osc = audioContext.createOscillator(), volume = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency; volume.gain.value = i === 0 ? .28 : .1;
      osc.connect(volume); volume.connect(filter); osc.start(); oscillators.push(osc);
    });
    return true;
  }
  function setAudioLevel() {
    if (!master) return;
    master.gain.setTargetAtTime(audioEnabled && !document.hidden ? .2 : 0, audioContext.currentTime, .5);
  }
  audioButton.addEventListener('click', async () => {
    try {
      if (!audioContext && !createAudio()) { audioButton.setAttribute('aria-label', 'Audio non supportato in questo browser'); audioButton.disabled = true; return; }
      await audioContext.resume(); audioEnabled = !audioEnabled;
      audioButton.setAttribute('aria-pressed', String(audioEnabled));
      audioButton.setAttribute('aria-label', audioEnabled ? 'Disattiva l’audio ambientale' : 'Attiva l’audio ambientale');
      $('.sound-label').textContent = audioEnabled ? 'AUDIO ON' : 'AUDIO OFF'; setAudioLevel();
    } catch { audioButton.setAttribute('aria-label', 'Audio non disponibile'); audioButton.disabled = true; }
  });
  window.NadirAudio = {
    tone(frequency = 660, duration = .16) {
      if (!audioEnabled || !audioContext || document.hidden) return;
      const osc = audioContext.createOscillator(), volume = audioContext.createGain();
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, audioContext.currentTime + duration);
      volume.gain.setValueAtTime(.18, audioContext.currentTime); volume.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(volume); volume.connect(master); osc.start(); osc.stop(audioContext.currentTime + duration);
    }
  };
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointer.x = clamp(event.clientX / width, .06, .94); pointer.y = clamp(event.clientY / height, .08, .92); pointerUsed = true;
  }, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  reducedQuery.addEventListener('change', (event) => { reduced = event.matches; measure(); });
  document.addEventListener('visibilitychange', () => {
    setAudioLevel(); cancelAnimationFrame(frameId);
    if (!document.hidden) { previous = 0; frameId = requestAnimationFrame(tick); }
  });
  measure();
  if (document.fonts) document.fonts.ready.then(measure);
  frameId = requestAnimationFrame(tick);
})();
