-- =====================================================================
-- BSI Scoring v4 · Skema Supabase (model KV pengganti Firebase RTDB)
-- ---------------------------------------------------------------------
-- Jalankan seluruh berkas ini sekali di Supabase Dashboard › SQL Editor
-- pada project baru di akun r.ranggairawan@gmail.com.
--
-- Model: satu tabel key-value. Tiap nilai daun (scalar) = satu baris
-- (ns, path, value jsonb). Subpohon direkonstruksi di sisi klien oleh
-- supabase-shim.js. Dua namespace batch1 dan batch2 dipisah pada kolom
-- ns sehingga data dua ruangan paralel tidak pernah bercampur.
--
-- Pertahanan setara firebase-rules.json lama dibangun ulang di sini:
--   1. Isolasi batch         → CHECK ns IN ('batch1','batch2')
--   2. Jendela tulis waktu    → kv_settings + kv_write_allowed() + RLS
--   3. Validasi nilai kritis  → kv_value_valid() (cap Amanah 0..5, enum
--      tier, 6D 1..4, exam 0..100, currentRound 1..6) dipanggil di RLS
-- =====================================================================

-- ── Tabel utama ──────────────────────────────────────────────────────
create table if not exists public.kv (
  ns         text        not null check (ns in ('batch1','batch2')),
  path       text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (ns, path)
);

-- Indeks untuk pencocokan prefix subpohon (path like 'prefix/%').
create index if not exists kv_ns_path_pattern_idx
  on public.kv (ns, path text_pattern_ops);

-- ── Pengaturan jendela tulis ─────────────────────────────────────────
create table if not exists public.kv_settings (
  id          int  primary key default 1 check (id = 1),
  write_open  boolean      not null default true,
  write_from  timestamptz,            -- null = tanpa batas bawah
  write_until timestamptz             -- null = tanpa batas atas
);
insert into public.kv_settings (id) values (1) on conflict (id) do nothing;

-- ── Fungsi: apakah tulisan diizinkan sekarang ───────────────────────
-- SECURITY DEFINER agar dapat membaca kv_settings tanpa memberi anon
-- akses langsung ke tabel pengaturan.
create or replace function public.kv_write_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select s.write_open
         and (s.write_from  is null or now() >= s.write_from)
         and (s.write_until is null or now() <= s.write_until)
  from public.kv_settings s
  where s.id = 1
$$;

