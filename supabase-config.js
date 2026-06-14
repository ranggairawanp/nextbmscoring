/* ===================================================================
   BSI Scoring v4 · Konfigurasi Supabase
   -------------------------------------------------------------------
   Isi dua nilai di bawah setelah Anda membuat project Supabase di akun
   r.ranggairawan@gmail.com. Ambil dari Supabase Dashboard:
     Project Settings  ›  Data API
       • Project URL          → url
       • Project API keys      → anon / publishable key  → anonKey

   Catatan keamanan: anon key memang dirancang untuk dipasang di sisi
   klien dan aman ditampilkan, persis seperti apiKey Firebase dahulu.
   Pengamanan sebenarnya berada di Row Level Security tabel public.kv
   (lihat schema.sql), bukan pada kerahasiaan key ini. JANGAN memasang
   service_role key di sini.
   =================================================================== */
window.SUPABASE_CONFIG = {
  url:     "https://tcmnoelivjlsoazcjqwj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbW5vZWxpdmpsc29hemNqcXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDM1NTksImV4cCI6MjA5Njk3OTU1OX0.yxkzUDRBfhofS7i3RGQIypFi8OX6YAMXiWw4RlDaHHY"
};
