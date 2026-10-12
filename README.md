# Ecosistema · Liberi Network

Osservatorio delle collaborazioni Instagram, delle caption e delle affinità semantiche fra profili. La dashboard mostra solo contenuti e risultati dell'analisi. Il database operativo, le sessioni del browser e i log restano sul computer di raccolta.

## Viste

- **Collaborazioni:** relazioni dirette dall'autore ai collaboratori oppure compresenza di tutti i coautori; periodo, ricerca, categorie, schede e post originali.
- **Affinità semantiche:** cosine similarity fra vettori medi delle caption originali di ogni profilo; soglia regolabile e coppie di caption come esempi. Minimo due caption distinte per profilo.
- **Temi e narrazioni:** cluster semantici con parole distintive ed esempi; sei cornici narrative esplorative, esplicitamente non validate come opinioni degli autori.

La condivisione conserva la vista, il periodo e il profilo selezionato. I filtri per categoria mantengono i vicini di altre categorie per non perdere il contesto. I conteggi si riferiscono al campione osservato, non all'intero Instagram.

## Identità e mappa interattiva

Identità Liberi Network: marchio originale, titoli Bebas Neue, testi Archivo e magenta `#DC058C` su fondo bianco. Font e logo incorporati: nessuna richiesta a servizi esterni per caricarli. Il grafo usa archi curvi, focus sui vicini di un profilo, trascinamento dei nodi e vista immersiva. Le animazioni si disattivano con la preferenza di movimento ridotto e si sospendono fuori schermo. I colori distinguono le categorie osservate; non indicano un giudizio sui profili.

## Aggiornamenti

`bridge/serve.py` legge SQLite in sola lettura a ogni richiesta. La pagina locale richiede nuovi dati ogni 10 secondi. `bridge/semantic.py --loop` controlla il database ogni 120 secondi dopo ogni elaborazione, riusa gli embedding in cache e rigenera le analisi quando i dati cambiano. Il primo passaggio è più lungo dei successivi.

`bridge/publish.py --loop` pubblica una vista JSON dei dati ogni 120 secondi sul ramo separato `data`, solo quando cambiano. Riprova dopo interruzioni di rete. La dashboard GitHub Pages legge quei file ogni 30 secondi; la cache della piattaforma può aggiungere un ritardo. La pubblicazione del JSON non ricostruisce il sito.

Se il computer o il processo di pubblicazione sono fermi, il sito pubblico resta disponibile con l'ultima versione. La data di osservazione e quella dell'analisi sono visibili; dopo 30 minuti la pagina indica «Ultimi dati disponibili». L'interfaccia non spaccia la ricezione della pagina per la data di raccolta dei dati.

## Avvio locale

Richiede Python 3.10+ per il server e un ambiente Python con sentence-transformers, numpy e scikit-learn per l'analisi. Il modello deve essere già presente nella cache Hugging Face: l'inferenza è offline.

```powershell
python bridge/serve.py --db PERCORSO_DATABASE --state CARTELLA_STATO --port 8766
python bridge/semantic.py --db PERCORSO_DATABASE --state CARTELLA_STATO --loop
python bridge/publish.py --db PERCORSO_DATABASE --state CARTELLA_STATO --repo CHECKOUT_RAMO_DATA --loop
```

`avvia-osservatorio.ps1` avvia server, analisi e pubblicazione con configurazione locale in `.state/config.json`. I processi sono avviati in background; l'eventuale avvio al login è configurato separatamente sul computer, non su GitHub.

## Metodo semantico

Modello: [sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2). Si rimuovono URL e menzioni, si mantengono le parole degli hashtag. Caption con meno di cinque parole escluse. Testi lunghi divisi in segmenti di 110 token con passo 90; media dei segmenti normalizzati e normalizzazione finale. La cache usa hash di testo e versione del metodo.

Il vettore del profilo è la media normalizzata delle sue caption originali distinte nel periodo. Le caption di un post collaborativo non vengono assegnate ai coautori. Si conservano le coppie con similarità ≥0,55 fra i cinque vicini di ogni profilo; il filtro UI parte da 0,65. Il grafo è non diretto, quindi un nodo può avere più di cinque archi se è vicino scelto da altri. Le coppie di caption di esempio sono quelle più simili fra le due raccolte; il loro punteggio è distinto da quello fra profili.

Temi: K-means sulle caption uniche, seed 42, da 2 a 10 cluster secondo dimensione del corpus. Etichette ricavate dalle parole TF-IDF più rappresentative. I cluster sono ricalcolati e possono cambiare con nuovi dati; non sono una tassonomia stabile.

Cornici narrative: similarità alle sei descrizioni esplicite in `bridge/semantic.py`, soglia 0,42 e margine 0,04 sulla seconda cornice. Le soglie sono euristiche non calibrate. Non si tratta di una misura di probabilità, sentiment o adesione politica. Sono suggerimenti di lettura verificabili attraverso i post originali.

## Pubblicazione

- `main`: codice della dashboard, bridge e test.
- `gh-pages`: soli file di `site/`, con `config.js` rivolto al ramo pubblico `data`.
- `data`: `latest.json` e `semantic.json`, aggiornati dal publisher locale.

La configurazione GitHub Pages usa `gh-pages` come sorgente. [Documentazione ufficiale](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Verifiche

```powershell
node --test tests/network.test.js
python -m unittest discover -s tests -p 'test_*.py'
```

I test coprono direzione dei legami, coautori, aggiornamento di un post già esistente, filtri, lettura del database senza log, attribuzione semantica e deduplica. D3 v7.9.0 è incluso in `site/vendor`, con licenza ISC.
