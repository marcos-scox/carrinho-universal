(function(){
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CUR = ['BRL', 'USD', 'EUR'];
const CUR_INFO = {BRL:{sym:'R$', nome:'Real', pl:40}, USD:{sym:'US$', nome:'Dólar', pl:50}, EUR:{sym:'€', nome:'Euro', pl:34}};
const FMT = {};
CUR.forEach(c => { FMT[c] = new Intl.NumberFormat('pt-BR', {style:'currency', currency:c}); });
const fmtC = (n, c) => (FMT[c] || FMT.BRL).format(Number(n) || 0);
const fmt = n => fmtC(n, 'BRL');
const fmtNum = n => Number(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
function totals(list, qty){
  const t = {BRL:0, USD:0, EUR:0};
  list.forEach(p => { if (p.preco != null){ const c = CUR_INFO[p.moeda] ? p.moeda : 'BRL'; t[c] += (Number(p.preco) || 0) * (qty ? qty(p) : 1); } });
  return t;
}
const usedCur = t => CUR.filter(c => t[c] > 0);
function toBRL(t){
  const r = state.rates || {};
  if (t.USD > 0 && !(r.usd > 0)) return null;
  if (t.EUR > 0 && !(r.eur > 0)) return null;
  return t.BRL + t.USD * (r.usd || 0) + t.EUR * (r.eur || 0);
}
function fmtSmart(t){
  const u = usedCur(t);
  if (u.length <= 1) return fmtC(u.length ? t[u[0]] : 0, u[0] || 'BRL');
  const b = toBRL(t);
  return b != null ? '≈ ' + fmtC(b, 'BRL') : u.map(c => fmtC(t[c], c)).join(' + ');
}
const cartQty = p => Math.max(0, Number(p.carrinho) || 0);

const P = {
  plus:'<path d="M12 5v14M5 12h14"/>',
  ext:'<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  edit:'<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chev:'<path d="m15 6-6 6 6 6"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  cartplus:'<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M13.5 9.5v4M11.5 11.5h4"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'
};
const ic = n => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + '</svg>';

/* ---------- estado ---------- */
const state = { cats:[], prods:[], rates:{}, ready:false, mode:'local', canEdit:true, route:{name:'home'}, q:'' };
const api = { db:null, assets:null };
const fresh = new Set();
const toggled = new Set();
const LS = 'carrinho-universal:v1';

const catById = id => state.cats.find(c => c.id === id);
const prodById = id => state.prods.find(p => p.id === id);
const sortedCats = () => state.cats.slice().sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
const prodsOf = id => state.prods.filter(p => p.categoriaId === id);
const sortProds = list => list.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
const cartItems = () => state.prods.filter(p => cartQty(p) > 0).sort((a, b) => (b.carrinhoEm || 0) - (a.carrinhoEm || 0));
const srcOf = f => !f ? '' : (String(f).indexOf('asset:') === 0 ? '/_blob/' + String(f).slice(6) : String(f));

function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return ''; } }
function safeLink(u){ try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch(e){ return ''; } }
function normLink(s){
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || u.hostname.indexOf('.') < 0) return null; return u.href; }
  catch(e){ return null; }
}
function parsePreco(s){
  s = String(s || '').replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else { const parts = s.split('.'); if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/\./g, ''); }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function initials(t){ return String(t || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '?'; }
function guessTitle(u){
  try {
    const url = new URL(u);
    let best = '';
    url.pathname.split('/').forEach(seg => {
      try { seg = decodeURIComponent(seg); } catch(e){}
      seg = seg.replace(/^MLB-?\d+-?/i, '').replace(/_JM$/i, '').replace(/-i\.\d+\.\d+$/, '').replace(/\.html?$/i, '');
      const words = seg.split(/[-_+]+/).filter(w => w && !/^\d+$/.test(w) && !(/^[0-9a-f]{5,}$/i.test(w) && /\d/.test(w)));
      const joined = words.join(' ');
      if (words.length >= 2 && joined.length > best.length) best = joined;
    });
    if (!best) return '';
    best = best.replace(/\s+/g, ' ').trim().slice(0, 90);
    return best.charAt(0).toUpperCase() + best.slice(1);
  } catch(e){ return ''; }
}

/* ---------- arte geométrica ---------- */
function hashStr(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed){ let s = seed % 2147483646 + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const SH = ['q','q','q','circle','circle','leaf','half','ring','dot','blank'];
const BGS = ['--bg','--bg','--bg','--m4','--m4','--m3','--m1','--m2'];
const FGS = ['--m1','--m2','--m3','--m4'];
function smallTile(rnd, style){
  const pick = a => a[Math.floor(rnd() * a.length)];
  const bg = pick(BGS);
  const fgs = bg === '--bg' ? ['--m1','--m2','--m3','--m1','--m2'] : FGS.filter(k => k !== bg);
  const fg = pick(fgs), sh = pick(SH), r = pick([0, 90, 180, 270]);
  return '<span class="t" style="--tb:var(' + bg + ');--tf:var(' + fg + ');' + (style || '') + '"><i class="s ' + sh + '" style="--r:' + r + 'deg" data-r="' + r + '"></i></span>';
}
function geoArt(seed, cols, rows){
  const rnd = seeded(hashStr(String(seed)));
  let h = '';
  for (let i = 0; i < cols * rows; i++) h += smallTile(rnd, '');
  return '<span class="geo-grid" style="--cols:' + cols + '" aria-hidden="true">' + h + '</span>';
}
const BIG = [
  {r:2, c:3, shape:'circle', tb:'--m4', tf:'--m1'},
  {r:4, c:5, shape:'q0',     tb:'--bg', tf:'--m2'},
  {r:5, c:1, shape:'l0',     tb:'--m1', tf:'--m3'}
];
function buildMosaic(covers, intro){
  const rnd = seeded(424242);
  const occ = new Set();
  BIG.forEach(b => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) occ.add((b.r + i) + ':' + (b.c + j)); });
  let h = '';
  BIG.forEach((b, i) => {
    const cov = covers[i];
    h += '<span class="t big" style="grid-area:' + b.r + ' / ' + b.c + ' / span 2 / span 2;--tb:var(' + (cov ? '--m4' : b.tb) + ');--tf:var(' + b.tf + ');--d:' + ((b.r + b.c) * 50) + '">'
       + '<i class="s ' + b.shape + (cov ? ' ph' : '') + '"' + (cov ? ' style="background-image:url(&quot;' + esc(cov) + '&quot;)"' : '') + '></i></span>';
  });
  for (let r = 1; r <= 6; r++) for (let c = 1; c <= 6; c++){
    if (occ.has(r + ':' + c)) continue;
    h += smallTile(rnd, 'grid-area:' + r + ' / ' + c + ';--d:' + ((r + c) * 50));
  }
  const el = document.createElement('div');
  el.className = 'mosaic' + (intro && !reduce ? ' intro' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = h;
  return el;
}
let mosaicEl = null, mosaicKey = null;
function mountMosaic(){
  if (!state.ready) return;
  const covers = sortedCats().filter(c => c.capa).slice(0, 3).map(c => srcOf(c.capa));
  const key = covers.join('|');
  if (mosaicEl && key === mosaicKey) return;
  const first = !mosaicEl;
  const el = buildMosaic(covers, first);
  const slot = $('#mosaic-slot');
  if (mosaicEl) { slot.replaceChild(el, mosaicEl); if (!reduce) el.animate([{opacity:.25},{opacity:1}], {duration:450, easing:'ease-out'}); }
  else slot.appendChild(el);
  mosaicEl = el; mosaicKey = key;
  if (first) setTimeout(() => el.classList.remove('intro'), 2300);
}
function spin(s){
  if (!s || reduce) return;
  const now = performance.now();
  if (s._t && now - s._t < 700) return;
  s._t = now;
  const r = (parseFloat(s.dataset.r) || 0) + 90;
  s.dataset.r = r;
  s.style.setProperty('--r', r + 'deg');
}

/* ---------- armazenamento ---------- */
function loadLocal(){ try { const raw = localStorage.getItem(LS); if (raw){ const d = JSON.parse(raw); state.cats = d.cats || []; state.prods = d.prods || []; state.rates = d.rates || {}; } } catch(e){} }
function saveLocal(){
  try { localStorage.setItem(LS, JSON.stringify({cats:state.cats, prods:state.prods, rates:state.rates})); return true; }
  catch(e){ toast('Não deu para salvar: o espaço deste navegador acabou. Use fotos menores ou exclua itens.'); return false; }
}
function body(o){ const c = Object.assign({}, o); delete c.id; return JSON.parse(JSON.stringify(c)); }
function upsert(arr, item){ const i = arr.findIndex(x => x.id === item.id); if (i >= 0) arr[i] = item; else arr.push(item); }
function report(code){
  if (code === 'invalid_argument'){ state.canEdit = false; schedule(); toast('Você pode ver este carrinho, mas não tem permissão para editar.'); }
  else if (code === 'quota_exceeded') toast('O espaço deste carrinho acabou. Exclua alguns produtos para continuar.');
  else if (code === 'revoked'){ state.canEdit = false; schedule(); toast('Seu acesso a este carrinho mudou. Recarregue a página.'); }
  else toast('Não foi possível salvar agora. Tente de novo em instantes.');
}
async function safe(fn){
  for (let i = 0; i < 2; i++){
    try { await fn(); return true; }
    catch(e){
      const code = e && e.code;
      if (code === 'unavailable' && i === 0){ await sleep(300 + Math.random() * 500); continue; }
      report(code); return false;
    }
  }
  return false;
}
async function write(kind, item, del){
  const coll = kind === 'cats' ? 'categorias' : 'produtos';
  const prev = state[kind].slice();
  if (del) state[kind] = state[kind].filter(x => x.id !== item.id); else upsert(state[kind], item);
  schedule();
  if (state.mode === 'db'){
    const ref = api.db.collection(coll).doc(item.id);
    const ok = await safe(() => del ? ref.delete() : ref.set(body(item)));
    if (!ok){ state[kind] = prev; lastHome = lastCat = ''; schedule(); }
    return ok;
  }
  if (!saveLocal()){ state[kind] = prev; lastHome = lastCat = ''; schedule(); return false; }
  return true;
}

async function writeRates(r){
  const prev = state.rates;
  state.rates = r; schedule();
  if (state.mode === 'db'){
    const ok = await safe(() => api.db.doc('config/cotacoes').set(r));
    if (!ok){ state.rates = prev; schedule(); }
    return ok;
  }
  if (!saveLocal()){ state.rates = prev; schedule(); return false; }
  return true;
}

/* ---------- fotos ---------- */
function loadImg(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
  });
}
const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
async function processImage(file){
  const img = await loadImg(file);
  const w0 = img.naturalWidth || 1, h0 = img.naturalHeight || 1;
  const k = Math.min(1, 1400 / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  let blob = await toBlob(cv, 'image/webp', .86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(cv, file.type === 'image/png' ? 'image/png' : 'image/jpeg', .88);
  if (!blob) throw new Error('encode');
  return {blob, canvas:cv};
}
function canvasToDataURL(src){
  const k = Math.min(1, 760 / Math.max(src.width, src.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(src.width * k)); cv.height = Math.max(1, Math.round(src.height * k));
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  const qs = [.82, .7, .58, .45];
  for (let i = 0; i < qs.length; i++){
    let d = cv.toDataURL('image/webp', qs[i]);
    if (d.indexOf('data:image/webp') !== 0){
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0);
      d = c2.toDataURL('image/jpeg', qs[i]);
    }
    if (d.length < 200000) return d;
  }
  return null;
}
async function persistPhoto(pending){
  if (api.assets){
    for (let i = 0; i < 2; i++){
      try { const r = await api.assets.upload(pending.blob); if (r && r.id) return 'asset:' + r.id; }
      catch(e){ if (e && e.code === 'store_unavailable' && i === 0){ await sleep(700); continue; } break; }
    }
  }
  return canvasToDataURL(pending.canvas);
}
function dropPhoto(f){
  if (f && String(f).indexOf('asset:') === 0 && api.assets){ api.assets.delete(String(f).slice(6)).catch(() => {}); }
}

/* ---------- toast ---------- */
function toast(msg, opts){
  opts = opts || {};
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.action ? '<button type="button">' + esc(opts.action) + '</button>' : '');
  $('#toasts').appendChild(t);
  let done = false;
  const remove = () => { t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  const timer = setTimeout(() => { if (done) return; done = true; remove(); if (opts.onExpire) opts.onExpire(); }, opts.duration || 3400);
  if (opts.action) t.querySelector('button').addEventListener('click', () => { if (done) return; done = true; clearTimeout(timer); remove(); if (opts.onAction) opts.onAction(); });
}

/* ---------- render ---------- */
let raf = 0, lastHome = '', lastCat = '', lastTotal = null;
function schedule(){ if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderNow(); }); }

