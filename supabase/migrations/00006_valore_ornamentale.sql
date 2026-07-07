-- ============================================================================
-- GreenCure VTA – Contesto per il valore ornamentale (modello dello studio)
-- Campi facoltativi per la stima del valore ornamentale con curva sigmoide,
-- aspetti di contesto e tetto di riferimento (rilievi esistenti invariati):
--   * posizione_sociale        Dominata | Intermedia | Codominante | Isolata/predominante
--   * contesto_dimora          Buca/pavimentato | Aiuola | Giardino/parco | Parco storico
--   * contesto_localizzazione  Aree rurali | Periurbano | Urbano | Centro storico
--   * vincolo                  Nessuno | Paesaggistico | Monumentale
--   * valore_max_rif           tetto di riferimento (€), tarabile per provincia
-- Additivo e sicuro. Eseguita in produzione via Management API il 2026-07-07.
-- ============================================================================

alter table public.alberi
  add column if not exists posizione_sociale       text,
  add column if not exists contesto_dimora         text,
  add column if not exists contesto_localizzazione text,
  add column if not exists vincolo                 text,
  add column if not exists valore_max_rif          real;
