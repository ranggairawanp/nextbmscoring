#!/usr/bin/env python3
import re, glob, sys, os

ROOT = "/tmp/build/bsi-scoring-v4-supabase"

NEW_BLOCK_TMPL = '''<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="../supabase-config.js"></script>
<script src="../supabase-shim.js"></script>
<script>
/* Inisialisasi Supabase (pengganti Firebase). Shim menyuntikkan
   window.firebase sehingga DB.ref, dbRef, .on/.once/.set/.update/
   .transaction, dan ServerValue.TIMESTAMP berjalan tanpa perubahan
   pada logika halaman maupun mesin penilaian. */
let DB = null, FB_OK = false;
(function(){
  if(typeof firebase === 'undefined' || typeof window.supabase === 'undefined'){
    console.error('[Supabase] SDK/shim tidak termuat. Jalankan via server, bukan berkas langsung.');
    return;
  }
  try{
    if(!firebase.apps || firebase.apps.length===0){ firebase.initializeApp(window.SUPABASE_CONFIG); }
    DB = firebase.database();
    FB_OK = true;
    console.log('[Supabase] RTDB-compat siap \\u00b7 ' + (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url));
  }catch(e){ console.error('[Supabase] init gagal', e); }
})();
/* Namespace batch \\u00b7 seluruh data halaman ditulis di bawah __NS__
   sehingga Batch 1 dan Batch 2 yang berjalan paralel tidak pernah
   berbagi jalur data. */
const NS = "__NS__";
function dbRef(p){ return DB.ref(NS + p); }
/* Pengikat indikator koneksi pada .fb-pill. Aman saat SDK gagal. */
function bindConnState(){
  const pill=document.querySelector('.fb-pill'); if(!pill) return;
  if(!FB_OK){
    pill.classList.remove('on'); pill.classList.add('off');
    const t=pill.querySelector('.txt'); if(t) t.textContent='Sistem tidak aktif';
    return;
  }
  DB.ref('.info/connected').on('value',s=>{
    const on=s.val()===true;
    pill.classList.toggle('on',on); pill.classList.toggle('off',!on);
    const t=pill.querySelector('.txt'); if(t) t.textContent=on?'Tersambung':'Menyambung';
  });
}
/* Panggil di awal logika halaman yang butuh DB. Bila false, hentikan alur DB. */
function requireFB(){
  if(FB_OK) return true;
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="fb-fail">Koneksi Supabase gagal dimuat. Sistem penilaian ini harus '
    +'dijalankan dari server dengan internet aktif (Vercel atau http server lokal), '
    +'bukan dibuka langsung sebagai berkas atau di jendela pratinjau.</div>');
  return false;
}
</script>'''

# Pola: dari tag CDN firebase-app sampai </script> penutup setelah requireFB.
PATTERN = re.compile(
    r'<script src="https://www\.gstatic\.com/firebasejs/9\.23\.0/firebase-app-compat\.js"></script>.*?function requireFB\(\).*?</script>',
    re.DOTALL
)

files = sorted(glob.glob(os.path.join(ROOT, "batch1", "*.html")) +
               glob.glob(os.path.join(ROOT, "batch2", "*.html")))

assert len(files) == 16, "harus 16 berkas, ketemu %d" % len(files)

for f in files:
    ns = "/batch1" if "/batch1/" in f else "/batch2"
    src = open(f, encoding="utf-8").read()
    # Ambil NS lama untuk verifikasi
    mns = re.search(r'const NS\s*=\s*"(/batch[12])"', src)
    if mns and mns.group(1) != ns:
        print("  PERBAIKAN NS:", os.path.relpath(f, ROOT), "lama=", mns.group(1), "-> benar=", ns)
    block = NEW_BLOCK_TMPL.replace("__NS__", ns)
    new, n = PATTERN.subn(lambda m: block, src, count=1)
    assert n == 1, "blok tidak ditemukan / ganda di %s (n=%d)" % (f, n)
    # Pastikan tidak ada sisa referensi firebase CDN / FB_CONFIG
    assert "gstatic.com/firebasejs" not in new, "sisa CDN firebase di %s" % f
    assert "FB_CONFIG" not in new, "sisa FB_CONFIG di %s" % f
    open(f, "w", encoding="utf-8").write(new)
    print("patched", os.path.relpath(f, ROOT), "->", ns)

print("OK 16 berkas dipatch")
