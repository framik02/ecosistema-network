# Ecosistema · Liberi Network

Osservatorio delle collaborazioni Instagram, delle caption e delle affinità semantiche fra profili. La dashboard mostra solo contenuti e risultati dell'analisi. Il database operativo, le sessioni del browser e i log restano sul computer di raccolta.

## Viste

- **Collaborazioni:** relazioni dirette dall'autore ai collaboratori oppure compresenza di tutti i coautori; periodo, ricerca, categorie, schede e post originali.
  Si apre sui 7 giorni e sull'ecosistema monitorato: nodi e linee solo fra due profili dell'elenco, gli account esterni restano un conteggio sul profilo e tornano visibili con «Con profili esterni». Sopra la mappa quattro letture automatiche (legame più frequente, profilo più collegato, ponte fra categorie, coppia di categorie più frequente), sotto la tabella delle collaborazioni fra categorie.
- **Affinità semantiche:** cosine similarity fra vettori medi delle caption originali di ogni profilo; soglia regolabile e coppie di caption come esempi. Minimo due caption distinte per profilo.
- **Temi e narrazioni:** cluster semantici con parole distintive ed esempi; sei cornici narrative esplorative, esplicitamente non validate come opinioni degli autori.

La condivisione conserva la vista, il periodo e il profilo selezionato. I filtri per categoria mantengono i vicini di altre categorie per non perdere il contesto. I conteggi si riferiscono al campione osservato, non all'intero Instagram.

## Identità e mappa interattiva

Il sito pubblico usa l’impaginazione di ecosistemapolitico.it: mappa a tutto schermo su foglio quadrettato, pannello Vista a sinistra (periodo, profili, legami, interruttori, numeri) e pannello a schede a destra (Sintesi, Gruppi, Ponti, Classifica, Post) che diventa la scheda del profilo selezionato. Nodi quadrati pieni nei colori di categoria di quella mappa, nomi in carattere monospaziato. La disposizione calcola prima ogni gruppo (scheletro dei profili con più legami e ventagli dei collaboratori con un solo legame), poi la posizione dei gruppi secondo l’ingombro reale, poi l’insieme. «Ponti» conta i profili che resterebbero isolati dal proprio gruppo senza quel profilo. La versione locale completa mantiene l’impaginazione a pagina.

