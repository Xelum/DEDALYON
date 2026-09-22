/* Compatibilità con la vecchia home: Forgefall ora vive in una pagina autonoma. */
(() => {
  'use strict';
  const GAME_URL = './giochi/forgefall/index.html';
  window.Forgefall = {
    open() { window.location.href = GAME_URL; },
    reset() { window.location.href = GAME_URL; }
  };
})();
