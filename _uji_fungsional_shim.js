/* Uji fungsional supabase-shim.js terhadap semantik Firebase RTDB.
   Mock client meniru kv_set / kv_update / kv_remove dan memancarkan
   event realtime, sehingga jalur optimistik dan jalur realtime diuji. */

const fs = require('fs');
const path = require('path');

let FAIL = 0, PASS = 0;
function sortKeys(x){
  if(Array.isArray(x)) return x.map(sortKeys);
  if(x && typeof x==='object'){ const o={}; Object.keys(x).sort().forEach(k=>o[k]=sortKeys(x[k])); return o; }
  return x;
}
function eq(a, b, msg) {
  const sa = JSON.stringify(sortKeys(a)), sb = JSON.stringify(sortKeys(b));
  if (sa === sb) { PASS++; console.log('  PASS ·', msg); }
  else { FAIL++; console.log('  FAIL ·', msg, '\n    dapat   :', sa, '\n    harusnya:', sb); }
}
function ok(c, msg){ if(c){PASS++;console.log('  PASS ·',msg);} else {FAIL++;console.log('  FAIL ·',msg);} }

/* ── Mock store + client ───────────────────────────────────────────── */
let rows = [];               // {ns,path,value}
let rtHandler = null;
function findIdx(ns, p){ return rows.findIndex(r=>r.ns===ns&&r.path===p); }
function delSubtree(ns, prefix){
  const cp = prefix + '/';
  const removed = [];
  rows = rows.filter(r=>{
    if(r.ns===ns && (r.path===prefix || r.path.indexOf(cp)===0)){ removed.push(r); return false; }
    return true;
  });
  return removed;
}
function upsert(ns, p, v){
  const i = findIdx(ns,p);
  if(i>=0){ rows[i].value=v; return {evt:'UPDATE', row:{ns,path:p,value:v}}; }
  rows.push({ns,path:p,value:v}); return {evt:'INSERT', row:{ns,path:p,value:v}};
}
function emit(evt, row){
  if(!rtHandler) return;
  if(evt==='DELETE') rtHandler({eventType:'DELETE', old:{ns:row.ns,path:row.path}});
  else rtHandler({eventType:evt, new:{ns:row.ns,path:row.path,value:row.value}});
}

function makeBuilder(){
  const f = {ns:undefined, pathEq:undefined, single:false};
  const b = {
    select(){ return b; },
    eq(col,val){ if(col==='ns') f.ns=val; if(col==='path') f.pathEq=val; return b; },
    maybeSingle(){
      const r = rows.find(x=>x.ns===f.ns && x.path===f.pathEq);
      return Promise.resolve({ data: r ? {value:r.value} : null, error: r?null:{code:'PGRST116'} });
    },
    then(res){ // list query (bootstrap)
      const data = rows.filter(x=>x.ns===f.ns).map(x=>({path:x.path, value:x.value}));
      return Promise.resolve({data, error:null}).then(res);
    }
  };
  return b;
}

const mockClient = {
  from(){ return makeBuilder(); },
  rpc(name, args){
    return new Promise((resolve)=>{
      if(name==='kv_set'){
        delSubtree(args.p_ns, args.p_prefix).forEach(r=>emit('DELETE', r));
        Object.keys(args.p_leaves||{}).forEach(k=>{ const e=upsert(args.p_ns,k,args.p_leaves[k]); emit(e.evt,e.row); });
      } else if(name==='kv_update'){
        (args.p_prefixes||[]).forEach(pre=>delSubtree(args.p_ns,pre).forEach(r=>emit('DELETE', r)));
        Object.keys(args.p_leaves||{}).forEach(k=>{ const e=upsert(args.p_ns,k,args.p_leaves[k]); emit(e.evt,e.row); });
      } else if(name==='kv_remove'){
        delSubtree(args.p_ns, args.p_prefix).forEach(r=>emit('DELETE', r));
      }
      resolve({error:null});
    });
  },
  channel(){ const ch={ on(evt,cfg,h){ rtHandler=h; return ch; }, subscribe(cb){ cb('SUBSCRIBED'); return ch; } }; return ch; }
};

/* ── Pasang lingkungan global lalu muat shim ───────────────────────── */
global.window = {};
global.location = { pathname: '/batch1/gamemaster.html' };
global.window.supabase = { createClient: ()=>mockClient };
require(path.resolve('/tmp/build/bsi-scoring-v4-supabase/supabase-shim.js'));
const firebase = global.window.firebase;
firebase.initializeApp({url:'https://x.supabase.co', anonKey:'k'});
const DB = firebase.database();
const NS = '/batch1';
const dbRef = p => DB.ref(NS + p);
const TS = firebase.database.ServerValue.TIMESTAMP;
const tick = ()=>new Promise(r=>setTimeout(r,0));