Identità Liberi Network: marchio originale, titoli Bebas Neue, testi Archivo e blu profondo `#302C75` su fondo caldo. Composizione ispirata alla pagina [Chi siamo](https://dapper-youtiao-da3032.netlify.app/chi-siamo): navigazione sospesa, titoli ampi, schede con bordi netti e collegamenti curvi. Il logo conserva il gradiente originale. Font e logo incorporati: nessuna richiesta a servizi esterni per caricarli. Il grafo usa archi curvi, focus sui vicini di un profilo, trascinamento dei nodi e vista immersiva. Le animazioni si disattivano con la preferenza di movimento ridotto e si sospendono fuori schermo. I colori distinguono le categorie osservate; non indicano un giudizio sui profili.

## Esplorazione della rete

La panoramica dispone separatamente le componenti connesse del grafo: i gruppi rappresentano percorsi di collaborazione osservati, non comunità ideologiche inferite. Le etichette aumentano con lo zoom; nodi e linee rimangono sempre basati sugli stessi dati. Il focus dispone il profilo al centro e i vicini su anelli; un comando espande al secondo livello. Le posizioni esistenti restano ferme durante gli aggiornamenti, mentre Riordina ricostruisce la disposizione.

Un clic su una linea apre i post che la giustificano, con direzione autore → collaboratore quando pertinente. I pulsanti Vedi post nell’elenco offrono la stessa consultazione da tastiera e mostrano entrambe le direzioni per la coppia. Il dettaglio si aggiorna anche quando un post viene rimosso dai dati ricevuti. Il pannello laterale è richiudibile e le animazioni sono limitate ai collegamenti evidenziati.

## Aggiornamenti

`bridge/serve.py` legge SQLite in sola lettura a ogni richiesta. La pagina locale richiede nuovi dati ogni 10 secondi. `bridge/semantic.py --loop` controlla il database ogni 120 secondi dopo ogni elaborazione, riusa gli embedding in cache e rigenera le analisi quando i dati cambiano. Il primo passaggio è più lungo dei successivi.

`bridge/share_collaborations.py --loop`, dopo l’abilitazione esplicita, pubblica ogni 120 secondi solo i post con più autori e i profili coinvolti sul ramo `collaborations`. Esclude caption, contenuti non collaborativi, account estranei alla rete e tutte le analisi semantiche. Riprova dopo interruzioni di rete. La pagina pubblica controlla i dati ogni 30 secondi; la cache della piattaforma può aggiungere alcuni minuti. Modifiche e cancellazioni nel database vengono esportate alla lettura successiva. Il JSON non ricostruisce il sito.

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

## Condivisione delle sole collaborazioni

- `main`: codice e test, senza dati raccolti.
- `gh-pages`: interfaccia generata con una sola sezione, Collaborazioni.
- `collaborations`: solo `latest.json`, con profili coinvolti, categorie, autori, date e identificativi dei post.

Il publisher legge SQLite in sola lettura e usa una lista esplicita di campi e file. La modalità pubblica forza la vista collaborazioni anche se il link contiene `view=semantic` o `view=topics`; non richiede alcun dato semantico. La versione locale completa resta disponibile.

La pubblicazione richiede l’autorizzazione esplicita a rendere pubblici questi dati: un sito GitHub Pages e il suo ramo dati sono accessibili pubblicamente. `shareCollaborations` resta `false` fino a quell’autorizzazione. `bridge/publish.py` è il vecchio esportatore completo: non viene attivato per questo link.

Dopo l’autorizzazione:

1. Eseguire `bridge/share_collaborations.py` con database, stato locale, repository, URL pubblico e URL snapshot configurati. `--prepare-only` genera e verifica i file localmente senza pubblicarli.
2. Attivare GitHub Pages dal ramo `gh-pages`, directory `/`, e verificare il link effettivamente online.
3. Eseguire `abilita-condivisione.ps1 -ConfirmPublicCollaborations` per abilitare la sincronizzazione in background e l’avvio al login Windows. Lo script usa la configurazione locale in `.state/config.json`.

Il publisher confronta anche i file dell’interfaccia in `site/`: le modifiche salvate vengono riportate nel sito pubblico automaticamente. Una versione degli asset evita di mescolare file vecchi e nuovi; la pagina già aperta controlla la versione e si ricarica dopo una nuova pubblicazione. La configurazione pubblica e il perimetro delle collaborazioni vengono rigenerati senza copiare la configurazione locale completa.

Il computer di raccolta deve essere acceso e connesso per inviare nuovi dati; dopo il riavvio la sincronizzazione riparte al login Windows. A computer spento il link continua a mostrare l’ultima versione. I filtri temporanei di un visitatore non modificano i dati degli altri; il pulsante Condividi include periodo e profilo selezionati nel link.

[Configurazione GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Verifiche

```powershell
node --test tests/network.test.js tests/graph_exploration.test.js
python -m unittest discover -s tests -p 'test_*.py'
```

I test coprono direzione dei legami, coautori, aggiornamento di un post già esistente, filtri, lettura del database senza log, attribuzione semantica e deduplica. D3 v7.9.0 è incluso in `site/vendor`, con licenza ISC.

### Mappa completa delle collaborazioni

La vista iniziale mostra tutti i profili e tutti i collegamenti del periodo in un unico grafo. I profili sono rappresentati da quadratini con iniziali, in una disposizione organica a forze con spazio tra i nodi, senza riquadri o file separate. L’elenco laterale è apribile; selezionare un profilo evidenzia i suoi legami mantenendo l’intero grafo. Le etichette emergono con lo zoom e il passaggio del puntatore. Gli aggiornamenti conservano le posizioni; «Riordina» ridistribuisce la mappa quando serve.

### Gerarchia e novità

Dimensioni dei quadratini e spessore delle linee crescono con i post osservati. La barra «Più attivi» mantiene cinque nomi accessibili anche nella panoramica; hover e selezione evidenziano solo i legami del profilo mantenendo l’intero grafo. «Panoramica completa» rimuove la selezione e ripristina l’inquadratura, mantenendo i filtri del periodo.

«Novità» confronta l’archivio completo con un checkpoint locale della visita precedente: post, profili e legami diretti aggiunti. Distingue la data di pubblicazione dall’arrivo nella raccolta; i cambi ai coautori su post esistenti possono produrre nuovi legami senza nuovi post. La prima visita stabilisce il confronto senza dichiarare tutto nuovo. Si salvano solo identificativi e data in localStorage, separati per fonte dati; nessuna caption e nessun tracciamento degli accessi. Con storage non disponibile il confronto continua in memoria durante la visita. «Segna come visto» aggiorna esplicitamente il riferimento.
