#!/usr/bin/env python3
# =====================================================================
# BSI Scoring v4 · Generator seed peserta (CSV -> SQL)
# ---------------------------------------------------------------------
# Pakai:
#   python3 seed_build.py peserta_template.csv > seed_peserta.sql
# lalu jalankan seed_peserta.sql di Supabase SQL Editor.
#
# CSV kolom wajib: batch,cabang,slot,nama,nik,jabatan
#   batch   : batch1 | batch2
#   cabang  : jakarta | bandung | surabaya | medan | makassar
#   slot    : p1..p6
#   nama    : nama peserta. Baris dengan nama kosong DILEWATI (kursi
#             kosong untuk kelompok beranggota 5).
#   nik     : opsional
#   jabatan : opsional
# peran selalu "Branch Manager" karena seluruh peserta di meja berperan
# sebagai Branch Manager (bukan distribusi peran).
# =====================================================================
import sys, csv, json

CABANG = {"jakarta","bandung","surabaya","medan","makassar"}
SLOT   = {"p1","p2","p3","p4","p5","p6"}
BATCH  = {"batch1","batch2"}

def jval(s):
    # string -> literal jsonb SQL, aman terhadap kutip
    return "'" + json.dumps(s, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Pemakaian: python3 seed_build.py <peserta.csv> > seed_peserta.sql\n")
        sys.exit(2)
    rows = []
    counts = {}
    with open(sys.argv[1], newline='', encoding='utf-8-sig') as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            batch = (r.get("batch") or "").strip()
            cab   = (r.get("cabang") or "").strip().lower()
            slot  = (r.get("slot") or "").strip().lower()
            nama  = (r.get("nama") or "").strip()
            nik   = (r.get("nik") or "").strip()
            jab   = (r.get("jabatan") or "").strip()
            if not nama:
                continue  # kursi kosong, lewati
            if batch not in BATCH:   sys.exit(f"Baris {i}: batch tidak sah '{batch}'")
            if cab not in CABANG:    sys.exit(f"Baris {i}: cabang tidak sah '{cab}'")
            if slot not in SLOT:     sys.exit(f"Baris {i}: slot tidak sah '{slot}'")
            rows.append((batch, cab, slot, nama, nik, jab))
            counts.setdefault(batch, {}).setdefault(cab, 0)
            counts[batch][cab] += 1

    # Susun nilai daun: nama, nik, jabatan, peran per peserta
    values = []
    for batch, cab, slot, nama, nik, jab in rows:
        base = f"/peserta/{cab}/{slot}"
        values.append((batch, base + "/nama",    jval(nama)))
        values.append((batch, base + "/nik",     jval(nik)))
        values.append((batch, base + "/jabatan", jval(jab)))
        values.append((batch, base + "/peran",   jval("Branch Manager")))

    out = []
    out.append("-- =====================================================================")
    out.append("-- BSI Scoring v4 · Seed peserta (dihasilkan oleh seed_build.py)")
    out.append("-- Idempoten. Jalankan di Supabase SQL Editor sebagai pemilik.")
    out.append("-- =====================================================================")
    out.append("insert into public.kv (ns, path, value, updated_at) values")
    lines = []
    for batch, path, v in values:
        lines.append(f"  ('{batch}', '{path}', {v}, now())")
    out.append(",\n".join(lines))
    out.append("on conflict (ns, path) do update")
    out.append("  set value = excluded.value, updated_at = now();")
    out.append("")
    print("\n".join(out))

    # Ringkasan ke stderr (tidak ikut ke berkas SQL)
    sys.stderr.write("Ringkasan peserta per batch/cabang:\n")
    for b in sorted(counts):
        total = sum(counts[b].values())
        per = ", ".join(f"{c}:{counts[b][c]}" for c in sorted(counts[b]))
        sys.stderr.write(f"  {b}: total {total} · {per}\n")
    sys.stderr.write(f"Total baris daun ditulis: {len(values)} (4 per peserta)\n")

if __name__ == "__main__":
    main()