function emptyHTML(o){
  return '<div class="empty"><span class="empty-art">' + geoArt(o.seed, 3, 3) + '</span><div><h3>' + o.title + '</h3><p>' + o.text + '</p>' + (o.btn || '') + '</div></div>';
}
function catCard(c, feature){
  const ps = prodsOf(c.id);
  const cover = c.capa ? '<img class="cover-img" src="' + esc(srcOf(c.capa)) + '" alt="" decoding="async">' : geoArt(c.id, 6, 6);
  return '<button class="cat' + (feature ? ' feature' : '') + '" data-open="' + esc(c.id) + '" data-key="' + esc(c.id) + '" aria-label="Abrir ' + esc(c.nome) + '">'
    + '<span class="cv" style="view-transition-name:vt-' + esc(c.id) + '">' + cover + '</span><span class="shade"></span>'
    + '<span class="label"><span class="pill"><span class="nm">' + esc(c.nome) + '</span><span class="qt">' + plural(ps.length, 'item', 'itens') + '</span><span class="price">' + fmtSmart(totals(ps)) + '</span></span></span></button>';
}
function prodCard(p, showCat){
  const host = hostOf(p.link), link = safeLink(p.link);
  const cat = showCat ? catById(p.categoriaId) : null;
  const q = cartQty(p), m = CUR_INFO[p.moeda] ? p.moeda : 'BRL';
  const img = p.foto ? '<img src="' + esc(srcOf(p.foto)) + '" alt="' + esc(p.titulo) + '" decoding="async">' : '<span class="noimg" aria-hidden="true">' + esc(initials(p.titulo)) + '</span>';
  const price = p.preco != null ? '<span class="price">' + fmtC(p.preco, m) + '</span>' : '<span class="price none">Sem preço</span>';
  const tools = state.canEdit
    ? '<div class="tools"><button class="ib" data-act="edit-prod" data-id="' + esc(p.id) + '" title="Editar" aria-label="Editar ' + esc(p.titulo) + '">' + ic('edit') + '</button>'
      + '<button class="ib del" data-act="del-prod" data-id="' + esc(p.id) + '" title="Excluir" aria-label="Excluir ' + esc(p.titulo) + '">' + ic('trash') + '</button></div>'
    : '';
  const tags = (cat ? '<span class="tag incat">' + esc(cat.nome) + '</span>' : '')
    + (host ? '<span class="tag">' + esc(host) + (link ? ic('ext') : '') + '</span>' : '');
  const lbl = q ? 'Tirar do carrinho' : 'Adicionar ao carrinho';
  const cartBtn = state.canEdit
    ? '<button class="cartbtn' + (q ? ' on' : '') + '" data-act="cart-toggle" data-id="' + esc(p.id) + '" aria-pressed="' + (q ? 'true' : 'false') + '" title="' + lbl + '" aria-label="' + lbl + ': ' + esc(p.titulo) + '">' + ic(q ? 'check' : 'cartplus') + (q > 1 ? '<span class="qb">' + q + '</span>' : '') + '</button>'
    : '';
  return '<article class="prod' + (q ? ' incart' : '') + (link ? ' linked' : '') + '" data-key="' + esc(p.id) + '">'
    + (link ? '<a class="hit" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir ' + esc(p.titulo) + ' na loja"></a>' : '')
    + '<div class="img">' + img + '</div>'
    + (tags ? '<div class="tags">' + tags + '</div>' : '')
    + tools
    + '<div class="label"><span class="pill" title="' + esc(p.titulo) + '"><span class="nm">' + esc(p.titulo) + '</span>' + price + '</span>' + cartBtn + '</div></article>';
}
function homeHTML(){
  if (!state.ready) return '<div class="sec-head"><h2>Suas categorias</h2></div><div class="cats">' + '<div class="cat sk" aria-hidden="true"></div>'.repeat(4) + '</div>';
  const qRaw = state.q.trim(), q = norm(qRaw);
  const cats = sortedCats();
  const list = q ? cats.filter(c => norm(c.nome).indexOf(q) >= 0) : cats;
  let h = '<div class="sec-head"><h2>Suas categorias</h2>' + (cats.length ? '<span class="muted">' + plural(cats.length, 'categoria', 'categorias') + '</span>' : '') + '</div>';
  if (!cats.length){
    h += emptyHTML({seed:'vazio', title:'Crie sua primeira categoria',
      text:'Separe o que você quer comprar em listas, como Casa, Presentes ou Viagem. Depois é só colar os links dos produtos.',
      btn: state.canEdit ? '<button class="btn btn-primary" data-act="new-cat">' + ic('plus') + 'Criar categoria</button>' : ''});
  } else if (q && !list.length){
    h += '<p class="none">Nenhuma categoria com “' + esc(qRaw) + '”.</p>';
  } else {
    const feat = list.length >= 3;
    h += '<div class="cats">' + list.map((c, i) => catCard(c, feat && i === 0)).join('')
      + (state.canEdit && !q ? '<button class="cat add" data-act="new-cat"><span class="add-ic">' + ic('plus') + '</span><span class="add-t">Nova categoria</span></button>' : '')
      + '</div>';
  }
  if (q){
    const ps = sortProds(state.prods.filter(p => norm(p.titulo).indexOf(q) >= 0 || norm(hostOf(p.link)).indexOf(q) >= 0));
    h += '<div class="sec-head results"><h2>Produtos encontrados</h2><span class="muted">' + plural(ps.length, 'produto', 'produtos') + '</span></div>'
      + (ps.length ? '<div class="prods">' + ps.map(p => prodCard(p, true)).join('') + '</div>' : '<p class="none">Nenhum produto com “' + esc(qRaw) + '”.</p>');
  }
  return h;
}
function catHTML(){
  const c = catById(state.route.id);
  if (!c) return '<button class="back" data-act="home">' + ic('chev') + 'Categorias</button><div class="banner sk"></div>';
  const qRaw = state.q.trim(), q = norm(qRaw);
  const all = prodsOf(c.id);
  const list = sortProds(q ? all.filter(p => norm(p.titulo).indexOf(q) >= 0 || norm(hostOf(p.link)).indexOf(q) >= 0) : all);
  const inCart = all.filter(p => cartQty(p) > 0).length;
  let h = '<button class="back" data-act="home">' + ic('chev') + 'Categorias</button>'
    + '<div class="banner" style="view-transition-name:vt-' + esc(c.id) + '">' + (c.capa ? '<img src="' + esc(srcOf(c.capa)) + '" alt="">' : geoArt(c.id, 12, 8)) + '</div>'
    + '<div class="cat-head"><div><h1>' + esc(c.nome) + '</h1><dl class="stats">'
    + '<div><dt>' + (all.length === 1 ? 'item' : 'itens') + '</dt><dd>' + all.length + '</dd></div>'
    + '<div><dt>total da lista</dt><dd>' + fmtSmart(totals(all)) + '</dd></div>'
    + (inCart ? '<div><dt>no carrinho</dt><dd>' + inCart + '</dd></div>' : '')
    + '</dl></div>'
    + (state.canEdit ? '<div class="actions"><button class="btn btn-primary" data-act="new-prod" data-cat="' + esc(c.id) + '">' + ic('plus') + 'Adicionar produto</button>'
      + '<button class="btn btn-soft" data-act="edit-cat" data-id="' + esc(c.id) + '" aria-label="Editar categoria">' + ic('edit') + '<span class="hide-sm">Editar</span></button>'
      + '<button class="btn btn-soft btn-icon danger" data-act="del-cat" data-id="' + esc(c.id) + '" title="Excluir categoria" aria-label="Excluir categoria">' + ic('trash') + '</button></div>' : '')
    + '</div>';
  if (!all.length){
    h += emptyHTML({seed:c.id + 'x', title:'Nenhum produto aqui ainda',
      text:'Cole o link de um produto, coloque a foto, o título e o preço. Depois é só colocar no carrinho o que você quer somar.',
      btn: state.canEdit ? '<button class="btn btn-primary" data-act="new-prod" data-cat="' + esc(c.id) + '">' + ic('plus') + 'Adicionar produto</button>' : ''});
  } else if (!list.length){
    h += '<p class="none">Nenhum produto com “' + esc(qRaw) + '” nesta categoria.</p>';
  } else {
    h += '<div class="prods">' + list.map(p => prodCard(p, false)).join('') + '</div>';
  }
  return h;
}
function footText(){
  if (!state.ready) return '';
  if (!state.canEdit) return 'Você está vendo este carrinho sem permissão para editar.';
  return state.mode === 'db' ? 'Tudo fica salvo nesta página e aparece igual em qualquer aparelho em que você abrir.' : 'Neste modo, o carrinho fica salvo só neste navegador.';
}
let bumpDelay = 0;
function updateSummary(){
  const items = cartItems();
  const t = totals(items, cartQty);
  const n = items.reduce((a, p) => a + cartQty(p), 0);
  const key = n + '|' + CUR.map(c => t[c]).join('|');
  $('#sum-count').textContent = plural(n, 'item', 'itens');
  $('#sum-total').textContent = fmtSmart(t);
  if (state.ready){
    if (lastTotal !== null && key !== lastTotal && !reduce){
      const el = $('#cartsum');
      const go = () => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
      if (bumpDelay){ setTimeout(go, bumpDelay); bumpDelay = 0; } else go();
    }
    lastTotal = key;
  }
}
function playFresh(scope){
  if (reduce){ fresh.clear(); toggled.clear(); return; }
  fresh.forEach(id => {
    const el = scope.querySelector('[data-key="' + id + '"]');
    if (el){ el.animate([{transform:'scale(.84)', opacity:0}, {transform:'none', opacity:1}], {duration:560, easing:'cubic-bezier(.2,.9,.3,1.25)'}); fresh.delete(id); }
  });
  toggled.forEach(id => {
    const b = scope.querySelector('[data-key="' + id + '"] .cartbtn');
    if (b) b.animate([{transform:'scale(.6)'}, {transform:'scale(1.18)', offset:.55}, {transform:'none'}], {duration:460, easing:'ease-out'});
    const tg = scope.querySelector('[data-key="' + id + '"] .cart-tag');
    if (tg) tg.animate([{transform:'translateY(-6px) scale(.8)', opacity:0}, {transform:'none', opacity:1}], {duration:380, easing:'cubic-bezier(.2,.9,.3,1.3)'});
    toggled.delete(id);
  });
}
function renderNow(){
  if (state.route.name === 'cat' && state.ready && !catById(state.route.id)){
    state.route = {name:'home'};
    try { history.replaceState(null, '', '#/'); } catch(e){}
  }
  const isCat = state.route.name === 'cat';
  $('#home').hidden = isCat;
  $('#catview').hidden = !isCat;
  $('#hero-actions').hidden = !state.canEdit;
  if (isCat){
    const h = catHTML();
    if (h !== lastCat){ $('#catview').innerHTML = h; lastCat = h; }
    playFresh($('#catview'));
  } else {
    mountMosaic();
    const h = homeHTML();
    if (h !== lastHome){ $('#home-body').innerHTML = h; lastHome = h; }
    playFresh($('#home'));
  }
  $('#foot').textContent = footText();
  updateSummary();
  renderDrawer();
}

