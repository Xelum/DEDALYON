# Medusa Games — FULL v3

Pacchetto completo del sito Medusa Games con Forgefall separato dalla grafica della home.

## Avvio
Apri `index.html` oppure pubblica l'intera cartella su GitHub Pages mantenendo la struttura delle cartelle.

## Forgefall
Percorso: `giochi/forgefall/index.html`

Questa versione introduce:
- layout Forgefall a pieno schermo, adattivo desktop/mobile;
- griglia 6×6 ridimensionata in base sia alla larghezza sia all'altezza disponibile;
- difese ridisegnate: muro glaciale, torre degli arcieri, cannone, balestra ardente, cassa del fabbro e idolo aureo;
- colori e silhouette più differenziati tra materiali e strutture;
- Cassa del fabbro interattiva: clic/tap per aprirla e ricevere casualmente +2, +3 o +4 mosse;
- drag/swipe ancora disponibile sulle casse se vuoi spostarle anziché aprirle;
- supporto mobile in verticale e adattamento per schermi bassi/orizzontali.

## Struttura
- `index.html`, `style.css`, `app.js`, `games.js`, `medusa-logo.svg`: home Medusa Games.
- `giochi/forgefall/index.html`: pagina autonoma del gioco.
- `giochi/forgefall/game.css`: grafica responsive di Forgefall.
- `giochi/forgefall/game.js`: logica puzzle/tower-defense.

Non modificare i percorsi relativi se pubblichi su GitHub Pages.
