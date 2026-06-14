# BSI Scoring System v4 · Rilis Final Terpoles · Siap Deploy

Sistem penilaian Branch Banking Simulation, BSI Next BM School 2026.
Rilis ini sudah melewati QA Technical Lead penuh dan seluruh temuan yang
dapat ditangani di sisi kode telah diterapkan.

## v4.2 · Tombol submit Group Leader · 14 Juni 2026

Group Leader kini punya tombol konfirmasi "Kirim Penilaian Saya", seragam di
R1 sampai R6 maupun Business Plan Defense. Perilaku auto-save dipertahankan
penuh: tiap klik tier tetap langsung tersimpan, jadi tidak ada risiko suara
hilang. Tombol berperan sebagai konfirmasi, bukan gerbang.

Tombol baru aktif setelah keempat indikator terpilih. Setelah ditekan, status
berubah menjadi "Penilaian Anda sudah terkirim lengkap" dan tombol berlabel
"Sudah Terkirim". Bila leader mengubah salah satu tier sesudahnya, status
otomatis reset dan tombol aktif lagi, karena pengunci sebenarnya tetap
Finalisasi di tangan Game Master.

Di panel Game Master, tiap baris Group Leader pada matriks suara diberi tanda
centang ketika leader itu sudah menekan submit, sehingga GM tahu kelimanya
sudah mengirim sebelum menekan Finalisasi.

Status submit disimpan sebagai flag _submitted di node peer (/tier/.../peers/
{kelompok}/_submitted dan /bpd/{cabang}/peers/{kelompok}/_submitted). Flag ini
murni penanda antarmuka. Diverifikasi terisolasi penuh dari skor: report.html
tidak pernah membacanya, perhitungan tier final hanya membaca empat indikator,
dan flag tidak menyentuh CM, BPM, L3, ranking, maupun Skor Kelompok.

## v4.1 · Business Plan Defense masuk L3 · 14 Juni 2026

Formula L3 dikembalikan ke komposisi tiga komponen: BPM kumulatif cabang
30%, Perilaku 6D 55%, dan Business Plan Defense 15%. Versi v4 sebelumnya
sempat memakai 30/70 tanpa Defense.

Business Plan Defense dinilai sekali per kelompok, satu presentasi dan satu
sesi tanya jawab, ditutup satu assessment panel. Empat indikator dinilai
dengan tier yang sama seperti R1 sampai R6: Optimal, Plausible, Suboptimal,
Trap. Faktor tier seragam: Optimal 1,00 · Plausible 0,95 · Suboptimal 0,90
· Trap 0,85. Bobot indikator khusus BPD: Business 35%, Risk 25%, People 20%,
Customer Satisfaction 20%.

  BPD = 0,35·f(Business) + 0,25·f(Risk) + 0,20·f(People) + 0,20·f(CSAT)
  Defense = BPD × 100, rentang 85 sampai 100
  L3 = 0,30·BPM_100 + 0,55·Perilaku6D + 0,15·Defense

Penilai: Game Master ditambah empat Group Leader kelompok lain. Kelompok yang
sedang tampil tidak menilai dirinya sendiri. Final per indikator memakai mode
lima suara dengan GM sebagai pemecah seri, identik mekanisme panel R1-R6.
Input GM di gamemaster.html, input peer di leader.html.

Isolasi: BPD disimpan di path terpisah /bpd/{cabang} dan hanya dibaca
report.html untuk L3. BPD tidak menggerakkan CM, layar skor, ranking, maupun
Skor Kelompok. Hal ini diverifikasi lewat asersi mesin: cmImpact, BPM
kumulatif, dan Skor Kelompok identik dengan maupun tanpa data BPD. Board dan
projector tidak memuat listener /bpd.

Sebelum Defense difinalkan, L3 sementara memakai (0,30·BPM_100 +
0,55·Perilaku6D) dibagi 0,85, agar tetap pada skala 0 sampai 100 dan tidak
menghukum kelompok yang Defense-nya belum dinilai.

Validasi nilai /bpd ditambahkan ke schema.sql: hanya menerima empat string
tier pada path yang berakhir business, risk, people, atau csat.

## Migrasi ke Supabase · 13 Juni 2026

