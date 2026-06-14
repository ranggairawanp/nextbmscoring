# Panduan Deploy · BSI Scoring v4 di Supabase + Vercel

Dokumen ini mengantar Anda dari nol sampai sistem penilaian aktif di akun
baru r.ranggairawan@gmail.com. Seluruh langkah berakun dikerjakan oleh Anda,
karena pembuatan dan login akun tidak dapat saya lakukan.

Urutan: Supabase dulu (database dan realtime), lalu isi konfigurasi, lalu
GitHub, lalu Vercel, lalu uji dua laptop, lalu kunci tulisan setelah acara.

---

## 1. Buat project Supabase

1. Masuk ke https://supabase.com dengan r.ranggairawan@gmail.com.
2. New project. Nama bebas, contoh `bsi-next-bm-2026`. Pilih region
   Singapore (Southeast Asia) agar dekat dengan peserta.
3. Simpan Database Password di tempat aman. Tunggu provisioning selesai.

## 2. Jalankan skema

1. Buka project · menu SQL Editor · New query.
2. Salin seluruh isi `schema.sql`, tempel, klik Run.
3. Pastikan tidak ada error. Skema ini membuat tabel `public.kv`, aturan
   RLS, fungsi validasi, fungsi RPC, dan mengaktifkan realtime.
4. Verifikasi cepat di Table editor: tabel `kv` dan `kv_settings` muncul,
   `kv_settings` berisi satu baris dengan `write_open = true`.

## 3. Ambil kredensial dan isi konfigurasi

1. Menu Project Settings · Data API.
2. Salin **Project URL** dan **anon / publishable key**.
3. Buka berkas `supabase-config.js`, ganti dua nilai placeholder:
   - `url`     ← Project URL
   - `anonKey` ← anon / publishable key
4. anon key aman dipasang di klien, sama seperti apiKey Firebase dahulu.
   Keamanan ada pada RLS, bukan pada kerahasiaan key. Jangan memakai
   service_role key.

## 4. Push ke GitHub

1. Buat repository baru, misal `bsi-next-bm-2026`, di akun GitHub baru.
2. Dari folder ini:

   ```
   git init
   git add .
   git commit -m "BSI Scoring v4 · Supabase"
   git branch -M main
   git remote add origin https://github.com/USERNAME/bsi-next-bm-2026.git
   git push -u origin main
   ```

   Struktur folder dipertahankan apa adanya: `batch1/`, `batch2/`,
   `supabase-config.js`, `supabase-shim.js`, `schema.sql`, `vercel.json`.

## 5. Deploy ke Vercel

1. Masuk ke https://vercel.com dengan akun baru, Add New · Project,
   import repository tadi.
2. Framework Preset: Other. Tidak ada build command. Output langsung
   dari root (situs statis). `vercel.json` sudah menyertakan header
   keamanan dasar.
3. Deploy. Setelah selesai, URL produksi tersedia.

### Peta halaman (relatif terhadap domain Vercel)

| Peran            | Batch 1                          | Batch 2                          |
|------------------|----------------------------------|----------------------------------|
| Gerbang kode     | `/batch1/`                       | `/batch2/`                       |
| Game Master      | `/batch1/gamemaster.html`        | `/batch2/gamemaster.html`        |
| Leader kelompok  | `/batch1/leader.html`            | `/batch2/leader.html`            |
| Coach 6D         | `/batch1/coach.html`             | `/batch2/coach.html`             |
| Papan skor       | `/batch1/board.html`             | `/batch2/board.html`             |
| Layar proyektor  | `/batch1/projector.html`         | `/batch2/projector.html`         |
| Laporan          | `/batch1/report.html`            | `/batch2/report.html`            |
| Admin            | `/batch1/admin.html`             | `/batch2/admin.html`             |

Kode akses (15) tetap: BSI2026ADMIN/GM/LAYAR/BOARD/REPORT,
COACH2026G1 sampai G5, LEADER2026G1 sampai G5.

## 6. Uji dua laptop sebelum hari H (wajib)

Tujuan utama: membuktikan isolasi namespace setelah perbaikan bug NS pada
coach Batch 2 (lihat CATATAN-RILIS-v4.md).

1. Laptop A buka `/batch1/gamemaster.html`, Laptop B buka
   `/batch2/gamemaster.html`. Pastikan pil koneksi berstatus Tersambung.
2. Di Laptop A, finalisasi satu kelompok dan beri Koin Amanah. Di papan
   Batch 1 (`/batch1/board.html`) angka berubah real-time. Papan Batch 2
   tidak boleh ikut berubah.
3. Uji silang Coach: buka `/batch2/coach.html`, isi 6D satu peserta.
   Buka `/batch2/report.html`, nilai harus muncul di Batch 2. Buka
   `/batch1/report.html`, nilai tersebut tidak boleh muncul. Inilah uji
   yang menangkap bug lama.
4. Cek cap Koin Amanah: tekan tambah lebih dari lima kali pada satu ronde,
   nilai berhenti di 5.
5. Bila perlu reset data uji: di Supabase SQL Editor jalankan
   `delete from public.kv;` lalu mulai acara dengan data bersih.

## 7. Kunci tulisan setelah acara

Agar nilai final tidak berubah setelah sesi selesai, di SQL Editor:

```
update public.kv_settings set write_open = false where id = 1;
```

Membuka kembali bila perlu koreksi:

```
update public.kv_settings set write_open = true where id = 1;
```

Pembacaan (papan, laporan) tetap berjalan walau tulisan dikunci.

---

## Catatan operasional

- Backup cepat sebelum hari H: Table editor · kv · Export to CSV. Atau
  `select * from public.kv;` lalu unduh hasilnya.
- Bila pil koneksi tidak pernah Tersambung: cek `supabase-config.js` sudah
  terisi benar, dan tabel `kv` sudah masuk publication realtime (skema
  sudah menangani ini; ulangi Run schema bila ragu).
- Jangan membuka berkas HTML langsung dari disk (file://). Harus lewat
  Vercel atau server lokal, karena modul SDK dimuat via jaringan.
