/* ===================================================================
   BSI Scoring v4 · Lapisan data Supabase (kompatibel Firebase RTDB)
   -------------------------------------------------------------------
   Berkas ini menyuntikkan window.firebase yang meniru permukaan API
   Firebase Realtime Database yang dipakai aplikasi, tetapi ditopang
   tabel public.kv di Supabase. Seluruh logika halaman, mesin penilaian,
   dan kontrak data tetap utuh: DB.ref, dbRef, .set, .update, .once,
   .on, .off, .remove, .transaction, .info/connected, dan
   ServerValue.TIMESTAMP berperilaku seperti sebelumnya.

   Model penyimpanan: setiap nilai daun (scalar) disimpan sebagai satu
   baris (ns, path, value jsonb). Subpohon direkonstruksi dari daun.
   Realtime lewat postgres_changes pada tabel kv, difilter per namespace
   batch sehingga Batch 1 dan Batch 2 tidak pernah berbagi jalur data.
   =================================================================== */
(function () {
  'use strict';

  /* Sentinel stempel waktu server, padanan ServerValue.TIMESTAMP. */
  var TS = { __sv__: 'timestamp' };

  var _client = null;
  var NS = null;                 // 'batch1' | 'batch2'
  var cache = Object.create(null); // rel-path -> nilai daun
  var listeners = [];            // { prefix, cb }
  var connListeners = [];        // cb(boolSnapshot)
  var connected = false;
  var bootstrapped = false;
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  /* ── Util namespace & path ─────────────────────────────────────── */
  function deriveNS() {
    if (window.BSI_NS) return String(window.BSI_NS).replace(/^\//, '');
    var m = (location.pathname || '').match(/(batch[12])/);
    return m ? m[1] : 'batch1';
  }

  /* fullPath dari DB.ref() berbentuk '/batch1/...' atau '.info/connected'.
     Kembalikan rel relatif namespace, mis. '/session', '/tier/r1/jakarta'. */
  function toRel(full) {
    var m = full.match(/^\/(?:batch[12])(\/.*)?$/);
    if (m) return m[1] || '/';
    return full; // sudah relatif
  }

  /* ── Snapshot ──────────────────────────────────────────────────── */
  function buildVal(prefix) {
    var hasExact = Object.prototype.hasOwnProperty.call(cache, prefix);
    var childPrefix = (prefix === '/' ? '/' : prefix + '/');
    var obj = null;
    for (var path in cache) {
      if (path === prefix) continue;
      if (path.indexOf(childPrefix) === 0) {
        var rest = path.slice(childPrefix.length);
        if (!rest) continue;
        var parts = rest.split('/');
        obj = obj || {};
        var node = obj;
        for (var i = 0; i < parts.length - 1; i++) {
          if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) {
            node[parts[i]] = {};
          }
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = cache[path];
      }
    }
    if (obj !== null) return obj;       // subpohon
    if (hasExact) return cache[prefix]; // daun scalar
    return null;                        // tidak ada
  }

  function makeSnap(prefix) {
    var v = buildVal(prefix);
    return {
      val: function () { return v; },
      exists: function () { return v !== null && v !== undefined; }
    };
  }

  function boolSnap() {
    var b = connected;
    return { val: function () { return b; }, exists: function () { return true; } };
  }

  /* ── Emit ──────────────────────────────────────────────────────── */
  function emitAll() {
    /* Data sangat kecil; lebih aman dan sederhana memantik ulang semua
       listener nilai pada setiap perubahan. */
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i].cb(makeSnap(listeners[i].prefix)); } catch (e) {}
    }
  }
  function setConnected(b) {
    if (connected === b) return;
    connected = b;
    for (var i = 0; i < connListeners.length; i++) {
      try { connListeners[i](boolSnap()); } catch (e) {}
    }
  }

  /* ── Flatten nilai menjadi peta daun ───────────────────────────── */
  function flatten(prefix, value, out) {
    if (value === TS) value = Date.now();
    if (value !== null && typeof value === 'object') {
      var empty = true;
      for (var k in value) {
        if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
        empty = false;
        flatten(prefix + '/' + k, value[k], out);
      }
      /* objek kosong → tidak menulis daun apa pun (padanan hapus node) */
    } else if (value !== null && value !== undefined) {
      out[prefix] = value;
    }
  }

  /* ── Mutasi cache lokal (optimistik) ───────────────────────────── */
  function dropSubtree(prefix) {
    var cp = prefix + '/';
    for (var path in cache) {
      if (path === prefix || path.indexOf(cp) === 0) delete cache[path];
    }
  }
  function applySet(rel, leaves) {
    dropSubtree(rel);
    for (var p in leaves) cache[p] = leaves[p];
  }
  function applyUpdate(prefixes, leaves) {
    for (var i = 0; i < prefixes.length; i++) dropSubtree(prefixes[i]);
    for (var p in leaves) cache[p] = leaves[p];
  }

  /* ── Operasi tulis ke Supabase ─────────────────────────────────── */
  function rpcSet(rel, leaves) {
    return _client.rpc('kv_set', { p_ns: NS, p_prefix: rel, p_leaves: leaves });
  }
  function rpcUpdate(prefixes, leaves) {
    return _client.rpc('kv_update', { p_ns: NS, p_prefixes: prefixes, p_leaves: leaves });
  }
  function rpcRemove(rel) {
    return _client.rpc('kv_remove', { p_ns: NS, p_prefix: rel });
  }

  function doSet(rel, value) {
    var leaves = {};
    flatten(rel, value, leaves);
    applySet(rel, leaves);   // optimistik
    emitAll();
    return rpcSet(rel, leaves).then(function (res) {
      if (res && res.error) throw res.error;
      return res;
    });
  }
  function doUpdate(rel, obj) {
    var leaves = {};
    var prefixes = [];
    var base = (rel === '/' ? '' : rel);
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var childPrefix = base + '/' + k;
      prefixes.push(childPrefix);
      if (obj[k] !== null && obj[k] !== undefined) {
        flatten(childPrefix, obj[k], leaves);
      }
    }
    applyUpdate(prefixes, leaves); // optimistik
    emitAll();
    return rpcUpdate(prefixes, leaves).then(function (res) {
      if (res && res.error) throw res.error;
      return res;
    });
  }
  function doRemove(rel) {
    dropSubtree(rel);
    emitAll();
    return rpcRemove(rel).then(function (res) {
      if (res && res.error) throw res.error;
      return res;
    });
  }

  /* ── Node (padanan firebase ref) ───────────────────────────────── */
  function makeNode(rel) {
    return {
      _rel: rel,
      set: function (value) {
        return ready.then(function () { return doSet(rel, value); });
      },
      update: function (obj) {
        return ready.then(function () { return doUpdate(rel, obj); });
      },
      remove: function () {
        return ready.then(function () { return doRemove(rel); });
      },
      once: function (ev, cb) {
        var pr = ready.then(function () {
          var s = makeSnap(rel);
          if (typeof cb === 'function') cb(s);
          return s;
        });
        return pr;
      },
      on: function (ev, cb) {
        var entry = { prefix: rel, cb: cb };
        listeners.push(entry);
        ready.then(function () { try { cb(makeSnap(rel)); } catch (e) {} });
        return cb;
      },
      off: function () {
        for (var i = listeners.length - 1; i >= 0; i--) {
          if (listeners[i].prefix === rel) listeners.splice(i, 1);
        }
      },
      transaction: function (updateFn, onComplete) {
        return ready.then(function () {
          return _client.from('kv').select('value')
            .eq('ns', NS).eq('path', rel).maybeSingle()
            .then(function (res) {
              if (res && res.error && res.error.code && res.error.code !== 'PGRST116') {
                throw res.error;
              }
              var cur = (res && res.data) ? res.data.value : null;
              var next = updateFn(cur);
              if (next === undefined) {
                if (onComplete) onComplete(null, false, makeSnap(rel));
                return;
              }
              return doSet(rel, next).then(function () {
                if (onComplete) onComplete(null, true, makeSnap(rel));
              });
            })
            .catch(function (err) {
              if (onComplete) onComplete(err, false, null);
              else throw err;
            });
        });
      }
    };
  }

  function makeConnNode() {
    return {
      on: function (ev, cb) {
        connListeners.push(cb);
        try { cb(boolSnap()); } catch (e) {}
        return cb;
      },
      off: function () {
        connListeners.length = 0;
      }
    };
  }

  /* ── Realtime handler ──────────────────────────────────────────── */
  function handleChange(payload) {
    var ev = payload.eventType || payload.event;
    if (ev === 'DELETE') {
      var op = payload.old || {};
      if (op.path != null) delete cache[op.path];
    } else {
      var np = payload.new || {};
      if (np.path != null) cache[np.path] = np.value;
    }
    emitAll();
  }

  /* ── Bootstrap: muat awal + langganan realtime ─────────────────── */
  function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    /* Supabase membatasi satu permintaan select maksimal 1000 baris.
       Data satu batch dapat jauh melampaui itu (skor 6D, tier, exam,
       peserta, dll.), sehingga pemuatan awal wajib bertahap dengan
       range hingga seluruh baris terbaca. Tanpa ini, sebagian nilai
       tidak pernah sampai ke halaman dan tampak hilang. */
    var PAGE = 1000;
    var acc = [];
    function fetchPage(from) {
      return _client.from('kv').select('path,value').eq('ns', NS)
        .order('path', { ascending: true })
        .range(from, from + PAGE - 1)
        .then(function (res) {
          if (res && res.error) { console.error('[Supabase] muat awal gagal', res.error); return; }
          var rows = (res && res.data) || [];
          for (var i = 0; i < rows.length; i++) acc.push(rows[i]);
          if (rows.length === PAGE) return fetchPage(from + PAGE);
        });
    }
    fetchPage(0)
      .then(function () {
        cache = Object.create(null);
        for (var i = 0; i < acc.length; i++) cache[acc[i].path] = acc[i].value;
        var ch = _client.channel('kv_' + NS)
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'kv', filter: 'ns=eq.' + NS },
              handleChange)
          .subscribe(function (status) {
            setConnected(status === 'SUBSCRIBED');
          });
        readyResolve();
        emitAll();
      })
      .catch(function (e) {
        console.error('[Supabase] bootstrap gagal', e);
        readyResolve();
      });
  }

  /* ── Permukaan firebase yang disuntikkan ───────────────────────── */
  var DB = {
    ref: function (full) {
      if (full === '.info/connected') return makeConnNode();
      return makeNode(toRel(full));
    }
  };

  function databaseFn() { return DB; }
  databaseFn.ServerValue = { TIMESTAMP: TS };

  function initializeApp(config) {
    if (!config || !config.url || !config.anonKey) {
      throw new Error('SUPABASE_CONFIG.url dan anonKey wajib diisi di supabase-config.js');
    }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      throw new Error('SDK supabase-js belum termuat');
    }
    NS = deriveNS();
    _client = window.supabase.createClient(config.url, config.anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false }
    });
    window.firebase.apps.push({ name: '[DEFAULT]' });
    bootstrap();
    return window.firebase.apps[0];
  }

  window.firebase = {
    apps: [],
    initializeApp: initializeApp,
    database: databaseFn
  };
})();
