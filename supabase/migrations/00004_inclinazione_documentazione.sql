-- ============================================================================
-- GreenCure VTA – Modulo inclinazione + documentazione (relazione)
-- Campi facoltativi (rilievi esistenti invariati, NULL di default):
--   * inclinazione_tipo    Assente | Lineare | Arcuata | Sciabolata/Sinuosa
--   * inclinazione_gradi    gradi di inclinazione del fusto (°)
--   * curvatura_correttiva  risposta gravitropica adattativa (S/C) presente
--   * instabilita_suolo     sollevamento zolla / cretti sopravento → override Classe D
--   * motivazione_scelte    giustificazione delle scelte (assenza indagini, urgenza…)
-- Additivo e sicuro. Eseguita in produzione via Management API il 2026-07-07.
-- ============================================================================

alter table public.alberi
  add column if not exists inclinazione_tipo    text,
  add column if not exists inclinazione_gradi   real,
  add column if not exists curvatura_correttiva boolean,
  add column if not exists instabilita_suolo    boolean,
  add column if not exists motivazione_scelte   text;