/* ---------- navegação ---------- */
function parse(h){ const m = String(h || '').match(/^#\/c\/([A-Za-z0-9_.~:@+-]+)$/); return m ? {name:'cat', id:m[1]} : {name:'home'}; }
let suppress = false;
function transition(fn){ if (document.startViewTransition && !reduce){ try { document.startViewTransition(fn); return; } catch(e){} } fn(); }
function go(hash){
  transition(() => {
    try { if (location.hash !== hash){ suppress = true; location.hash = hash; } } catch(e){ suppress = false; }
    state.route = parse(hash);
    renderNow();
    window.scrollTo(0, 0);
  });
}
window.addEventListener('hashchange', () => {
  if (suppress){ suppress = false; return; }
  const r = parse(location.hash);
  transition(() => { state.route = r; renderNow(); window.scrollTo(0, 0); });
});

/* ---------- modais ---------- */
let modalCount = 0;
function openModal(inner, opts){
  opts = opts || {};
  const opener = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + inner + '</div>';
  $('#modal-root').appendChild(ov);
  modalCount++; document.documentElement.classList.add('locked');
  let closed = false;
  function onKey(e){ if (e.key === 'Escape' && ov === $('#modal-root').lastElementChild){ e.preventDefault(); close(); } }
  function close(){
    if (closed) return; closed = true;
    ov.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { ov.remove(); modalCount--; if (!modalCount && !drawerEl) document.documentElement.classList.remove('locked'); }, reduce ? 0 : 180);
    try { if (opener && opener.isConnected && opener.focus) opener.focus({preventScroll:true}); } catch(e){}
    if (opts.onClose) opts.onClose();
  }
  document.addEventListener('keydown', onKey);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
  requestAnimationFrame(() => { const f = ov.querySelector('input:not([type=file]), select, button'); if (f) f.focus(); });
  return {el:ov, close};
}
function dropzone(kind){
  return '<div class="dz"><div class="drop dz-' + kind + '" tabindex="0" role="button" aria-label="Escolher foto">'
    + '<span class="dz-empty">' + ic('image') + '<b>Escolher foto</b><span>Arraste, cole com Ctrl+V ou clique</span></span>'
    + '<img alt="" hidden><button type="button" class="dz-rm" hidden aria-label="Remover foto">' + ic('x') + '</button></div>'
    + '<input type="file" accept="image/*" hidden></div>';
}
function setupDrop(wrap, current){
  const st = {pending:null, removed:false, busy:false};
  const el = wrap.querySelector('.drop'), input = wrap.querySelector('input'), img = el.querySelector('img'), rm = el.querySelector('.dz-rm'), empty = el.querySelector('.dz-empty');
  function show(src){
    if (src){ img.src = src; img.hidden = false; rm.hidden = false; empty.hidden = true; el.classList.add('has'); }
    else { img.hidden = true; img.removeAttribute('src'); rm.hidden = true; empty.hidden = false; el.classList.remove('has'); }
  }
  if (current) show(srcOf(current));
  async function take(file){
    if (!file) return;
    if (!/^image\//.test(file.type)){ toast('Escolha um arquivo de imagem, como JPG, PNG ou WEBP.'); return; }
    st.busy = true; el.classList.add('loading');
    try { const r = await processImage(file); st.pending = r; st.removed = false; show(URL.createObjectURL(r.blob)); }
    catch(e){ toast('Não foi possível ler essa imagem. Tente outro arquivo.'); }
    finally { st.busy = false; el.classList.remove('loading'); }
  }
  el.addEventListener('click', e => { if (e.target.closest('.dz-rm')) return; input.click(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { take(input.files && input.files[0]); input.value = ''; });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); take(e.dataTransfer && e.dataTransfer.files[0]); });
  rm.addEventListener('click', e => { e.stopPropagation(); st.pending = null; st.removed = true; show(null); });
  return {st, take};
}
function wirePaste(root, dz){
  root.addEventListener('paste', e => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const it = items.find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (it){ e.preventDefault(); dz.take(it.getAsFile()); }
  });
}
function confirmModal(o){
  return new Promise(res => {
    let answered = false;
    const m = openModal('<h3>' + o.title + '</h3><p class="sub">' + o.text + '</p><div class="modal-foot"><button type="button" class="btn btn-ghost" data-x>Cancelar</button><button type="button" class="btn btn-danger" data-ok>' + o.ok + '</button></div>',
      {onClose: () => { if (!answered) res(false); }});
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); res(true); });
  });
}