Lapisan data dipindah dari Firebase Realtime Database ke Supabase tanpa
mengubah mesin penilaian, kontrak data, maupun formula. Cara: berkas
`supabase-shim.js` menyuntikkan `window.firebase` yang meniru permukaan
RTDB (DB.ref, .set, .update, .once, .on, .off, .remove, .transaction,
.info/connected, ServerValue.TIMESTAMP). Data disimpan sebagai pasangan
key-value di tabel `public.kv` (kolom ns, path, value jsonb), dan subpohon
direkonstruksi di klien. Realtime memakai postgres_changes yang difilter
per namespace batch.

Pertahanan firebase-rules.json lama dibangun ulang di `schema.sql`:
isolasi batch lewat CHECK ns, jendela tulis lewat tabel kv_settings dan
RLS, serta validasi nilai kritis lewat fungsi kv_value_valid (cap Koin
Amanah 0..5, enum tier, 6D 1..4, exam 0..100, currentRound 1..6).

Uji fungsional shim terhadap semantik RTDB: 13 dari 13 skenario lulus,
mencakup inisialisasi session, update merge tanpa menghapus saudara,
finalisasi tier dengan ServerValue, set subfield tanpa menimpa field lain,
peers vote, cap transaksi Amanah di 5, listener on(value), propagasi
realtime antar klien, penghapusan subpohon, dan isolasi namespace.

### Perbaikan bug laten namespace · penting

Pada paket Firebase sebelumnya, `batch2/coach.html` keliru diset
`const NS = "/batch1"`. Akibatnya seluruh penilaian 6D Coach di Batch 2
diam-diam tertulis ke namespace Batch 1, sehingga klaim isolasi namespace
tidak terpenuhi untuk jalur Coach. Pada rilis Supabase ini, NS dipaksa
mengikuti folder berkas, sehingga `batch2/coach.html` kini benar memakai
`/batch2`. Inilah alasan utama uji dua laptop pada PANDUAN-DEPLOY langkah 6
wajib dilakukan: untuk membuktikan jalur Coach Batch 2 tidak lagi bocor ke
Batch 1.

Berkas firebase-rules.json dan FIREBASE-RULES-v4.md dihapus dari paket ini
karena tidak lagi relevan.

---

## Recalibrasi Delta CM · 26 Mei 2026

Kalibrasi Delta CM disetel ulang dengan anchor satu ronde sama dengan dua
bulan trajektori CM cabang. Jalur Plausible konsisten kini mendarat di
Σ +1.200 Jt setahun, rata-rata 200 Jt per ronde. Tabel per ronde, Rp Juta:

  Ronde                  Optimal  Plausible  Suboptimal  Trap
  R1 Diagnose              210      150        70        nihil
  R2 Grow the Top Line     350      250       110         -45
  R3 Optimize the Funding  310      220       100         -40
  R4 Defend Against Erosion 210     150        70         -35
  R5 Lead Through Pressure 280      200        90         -35
  R6 Year-End Capstone     320      230       100         -45
  Sigma setahun           1.680    1.200      540        -200

Alasan: kalibrasi lama menempatkan R1 pada skala puluhan juta
(Optimal 90, Plausible 60, Suboptimal 30), bertentangan dengan prinsip
terkunci bahwa Delta CM per ronde berskala ratusan juta. Recalibrasi
menutup inkonsistensi itu sekaligus membuat angka rupiah terasa
sepadan dengan cabang yang CM tahunannya di atas satu miliar.

Dampak pada mesin: envelope normalisasi cm_index bergeser dari batas atas
1.400 ke 1.680, batas bawah tetap -200 karena Σ Trap tidak berubah.
Skor Kelompok ternormalisasi praktis tidak bergerak, jalur all-Plausible
74,5 berbanding 75,0 pada kalibrasi lama. Artinya angka rupiah jadi
realistis tanpa mengganggu peta persaingan leaderboard. Band
zona_realisasi_cm per lima cabang ikut dihitung ulang.

Terverifikasi: node --check lulus 16 berkas; uji mesin memastikan
Σ Plausible 1.200, Σ Optimal 1.680, R1 tanpa Trap; render board dan
projector menampilkan skala Delta CM ratusan juta.

## Perbaikan tampilan kelompok belum dinilai · 26 Mei 2026

