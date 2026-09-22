# Medusa Games — Mobile Optimized

Questa build mantiene la grafica di Forgefall ma riduce drasticamente il peso e il lavoro grafico sui telefoni.

## Ottimizzazioni
- Sprite convertiti in WebP e ridimensionati (circa 0,8 MB complessivi).
- Sfondo desktop WebP ~450 KB e versione mobile ~160 KB.
- Preloader: il gioco appare solo dopo il caricamento/decodifica degli asset.
- Cache degli asset tramite Service Worker su GitHub Pages/HTTPS.
- Su mobile: 30 FPS per gli aggiornamenti JS, meno filtri/blur e meno animazioni decorative simultanee.
- Le animazioni di gameplay (swap, colpi, impatti, nemici) restano attive.
- Rendering della board tramite DocumentFragment per ridurre reflow.

Caricare tutti i file del pacchetto mantenendo la struttura delle cartelle.