function maskMoney(input){
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    input.value = d ? fmtNum(parseInt(d, 10) / 100) : '';
  });
  input.addEventListener('paste', e => {
    const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const n = parsePreco(t);
    if (n != null){ e.preventDefault(); input.value = fmtNum(n); }
  });
}
const MOEDA_KEY = 'carrinho-universal:moeda';
function lastMoeda(){ try { const v = localStorage.getItem(MOEDA_KEY); if (CUR_INFO[v]) return v; } catch(e){} return 'BRL'; }
function saveMoeda(v){ try { localStorage.setItem(MOEDA_KEY, v); } catch(e){} }

function catModal(existing){
  const m = openModal(
    '<h3>' + (existing ? 'Editar categoria' : 'Nova categoria') + '</h3>'
    + '<p class="sub">' + (existing ? 'Mude o nome ou a foto de capa.' : 'Dê um nome e, se quiser, uma foto de capa.') + '</p>'
    + '<div class="field"><label for="f-nome">Nome</label><input id="f-nome" class="inp" maxlength="40" placeholder="Ex.: Casa nova" autocomplete="off" value="' + esc(existing ? existing.nome : '') + '"></div>'
    + '<div class="field"><span class="lbl">Foto de capa</span>' + dropzone('cover') + '</div>'
    + '<p class="err" hidden></p>'
    + '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-x>Cancelar</button><button type="button" class="btn btn-primary" data-save>' + (existing ? 'Salvar alterações' : 'Criar categoria') + '</button></div>');
  const dz = setupDrop(m.el.querySelector('.dz'), existing && existing.capa);
  const nome = m.el.querySelector('#f-nome'), btn = m.el.querySelector('[data-save]'), err = m.el.querySelector('.err');
  const label = btn.textContent;
  const fail = t => { err.textContent = t; err.hidden = false; };
  let saving = false;
  async function save(){
    if (saving) return;
    if (dz.st.busy){ fail('Espere a foto terminar de carregar.'); return; }
    const n = nome.value.trim();
    if (!n){ fail('Dê um nome para a categoria.'); nome.focus(); return; }
    saving = true; btn.disabled = true; btn.textContent = 'Salvando…'; err.hidden = true;
    let capa = existing ? existing.capa || null : null, old = null;
    if (dz.st.pending){
      const f = await persistPhoto(dz.st.pending);
      if (f){ old = capa; capa = f; } else toast('A foto ficou grande demais para salvar. A categoria foi salva sem ela.');
    } else if (dz.st.removed){ old = capa; capa = null; }
    const c = {id: existing ? existing.id : uid(), nome:n, capa, criadoEm: existing ? existing.criadoEm || Date.now() : Date.now()};
    const ok = await write('cats', c);
    if (!ok){ if (capa && (!existing || capa !== existing.capa)) dropPhoto(capa); saving = false; btn.disabled = false; btn.textContent = label; return; }
    if (old && old !== capa) dropPhoto(old);
    m.close();
    if (existing) toast('Alterações salvas');
    else { go('#/c/' + c.id); toast('Categoria criada. Agora adicione o primeiro produto.'); }
  }
  btn.addEventListener('click', save);
  nome.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); save(); } });
  wirePaste(m.el, dz);
}

