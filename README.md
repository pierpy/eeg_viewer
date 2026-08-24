# EEG Viewer

Web app per visualizzare tracciati EEG da file `.edf`: caricamento file,
selezione dinamica dei canali, filtri di visualizzazione (passa-alto,
passa-basso, notch) e navigazione temporale su un grafico multicanale.

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
- **Nuova feature UI** (es. annotazioni, export, spettrogramma): è un
  nuovo componente React montato in `App.tsx`, eventualmente con un nuovo
  router FastAPI in `backend/app/routers/` incluso in `main.py`.
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

## Uso

1. Apri l'app e carica un file `.edf` tramite "Apri file .edf".
2. Seleziona i canali da visualizzare dalla lista (varia in base al file).
3. Attiva/disattiva e regola passa-alto, passa-basso e notch dal pannello
   filtri: i valori si applicano immediatamente al tracciato visibile.
4. Naviga nel tempo con lo slider/i pulsanti Avanti/Indietro e scegli
   l'ampiezza della finestra visibile.
5. Regola il guadagno per scalare l'ampiezza del tracciato.

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
