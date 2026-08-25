# EEG Viewer

Web app per visualizzare tracciati EEG da file `.edf`: caricamento file,
selezione dinamica dei canali, filtri di visualizzazione (passa-alto,
passa-basso, notch), montaggio/riferimento (media comune, bipolare),
navigazione temporale su un grafico multicanale, marcatura di bad
channel e bad segment, spettrogramma per canale ed export dei dati in
formato MATLAB (`.mat`) con tracciamento completo delle operazioni di
pre-processing effettuate.

## Architettura

```
backend/   FastAPI + pyedflib + scipy   -> parsing EDF, filtri DSP, API REST
frontend/  React + TypeScript + Vite    -> upload, controlli, rendering canvas
```

Il rendering della finestra temporale visibile e i filtri sono calcolati
**server-side** ad ogni richiesta: il client manda la finestra (canali,
`start_sec`, `duration_sec`) e la pipeline di filtri attiva, il backend
legge solo quel segmento dal file EDF, applica i filtri e restituisce i
punti (eventualmente decimati per il rendering). Questo mantiene il
frontend leggero e permette di aprire file EDF anche di grandi dimensioni
senza caricarli interamente in memoria nel browser.

### Estendibilità

Il progetto è pensato per aggiungere feature senza toccare codice
esistente:

- **Nuovo filtro**: implementa la funzione DSP in
  `backend/app/filters/dsp.py`, registrala in
  `backend/app/filters/registry.py` (`FILTER_REGISTRY`), aggiungi il tipo
  letterale a `FilterType` in `backend/app/schemas.py` e allo stesso tipo
  in `frontend/src/types/index.ts`, poi aggiungi una riga nel pannello
  `frontend/src/components/FilterPanel.tsx`. Nessun altro punto del
  codice deve cambiare.
- **Nuova feature UI** (es. annotazioni, export): è un nuovo componente
  React montato in `App.tsx`, eventualmente con un nuovo router FastAPI
  in `backend/app/routers/` incluso in `main.py` — lo spettrogramma
  (`backend/app/spectrogram.py` + `routers/spectrogram.py` +
  `frontend/src/components/Spectrogram.tsx`) è un esempio di questo
  pattern.
- Lo storage dei file EDF caricati è isolato in `backend/app/edf_store.py`
  dietro un'interfaccia semplice (`save_upload`, `get_info`, `read_window`),
  sostituibile in futuro (es. persistenza su disco/DB) senza toccare i
  router.

## Requisiti

- Python 3.11+
- Node.js 18+

## Avvio backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Test:

```bash
pytest -q
```

## Avvio frontend

```bash
cd frontend
npm install
npm run dev
```

L'app è disponibile su `http://localhost:5173` (il dev server proxya le
chiamate `/api` verso il backend su `localhost:8000`, vedi
`vite.config.ts`).

Build di produzione:

```bash
npm run build
```

## Deploy con Docker

`docker-compose.yml` (alla radice del repo) avvia backend e frontend
insieme: nginx serve i file statici del frontend e fa da reverse proxy
verso il backend per le chiamate `/api`, così il browser parla con una
sola origine (nessun problema di CORS).

```bash
docker compose up --build -d
```

L'app sarà su `http://localhost` (porta 80). I file caricati persistono
nel volume Docker `uploads` tra un riavvio e l'altro (percorso
configurato via `EEG_VIEWER_UPLOAD_DIR`).

Per metterla online gratis, il modo più semplice per un servizio che
resta sempre attivo (nessun "cold start") è una VM **Oracle Cloud Always
Free** (gratuita a tempo indeterminato, non solo per un periodo di
prova):

1. Crea un account Oracle Cloud e una VM "Always Free" (Ubuntu, anche
   la shape ARM Ampere va benissimo — il `Dockerfile` del backend
   installa `gcc` apposta per compilare le dipendenze native su ARM).
2. Sulla VM: installa Docker (`curl -fsSL https://get.docker.com | sh`)
   e il plugin compose (incluso nelle build recenti di Docker).
3. Apri la porta 80 sia nel "Security List"/"Network Security Group"
   della VM su Oracle Cloud sia nel firewall del sistema
   (`sudo ufw allow 80`, se `ufw` è attivo).
4. `git clone` il repository sulla VM, poi `docker compose up --build -d`
   nella cartella del progetto.
5. L'app è raggiungibile sull'IP pubblico della VM. Per un dominio e
   HTTPS gratuiti puoi usare un sottodominio gratuito (es. DuckDNS) che
   punta all'IP della VM, con Let's Encrypt/Certbot davanti a nginx.

## Uso