function prodModal(existing, catId){
  const cats = sortedCats();
  const sel = (existing && existing.categoriaId) || catId || (cats[0] && cats[0].id);
  let moeda = (existing && CUR_INFO[existing.moeda]) ? existing.moeda : lastMoeda();
  const m = openModal(
    '<h3>' + (existing ? 'Editar produto' : 'Adicionar produto') + '</h3>'
    + '<p class="sub">Cole o link da loja, dê um título e informe o preço.</p>'
    + '<div class="field"><label for="f-link">Link do produto</label><div class="with-ic">' + ic('link') + '<input id="f-link" class="inp" type="url" inputmode="url" placeholder="https://loja.com/produto" autocomplete="off" value="' + esc(existing ? existing.link || '' : '') + '"></div><span class="hint" id="f-host"></span></div>'
    + '<div class="field"><label for="f-tit">Título</label><input id="f-tit" class="inp" maxlength="90" placeholder="Ex.: Cafeteira elétrica" autocomplete="off" value="' + esc(existing ? existing.titulo : '') + '"></div>'
    + '<div class="row2"><div class="field"><label for="f-preco">Preço</label><div class="money"><span id="f-sym">' + CUR_INFO[moeda].sym + '</span><input id="f-preco" class="inp" inputmode="numeric" placeholder="0,00" autocomplete="off" style="--pl:' + CUR_INFO[moeda].pl + 'px" value="' + (existing && existing.preco != null ? fmtNum(existing.preco) : '') + '"></div></div>'
    + '<div class="field"><span class="lbl" id="lbl-moeda">Moeda</span><div class="seg" role="radiogroup" aria-labelledby="lbl-moeda" style="--idx:' + CUR.indexOf(moeda) + '">' + CUR.map(c => '<button type="button" role="radio" data-cur="' + c + '" aria-checked="' + (c === moeda ? 'true' : 'false') + '">' + CUR_INFO[c].nome + '</button>').join('') + '</div></div></div>'
    + '<div class="field"><label for="f-cat">Categoria</label><select id="f-cat" class="inp">' + cats.map(c => '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') + '</select></div>'
    + '<div class="field"><span class="lbl">Foto do produto</span>' + dropzone('prod') + '<span class="hint">Salve a imagem da página da loja e arraste para cá, ou copie a imagem e cole aqui.</span></div>'
    + '<p class="err" hidden></p>'
    + '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-x>Cancelar</button><button type="button" class="btn btn-primary" data-save>' + (existing ? 'Salvar alterações' : 'Adicionar produto') + '</button></div>');
  const dz = setupDrop(m.el.querySelector('.dz'), existing && existing.foto);
  const link = m.el.querySelector('#f-link'), tit = m.el.querySelector('#f-tit'), preco = m.el.querySelector('#f-preco'), catSel = m.el.querySelector('#f-cat');
  const host = m.el.querySelector('#f-host'), btn = m.el.querySelector('[data-save]'), err = m.el.querySelector('.err');
  const label = btn.textContent;
  let auto = !existing;
  function showHost(){ const v = normLink(link.value); const h = v ? hostOf(v) : ''; host.textContent = h ? 'Loja: ' + h : ''; return v; }
  showHost();
  link.addEventListener('input', () => {
    const v = showHost();
    if (v && (auto || !tit.value.trim())){
      const g = guessTitle(v);
      if (g){ tit.value = g; auto = true; host.textContent = 'Loja: ' + hostOf(v) + '. Título sugerido pelo link, ajuste se quiser.'; }
    }
  });
  tit.addEventListener('input', () => { auto = false; });
  maskMoney(preco);
  const seg = m.el.querySelector('.seg'), sym = m.el.querySelector('#f-sym');
  seg.addEventListener('click', e => {
    const b = e.target.closest('[data-cur]'); if (!b) return;
    moeda = b.dataset.cur;
    seg.querySelectorAll('[data-cur]').forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
    seg.style.setProperty('--idx', CUR.indexOf(moeda));
    sym.textContent = CUR_INFO[moeda].sym;
    preco.style.setProperty('--pl', CUR_INFO[moeda].pl + 'px');
    if (!reduce) sym.animate([{opacity:0, transform:'translateY(calc(-50% + 6px))'}, {opacity:1, transform:'translateY(-50%)'}], {duration:260, easing:'ease-out'});
    preco.focus();
  });
  const fail = t => { err.textContent = t; err.hidden = false; };
  let saving = false;
  async function save(){
    if (saving) return;
    if (dz.st.busy){ fail('Espere a foto terminar de carregar.'); return; }
    const t = tit.value.trim();
    let l = '';
    if (link.value.trim()){ l = normLink(link.value); if (l === null){ fail('Esse link não parece válido. Confira se copiou o endereço completo.'); link.focus(); return; } }
    if (!t){ fail('Dê um título para o produto.'); tit.focus(); return; }
    let pr = null;
    if (preco.value.trim()){ pr = parsePreco(preco.value); if (pr === null){ fail('Informe o preço só com números, como 199,90.'); preco.focus(); return; } }
    const cId = catSel.value;
    if (!cId || !catById(cId)){ fail('Escolha uma categoria.'); return; }
    saving = true; btn.disabled = true; btn.textContent = 'Salvando…'; err.hidden = true;
    let foto = existing ? existing.foto || null : null, old = null;
    if (dz.st.pending){
      const f = await persistPhoto(dz.st.pending);
      if (f){ old = foto; foto = f; } else toast('A foto ficou grande demais para salvar. O produto foi salvo sem ela.');
    } else if (dz.st.removed){ old = foto; foto = null; }
    const p = {id: existing ? existing.id : uid(), categoriaId:cId, titulo:t, link:l, preco:pr, moeda, foto, carrinho: existing ? cartQty(existing) : 0, carrinhoEm: existing ? existing.carrinhoEm || null : null, criadoEm: existing ? existing.criadoEm || Date.now() : Date.now()};
    if (!existing) fresh.add(p.id);
    const ok = await write('prods', p);
    if (!ok){ fresh.delete(p.id); if (foto && (!existing || foto !== existing.foto)) dropPhoto(foto); saving = false; btn.disabled = false; btn.textContent = label; return; }
    if (old && old !== foto) dropPhoto(old);
    saveMoeda(moeda);
    m.close();
    toast(existing ? 'Alterações salvas' : 'Produto adicionado');
    if (!(state.route.name === 'cat' && state.route.id === cId) && !state.q.trim()) go('#/c/' + cId);
  }
  btn.addEventListener('click', save);
  [link, tit, preco].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); save(); } }));
  wirePaste(m.el, dz);
}

