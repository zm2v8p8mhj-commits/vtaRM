-- ============================================================================
-- GreenCure VTA – Schema iniziale
-- Modello di accesso:
--   * un solo tipo di utente autenticato: ADMIN (Ruggero Manca)
--   * i comuni NON hanno credenziali: consultano una mappa pubblica di sola
--     lettura raggiungibile da un link con token segreto (share_token)
-- Eseguire una sola volta nel SQL Editor di un progetto Supabase nuovo.
-- ============================================================================

-- ----------------------------------------------------------------- tabelle
create table public.comuni (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  codice       text not null unique,          -- es. NAR, CAM
  share_token  uuid not null unique default gen_random_uuid(),
  created_at   timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  role        text not null check (role = 'admin'),
  created_at  timestamptz not null default now()
);

create table public.alberi (
  id                              uuid primary key default gen_random_uuid(),
  codice                          text not null unique,        -- NAR-2026-001
  comune_id                       uuid not null references public.comuni (id),
  data_rilievo                    timestamptz not null default now(),
  lat                             double precision not null,
  lng                             double precision not null,
  localizzazione                  text,
  rilevatore                      text,
  specie_botanica                 text,
  altezza_m                       real,
  dbh_cm                          real,
  diametro_chioma_m               real,
  fase_sviluppo                   text,
  bersagli                        jsonb not null default '[]',
  frequenza_occupazione           text,
  -- difetti: 6 distretti anatomici (radici resta per i record storici)
  radici                          jsonb not null default '{"difetti": []}',
  zolla                           jsonb not null default '{"difetti": []}',
  colletto                        jsonb not null default '{"difetti": []}',
  fusto                           jsonb not null default '{"difetti": []}',
  castello                        jsonb not null default '{"difetti": []}',
  branche                         jsonb not null default '{"difetti": []}',
  chioma                          jsonb not null default '{"difetti": []}',
  -- biometria estesa
  circonferenza_cm                real,
  diametro_branca_cm              real,
  lunghezza_branca_m              real,
  altezza_branca_m                real,
  altezza_bersaglio_m             real,
  -- salute / vigoria
  vigoria                         text,
  fitopatie                       text,
  agente_cariogeno                text,
  -- contesto
  conflitti                       jsonb not null default '[]',
  conformita_cam                  text,
  note_osservazioni               text,
  cpc                             text not null check (cpc in ('A', 'B', 'C', 'C/D', 'D')),
  classe_rischio                  text,
  intervento_emergenza            boolean not null default false,
  richiesta_indagine_strumentale  boolean not null default false,
  tipo_indagine_richiesta         text,
  urgenza_indagine                text,
  data_prossimo_controllo         date,
  prescrizioni_gestionali         text,
  urgenza_intervento              text,
  mitigazione_bersaglio           text,
  urgenza_mitigazione             text,
  co2_kg_anno                     real,
  valore_economico_eur            real,
  url_foto                        jsonb not null default '[]',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index alberi_comune_idx on public.alberi (comune_id);
create index alberi_cpc_idx    on public.alberi (cpc);

create or replace function public.tg_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger alberi_updated_at
  before update on public.alberi
  for each row execute function public.tg_updated_at();

-- --------------------------------------------------- funzione helper RLS
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- ------------------------------------------------------------------- RLS
-- Tutto è riservato all'admin autenticato; il pubblico passa SOLO dalla
-- funzione mappa_pubblica(token), che espone i dati del singolo comune.
alter table public.comuni   enable row level security;
alter table public.profiles enable row level security;
alter table public.alberi   enable row level security;

create policy comuni_admin on public.comuni for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid());

create policy alberi_admin on public.alberi for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- ------------------------------------------- mappa pubblica con token
-- security definer: bypassa la RLS ma restituisce esclusivamente i dati del
-- comune il cui share_token coincide. Il token (UUID casuale) è la chiave di
-- accesso: senza link nessuno può enumerare i dati di altri enti.
create or replace function public.mappa_pubblica(token uuid)
returns jsonb
language sql stable security definer set search_path = public as
$$
  select case when not exists (select 1 from comuni where share_token = token)
    then null
    else jsonb_build_object(
      'comune', (
        select jsonb_build_object('id', id, 'nome', nome, 'codice', codice)
        from comuni where share_token = token
      ),
      'alberi', coalesce((
        select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at')
        from alberi a
        join comuni c on c.id = a.comune_id
        where c.share_token = token
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.mappa_pubblica(uuid) from public;
grant execute on function public.mappa_pubblica(uuid) to anon, authenticated;

-- ------------------------------------------------------------- storage
-- Bucket pubblico in lettura per le foto degli alberi (dato non sensibile);
-- scrittura riservata all'admin.
insert into storage.buckets (id, name, public) values ('foto-alberi', 'foto-alberi', true);

create policy foto_lettura on storage.objects for select
  using (bucket_id = 'foto-alberi');
create policy foto_scrittura on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-alberi' and public.app_role() = 'admin');
create policy foto_aggiorna on storage.objects for update to authenticated
  using (bucket_id = 'foto-alberi' and public.app_role() = 'admin');

-- ------------------------------------------------------------- dati base
insert into public.comuni (nome, codice) values
  ('Comune di Nardò', 'NAR'),
  ('Comune di Campi Salentina', 'CAM');

-- ============================================================================
-- DOPO questa migrazione:
-- 1. Authentication → Users → "Add user": crea il tuo utente admin
-- 2. Esegui (sostituendo l'UUID con quello dell'utente appena creato):
--      insert into public.profiles (id, nome, role)
--      values ('<UUID-utente>', 'Ruggero Manca', 'admin');
-- 3. I link pubblici dei comuni compaiono nella pagina Amministrazione
-- ============================================================================