Pada board dan projector, kelompok yang belum punya satu ronde
terfinalisasi kini menampilkan label Belum dinilai pada slot Skor
Kelompok dan pada badge zona, menggantikan angka skor dasar dan label
zona awal cabang.

Sebab perbaikan: Skor Kelompok memakai normalisasi global dengan titik
nol tidak berada di ujung bawah envelope. Kelompok dengan nol ronde
selesai tetap menghasilkan skor dasar sekitar 21, dan badge zona
menampilkan posisi awal cabang. Keduanya benar secara perhitungan
tetapi terbaca seolah kelompok sudah dinilai. Pembeda yang dipakai
adalah jumlah ronde selesai per kelompok, bukan status papan global,
sehingga papan campuran menampilkan skor untuk kelompok yang sudah
dinilai dan label Belum dinilai untuk yang belum, pada saat bersamaan.

Logika mesin tidak diubah. Perbaikan murni pada lapis tampilan board
dan projector untuk kedua batch. Terverifikasi: node --check lulus,
render papan kosong dan papan campuran benar.

## Koin Amanah masuk Skor Kelompok · 26 Mei 2026

Koin Amanah kini ikut menghitung Skor Kelompok lewat komponen BPM,
membalik pengaturan terkunci 9 Mei yang memisahkannya. Mesin diubah:
bpmIndex menormalkan BPM Total, yaitu BPM tier kumulatif ditambah Koin
Amanah, pada envelope baru -50 sampai +90. Skor Kelompok tetap 70 persen
Delta CM ternormalisasi ditambah 30 persen BPM ternormalisasi, hanya
basis BPM-nya yang kini memuat Amanah, konsisten dengan BPM Total yang
selama ini sudah tampil di kartu.

CPI tetap bersih. L3 dan bpm100 sengaja dipisah, tetap memakai envelope
tier murni -50 sampai +60 tanpa Amanah, sehingga kelulusan individu
tidak terpengaruh koin diskresi Game Master.

Konsekuensi yang melekat: maksimal 30 koin setara sekitar 6,4 poin pada
Skor Kelompok skala 100. Tier sempurna tanpa koin tidak lagi menyentuh
100 pada sub-indeks BPM, hanya sekitar 79, karena envelope melebar untuk
menampung koin. Skor kelompok yang sudah dinilai sedikit lebih rendah
dari sebelum perubahan pada data tier yang sama, ini benar dan sesuai
pelebaran envelope.

Terverifikasi: node --check lulus 16 berkas; uji mesin memastikan selisih
0 dan 30 koin tepat 6,43 poin, l3 dan bpm100 tidak bergerak oleh Amanah;
render board bersih.

## Cap Amanah ditegakkan di engine · 26 Mei 2026

Lapis ketiga pertahanan cap 5 koin per ronde ditambahkan di engine
deriveAll, di 16 berkas. Sebelum perbaikan ini, engine percaya begitu
saja nilai Amanah yang dibaca dari Firebase. Akibatnya kalau database
berisi nilai melebihi 5 di satu ronde, entah dari data uji manual,
migrasi lama, atau bug yang terjadi sebelum cap di gamemaster terpasang,
engine memakai nilai tersebut apa adanya, BPM Total membengkak, dan
sejak Amanah masuk Skor Kelompok lewat komponen BPM, peringkat ikut
terdistorsi.

Tiga lapis pertahanan kini lengkap. Lapis pertama, gamemaster, menolak
klik tambah koin saat cap tercapai. Lapis kedua, Firebase rules,
menolak penulisan nilai di atas 5 di sisi server. Lapis ketiga, engine
deriveAll, men-cap saat membaca: setiap nilai per ronde dipaksa ke
rentang 0 sampai 5 dengan Math.min dan Math.max sebelum dijumlahkan.
Berapa pun nilai yang sudah terlanjur ada di Firebase, engine
menafsirkannya maksimum 5 per ronde dan maksimum 30 lintas enam ronde.

Verifikasi: data uji Makassar dengan amanah r1 = 13 koin di Firebase,
setelah cap defensif, engine membaca 5. BPM Total kartu turun dari +19
menjadi +11. Skor Kelompok ikut turun ke nilai yang adil. node check
lulus 16 berkas, render board mengonfirmasi label "5 Amanah" walau
Firebase masih berisi 13.

