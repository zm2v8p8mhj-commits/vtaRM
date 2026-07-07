-- ============================================================================
-- GreenCure VTA – Campi per relazione secondo le Linee Guida CONAF
-- Aggiunge alla tabella alberi quattro campi facoltativi usati nelle nuove
-- schede (i rilievi esistenti restano invariati, con questi campi a NULL):
--   * apc_m               Area Potenziale di Caduta (raggio, m)
--   * compartimentazione  capacità di compartimentazione (CODIT)
--   * suolo_zpa           condizioni del suolo nella Zona di Protezione dell'Albero
--   * limiti_valutazione  limiti della valutazione (parti non visibili, ipogei, stagionali)
-- Additivo e sicuro: nessun impatto sui dati esistenti né sulla sincronizzazione.
-- Eseguita in produzione via Management API il 2026-07-07.
-- ============================================================================

alter table public.alberi
  add column if not exists apc_m               real,
  add column if not exists compartimentazione  text,
  add column if not exists suolo_zpa           text,
  add column if not exists limiti_valutazione  text;
