# Medusa Games — FULL v5

Versione completa del sito **Medusa Games** con Forgefall completamente ricostruito.

## Forgefall v5

Questa versione non usa più l'impostazione dashboard/card delle versioni precedenti.

- tavola di gioco full-screen;
- grafica 2D / pixel-art originale;
- acqua, erba e cliff texturizzati;
- castello, materiali, difese e mostri disegnati nel mondo di gioco;
- griglia 6×6;
- 5 mosse iniziali;
- ogni scambio tra caselle adiacenti è consentito;
- 3 materiali uguali → una difesa;
- 3 difese uguali dello stesso livello → livello superiore;
- livello 1 = aspetto base;
- livello 2 = aspetto metallico / ferro;
- livello 3+ = aspetto dorato;
- casse apribili con click/tap: +2 / +3 / +4 mosse;
- orde con mostri che avanzano dal basso verso il bastione;
- boss ogni 10 giorni;
- officina con scambi illimitati dopo il boss;
- pannello **INFO** per materiali e difese con ruolo, danni, cadenza, bersagli ed effetti;
- layout responsive per desktop e smartphone.

## File del gioco

- `giochi/forgefall/index.html`
- `giochi/forgefall/game.css`
- `giochi/forgefall/game.js`
- `giochi/forgefall/assets/water.png`
- `giochi/forgefall/assets/grass.png`
- `giochi/forgefall/assets/cliff.png`

Le texture inserite in Forgefall v5 sono originali e generate appositamente per questo progetto; non sono copie degli asset di Tower Swap.

## Verifiche effettuate

- sintassi JavaScript controllata con Node;
- rendering verificato a 1600×900;
- rendering verificato a 390×844;
- nessuno scroll orizzontale o verticale nelle due viewport di test;
- apertura scheda INFO verificata;
- statistiche di una difesa livello 2 verificate;
- apertura Cassa del fabbro verificata con incremento delle mosse;
- avvio automatico dell'orda dopo 5 scambi verificato;
- nessun errore JavaScript rilevato nei test browser automatizzati.

## Pubblicazione GitHub Pages

Estrai lo ZIP e carica **il contenuto** direttamente nella root del repository. `index.html` deve rimanere nella root.
