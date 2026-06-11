#!/usr/bin/env python3
# ============================================================================
# GreenCure VTA – Archiviazione automatica foto su Google Drive
#
# Scarica dal bucket Supabase "foto-alberi" tutte le foto non ancora presenti
# nell'archivio locale dentro la cartella Google Drive (il client Drive del
# Mac le sincronizza poi nel cloud). Organizzazione:
#
#   Il mio Drive/GreenCure-Foto/<CODICE COMMITTENTE>/<CODICE ALBERO>/NAR-2026-001_01.jpg
#
# Non cancella mai nulla, né su Supabase né su Drive: solo copia incrementale.
# Eseguito ogni sera alle 21:00 da launchd (com.greencure.archiviafoto).
# ============================================================================
import json
import re
import sys
import urllib.request
from pathlib import Path

PROGETTO = "twxveuqzjajrgqwtodxb"
BUCKET = "foto-alberi"
BASE = f"https://{PROGETTO}.supabase.co/storage/v1"
DESTINAZIONE = Path(
    "/Users/ruggeromanca/Library/CloudStorage/GoogleDrive-ruggeromanca@gmail.com"
    "/Il mio Drive/GreenCure-Foto"
)
ENV = Path(__file__).resolve().parent.parent / ".env.local"


def anon_key():
    for riga in ENV.read_text().splitlines():
        if riga.startswith("VITE_SUPABASE_ANON_KEY="):
            return riga.split("=", 1)[1].strip()
    sys.exit("Chiave anon non trovata in .env.local")


def api(percorso, dati=None, key=""):
    req = urllib.request.Request(
        BASE + percorso,
        data=json.dumps(dati).encode() if dati is not None else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "greencure-archivio/1.0",
        },
        method="POST" if dati is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def elenca(prefisso, key):
    """Elenco ricorsivo dei file del bucket (le 'cartelle' hanno id null)."""
    file_trovati = []
    offset = 0
    while True:
        voci = json.loads(
            api(
                f"/object/list/{BUCKET}",
                {"prefix": prefisso, "limit": 1000, "offset": offset},
                key,
            )
        )
        for voce in voci:
            percorso = f"{prefisso}/{voce['name']}" if prefisso else voce["name"]
            if voce.get("id") is None:
                file_trovati += elenca(percorso, key)
            else:
                file_trovati.append(percorso)
        if len(voci) < 1000:
            return file_trovati
        offset += 1000


def main():
    key = anon_key()
    tutti = elenca("", key)
    nuovi, totale_byte = 0, 0

    for remoto in tutti:
        nome = remoto.rsplit("/", 1)[-1]            # NAR-2026-001_01.jpg
        m = re.match(r"([A-Z]+)-(\d{4}-\d+)_", nome)
        if m:
            locale = DESTINAZIONE / m.group(1) / f"{m.group(1)}-{m.group(2)}" / nome
        else:                                        # foto precedenti alla rinomina
            locale = DESTINAZIONE / "altre" / nome
        if locale.exists():
            continue
        dati = api(f"/object/public/{BUCKET}/{remoto}", key=key)
        locale.parent.mkdir(parents=True, exist_ok=True)
        locale.write_bytes(dati)
        nuovi += 1
        totale_byte += len(dati)

    print(
        f"Archiviazione completata: {nuovi} foto nuove "
        f"({totale_byte / 1e6:.1f} MB), {len(tutti)} totali nel cloud."
    )


if __name__ == "__main__":
    main()