/* ---------- ações ---------- */
function newProd(catId){
  if (!state.cats.length){ catModal(); toast('Crie uma categoria antes de adicionar produtos.'); return; }
  prodModal(null, catId || (state.route.name === 'cat' ? state.route.id : null));
}
async function deleteCat(c){
  if (!c) return;
  const ps = prodsOf(c.id);
  const ok = await confirmModal({
    title:'Excluir categoria?',
    text: ps.length ? '“' + esc(c.nome) + '” e ' + plural(ps.length, 'produto', 'produtos') + ' serão excluídos. Não dá para desfazer.' : '“' + esc(c.nome) + '” será excluída. Não dá para desfazer.',
    ok:'Excluir categoria'});
  if (!ok) return;
  for (const p of ps){ const d = await write('prods', p, true); if (!d) return; dropPhoto(p.foto); }
  const done = await write('cats', c, true);
  if (done){ dropPhoto(c.capa); go('#/'); toast('Categoria excluída'); }
}
async function deleteProd(p, btn){
  if (!p) return;
  const card = btn && btn.closest('.prod');
  if (card && !reduce){
    try { await card.animate([{opacity:1, transform:'none'}, {opacity:0, transform:'scale(.9)'}], {duration:200, easing:'ease-in', fill:'forwards'}).finished; } catch(e){}
  }
  const ok = await write('prods', p, true);
  if (!ok){ lastHome = lastCat = ''; schedule(); return; }
  let undone = false;
  toast('Produto excluído', {action:'Desfazer', duration:6000,
    onAction: () => { undone = true; fresh.add(p.id); write('prods', p); },
    onExpire: () => { if (!undone) dropPhoto(p.foto); }});
}
function flyToCart(card, btn){
  if (reduce) return;
  const target = $('#cartsum .ic');
  if (!target) return;
  const b = target.getBoundingClientRect();
  const src = card && card.querySelector('.img img');
  let node, a;
  if (src && src.naturalWidth){
    a = src.getBoundingClientRect();
    node = document.createElement('img');
    node.src = src.currentSrc || src.src;
  } else {
    a = (btn || card).getBoundingClientRect();
    node = document.createElement('span');
    node.classList.add('dot');
  }
  node.classList.add('fly');
  Object.assign(node.style, {left:a.left + 'px', top:a.top + 'px', width:a.width + 'px', height:a.height + 'px'});
  document.body.appendChild(node);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const sc = Math.max(.06, 22 / Math.max(a.width, a.height, 1));
  const anim = node.animate([
    {transform:'translate(0,0) scale(1)', opacity:1},
    {transform:'translate(' + dx * .45 + 'px,' + (dy * .45 - 70) + 'px) scale(' + ((1 + sc) / 2.2) + ')', opacity:1, offset:.45},
    {transform:'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')', opacity:.25}
  ], {duration:720, easing:'cubic-bezier(.45,0,.6,1)'});
  anim.finished.then(() => node.remove(), () => node.remove());
  bumpDelay = 640;
}
async function toggleCart(p, btn){
  if (!p) return;
  const inCart = cartQty(p) > 0;
  const n = Object.assign({}, p, inCart ? {carrinho:0} : {carrinho:1, carrinhoEm:Date.now()});
  if (!inCart){ flyToCart(btn && btn.closest('.prod'), btn); toggled.add(p.id); }
  const ok = await write('prods', n);
  if (ok && !inCart && !drawerEl) toast('Adicionado ao carrinho', {action:'Ver carrinho', duration:2800, onAction:openDrawer});
}
const qtyTimers = {};
function setQty(p, q){
  if (!p) return;
  q = Math.max(1, Math.min(99, q));
  if (q === cartQty(p)) return;
  upsert(state.prods, Object.assign({}, p, {carrinho:q}));
  schedule();
  clearTimeout(qtyTimers[p.id]);
  qtyTimers[p.id] = setTimeout(() => { const cur = prodById(p.id); if (cur) write('prods', cur); }, 350);
}
async function cartRemove(p, btn){
  if (!p) return;
  const row = btn && btn.closest('.ci');
  if (row && !reduce){ try { await row.animate([{opacity:1, transform:'none'}, {opacity:0, transform:'translateX(24px)'}], {duration:200, easing:'ease-in', fill:'forwards'}).finished; } catch(e){} }
  const ok = await write('prods', Object.assign({}, p, {carrinho:0}));
  if (!ok){ lastDrList = ''; schedule(); }
}
async function cartClear(){
  const items = cartItems();
  if (!items.length) return;
  const ok = await confirmModal({title:'Limpar o carrinho?', text:'Os ' + plural(items.length, 'produto sai', 'produtos saem') + ' do carrinho, mas continuam nas suas categorias.', ok:'Limpar carrinho'});
  if (!ok) return;
  for (const p of items){ const d = await write('prods', Object.assign({}, p, {carrinho:0})); if (!d) return; }
  toast('Carrinho limpo');
}

