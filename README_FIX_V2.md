# Forgefall Mobile Optimized v2

Correzioni principali:
- simboli e strutture vincolati alla singola casella tramite `asset-stage`;
- immagini mantenute con proporzioni naturali (`width/height:auto`, `max-width/max-height:100%`);
- strutture leggermente ridotte e centrate per tipo;
- nessuna scheda o sfondo intorno ai pezzi;
- fix officina post-boss giorno 10: al termine vengono riempite tutte le caselle vuote con nuovi materiali;
- fix stato `disabled` delle celle dopo animazioni/rerender;
- cache service worker aggiornata a v2;
- cache-busting su CSS/JS per evitare che GitHub Pages/browser mostrino la vecchia versione.
