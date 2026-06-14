# AGENTS.md — istruzioni per agenti AI sul progetto GreenCure VTA

Questo file è letto automaticamente dagli agenti di coding (Codex, Claude Code, ecc.).
Leggilo prima di toccare il codice e attieniti alle convenzioni. Codice e UI in **italiano**.

## Cos'è
PWA Web-GIS per la Valutazione di Stabilità degli Alberi (VTA) per Comuni e committenti.
Un'unica app, 3 moduli: rilievo in campo (wizard), cruscotto mappa per l'admin, mappe
pubbliche di sola lettura per i committenti.

- App live: https://zm2v8p8mhj-commits.github.io/vtaRM/
- Repo: github.com/zm2v8p8mhj-commits/vtaRM (deploy automatico su push a `main`)
- Backend: Supabase, progetto ref `twxveuqzjajrgqwtodxb`. Chiavi in `.env.local`
  (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). **Non committare segreti.**

## Stack
React 18 + Vite 6 + Tailwind v4 + Leaflet (vanilla, non react-leaflet) + Supabase JS +
IndexedDB (`idb`) + jsPDF + xlsx (SheetJS) + vite-plugin-pwa. Routing: HashRouter.

## Struttura
- `src/lib/` — `constants.js` (vocabolari, `CPC_META`, `GRAVITA`, `DISTRETTI`), `cpc.js`
  (regole CPC + rischio), `cam.js` (conformità CAM da specie), `servizi.js` (CO₂/canopy),
  `db.js` (IndexedDB), `supabaseClient.js`, `sync.js` (push/pull + riconciliazione
  cancellazioni), `geojson.js`, `pdf.js`, `excel.js`, `demoData.js`
- `src/context/AppContext.jsx` — auth admin, stato dati, azioni (salvaAlbero, eliminaAlbero,
  creaComune, sync…)
- `src/components/` — `Layout.jsx`, `TreeMap.jsx` (mappa Leaflet condivisa), `CpcBadge.jsx`
- `src/pages/` — `LoginPage`, `MapPage`, `PublicMapPage`, `SurveyPage` (il wizard, file
  grande e molto attivo), `ArchivePage`, `AdminPage`
- `supabase/migrations/00001_schema_vta.sql` — schema completo + RLS + funzione `mappa_pubblica`

## Modello dati / logica (importante)
- **Accesso**: un solo utente **admin** via Supabase Auth. I committenti NON hanno login:
  consultano `#/v/<share_token>` tramite la funzione SQL security-definer `mappa_pubblica(token)`.
  La RLS riserva le tabelle all'admin.
- **Offline-first**: rilievi e foto in IndexedDB; `sync.js` invia i record con `_synced=false`,
  carica le foto nel bucket Storage `foto-alberi`, scarica i remoti e **rimuove in locale i
  record spariti dal server** (riconciliazione cancellazioni). I campi che iniziano con `_`
  non vanno inviati al DB.
- **CPC** (protocollo S.I.A.): classi A / B / C / C/D / D. 6 distretti anatomici (zolla,
  colletto, fusto, castello, branche, chioma); ogni difetto è `{nome, gravita}` con gravita
  1–4 (Lieve/Significativo/Grave/Estremo → B/C/C-D/D). La CPC = **valore peggiore** tra tutti
  i difetti. `intervento_emergenza` forza D. Classe di rischio = matrice CPC × frequenza
  (`suggerisciRischio`). Conformità CAM suggerita dalla specie (`cam.js`). CO₂ stoccata e
  canopy cover calcolate (`servizi.js`).
- **Retrocompatibilità**: i record vecchi hanno difetti come stringhe e 3 distretti
  (radici/fusto/chioma). `normalizzaDifetti()` in `cpc.js` gestisce entrambi i formati;
  "radici" confluisce in "zolla". **Non rompere questa compatibilità.**

## Regole operative (tassative)
1. La shell può resettare la cwd ad altra cartella: usa SEMPRE percorsi assoluti o
   `cd /Users/ruggeromanca/Desktop/vtaRM` prima di npm/git.
2. Dopo ogni modifica `npm run build` deve passare pulito. Per la logica (CPC, rischio,
   servizi) aggiungi/riusa test rapidi con node prima di pubblicare.
3. **Nuovi campi dati**: se aggiungi un campo al record devi anche (a) aggiungere la colonna
   alla tabella `alberi` su Supabase, (b) aggiornare `supabase/migrations/00001_schema_vta.sql`,
   (c) riportarlo in `geojson.js`, `pdf.js`, `excel.js`. Altrimenti la sync fallisce (upsert su
   colonna inesistente). Le modifiche al DB di produzione richiedono un token Supabase: chiedilo
   al titolare, non inventarlo.
4. **z-index**: Leaflet usa livelli fino a 1000; gli overlay sopra la mappa (FAB, pannelli,
   messaggi) devono avere z-index > 1000.
5. **PWA**: l'app si auto-aggiorna (`registerSW` in `main.jsx`). Non rimuovere quel meccanismo.
6. Stile: commenti per-campo, nomi in italiano, coerenza con i file esistenti. Niente nuove
   dipendenze senza motivo.

## Collaborazione fra agenti
- Lavora su un **branch dedicato** (es. `codex/<feature>` o `claude/<feature>`), non su `main`.
  Apri una PR verso `main`.
- Prima di iniziare: `git pull` e `git log --oneline -15` per vedere cosa è già stato fatto e
  non sovrapporsi. Se tocchi `SurveyPage.jsx`, dichiara nel commit cosa hai cambiato.
- Commit piccoli, messaggi chiari in italiano che spiegano il "perché".
- NON forzare push su `main`, non riscrivere la history, non toccare `.github/workflows/` né i
  segreti.

## Deploy
Push su `main` → GitHub Actions builda con `--base=/vtaRM/` e pubblica su GitHub Pages.
I segreti Supabase sono nei repository secrets.