/* ---------- gaveta do carrinho ---------- */
let drawerEl = null, lastDrList = '', rateTimer = 0;
function parseRate(v){
  v = String(v || '').replace(/[^\d,.]/g, '');
  if (!v) return null;
  if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
}
const fmtRate = n => Number(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:4});
function openDrawer(){
  if (drawerEl) return;
  const opener = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'drawer-ov';
  ov.innerHTML = '<aside class="drawer enter" role="dialog" aria-modal="true" aria-labelledby="dr-title">'
    + '<div class="dr-head"><h3 id="dr-title">Seu carrinho</h3><span class="muted" id="dr-count"></span><button type="button" class="dr-x" aria-label="Fechar carrinho">' + ic('x') + '</button></div>'
    + '<div class="dr-body" id="dr-list"></div>'
    + '<div class="dr-foot" id="dr-foot">'
    +   '<div id="dr-rows"></div>'
    +   '<div class="rates" id="dr-rates"><p class="rates-t">Cotação para somar em reais</p>'
    +     '<label class="rate" id="rate-usd-row"><span>1 US$ =</span><span class="money"><span>R$</span><input class="inp" id="rate-usd" inputmode="decimal" placeholder="0,00" autocomplete="off"></span></label>'
    +     '<label class="rate" id="rate-eur-row"><span>1 € =</span><span class="money"><span>R$</span><input class="inp" id="rate-eur" inputmode="decimal" placeholder="0,00" autocomplete="off"></span></label>'
    +     '<span class="hint">Use a cotação do dia do seu banco ou cartão. O valor fica salvo para as próximas vezes.</span></div>'
    +   '<div id="dr-grand"></div>'
    +   '<div class="dr-actions"><button type="button" class="btn btn-ghost" data-act="cart-clear">Limpar carrinho</button></div>'
    + '</div></aside>';
  $('#drawer-root').appendChild(ov);
  drawerEl = ov; lastDrList = '';
  document.documentElement.classList.add('locked');
  const close = () => {
    if (!drawerEl) return;
    drawerEl = null;
    ov.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { ov.remove(); if (!modalCount) document.documentElement.classList.remove('locked'); }, reduce ? 0 : 220);
    try { if (opener && opener.isConnected && opener.focus) opener.focus({preventScroll:true}); } catch(e){}
  };
  function onKey(e){ if (e.key === 'Escape' && !$('#modal-root').children.length){ e.preventDefault(); close(); } }
  document.addEventListener('keydown', onKey);
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  ov.querySelector('.dr-x').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target.closest('.dr-empty [data-close]')) close(); });
  ['usd', 'eur'].forEach(k => {
    const inp = ov.querySelector('#rate-' + k);
    inp.addEventListener('input', () => {
      clearTimeout(rateTimer);
      rateTimer = setTimeout(() => {
        const n = parseRate(inp.value);
        const r = Object.assign({}, state.rates);
        if (n) r[k] = n; else delete r[k];
        if ((r[k] || null) !== (state.rates[k] || null)) writeRates(r);
      }, 550);
    });
    inp.addEventListener('blur', () => { const n = parseRate(inp.value); if (n) inp.value = fmtRate(n); });
  });
  renderDrawer();
  setTimeout(() => { const d = ov.querySelector('.drawer'); if (d) d.classList.remove('enter'); }, 900);
  requestAnimationFrame(() => ov.querySelector('.dr-x').focus());
}
function ciHTML(p, i){
  const link = safeLink(p.link), cat = catById(p.categoriaId), q = cartQty(p), m = CUR_INFO[p.moeda] ? p.moeda : 'BRL';
  const img = p.foto ? '<img src="' + esc(srcOf(p.foto)) + '" alt="">' : '<span class="noimg" aria-hidden="true">' + esc(initials(p.titulo)) + '</span>';
  const media = link ? '<a class="ci-img" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">' + img + '</a>' : '<span class="ci-img">' + img + '</span>';
  const title = link ? '<a class="ci-t" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(p.titulo) + '</a>' : '<span class="ci-t">' + esc(p.titulo) + '</span>';
  const price = p.preco != null ? fmtC(p.preco * q, m) + (q > 1 ? '<span class="ci-unit">' + fmtC(p.preco, m) + ' cada</span>' : '') : 'Sem preço';
  const step = state.canEdit
    ? '<div class="step" role="group" aria-label="Quantidade"><button type="button" data-act="qty-" data-id="' + esc(p.id) + '" aria-label="Diminuir quantidade"' + (q <= 1 ? ' disabled' : '') + '>−</button><span>' + q + '</span><button type="button" data-act="qty+" data-id="' + esc(p.id) + '" aria-label="Aumentar quantidade"' + (q >= 99 ? ' disabled' : '') + '>+</button></div>'
    : '<span class="ci-sub">' + plural(q, 'unidade', 'unidades') + '</span>';
  return '<li class="ci" data-key="' + esc(p.id) + '" style="--i:' + i + '">' + media
    + '<div>' + title + (cat ? '<span class="ci-sub">' + esc(cat.nome) + '</span>' : '')
    + '<div class="ci-row">' + step + '<span class="ci-price">' + price + '</span></div></div>'
    + (state.canEdit ? '<button type="button" class="rm" data-act="cart-rm" data-id="' + esc(p.id) + '" aria-label="Tirar ' + esc(p.titulo) + ' do carrinho" title="Tirar do carrinho">' + ic('x') + '</button>' : '<span></span>')
    + '</li>';
}
function renderDrawer(){
  if (!drawerEl) return;
  const items = cartItems();
  const t = totals(items, cartQty);
  const u = usedCur(t);
  const n = items.reduce((a, p) => a + cartQty(p), 0);
  drawerEl.querySelector('#dr-count').textContent = n ? plural(n, 'item', 'itens') : '';
  const list = items.length
    ? '<ul class="ci-list">' + items.map(ciHTML).join('') + '</ul>'
    : '<div class="dr-empty"><span class="empty-art">' + geoArt('carrinho', 3, 3) + '</span><h4>Seu carrinho está vazio</h4><p>Toque no botão de carrinho de um produto para ele entrar aqui e ser somado.</p></div>';
  if (list !== lastDrList){ drawerEl.querySelector('#dr-list').innerHTML = list; lastDrList = list; }
  drawerEl.querySelector('#dr-foot').hidden = !items.length;
  if (!items.length) return;
  drawerEl.querySelector('#dr-rows').innerHTML = u.length > 1 ? u.map(c => '<div class="tr"><span>Em ' + CUR_INFO[c].nome.toLowerCase() + '</span><b>' + fmtC(t[c], c) + '</b></div>').join('') : '';
  const needUsd = t.USD > 0, needEur = t.EUR > 0;
  drawerEl.querySelector('#dr-rates').hidden = !(needUsd || needEur);
  drawerEl.querySelector('#rate-usd-row').hidden = !needUsd;
  drawerEl.querySelector('#rate-eur-row').hidden = !needEur;
  ['usd', 'eur'].forEach(k => {
    const inp = drawerEl.querySelector('#rate-' + k);
    inp.disabled = !state.canEdit;
    if (document.activeElement !== inp) inp.value = state.rates[k] ? fmtRate(state.rates[k]) : '';
  });
  const brl = toBRL(t);
  let g;
  if (u.length <= 1 && (u[0] || 'BRL') === 'BRL'){
    g = '<div class="grand"><span>Total</span><b>' + fmtC(t.BRL, 'BRL') + '</b></div>';
  } else if (u.length === 1){
    g = '<div class="grand"><span>Total</span><b>' + fmtC(t[u[0]], u[0]) + '</b></div>'
      + (brl != null ? '<p class="grand-note">Cerca de ' + fmtC(brl, 'BRL') + ' pela cotação informada</p>' : '');
  } else if (brl != null){
    g = '<div class="grand"><span>Total em reais</span><b>≈ ' + fmtC(brl, 'BRL') + '</b></div><p class="grand-note">Valor aproximado pela cotação informada</p>';
  } else {
    g = '<p class="grand-note">Preencha a cotação acima para ver o total somado em reais.</p>';
  }
  drawerEl.querySelector('#dr-grand').innerHTML = g;
  drawerEl.querySelector('.dr-actions').hidden = !state.canEdit;
}

