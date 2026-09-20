# NADIR — Oltre la superficie

Home immersiva e primo gioco web, in HTML, CSS e JavaScript. Il nome NADIR è il nome di lavoro del progetto e può essere cambiato.

## Aprire il sito

Apri `index.html` in un browser moderno, mantenendo accanto gli altri file e la cartella `assets`. Non servono installazioni, compilazioni, account o chiavi API.

È disponibile anche il file autonomo `NADIR.html`, consegnato separatamente: contiene tutto e si apre con un doppio clic.

## Pubblicare su GitHub Pages

1. Crea un repository su GitHub, oppure usa quello destinato al sito.
2. Carica nella radice del repository tutti i file di questo pacchetto, compresa la cartella `assets`. `index.html` deve stare nella radice, senza una cartella aggiuntiva che lo racchiuda.
3. Apri **Settings → Pages** del repository.
4. In **Build and deployment → Source**, scegli **Deploy from a branch**.
5. Seleziona il branch che contiene i file, normalmente **main**, e la cartella **/(root)**. Premi **Save**.
6. Quando GitHub termina la pubblicazione, apri il collegamento mostrato nella pagina Pages.

In alternativa, puoi pubblicare soltanto il file autonomo `NADIR.html`, rinominandolo `index.html`.

Guida ufficiale: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Il viaggio

- **Orbita:** pianeta blu, stelle in movimento, meteora discreta e avvicinamento legato allo scroll.
- **Atmosfera:** passaggio fra le nuvole e discesa verso la superficie.
- **Abisso:** caverna scura, con illuminazione che segue il cursore. Su dispositivi touch la luce accompagna lo scroll.
- **I giochi:** ingresso diretto a Lumen. Il menu permette di raggiungerlo senza percorrere tutto il viaggio.

L’audio ambientale è disattivato all’apertura e si attiva solo con il pulsante. È sintetizzato nel browser. La home rispetta la preferenza di sistema per la riduzione delle animazioni.

## Lumen — La discesa

Raccogli le sfere luminose, evita i frammenti e scendi il più possibile.

- Computer: mouse, frecce sinistra/destra oppure A/D.
- Smartphone: trascina il dito sul campo di gioco.
- P: pausa e ripresa. ESC: chiusura del gioco.
- Ogni sfera vale 50 punti; la sopravvivenza aggiunge punti nel tempo.
- Hai tre vite. Dopo un impatto, un anello indica una breve protezione.
- Il record viene conservato solo nel browser utilizzato. Se l’archiviazione locale non è disponibile, il gioco continua a funzionare.
- Cambiando scheda o finestra, la partita si mette in pausa.

## Aggiungere altri giochi

La lista delle schede è in `games.js`. Per collegare un nuovo gioco HTML, aggiungi un oggetto all’array, separato da una virgola:

```js
{
  id: 'nuovo-gioco',
  title: 'NOME GIOCO',
  subtitle: 'Sottotitolo',
  genre: 'GENERE',
  description: 'Una breve descrizione del gioco.',
  url: './giochi/nuovo-gioco/index.html',
  image: './assets/copertina-nuovo-gioco.webp',
  label: 'Gioca ora'
}
```

Carica anche la cartella del nuovo gioco e la sua copertina. Il numero dei giochi nel menu si aggiorna automaticamente. Puoi usare anche un URL completo per un gioco ospitato altrove.

## Modifiche

| File | Contenuto |
| --- | --- |
| `index.html` | Testi, sezioni e struttura della home |
| `style.css` | Aspetto, impaginazione e adattamento agli schermi |
| `app.js` | Viaggio, luce, particelle, audio e schede dei giochi |
| `games.js` | Elenco e collegamenti dei giochi |
| `lumen.js` | Funzionamento del primo gioco |
| `assets/` | Tre ambientazioni, carattere tipografico e relativa licenza |

Le immagini sono originali, generate per questo concept e ottimizzate in WebP. Il font Geist è incluso localmente sotto licenza SIL Open Font License; conservare `assets/GEIST-OFL.txt`.

La home non usa CDN, analytics, pubblicità, cookie, richieste a servizi di gioco o componenti a pagamento. Le regole dei futuri giochi andranno considerate quando verranno integrati.

## Verifica di questa versione

Controllati nel browser i tre ambienti, la navigazione, l’apertura del gioco, il movimento e la pausa. Layout verificato a larghezza desktop, 390 e 320 pixel. Controllati inoltre punteggio, raccolta delle sfere, collisioni, vite, fine partita, record e riavvio con una simulazione a tempo controllato.

Il supporto opzionale a WebMCP è rilevato automaticamente e non è necessario per usare il sito; non era disponibile nel browser di verifica.
