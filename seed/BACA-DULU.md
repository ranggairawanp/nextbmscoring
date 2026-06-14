# Seed Data · Urutan Pakai

Folder ini mengisi database dengan data awal supaya dry run memakai data
nyata, bukan kosong.

## Urutan

1. Pastikan `schema.sql` (di folder induk) sudah dijalankan.

2. Jalankan `seed_session.sql` di Supabase SQL Editor. Ini menyetel ronde
   awal, fase idle, dan kunci buka untuk kedua batch. Aman diulang.

3. Isi `peserta_template.csv` dengan data peserta final. Kolom:
   `batch,cabang,slot,nama,nik,jabatan`. Aturan:
   - batch: batch1 atau batch2
   - cabang: jakarta, bandung, surabaya, medan, makassar (ini adalah lima
     meja kelompok, bukan kota asal peserta)
   - slot: p1 sampai p6
   - Baris dengan nama kosong dilewati, jadi kelompok beranggota 5 cukup
     dikosongkan slot p6 (template Batch 2 sudah disiapkan 6,6,6,5,5).
   - peran tidak perlu diisi, sistem memakai Branch Manager untuk semua
     karena seluruh peserta di meja berperan sebagai Branch Manager.

4. Hasilkan SQL seed peserta:

   ```
   python3 seed_build.py peserta_template.csv > seed_peserta.sql
   ```

   Generator menampilkan ringkasan jumlah peserta per batch dan cabang ke
   layar, agar Anda dapat memverifikasi komposisi 6,6,6,6,6 untuk Batch 1
   dan 6,6,6,5,5 untuk Batch 2 sebelum menulis ke database.

5. Jalankan `seed_peserta.sql` di SQL Editor. Idempoten, aman diulang.

## Reset data

Untuk mengulang dari bersih, misalnya setelah dry run:

```
delete from public.kv;
```

lalu ulangi langkah 2 sampai 5.

## Catatan

- Seed memakai INSERT langsung sebagai pemilik, sehingga berhasil tanpa
  bergantung pada jendela tulis kv_settings.
- CM baseline per cabang tidak diseed ke database. Nilai itu untuk posisi
  awal magnetic marker pada CM Tracker fisik, bukan bagian dari sistem
  penilaian digital. CM dalam sistem diturunkan dari tier per ronde.