## Struktur paket
- batch1/  8 HTML, namespace Firebase "/batch1"
- batch2/  8 HTML, namespace Firebase "/batch2"
- vercel.json          header keamanan dasar
- firebase-rules.json  aturan keamanan Realtime Database, model v4
- FIREBASE-RULES-v4.md draf dan penjelasan aturan Firebase
- CATATAN-RILIS-v4.md  dokumen ini

Delapan halaman: index, gamemaster, leader, coach, board, projector,
report, admin. Batch 1 dan Batch 2 berjalan paralel 12-13 Juni 2026 pada
dua namespace terpisah sehingga data tidak bercampur.

## Hasil QA dan perbaikan yang diterapkan

Pemeriksaan menyeluruh: inspeksi kode jalur tulis-baca Firebase, uji
kalkulasi mesin, render desktop dan mobile, uji generasi PDF, telusur
referensi mati. Tidak ada Blocker.

Diterapkan pada rilis ini:
- M1 · Pengaman batch. Badge permanen di setiap halaman, teal untuk
  Batch 1 dan emas untuk Batch 2, plus label batch pada judul tab.
  Mencegah fasilitator membuka folder batch yang keliru saat dua
  ruangan berjalan serentak.
- N1 · Pil indikator koneksi menciut menjadi titik saat tersambung,
  tidak lagi menutupi tombol di layar sempit. Teks penuh hanya muncul
  saat terputus, justru saat perlu terlihat.
- N2 · Predikat CPI pada report diselaraskan dengan ambang lulus 3,00.
  Predikat B kini mulai dari CPI 3,00, tidak lagi 2,50, sehingga tidak
  ada lagi peserta berpredikat B tetapi berstatus belum lulus.
- N3 · Footer projector menegaskan Skor Kelompok bersifat berjalan.
- Kebersihan kode. CSS mati panel Sesi Defense pada coach.html dihapus.

Ditemukan dan sudah diperbaiki lebih awal saat propagasi v4:
- Panel audit admin yang membaca key mati consequence, ditulis ulang ke
  model tier v4.
- Field catatan dimensi 6D yang dilepas mesin v4, dipasang peta lokal
  pada coach.

## Yang masih di luar kode, wajib disiapkan tim

- M2 · Aturan keamanan Firebase. PENTING. Rules yang sekarang live di
  Firebase berasal dari v3 dan tidak kompatibel dengan v4; bila tidak
  diganti, sistem penilaian lumpuh total saat dipakai. Berkas
  firebase-rules.json di paket ini sudah dibangun ulang untuk model data
  v4 dan diverifikasi silang terhadap setiap operasi tulis aplikasi.
  Tempel di konsol Firebase, menu Realtime Database, tab Rules, lalu
  Publish. Rincian dan penjelasan ada di FIREBASE-RULES-v4.md.

## Verifikasi teknis
- node --check lulus untuk seluruh 16 berkas.
- Render Playwright tanpa galat, desktop dan mobile.
- Generasi PDF report empat halaman bersih, konten v4 benar.
- Kontrak Firebase konsisten: gamemaster menulis tier dan finalisasi,
  leader menulis suara peer, board projector report membaca bentuk
  yang sama.
- Cap Amanah lima koin per ronde dijaga ganda.
- Mesin terbukti: Jakarta jalur kuat Delta CM +680 Jt, CM per Pegawai
  31,1 jt, BPM Total +33.
- Isolasi namespace batch1 dan batch2 benar.

## Brief fasilitator, dua hal untuk disampaikan
- Skor Kelompok dinormalkan terhadap envelope satu tahun penuh, jadi
  nilai merangkak naik sepanjang enam ronde dan baru wajar di R6.
- Peringkat dan zona mengukur hal berbeda. Sebuah cabang bisa memuncaki
  peringkat sekaligus berzona rendah; peringkat menilai mutu keputusan,
  zona menilai pendaratan CM absolut terhadap RBB cabang itu sendiri.

## Urutan deploy yang disarankan
1. Tempel firebase-rules.json di konsol Firebase.
2. Deploy paket ini ke Vercel.
3. Dry-run penuh dengan dua laptop membuka batch berbeda secara sengaja,
   pastikan tidak ada kebocoran data antar-batch.
4. Setelah dry-run lolos, paket siap dipakai pada 12-13 Juni 2026.