-- ── Fungsi: validasi nilai per path (pertahanan inti) ────────────────
create or replace function public.kv_value_valid(p_ns text, p_path text, p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v numeric;
  t text;
begin
  -- Koin Amanah: /amanah/{cabang}/r{n} wajib number 0..5
  if p_path ~ '^/amanah/(jakarta|bandung|surabaya|medan|makassar)/r[1-6]$' then
    if jsonb_typeof(p_value) <> 'number' then return false; end if;
    v := (p_value #>> '{}')::numeric;
    return v >= 0 and v <= 5;
  end if;

  -- Tier empat indikator: enum optimal/plausible/suboptimal/trap
  if p_path like '/tier/%' and p_path ~ '/(cmq|risk|people|csat)$' then
    if jsonb_typeof(p_value) <> 'string' then return false; end if;
    t := p_value #>> '{}';
    return t in ('optimal','plausible','suboptimal','trap');
  end if;

  -- Tier Business Plan Defense: enum, indikator business/risk/people/csat di bawah /bpd/
  if p_path like '/bpd/%' and p_path ~ '/(business|risk|people|csat)$' then
    if jsonb_typeof(p_value) <> 'string' then return false; end if;
    t := p_value #>> '{}';
    return t in ('optimal','plausible','suboptimal','trap');
  end if;

  -- Penilaian 6D coach: number 1..4
  if p_path ~ '^/coach/r[1-6]/(jakarta|bandung|surabaya|medan|makassar)/p[1-6]/(qoa|al|sa|rc|ej|pi)$' then
    if jsonb_typeof(p_value) <> 'number' then return false; end if;
    v := (p_value #>> '{}')::numeric;
    return v >= 1 and v <= 4;
  end if;

  -- Exam pre/post: number 0..100
  if p_path ~ '^/exam/(jakarta|bandung|surabaya|medan|makassar)/p[1-6]/(pre|post)$' then
    if jsonb_typeof(p_value) <> 'number' then return false; end if;
    v := (p_value #>> '{}')::numeric;
    return v >= 0 and v <= 100;
  end if;

  -- Ronde berjalan: number 1..6
  if p_path = '/session/currentRound' then
    if jsonb_typeof(p_value) <> 'number' then return false; end if;
    v := (p_value #>> '{}')::numeric;
    return v >= 1 and v <= 6;
  end if;

  -- Sisanya diperbolehkan (nama, nik, foto, flag, dsb.)
  return true;
end;
$$;

-- ── RPC tulis (dipakai supabase-shim.js) ─────────────────────────────
-- SECURITY INVOKER: RLS tetap berlaku, jadi jendela tulis dan validasi
-- ikut ditegakkan untuk setiap baris yang disentuh.
create or replace function public.kv_set(p_ns text, p_prefix text, p_leaves jsonb)
returns void
language plpgsql
security invoker
as $$
declare k text; val jsonb;
begin
  delete from public.kv
   where ns = p_ns and (path = p_prefix or path like p_prefix || '/%');
  for k, val in select * from jsonb_each(coalesce(p_leaves, '{}'::jsonb)) loop
    insert into public.kv (ns, path, value, updated_at)
    values (p_ns, k, val, now())
    on conflict (ns, path) do update set value = excluded.value, updated_at = now();
  end loop;
end;
$$;

create or replace function public.kv_update(p_ns text, p_prefixes text[], p_leaves jsonb)
returns void
language plpgsql
security invoker
as $$
declare pre text; k text; val jsonb;
begin
  if p_prefixes is not null then
    foreach pre in array p_prefixes loop
      delete from public.kv
       where ns = p_ns and (path = pre or path like pre || '/%');
    end loop;
  end if;
  for k, val in select * from jsonb_each(coalesce(p_leaves, '{}'::jsonb)) loop
    insert into public.kv (ns, path, value, updated_at)
    values (p_ns, k, val, now())
    on conflict (ns, path) do update set value = excluded.value, updated_at = now();
  end loop;
end;
$$;

create or replace function public.kv_remove(p_ns text, p_prefix text)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.kv
   where ns = p_ns and (path = p_prefix or path like p_prefix || '/%');
end;
$$;

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.kv enable row level security;

drop policy if exists kv_read       on public.kv;
drop policy if exists kv_write_ins  on public.kv;
drop policy if exists kv_write_upd  on public.kv;
drop policy if exists kv_write_del  on public.kv;

-- Baca terbuka (board, projector, report perlu memantau real-time).
create policy kv_read on public.kv
  for select to anon, authenticated
  using (true);

-- Tulis hanya dalam jendela waktu dan lolos validasi nilai.
create policy kv_write_ins on public.kv
  for insert to anon, authenticated
  with check ( public.kv_write_allowed() and public.kv_value_valid(ns, path, value) );

create policy kv_write_upd on public.kv
  for update to anon, authenticated
  using ( public.kv_write_allowed() )
  with check ( public.kv_write_allowed() and public.kv_value_valid(ns, path, value) );

create policy kv_write_del on public.kv
  for delete to anon, authenticated
  using ( public.kv_write_allowed() );

-- ── Hak akses peran ──────────────────────────────────────────────────
grant select, insert, update, delete on public.kv to anon, authenticated;
grant execute on function public.kv_set(text, text, jsonb)        to anon, authenticated;
grant execute on function public.kv_update(text, text[], jsonb)   to anon, authenticated;
grant execute on function public.kv_remove(text, text)            to anon, authenticated;
grant execute on function public.kv_write_allowed()               to anon, authenticated;
grant execute on function public.kv_value_valid(text, text, jsonb) to anon, authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL agar event DELETE membawa kolom path (old).
alter table public.kv replica identity full;

-- Tambahkan tabel ke publication realtime Supabase (abaikan bila sudah ada).
do $$
begin
  begin
    alter publication supabase_realtime add table public.kv;
  exception when duplicate_object then null;
  end;
end $$;

-- =====================================================================
-- Mengunci tulisan SETELAH acara (opsional, jalankan saat ingin freeze):
--   update public.kv_settings set write_open = false where id = 1;
-- Membuka kembali:
--   update public.kv_settings set write_open = true  where id = 1;
-- Membatasi pada rentang tanggal tertentu, contoh:
--   update public.kv_settings
--      set write_open = true,
--          write_from  = '2026-06-12 06:00:00+07',
--          write_until = '2026-06-13 19:00:00+07'
--    where id = 1;
-- =====================================================================
