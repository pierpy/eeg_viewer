# Creare un eseguibile desktop

Questa procedura produce un **singolo file eseguibile** (niente Python,
Node o Docker da installare) che una persona può lanciare con un doppio
click: si apre un piccolo server locale e il browser predefinito con
l'EEG Viewer già pronto.

Limite importante: PyInstaller compila per il sistema operativo su cui
viene eseguito, non può fare cross-compiling. Per dare l'eseguibile a un
collega con un SO diverso dal tuo, questi passi vanno ripetuti su una
macchina (anche virtuale) con quel SO — o puoi chiedere al collega
stesso di eseguirli una volta sulla propria.

## 1. Build del frontend (una volta, su qualunque SO)

```bash
cd frontend
npm install
npm run build
```

Questo crea `frontend/dist/`, che il backend servirà direttamente.

## 2. Build dell'eseguibile

### Windows

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-build.txt
pyinstaller --noconfirm eeg_viewer.spec
```

L'eseguibile risultante è `backend\dist\eeg-viewer.exe`.

### macOS

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-build.txt
pyinstaller --noconfirm eeg_viewer.spec
```

L'eseguibile risultante è `backend/dist/eeg-viewer`.

Nota macOS: al primo avvio Gatekeeper probabilmente blocca l'app perché
non è firmata/notarizzata da uno sviluppatore Apple registrato. Il
collega dovrà fare clic destro sull'eseguibile → **Apri** (invece del
doppio click) la prima volta, e confermare nel dialog di sicurezza.

### Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-build.txt
pyinstaller --noconfirm eeg_viewer.spec
```

L'eseguibile risultante è `backend/dist/eeg-viewer`. Potrebbe servire
`chmod +x backend/dist/eeg-viewer` se i permessi non vengono preservati
durante il trasferimento del file.

## 3. Consegnare il file

Basta il singolo eseguibile prodotto al passo 2 (è autonomo, include
già i file del frontend compilati al passo 1) — nessun altro file del
repository serve al collega.

Al lancio:
- si apre una finestra di terminale/console con i log del server (è
  normale, non va chiusa finché si usa l'app);
- il browser predefinito si apre da solo su `http://127.0.0.1:8321`;
- i file .edf caricati restano salvati in una cartella temporanea del
  sistema finché l'eseguibile resta aperto (stessa logica della demo
  Docker — vedi `EEG_VIEWER_UPLOAD_DIR` nel README per cambiare la
  cartella, se serve).

## Se la build fallisce

`pyinstaller` a volte non riesce a individuare automaticamente tutte le
dipendenze native di `scipy`/`numpy`/`pyedflib` su un SO mai provato
prima. Lo spec (`backend/eeg_viewer.spec`) usa già `collect_all` per
questi pacchetti proprio per ridurre il rischio, ma se l'eseguibile
compila e poi si chiude subito all'avvio, rilancialo da terminale (non
con doppio click) per leggere l'errore Python esatto e poter capire
quale modulo manca.