(async function(){
  await tick(); // tunggu bootstrap/ready

  console.log('\n[1] Inisialisasi session');
  let s0 = await dbRef('/session').once('value');
  ok(!s0.exists(), 'session awal kosong (!exists)');
  await dbRef('/session').set({currentRound:1,presenting:null,phase:'idle',locked:false});
  let s1 = await dbRef('/session').once('value');
  eq(s1.val(), {currentRound:1, phase:'idle', locked:false}, 'set session, presenting:null dihilangkan (semantik RTDB)');

  console.log('\n[2] update merge tidak menghapus saudara');
  await dbRef('/session').update({phase:'voting', presenting:'jakarta'});
  let s2 = await dbRef('/session').once('value');
  eq(s2.val(), {currentRound:1, phase:'voting', locked:false, presenting:'jakarta'}, 'update merge phase+presenting, currentRound/locked utuh');

  console.log('\n[3] finalize tier + ServerValue.TIMESTAMP');
  await dbRef('/tier/r1/jakarta').update({final:true, cmq:'optimal', risk:'plausible', people:'optimal', csat:'suboptimal', finalizedAt:TS});
  let t = await dbRef('/tier').once('value');
  const jak = t.val().r1.jakarta;
  eq({final:jak.final,cmq:jak.cmq,risk:jak.risk,people:jak.people,csat:jak.csat}, {final:true,cmq:'optimal',risk:'plausible',people:'optimal',csat:'suboptimal'}, 'tier nested shape benar');
  ok(typeof jak.finalizedAt==='number' && jak.finalizedAt>0, 'finalizedAt ServerValue → number');

  console.log('\n[4] set subfield gm tidak menghapus field final');
  await dbRef('/tier/r1/jakarta/gm/cmq').set('optimal');
  let t2 = await dbRef('/tier/r1/jakarta').once('value');
  ok(t2.val().final===true && t2.val().gm.cmq==='optimal', 'set /gm/cmq menambah, final tetap ada');

  console.log('\n[5] peers vote (leader) nested');
  await dbRef('/tier/r1/jakarta/peers/bandung').set({cmq:'optimal',risk:'plausible',people:'optimal',csat:'plausible'});
  let t3 = await dbRef('/tier/r1/jakarta/peers').once('value');
  eq(t3.val(), {bandung:{cmq:'optimal',risk:'plausible',people:'optimal',csat:'plausible'}}, 'peers/bandung tersimpan utuh');

  console.log('\n[6] transaction Koin Amanah dengan cap 5');
  function award(){ return new Promise(res=>{ dbRef('/amanah/jakarta/r1').transaction(v=>Math.min(5,Math.max(0,(v||0)+1)), (err,committed)=>res({err,committed})); }); }
  let last;
  for(let i=0;i<7;i++){ last = await award(); }
  let am = await dbRef('/amanah').once('value');
  eq(am.val(), {jakarta:{r1:5}}, 'amanah ter-cap di 5 walau di-award 7x');
  ok(last.committed===true && !last.err, 'transaction terakhir committed tanpa error');

  console.log('\n[7] listener on(value) memantik saat data berubah');
  let hits=[]; dbRef('/session/phase').on('value', sn=>hits.push(sn.val()));
  await tick();
  await dbRef('/session/phase').set('locked');
  await tick();
  ok(hits.includes('voting') && hits.includes('locked'), 'on(value) terima nilai awal "voting" lalu "locked"');

  console.log('\n[8] realtime dari klien lain memperbarui cache');
  // simulasikan tulisan eksternal langsung ke store + emit (tanpa lewat shim)
  const e = upsert('batch1','/session/locked', true); emit(e.evt, e.row);
  await tick();
  let sl = await dbRef('/session/locked').once('value');
  ok(sl.val()===true, 'perubahan eksternal terbaca via realtime handler');

  console.log('\n[9] remove menghapus subpohon');
  await dbRef('/tier').remove();
  let tr = await dbRef('/tier').once('value');
  eq(tr.val()||{}, {}, 'tier dihapus → null (board membaca {})');

  console.log('\n[10] isolasi namespace: tidak ada path batch2 yang bocor');
  const leak = rows.filter(r=>r.ns!=='batch1');
  eq(leak, [], 'seluruh tulisan tetap di ns batch1 (tanpa slash, sesuai skema)');

  console.log('\n──────── RINGKASAN ────────');
  console.log('PASS', PASS, '· FAIL', FAIL);
  process.exit(FAIL?1:0);
})();
