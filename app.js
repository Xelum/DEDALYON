(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const games = window.MEDUSA_GAMES || [];
  const grid = $('#game-grid');
  const sizes = ['featured', 'small', 'tiny', 'tiny', 'tiny'];

  games.forEach((game, index) => {
    const card = document.createElement('article');
    card.className = `game-card ${sizes[index] || 'tiny'}`;
    const art = document.createElement('div');
    art.className = `game-art art-${game.art || 'purple'}`;
    const artGrid = document.createElement('div');
    artGrid.className = 'art-grid';
    for (let i = 0; i < 36; i++) artGrid.append(document.createElement('i'));
    art.append(artGrid);

    const copy = document.createElement('div');
    copy.className = 'game-card-copy';
    copy.innerHTML = `<span class="tag">${game.tag}</span><h3>${game.title}</h3><p>${game.description}</p>`;
    card.append(art, copy);

    if (game.playable) {
      const button = document.createElement('button');
      button.className = 'game-play';
      button.type = 'button';
      button.setAttribute('aria-label', `Gioca a ${game.title}`);
      button.dataset.openGame = game.id;
      button.textContent = '↗';
      card.append(button);
    } else {
      const badge = document.createElement('span');
      badge.className = 'coming-badge';
      badge.textContent = game.subtitle;
      card.append(badge);
    }
    grid.append(card);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  $$('.reveal').forEach((el) => io.observe(el));

  const soundButton = $('.sound-toggle');
  let audioContext = null;
  let audioEnabled = false;
  function tone(freq = 520, duration = .08, gain = .045) {
    if (!audioEnabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    const osc = audioContext.createOscillator();
    const vol = audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, audioContext.currentTime);
    vol.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(vol); vol.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + duration);
  }
  soundButton?.addEventListener('click', async () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    await audioContext.resume();
    audioEnabled = !audioEnabled;
    soundButton.setAttribute('aria-pressed', String(audioEnabled));
    soundButton.lastElementChild.textContent = audioEnabled ? 'AUDIO ON' : 'AUDIO OFF';
    if (audioEnabled) tone(620, .12, .07);
  });
  window.MedusaAudio = { tone };

  function launchGame(id) {
    const game = games.find((item) => item.id === id);
    if (!game || !game.playable) return;
    if (game.url) {
      window.location.href = game.url;
      return;
    }
    window.Forgefall?.open?.();
  }

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-open-game]');
    if (!button) return;
    event.preventDefault();
    launchGame(button.dataset.openGame);
  });
})();
