-- ============================================================================
-- GreenCure VTA – Tabella "zone"
-- Aree disegnate sulla mappa (strumento di studio) con nome, descrizione dello
-- stato del verde e il poligono dei vertici. Sincronizzate sul cloud così sono
-- condivise tra i PC dell'admin. Accesso riservato all'admin, come alberi/comuni.
-- Eseguire una sola volta nel SQL Editor del progetto Supabase.
-- ============================================================================

create table public.zone (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null default '',
  descrizione  text not null default '',
  punti        jsonb not null default '[]',   -- [[lat, lng], ...]
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger zone_updated_at
  before update on public.zone
  for each row execute function public.tg_updated_at();

alter table public.zone enable row level security;

create policy zone_admin on public.zone for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