1. Apri l'app e carica un file `.edf` tramite "Apri file .edf".
2. Seleziona i canali da visualizzare dalla lista (varia in base al file).
3. Attiva/disattiva e regola passa-alto, passa-basso e notch dal pannello
   filtri: i valori si applicano immediatamente al tracciato visibile.
4. Naviga nel tempo con lo slider/i pulsanti Avanti/Indietro e scegli
   l'ampiezza della finestra visibile.
5. Regola il guadagno per scalare l'ampiezza del tracciato.
6. Clicca il pulsante "BAD" accanto a un canale per marcarlo come bad
   channel (il tracciato viene mostrato in grigio, la riga evidenziata).
7. Trascina il mouse sul grafico per marcare un intervallo temporale come
   bad segment (evidenziato in rosso su tutti i canali); clicca su un
   segmento esistente per rimuoverlo, oppure usa il pulsante "×" nella
   lista laterale.
8. Ogni operazione (filtri, bad channel, bad segment) viene registrata
   nel pannello "Cronologia operazioni".
9. Clicca "Esporta .mat" per scaricare **tutti i canali del file** (non
   solo quelli selezionati nel visualizzatore) sull'intera registrazione,
   con i filtri applicati, in un file MATLAB che include anche bad
   channels, bad segments e la cronologia completa delle operazioni.
10. Riaprendo lo stesso file (anche dopo un reload della pagina), le
    annotazioni e i filtri vengono ripristinati automaticamente da un
    banner in alto; da lì puoi anche "dimenticarli" e ripartire da zero.
11. Clicca "SPEC" accanto a un canale per aprire il suo spettrogramma
    (tempo-frequenza) sotto il tracciato principale; segue la stessa
    finestra temporale e gli stessi filtri della vista corrente. Un solo
    canale alla volta; clicca di nuovo (o la ×) per chiuderlo.
12. Cambia "Montaggio / riferimento" per applicare la media comune (CAR)
    o un montaggio bipolare sequenziale (ch1-ch2, ch2-ch3, ...). Quando un
    riferimento è attivo, il calcolo comprende **sempre tutti i canali non
    marcati bad** del file — la selezione nella sidebar si disabilita
    perché non ha più effetto: un canale bad è sempre escluso, gli altri
    good sono sempre mostrati. Il tracciato, lo spettrogramma e l'export
    si aggiornano di conseguenza. La marcatura BAD resta sui canali
    originali (un canale derivato appare bad se lo è uno dei due canali
    sorgente).
13. L'icona 🌙/☀️ in alto a destra alterna tema chiaro/scuro; la scelta
    viene ricordata e, se non l'hai mai cambiata esplicitamente, segue
    automaticamente il tema del sistema operativo.

## Note tecniche

- I filtri sono applicati con `scipy.signal` (Butterworth passa-alto/
  passa-basso via `sosfiltfilt`, notch IIR via `iirnotch`/`filtfilt`),
  fase-zero, applicati in cascata nell'ordine passa-alto → passa-basso →
  notch.
- Ogni canale EDF può avere una propria frequenza di campionamento; viene
  gestita indipendentemente per canale.
- Le risposte dell'endpoint segnale sono decimate a un numero massimo di
  punti (`EEG_VIEWER_MAX_POINTS`, default 10000) per mantenere fluido il
  rendering su finestre lunghe; i filtri vengono sempre applicati sul
  segnale a piena risoluzione prima della decimazione.
