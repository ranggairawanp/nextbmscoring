-- =====================================================================
-- BSI Scoring v4 · Seed inisialisasi sesi (dua batch)
-- ---------------------------------------------------------------------
-- Jalankan di SQL Editor sebagai pemilik (default). Idempoten: aman
-- dijalankan berulang. Menyetel ronde awal, fase idle, dan kunci buka
-- untuk kedua namespace sehingga papan dan proyektor langsung merender
-- keadaan awal yang benar bahkan sebelum Game Master menyentuh apa pun.
-- presenting sengaja tidak diisi (null) sesuai semantik aplikasi.
-- =====================================================================
insert into public.kv (ns, path, value, updated_at) values
  ('batch1', '/session/currentRound', '1'::jsonb,     now()),
  ('batch1', '/session/phase',        '"idle"'::jsonb, now()),
  ('batch1', '/session/locked',       'false'::jsonb,  now()),
  ('batch2', '/session/currentRound', '1'::jsonb,     now()),
  ('batch2', '/session/phase',        '"idle"'::jsonb, now()),
  ('batch2', '/session/locked',       'false'::jsonb,  now())
on conflict (ns, path) do update
  set value = excluded.value, updated_at = now();
