# GreenCure VTA – Web-GIS per la gestione del verde pubblico

App unica "field-to-office" per il censimento VTA e la consultazione comunale:

- **In campo (PWA installabile, offline-first)** – rilievo guidato in 6 passi con GPS ad alta
  precisione e correzione manuale del punto, foto, calcolo CPC suggerito, riepilogo con
  prescrizioni urgenti. I dati restano in IndexedDB e si sincronizzano quando torna la rete.
- **In ufficio (cruscotto Web-GIS, solo admin)** – mappa Leaflet (OSM + satellite) con marker
  colorati per Classe di Propensione al Cedimento, popup con foto/scheda PDF, filtri per
  classe, specie e comune, archivio tabellare, import/export GeoJSON.
- **Per i comuni: link pubblico, nessun account** – per ogni ente l'admin genera un link con
  token segreto (es. `https://…/#/v/<token>`) che apre una **mappa di sola consultazione**
  con i soli alberi di quel comune: filtri, schede PDF ed export GeoJSON inclusi. Il link si
  può revocare e rigenerare in qualsiasi momento dalla pagina Amministrazione.

## Modello di accesso

| Chi | Come entra | Cosa può fare |
|-----|-----------|----------------|
| Admin (Ruggero Manca) | login email+password | tutto: rilievi, modifica, export globale, gestione enti e link |
| Comune committente | link pubblico con token | consulta SOLO la propria mappa, scarica schede PDF e GeoJSON |

## Colori CPC

| Classe | Significato | Colore | Prossimo controllo |
|--------|-------------|--------|--------------------|
| A | Trascurabile | 🟢 verde | 24 mesi |
| B | Bassa | 🟡 giallo | 12 mesi |
| C | Moderata | 🟠 arancione | 6 mesi |
| D | Elevata/Estrema | 🔴 rosso | 2 mesi / intervento |

## Avvio rapido (modalità demo, senza backend)

```bash
npm install
npm run dev
```

Apri http://localhost:5173: senza Supabase configurato l'app parte in **modalità demo** con
dati di esempio, salvati solo sul dispositivo. Entra come Admin, oppure prova i link pubblici
demo: `#/v/nardo` e `#/v/campi`.

## Attivazione Supabase (produzione)

1. Crea un progetto su [supabase.com](https://supabase.com).
2. SQL Editor → esegui `supabase/migrations/00001_schema_vta.sql` (crea tabelle, RLS,
   funzione `mappa_pubblica`, bucket foto e i comuni Nardò/Campi Salentina).
3. Authentication → Users → **Add user** (la tua email + password), poi nel SQL Editor:
   ```sql
   insert into public.profiles (id, nome, role)
   values ('<UUID-del-tuo-utente>', 'Ruggero Manca', 'admin');
   ```
4. Copia `.env.example` in `.env.local` e inserisci URL e anon key del progetto
   (Project Settings → API).
5. `npm run dev` → accedi col tuo utente. In **Enti e link** trovi il link pubblico di ogni
   comune da inviare ai committenti.

### Sicurezza / isolamento dati

- Tabelle protette da RLS: **solo l'admin autenticato** può leggere e scrivere.
- Il pubblico accede esclusivamente tramite la funzione `mappa_pubblica(token)`: restituisce
  i soli alberi del comune con quel token. I token sono UUID casuali non enumerabili: il
  Comune di Nardò non può raggiungere i dati di Campi Salentina senza il suo link.
- "Rigenera" in Amministrazione revoca il vecchio link (es. cambio amministrazione o link
  diffuso a terzi).

## Build e hosting

```bash
npm run build   # produce dist/
```

`dist/` è un sito statico: si pubblica su qualunque server comunale (Apache/Nginx, anche in
sottocartella, grazie al routing con hash `#/`), su Netlify/Vercel o su GitHub Pages. Servire
in **HTTPS** è necessario per GPS, fotocamera e installazione PWA.

## Flusso di lavoro consigliato

1. **In campo**: apri l'app dal telefono (installala da "Aggiungi a schermata Home"),
   esegui i rilievi anche senza rete.
2. **Rientro**: con la rete disponibile l'app sincronizza da sola (o tasto 🔄 Sync).
3. **Comune**: invii una sola volta il link pubblico; il tecnico comunale apre la mappa,
   filtra "Solo priorità (C+D)" e scarica le schede PDF.
4. **Report**: "Esporta GeoJSON" globale o filtrato per comune, pronto per QGIS.

## Struttura del progetto

```
src/
├── lib/            # modello dati, CPC, IndexedDB, sync Supabase, GeoJSON, PDF
├── context/        # stato globale: auth admin (Supabase o demo), dati, azioni
├── components/     # layout, badge CPC, TreeMap (mappa condivisa admin/pubblica)
└── pages/          # Login, Mappa, Rilievo (wizard), Archivio, Amministrazione,
                    # PublicMapPage (mappa pubblica per comune via #/v/<token>)
supabase/
└── migrations/     # schema + RLS + funzione mappa_pubblica + bucket foto
```

## Possibili estensioni

- Clustering dei marker (`leaflet.markercluster`) oltre i ~2.000 alberi
- Report PDF riepilogativo per comune (statistiche per classe)
- Notifiche per i controlli in scadenza (`data_prossimo_controllo`)
