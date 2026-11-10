-- =============================================================
--  Esquema de reservas. Pégalo entero en Supabase → SQL Editor → Run.
--  Se puede ejecutar más de una vez sin romper nada.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- Reservas ----------
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  time          text not null check (time ~ '^\d{2}:\d{2}$'),
  service       text not null,
  party         int  not null check (party between 1 and 500),
  name          text not null,
  phone         text not null,
  email         text,
  notes         text,
  status        text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  source        text not null default 'web',          -- web | telefono
  cancel_token  uuid not null default gen_random_uuid() unique,
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

create index if not exists reservations_date_idx on public.reservations (date, status);

-- ---------- Días / turnos bloqueados ----------
create table if not exists public.blocked (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  service     text,                                   -- null = todo el día
  service_key text generated always as (coalesce(service, '*')) stored,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (date, service_key)
);

-- ---------- Seguridad ----------
-- RLS activado y SIN políticas: nadie con la clave pública puede leer ni escribir.
-- Solo el servidor (/api) entra, con la service_role key.
alter table public.reservations enable row level security;
alter table public.blocked      enable row level security;

-- ---------- Crear reserva sin overbooking ----------
-- Bloquea el turno de ese día mientras cuenta las plazas, así dos reservas
-- simultáneas nunca pueden pasarse del aforo.
create or replace function public.create_reservation(
  p_date date, p_time text, p_service text, p_party int,
  p_name text, p_phone text, p_email text, p_notes text,
  p_slot_cap int, p_service_cap int, p_source text default 'web'
)
returns table (id uuid, cancel_token uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_slot int;
  v_service int;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text || ':' || p_service));

  select coalesce(sum(r.party), 0) into v_service
    from reservations r
   where r.date = p_date and r.service = p_service and r.status = 'confirmed';

  select coalesce(sum(r.party), 0) into v_slot
    from reservations r
   where r.date = p_date and r.service = p_service and r.time = p_time and r.status = 'confirmed';

  if v_slot + p_party > p_slot_cap or v_service + p_party > p_service_cap then
    raise exception 'FULL';
  end if;

  return query
    insert into reservations (date, time, service, party, name, phone, email, notes, source)
    values (p_date, p_time, p_service, p_party, p_name, p_phone, nullif(p_email, ''), nullif(p_notes, ''), p_source)
    returning reservations.id, reservations.cancel_token;
end;
$$;

-- Solo el servidor puede llamar a la función.
revoke all on function public.create_reservation(date, text, text, int, text, text, text, text, int, int, text) from public, anon, authenticated;
grant execute on function public.create_reservation(date, text, text, int, text, text, text, text, int, int, text) to service_role;
