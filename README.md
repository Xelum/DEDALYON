# MEDUSA GAMES — prototipo web

Nuova versione del sito trasformata da concept “spazio/profondità” a portale arcade cartoon/dark.

## Avvio

Apri `index.html` in un browser moderno. Non servono server, account, chiavi API o installazioni.

Per pubblicarlo su GitHub Pages, carica tutti i file nella root del repository e imposta Pages sul branch `main` / root.

## File

- `index.html` — home, sezioni e finestra del gioco
- `style.css` — grafica responsive, animazioni, home e UI di Forgefall
- `games.js` — catalogo giochi della home; aggiungi qui i prossimi titoli
- `app.js` — card dinamiche, reveal allo scroll e audio opzionale
- `forgefall.js` — logica completa del primo prototipo giocabile
- `medusa-logo.svg` — logo Medusa Games riutilizzabile

## Forgefall — regole implementate

- Griglia 6×6.
- Inizio con 5 mosse.
- Scambia due caselle adiacenti; uno scambio valido deve creare un tris orizzontale o verticale.
- 3+ materiali uguali creano una struttura.
- 3+ strutture uguali dello stesso livello creano una struttura di livello superiore.
- Dopo una fusione, gli spazi vengono fatti cadere e riempiti con nuovi materiali.
- Le fusioni a cascata non consumano mosse aggiuntive.
- Quando finiscono le mosse parte automaticamente un’orda di mostri.
- Se la base sopravvive, si passa al livello successivo con altre 5 mosse.
- Dopo aver completato i livelli 10, 20, 30… si apre l’Officina: gli scambi sono illimitati e durante questa fase non vengono generati nuovi simboli. Le caselle vuote vengono riempite solo quando si chiude l’Officina.
- Record livello salvato localmente nel browser.

### Materiali

- **Ghiaccio → Muro glaciale:** rallenta i nemici nella sua corsia.
- **Rame → Torre arcieri:** colpisce la propria corsia e quelle adiacenti.
- **Ferro → Cannone:** attacca orizzontalmente e fa danno ad area.
- **Fuoco → Balestra:** attacca verticalmente nella colonna della struttura.
- **Legno → Cassa:** quando viene creata assegna subito da 2 a 4 mosse extra; i livelli superiori aumentano il bonus.
- **Oro → Totem:** scelta di design provvisoria, perché il comportamento dell’oro non era specificato. Potenzia le strutture adiacenti.

## Note sul prototipo

Forgefall è già giocabile, ma il bilanciamento (HP mostri, danni, velocità, spawn, probabilità dei materiali) è volutamente semplice e centralizzato in `forgefall.js`, così è facile rifinirlo dopo i primi test.

Le altre card sono placeholder “prossimamente”: il catalogo è già predisposto per aggiungere nuovi giochi.