- Bad channels e bad segments sono annotazioni tenute lato client (non
  c'è persistenza server-side per-file); vengono inviate al backend solo
  al momento dell'export, insieme alla pipeline di filtri attiva e al log
  completo delle operazioni (`POST /api/files/{id}/export/mat`, vedi
  `backend/app/mat_export.py`). Il file `.mat` non decima mai il segnale:
  contiene i dati a piena risoluzione, filtrati, sull'intera registrazione
  (o sull'intervallo richiesto).
- Bad channels/segments, filtri, guadagno, finestra temporale e cronologia
  operazioni vengono salvati automaticamente in `localStorage` del
  browser (`frontend/src/persistence.ts`), associati a un hash del
  contenuto del file (non al `file_id` del server, che cambia ad ogni
  upload). Un secondo puntatore ricorda anche "l'ultimo file aperto"
  (`file_id` + nome): al caricamento della pagina l'app prova a
  riconnettersi automaticamente a quel file sul backend (che lo tiene in
  memoria/su disco finché il processo resta attivo), così un semplice
  reload ripristina l'intera sessione **senza dover riselezionare il
  file** — i browser non permettono di ripopolare programmaticamente un
  `<input type="file">`. Se il backend nel frattempo è stato riavviato
  (il `file_id` non è più valido), viene mostrato un avviso che invita a
  riaprire il file: le annotazioni (associate all'hash del contenuto, non
  al `file_id`) vengono comunque ripristinate non appena lo fai. Un
  banner permette anche di "dimenticare" le annotazioni salvate e
  ripartire da zero. È una persistenza puramente client-side, legata al
  browser: non è condivisa tra dispositivi o browser diversi.
- Lo spettrogramma (`POST /api/files/{id}/spectrogram`,
  `backend/app/spectrogram.py`) è calcolato con `scipy.signal.spectrogram`
  su finestre di analisi di ~1s (50% overlap) sul segnale già filtrato,
  convertito in dB; le frequenze sono limitate a 45Hz di default
  (`max_freq`) per restare nella banda EEG rilevante e mantenere la
  risposta piccola. Non viene mai decimato: essendo già una
  trasformazione tempo-frequenza compatta (decine di bin di tempo × decine
  di bin di frequenza anche su finestre di 60s), non ne ha bisogno. La
  color scale è la rampa sequenziale blu validata dalla skill `dataviz`
  (100→700, `frontend/src/components/Spectrogram.tsx`).
- Il montaggio/riferimento (`backend/app/montage.py`) è applicato **prima**
  della pipeline di filtri (raw → riferimento → filtri → display/export),
  come da convenzione EEG standard, ed è condiviso da `/signal`,
  `/spectrogram` ed `/export/mat`. "Media comune (CAR)" sottrae la media
  dei canali coinvolti da ciascuno di essi; "Bipolare" calcola derivazioni
  in catena (`ch[i] - ch[i+1]`), producendo un canale in meno rispetto ai
  canali in ingresso, con nome `"A-B"`. Entrambe richiedono che tutti i
  canali coinvolti abbiano la stessa frequenza di campionamento (altrimenti
  l'API risponde 400 con un messaggio esplicativo).
  **Quando un riferimento è attivo, il calcolo (e la vista) comprendono
  sempre tutti i canali non marcati bad del file** — non solo quelli
  selezionati nel visualizzatore: un canale bad non deve mai entrare in
  una media comune o in una catena bipolare, e questo vale a prescindere
  da cosa hai spuntato nella lista canali (`bad_channels` è un campo
  esplicito di `SignalRequest`/`SpectrogramRequest`/`ExportRequest`, il
  set di canali "buoni" è ricalcolato lato server da
  `store.get_info(file_id)` meno `bad_channels`, ignorando `channels` in
  questa modalità). Di conseguenza, mentre un riferimento è attivo la
  selezione dei canali nella sidebar è disabilitata (con una nota che lo
  spiega): il canale bad marcato viene sempre escluso in automatico e
  gli altri canali good vengono sempre mostrati tutti, indipendentemente
  da quali fossero spuntati. La marcatura bad channel resta sui canali
  originali; nella vista un canale derivato appare "bad" se lo è uno dei
  due canali sorgente (`frontend/src/components/EegCanvas.tsx`,
  `isChannelBad`). Lo spettrogramma di un canale in montaggio bipolare
  risolve automaticamente la coppia della catena (sui soli canali good)
  a cui appartiene il canale cliccato
  (`frontend/src/components/Spectrogram.tsx`, `resolveChannel`).
- L'aspetto grafico usa design token CSS (`frontend/src/styles.css`, custom
  properties su `:root`) con varianti chiaro/scuro; `frontend/src/theme.ts`
  gestisce il tema (hook `useTheme`, persistenza in `localStorage`,
  sincronizzazione con la preferenza di sistema se l'utente non ha mai
  scelto esplicitamente) ed espone gli stessi colori come costanti JS
  (`CANVAS_COLORS`, `TRACE_COLORS`) per i canvas di `EegCanvas.tsx` e
  `Spectrogram.tsx`, che non possono leggere le CSS custom properties.
  I colori dei tracciati usano la palette categorica validata dalla skill
  `dataviz` (ordine fisso, CVD-safe) invece di colori scelti a caso.
- Il grafico multicanale mostra un righello temporale fisso in alto (resta
  visibile scorrendo grazie a `position: sticky`, `EegCanvas.tsx`) con
  tick "nice" in secondi condivisi con griglie verticali attraverso tutti
  i canali, e per ciascun canale l'ampiezza di picco raggiunta al bordo
  della riga nella sua unità fisica (es. "±212 µV") — calcolata dallo
  stesso auto-scale usato per disegnare il tracciato, quindi resta
  coerente quando cambi guadagno o finestra. L'unità viene letta da
  `ChannelInfo.unit` (EDF); per un canale derivato da un montaggio
  bipolare si usa l'unità di uno dei due canali sorgente. La funzione di
  calcolo dei tick (`niceTicks`, `frontend/src/canvasUtils.ts`) è
  condivisa con lo spettrogramma.