document.addEventListener('click', e => {
  if (e.target.closest('.overlay')) return;
  const open = e.target.closest('[data-open]');
  if (open){ go('#/c/' + open.dataset.open); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const id = a.dataset.id;
  switch (a.dataset.act){
    case 'home': go('#/'); break;
    case 'new-cat': catModal(); break;
    case 'new-prod': newProd(a.dataset.cat); break;
    case 'edit-cat': catModal(catById(id)); break;
    case 'del-cat': deleteCat(catById(id)); break;
    case 'edit-prod': prodModal(prodById(id)); break;
    case 'del-prod': deleteProd(prodById(id), a); break;
    case 'cart': openDrawer(); break;
    case 'cart-toggle': toggleCart(prodById(id), a); break;
    case 'qty+': { const p = prodById(id); if (p) setQty(p, cartQty(p) + 1); break; }
    case 'qty-': { const p = prodById(id); if (p) setQty(p, cartQty(p) - 1); break; }
    case 'cart-rm': cartRemove(prodById(id), a); break;
    case 'cart-clear': cartClear(); break;
  }
});
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.broken){ t.dataset.broken = '1'; t.style.visibility = 'hidden'; }
}, true);

let qt = 0;
const qEl = $('#q');
qEl.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { state.q = qEl.value; schedule(); }, 120); });
qEl.addEventListener('keydown', e => { if (e.key === 'Escape'){ qEl.value = ''; state.q = ''; schedule(); qEl.blur(); } });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('.overlay')){ e.preventDefault(); qEl.focus(); }
});

$('#mosaic-slot').addEventListener('pointerover', e => {
  const t = e.target.closest('.t:not(.big)');
  if (t) spin(t.querySelector('.s'));
});
if (!reduce){
  setInterval(() => {
    if (!mosaicEl || !mosaicEl.isConnected || document.hidden || $('#home').hidden) return;
    const list = mosaicEl.querySelectorAll('.t:not(.big) .s:not(.blank)');
    if (list.length) spin(list[Math.floor(Math.random() * list.length)]);
  }, 1800);
}

/* ---------- início ---------- */
function startLocal(){ state.mode = 'local'; loadLocal(); state.ready = true; schedule(); }
function onDbErr(err){
  if (err && err.code === 'revoked') state.canEdit = false;
  toast('A conexão com os dados caiu. Recarregue a página para continuar.');
  schedule();
}
async function boot(){
  state.route = parse(location.hash);
  renderNow();
  setTimeout(() => { const h = $('.hero-text'); if (h) h.classList.remove('intro-text'); }, 1600);
  const rt = window.claude && typeof window.claude.use === 'function';
  if (!rt){ startLocal(); return; }
  let db = null, assets = null, user = null;
  try { const r = await Promise.all([window.claude.use('db'), window.claude.use('assets'), window.claude.use('user')]); db = r[0]; assets = r[1]; user = r[2]; } catch(e){}
  if (!db){ startLocal(); return; }
  api.db = db; api.assets = assets; state.mode = 'db';
  if (user){ try { state.canEdit = !!(await user.canEdit()); } catch(e){} }
  let gc = false, gp = false;
  const ready = () => { if (gc && gp) state.ready = true; schedule(); };
  db.collection('categorias').onSnapshot(s => { state.cats = s.docs.map(d => Object.assign({}, d.data(), {id:d.id})); gc = true; ready(); }, onDbErr);
  db.collection('produtos').onSnapshot(s => { state.prods = s.docs.map(d => Object.assign({}, d.data(), {id:d.id})); gp = true; ready(); }, onDbErr);
  db.doc('config/cotacoes').onSnapshot(s => { state.rates = s.exists ? Object.assign({}, s.data()) : {}; schedule(); }, () => {});
}
boot();
})();
