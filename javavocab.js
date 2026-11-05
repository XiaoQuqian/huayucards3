'use strict';
/* Huayu Cards: make your own Mandarin flashcard decks, study them, and take a TOCFL A1-style quiz.
   Everyone makes a simple account (username + password) and their decks are saved under it, so when they
   come back and log in, their own decks are there. By default accounts live in the browser on that device.
   If js/firebase-config.js is filled in, accounts and decks are stored online (Firebase) and follow people to any device.
   Starter decks come from js/data.js. */

const KEY = 'huayu-cards-v2';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- saved data ---------- */
// decks: [{ id, name, src?, words: [{ id, zh, py, en, ex, s }] }]   s: 1 = remembered, 0 = don't remember, undefined = not studied
let decks = [];
let storageKey = KEY;          // becomes KEY + '-' + user id after login, so accounts never mix on one browser
let auth = null, cloud = null, user = null, pushTimer = null;
const needAuth = () => typeof FIREBASE_CONFIG !== 'undefined' && !!FIREBASE_CONFIG && typeof firebase !== 'undefined';
function loadLocal() { try { decks = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (e) { decks = []; } }
const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(decks)); } catch (e) {} if (cloud) pushCloud(); else setStatus('Saved on this device'); };
function setStatus(t, bad) { const s = $('status'); if (s) { s.textContent = t; s.style.color = bad ? '#F0B46A' : ''; } }
function pushCloud(now) {
  if (!cloud || !user) return;
  setStatus('Saving…'); clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    cloud.collection('users').doc(user.uid).set({ decks: JSON.stringify(decks), updated: Date.now() })
      .then(() => setStatus('Saved to your account'))
      .catch(() => setStatus('Not saved yet (offline?)', true));
  }, now ? 0 : 700);
}

const app = { view: 'decks', deckId: null, draft: null, filter: 'all', confirm: false, session: null, quiz: null, quizDeck: null, qcfg: { listen: true, read: true, n: 10 }, dir: 'zh', shuffle: true };
const deckOf = id => decks.find(d => d.id === id);
const cnt = d => ({ n: d.words.length, k: d.words.filter(w => w.s === 1).length, l: d.words.filter(w => w.s === 0).length });
const go = (v, extra = {}) => { Object.assign(app, { view: v, confirm: false }, extra); render(); window.scrollTo(0, 0); };
$('home').onclick = () => { if (!user) return; go('decks'); };

function render() {
  const views = { auth: vAuth, decks: vDecks, deck: vDeck, edit: vEdit, study: vStudy, quizsetup: vQuizSetup, quiz: vQuiz, quizres: vQuizRes };
  views[app.view]($('app'));
}

/* ---------- home: my decks + starter decks ---------- */
function addStarter(s, prefix = 'TOCFL A1 · ') {
  decks.push({ id: uid(), name: prefix + s.name, src: s.id, words: s.words.map(([zh, py, en, ex]) => ({ id: uid(), zh, py, en, ex })) });
}
function vDecks(el) {
  const have = new Set(decks.map(d => d.src).filter(Boolean));
  const total = STARTER_DECKS.reduce((n, s) => n + s.words.length, 0);
  el.innerHTML = `
  <div class="top"><div class="grow"><h2>My decks</h2><p class="lead">Make a deck, type in your own words, save it, then study it with flashcards.</p></div></div>
  <div class="decks">${decks.map(d => { const c = cnt(d); return `<button class="deck" data-id="${d.id}"><b>${esc(d.name)}</b>
    <div class="bar"><i class="g" style="width:${c.n ? c.k / c.n * 100 : 0}%"></i><i class="o" style="width:${c.n ? c.l / c.n * 100 : 0}%"></i></div>
    <div class="meta">${c.n} words · ${c.k} remembered · ${c.l} don't remember</div></button>`; }).join('')}
    <button class="deck new" id="newdeck">+ New deck</button></div>
  ${decks.length ? '' : '<div class="empty">You have no decks yet. Make your own with "+ New deck", or add a TOCFL A1 starter deck below.</div>'}

  ${typeof MY_DECKS !== 'undefined' && MY_DECKS.length ? `<div class="section"><div class="top"><div class="grow"><h2>My word lists</h2><p class="lead">Lists that came with this app. Add one to your decks to study it.</p></div></div>
  <div class="decks">${MY_DECKS.map(s => `<div class="deck st"><div><b>${esc(s.name)}</b><div class="desc">${esc(s.desc || '')}</div></div>
    <div class="eg">${s.words.slice(0, 4).map(w => esc(w[0])).join(' · ')}</div>
    <div class="row" style="justify-content:space-between"><span class="meta">${s.words.length} words</span>
    <button class="sm" data-addmy="${s.id}" ${have.has(s.id) ? 'disabled' : ''}>${have.has(s.id) ? 'Added' : 'Add to my decks'}</button></div></div>`).join('')}</div></div>` : ''}

  <div class="section"><div class="top"><div class="grow"><h2>TOCFL A1 starter decks</h2>
    <p class="lead">${total} common beginner words in ${STARTER_DECKS.length} topics, with example sentences. Add the topics you want to your decks. These are based on the beginner (Novice 1, A1) level and are not the official word list.</p></div>
    <button class="btn" id="addall" ${STARTER_DECKS.every(s => have.has(s.id)) ? 'disabled' : ''}>Add all topics</button></div>
  <div class="decks">${STARTER_DECKS.map(s => `<div class="deck st"><div><b>${esc(s.name)}</b><div class="desc">${esc(s.desc)}</div></div>
    <div class="eg">${s.words.slice(0, 4).map(w => esc(w[0])).join(' · ')}</div>
    <div class="row" style="justify-content:space-between"><span class="meta">${s.words.length} words</span>
    <button class="sm" data-add="${s.id}" ${have.has(s.id) ? 'disabled' : ''}>${have.has(s.id) ? 'Added' : 'Add to my decks'}</button></div></div>`).join('')}</div>
  <div class="panel"><h3>TOCFL A1-style practice test</h3><p>Listening and reading questions made from all the starter words. Your results are not saved to your decks.</p>
    <button class="btn p" id="mix">Start practice test</button></div></div>

  <div class="panel"><h3>Back up your decks</h3><p>Your decks are saved in this browser only. Copy a backup now and then, and paste it back here to restore it on another device.</p>
    <div class="row"><button class="sm" id="bk">Copy backup</button><span class="msg" id="bkm"></span></div>
    <details style="margin-top:10px"><summary style="cursor:pointer;font-size:14px">Restore from a backup</summary>
      <p style="margin-top:8px">This replaces all decks in this browser.</p><textarea id="rs" placeholder="Paste a backup here"></textarea>
      <div class="row" style="margin-top:8px"><button class="sm" id="rsb">Restore</button><span class="msg" id="rsm"></span></div></details></div>`;

  el.querySelectorAll('.deck[data-id]').forEach(b => b.onclick = () => go('deck', { deckId: b.dataset.id, filter: 'all' }));
  $('newdeck').onclick = () => go('edit', { draft: { id: null, name: '', rows: Array.from({ length: 10 }, () => ({ zh: '', py: '', en: '', ex: '' })) } });
  el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { addStarter(STARTER_DECKS.find(s => s.id === b.dataset.add)); save(); render(); });
  el.querySelectorAll('[data-addmy]').forEach(b => b.onclick = () => { addStarter(MY_DECKS.find(s => s.id === b.dataset.addmy), ''); save(); render(); });
  $('addall').onclick = () => { STARTER_DECKS.filter(s => !have.has(s.id)).forEach(addStarter); save(); render(); };
  $('mix').onclick = () => {
    const words = STARTER_DECKS.flatMap(s => s.words.map(([zh, py, en, ex]) => ({ id: uid(), zh, py, en, ex })));
    app.quizDeck = { id: '__mix', name: 'TOCFL A1 (all topics)', words };
    go('quizsetup');
  };
  $('bk').onclick = async () => {
    const t = JSON.stringify(decks);
    try { await navigator.clipboard.writeText(t); $('bkm').className = 'msg ok'; $('bkm').textContent = 'Backup copied.'; }
    catch (e) { $('rs').value = t; $('bkm').className = 'msg'; $('bkm').textContent = 'Copy was blocked. The backup is in the restore box: select it and copy.'; el.querySelector('details').open = true; }
  };
  $('rsb').onclick = () => {
    try { const x = JSON.parse($('rs').value); if (!Array.isArray(x) || !x.every(d => d && d.name && Array.isArray(d.words))) throw 0; decks = x; save(); go('decks'); }
    catch (e) { $('rsm').className = 'msg err'; $('rsm').textContent = 'That does not look like a backup.'; }
  };
}

/* ---------- deck page ---------- */
function vDeck(el) {
  const d = deckOf(app.deckId); if (!d) return go('decks');
  const c = cnt(d), f = app.filter;
  const list = d.words.filter(w => f === 'all' || (f === 'learn' && w.s === 0) || (f === 'known' && w.s === 1) || (f === 'new' && w.s === undefined));
  el.innerHTML = `<button class="link" id="back">← All decks</button>
  <div class="top"><div class="grow"><h2>${esc(d.name)}</h2></div></div>
  <div class="stats"><div><b>${c.n}</b><span>words</span></div><div><b>${c.k}</b><span>remembered</span></div><div><b>${c.l}</b><span>don't remember</span></div><div><b>${c.n - c.k - c.l}</b><span>not studied</span></div></div>
  <div class="row"><button class="btn p" id="sa" ${c.n ? '' : 'disabled'}>Study all cards</button>
    <button class="btn" id="sl" ${c.l ? '' : 'disabled'}>Study "Don't remember" (${c.l})</button>
    <button class="btn" id="tq" ${c.n >= 4 ? '' : 'disabled'} title="${c.n >= 4 ? '' : 'Add at least 4 words'}">TOCFL A1-style quiz</button>
    <button class="btn" id="ed">Edit deck</button>
    <button class="btn d" id="del">${app.confirm ? 'Click again to delete' : 'Delete'}</button></div>
  <div class="row" style="margin-top:12px"><div class="seg"><button id="d-zh" aria-pressed="${app.dir === 'zh'}">中文 → English</button><button id="d-en" aria-pressed="${app.dir === 'en'}">English → 中文</button></div>
    <label style="font-size:14px;color:var(--muted)"><input type="checkbox" id="sh" ${app.shuffle ? 'checked' : ''}> Shuffle</label></div>
  <div class="chips">${[['all', 'All', c.n], ['learn', "Don't remember", c.l], ['known', 'Remembered', c.k], ['new', 'Not studied', c.n - c.k - c.l]].map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l} (${n})</button>`).join('')}</div>
  ${list.length ? list.map(w => `<div class="wi"><span class="zh">${esc(w.zh)}</span><span class="m"><div class="py">${esc(w.py)}</div><div class="en">${esc(w.en)}</div></span>
    <span class="act">${w.s === 1 ? '<span class="badge k">Remembered</span>' : w.s === 0 ? '<span class="badge d">Don\'t remember</span>' : ''}
    <button class="sm" data-w="${w.id}" data-s="${w.s === 0 ? 1 : 0}">${w.s === 0 ? 'Remembered' : "Don't remember"}</button></span></div>`).join('') : '<div class="empty">No words here yet.</div>'}`;
  $('back').onclick = () => go('decks');
  $('sa').onclick = () => startStudy(d.words.map(w => w.id));
  $('sl').onclick = () => startStudy(d.words.filter(w => w.s === 0).map(w => w.id));
  $('tq').onclick = () => { app.quizDeck = d; go('quizsetup'); };
  $('ed').onclick = () => go('edit', { draft: { id: d.id, name: d.name, rows: d.words.map(w => ({ ...w })) } });
  $('del').onclick = () => { if (!app.confirm) { app.confirm = true; render(); return; } decks = decks.filter(x => x.id !== d.id); save(); go('decks'); };
  $('d-zh').onclick = () => { app.dir = 'zh'; render(); }; $('d-en').onclick = () => { app.dir = 'en'; render(); };
  $('sh').onchange = e => { app.shuffle = e.target.checked; };
  el.querySelectorAll('.chip').forEach(b => b.onclick = () => { app.filter = b.dataset.f; render(); });
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const w = d.words.find(x => x.id === b.dataset.w); w.s = +b.dataset.s; save(); render(); });
}

/* ---------- deck editor ---------- */
const blank = () => ({ zh: '', py: '', en: '', ex: '' });
function vEdit(el) {
  const dr = app.draft;
  el.innerHTML = `<button class="link" id="back">← Cancel</button>
  <div class="top"><div class="grow"><h2>${dr.id ? 'Edit deck' : 'New deck'}</h2><p class="lead">Type the words you want to learn. Chinese and meaning are required. Pinyin and example are optional. An example can be written as: 中文句子 | pinyin | English.</p></div></div>
  <input type="text" class="name" id="nm" placeholder="Deck name, for example “Lesson 3”" value="${esc(dr.name)}" aria-label="Deck name">
  <div class="cols"><span>Chinese</span><span>Pinyin</span><span>Meaning</span><span>Example</span><span></span></div>
  <div id="rows">${dr.rows.map((r, i) => rowHTML(r, i)).join('')}</div>
  <div class="row" style="margin-top:6px"><button class="sm" id="add">+ Add row</button><button class="sm" id="add5">+ Add 5 rows</button></div>
  <div class="panel"><h3>Paste many words at once</h3><p>One word per line, separated by commas: Chinese, pinyin, meaning, example (optional).</p>
    <textarea id="bulk" placeholder="你好, nǐ hǎo, hello&#10;謝謝, xièxie, thank you"></textarea>
    <div class="row" style="margin-top:8px"><button class="sm" id="bulkb">Add these words</button></div></div>
  <div class="savebar"><button class="btn p" id="save">Save deck</button><span class="msg" id="m"></span></div>`;
  $('back').onclick = () => go(dr.id ? 'deck' : 'decks', { deckId: dr.id });
  $('nm').oninput = e => { dr.name = e.target.value; };
  bindRows();
  $('add').onclick = () => { dr.rows.push(blank()); redrawRows(true); };
  $('add5').onclick = () => { for (let i = 0; i < 5; i++) dr.rows.push(blank()); redrawRows(true); };
  $('bulkb').onclick = () => {
    const lines = $('bulk').value.split('\n').map(l => l.trim()).filter(Boolean);
    const add = lines.map(l => { const p = l.split(/\s*[,，\t]\s*/); return { zh: p[0] || '', py: p[1] || '', en: p[2] || '', ex: p.slice(3).join(', ') }; });
    if (!add.length) return;
    dr.rows = dr.rows.filter(r => r.zh || r.py || r.en || r.ex).concat(add); $('bulk').value = ''; redrawRows(true);
    $('m').className = 'msg ok'; $('m').textContent = add.length + ' words added. Press Save deck when you are done.';
  };
  $('save').onclick = () => {
    const words = dr.rows.filter(r => r.zh.trim() || r.en.trim());
    const bad = words.find(r => !r.zh.trim() || !r.en.trim());
    const m = $('m'); m.className = 'msg err';
    if (!dr.name.trim()) { m.textContent = 'Give the deck a name.'; $('nm').focus(); return; }
    if (!words.length) { m.textContent = 'Add at least one word.'; return; }
    if (bad) { m.textContent = 'Each word needs both Chinese and a meaning. Check the rows that are half empty.'; return; }
    const clean = words.map(r => ({ id: r.id || uid(), zh: r.zh.trim(), py: r.py.trim(), en: r.en.trim(), ex: (r.ex || '').trim(), s: r.s }));
    let target;
    if (dr.id) { target = deckOf(dr.id); target.name = dr.name.trim(); target.words = clean; }
    else { target = { id: uid(), name: dr.name.trim(), words: clean }; decks.push(target); }
    save(); go('deck', { deckId: target.id, filter: 'all' });
  };
}
const rowHTML = (r, i) => `<div class="er" data-i="${i}"><input type="text" class="zh" data-k="zh" placeholder="你好" value="${esc(r.zh)}" aria-label="Chinese"><input type="text" class="py" data-k="py" placeholder="nǐ hǎo" value="${esc(r.py)}" aria-label="Pinyin"><input type="text" class="en" data-k="en" placeholder="hello" value="${esc(r.en)}" aria-label="Meaning"><input type="text" class="ex" data-k="ex" placeholder="你好嗎? | Nǐ hǎo ma? | How are you?" value="${esc(r.ex || '')}" aria-label="Example"><button class="x" data-rm="${i}" aria-label="Remove row">×</button></div>`;
function bindRows() {
  const dr = app.draft;
  $('rows').querySelectorAll('input').forEach(inp => inp.oninput = () => { dr.rows[+inp.closest('.er').dataset.i][inp.dataset.k] = inp.value; });
  $('rows').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { dr.rows.splice(+b.dataset.rm, 1); if (!dr.rows.length) dr.rows.push(blank()); redrawRows(); });
}
function redrawRows(focusLast) {
  $('rows').innerHTML = app.draft.rows.map((r, i) => rowHTML(r, i)).join(''); bindRows();
  if (focusLast) { const l = $('rows').querySelectorAll('.er'); const t = l[l.length - 1]; if (t) t.querySelector('input').focus(); }
}

/* ---------- flashcard study ---------- */
function startStudy(ids) {
  if (!ids.length) return;
  app.session = { ids: app.shuffle ? shuf(ids) : ids, idx: 0, flipped: false, rem: [], miss: [], round: (app.session && app.session.again) ? app.session.round + 1 : 1 };
  app.view = 'study'; render(); window.scrollTo(0, 0);
}
function vStudy(el) {
  const s = app.session, d = deckOf(app.deckId);
  if (s.idx >= s.ids.length) {
    el.innerHTML = `<div class="sum"><div class="big">${s.miss.length ? 'Nice work' : '太好了！'}</div>
    <p class="lead" style="margin:6px auto">${s.miss.length ? 'Cards you missed stay in your "Don\'t remember" pile.' : 'You remembered every card in this round.'}</p>
    <div class="two"><div><b style="color:var(--good)">${s.rem.length}</b>remembered</div><div><b style="color:var(--bad)">${s.miss.length}</b>don't remember</div></div>
    <div class="row" style="justify-content:center">${s.miss.length ? `<button class="btn p" id="again">Practice the ${s.miss.length} I missed</button>` : ''}<button class="btn" id="fin">Back to deck</button></div></div>`;
    if (s.miss.length) $('again').onclick = () => { app.session.again = true; startStudy(s.miss.slice()); };
    $('fin').onclick = () => { app.session = null; go('deck', { deckId: d.id, filter: s.miss.length ? 'learn' : 'all' }); };
    return;
  }
  const w = d.words.find(x => x.id === s.ids[s.idx]);
  const zh = `<div class="hanzi ${w.zh.length > 3 ? 's' : ''}">${esc(w.zh)}</div>`, en = `<div class="eng">${esc(w.en)}</div>`;
  const ex = w.ex ? `<div class="exs">${esc(w.ex).replace(/ \| /g, '\n')}</div>` : '';
  el.innerHTML = `<button class="link" id="quit">← Stop studying</button>
  <div class="prog"><span>${s.idx + 1} / ${s.ids.length}${s.round > 1 ? ' · round ' + s.round : ''}</span><div class="track"><div class="fill" style="width:${s.idx / s.ids.length * 100}%"></div></div><span>${esc(d.name)}</span></div>
  <div class="stage"><button class="card ${s.flipped ? 'flip' : ''}" id="card" aria-label="Flashcard. Press to flip.">
   <div class="face"><span class="tag">${app.dir === 'zh' ? 'Chinese' : 'English'}</span>${app.dir === 'zh' ? zh : en}<span class="hint">Tap to flip</span></div>
   <div class="face back"><span class="tag">Answer</span>${zh}${w.py ? `<div class="cpy">${esc(w.py)}</div>` : ''}<div class="eng" style="font-size:22px">${esc(w.en)}</div>${ex}</div></button></div>
  <div class="nav3"><button class="no" id="no">Don't remember (1)</button><button class="yes" id="yes">Remembered (2)</button></div>
  <p class="msg" style="text-align:center;color:var(--muted);margin-top:10px">Space flips the card.</p>`;
  $('quit').onclick = () => { app.session = null; go('deck', { deckId: d.id }); };
  $('card').onclick = flip; $('no').onclick = () => mark(false); $('yes').onclick = () => mark(true);
}
function flip() { const s = app.session; if (!s) return; s.flipped = !s.flipped; $('card').classList.toggle('flip', s.flipped); }
function mark(ok) {
  const s = app.session, d = deckOf(app.deckId); if (!s || s.idx >= s.ids.length) return;
  const w = d.words.find(x => x.id === s.ids[s.idx]); w.s = ok ? 1 : 0; (ok ? s.rem : s.miss).push(w.id);
  s.idx++; s.flipped = false; save(); render();
}
document.addEventListener('keydown', e => {
  if (app.view !== 'study' || !app.session || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (app.session.idx >= app.session.ids.length) return;
  if (e.code === 'Space') { e.preventDefault(); flip(); } else if (e.key === '1') mark(false); else if (e.key === '2') mark(true);
});

function leaveQuiz(){try{speechSynthesis.cancel()}catch(e){}app.quiz=null;if(app.quizDeck&&app.quizDeck.id==='__mix')go('decks');else go('deck')}
/* ---------- TOCFL A1-style quiz ----------
   Setup (listening / reading / count), one question at a time with A to D choices, then a results review. */
const parts=w=>{const p=(w.ex||'').split(' | ').map(x=>x.trim());return {zh:p[0]||'',py:p[1]||'',en:p[2]||''}};
const variants=w=>w.zh.split('/').map(x=>x.trim()).filter(Boolean);
const blankOf=w=>{const s=parts(w).zh;const v=variants(w).find(x=>s.includes(x));return v?{s,v}:null};
function speak(text){try{const u=new SpeechSynthesisUtterance(text);u.lang='zh-TW';u.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function pick(list,n,bad){const out=[];for(const x of shuf(list)){if(out.length>=n)break;if(bad(x,out))continue;out.push(x)}return out}
function makeQ(type,w,W){
  const others=W.filter(x=>x.id!==w.id);
  const zhOpts=(filterFn)=>{
    const d=pick(others,3,(x,o)=>(filterFn&&!filterFn(x))||x.zh===w.zh||o.some(y=>y.zh===x.zh));
    if(d.length<3)return null;
    return shuf([{t:w.zh,c:true,zh:true},...d.map(x=>({t:x.zh,c:false,zh:true}))]);
  };
  const enOpts=(key,correct)=>{
    const d=pick(others.filter(x=>key(x)),3,(x,o)=>key(x)===correct||o.some(y=>key(y)===key(x)));
    if(d.length<3)return null;
    return shuf([{t:correct,c:true},...d.map(x=>({t:key(x),c:false}))]);
  };
  const p=parts(w);
  if(type==='L1'){const o=zhOpts();return o&&{type,sec:'Listening',kind:'Listen and choose the word you hear.',audio:variants(w)[0],opts:o,wid:w.id}}
  if(type==='L2'){if(!p.en||!p.zh)return null;const o=enOpts(x=>parts(x).en,p.en);return o&&{type,sec:'Listening',kind:'Listen to the sentence and choose the meaning.',audio:p.zh,opts:o,wid:w.id}}
  if(type==='R1'){const b=blankOf(w);if(!b)return null;
    const o=zhOpts(x=>!b.s.includes(variants(x)[0]||'§'));return o&&{type,sec:'Reading',kind:'Choose the best word to fill in the blank.',blank:b,opts:o,wid:w.id}}
  if(type==='R2'){if(!p.en||!p.zh)return null;const o=enOpts(x=>parts(x).en,p.en);return o&&{type,sec:'Reading',kind:'Read the sentence and choose the meaning.',sent:p.zh,opts:o,wid:w.id}}
  if(type==='R3'){const o=enOpts(x=>x.en,w.en);return o&&{type,sec:'Reading',kind:'Choose the meaning of this word.',word:w.zh,opts:o,wid:w.id}}
  return null;
}
function genQuiz(d,cfg){
  const W=d.words,qs=[];
  const nL=cfg.listen&&cfg.read?Math.ceil(cfg.n/2):cfg.listen?cfg.n:0, nR=cfg.n-nL;
  const build=(count,types)=>{
    let pool=shuf(W),pi=0,ti=0,guard=0;
    while(count>0&&guard++<400){
      if(pi>=pool.length){pool=shuf(W);pi=0}
      const w=pool[pi++];
      for(let k=0;k<types.length;k++){const q=makeQ(types[(ti+k)%types.length],w,W);if(q){qs.push(q);ti++;count--;break}}
    }
  };
  if(nL)build(nL,['L1','L2']);
  if(nR)build(nR,['R1','R2','R3']);
  qs.forEach(q=>{q.ans=null});
  return qs;
}
function vQuizSetup(el){
  const d=app.quizDeck,c=app.qcfg,ok=d.words.length>=4;
  el.innerHTML=`<button class="link" id="back">← ${esc(d.name)}</button>
  <div class="top"><div class="grow"><h2>TOCFL A1-style quiz</h2><p class="lead">Practice in the style of the TOCFL Band A listening and reading sections. Questions come from the words and example sentences in this deck.</p></div></div>
  <div class="panel" style="margin-top:0">
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="qL" ${c.listen?'checked':''}><span><b>Listening</b><br><span style="color:var(--muted);font-size:14px">You hear a word or a sentence and choose the answer. Needs sound on.</span></span></label>
    <label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="qR" ${c.read?'checked':''}><span><b>Reading</b><br><span style="color:var(--muted);font-size:14px">Fill in the blank, read a sentence, or pick the meaning of a word.</span></span></label>
    <label style="font-size:15px">Number of questions <select id="qn" style="font:15px var(--f-body);padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);margin-left:6px">${[10,20,30].map(n=>`<option ${c.n===n?'selected':''}>${n}</option>`).join('')}</select></label>
  </div>
  ${ok?'':'<p class="msg err" style="margin-top:10px">This deck needs at least 4 words to make a quiz.</p>'}
  <div class="row" style="margin-top:14px"><button class="btn p" id="go" ${ok?'':'disabled'}>Start quiz</button><span class="msg err" id="m"></span></div>
  <p class="note">All questions have four choices, A to D. You can go back and change answers until you press Finish. This is practice only, not an official test or score.</p>`;
  $('back').onclick=leaveQuiz;
  $('go').onclick=()=>{
    c.listen=$('qL').checked;c.read=$('qR').checked;c.n=+$('qn').value;
    if(!c.listen&&!c.read){$('m').textContent='Choose Listening, Reading, or both.';return}
    const qs=genQuiz(d,c);
    if(!qs.length){$('m').textContent='Could not make questions from this deck. Add more words with different meanings.';return}
    app.quiz={qs,i:0,warn:false,t0:Date.now()};go('quiz');
  };
}
function vQuiz(el){
  const d=app.quizDeck,z=app.quiz,q=z.qs[z.i],N=z.qs.length;
  const letters='ABCD';
  let prompt='';
  if(q.audio)prompt=`<button class="play" id="play">▶ Play sound</button>`;
  else if(q.blank){const i=q.blank.s.indexOf(q.blank.v);prompt=`<div class="sent">${esc(q.blank.s.slice(0,i))}<span class="blank">&nbsp;&nbsp;&nbsp;</span>${esc(q.blank.s.slice(i+q.blank.v.length))}</div>`}
  else if(q.sent)prompt=`<div class="sent">${esc(q.sent)}</div>`;
  else prompt=`<div class="big">${esc(q.word)}</div>`;
  const left=z.qs.filter(x=>x.ans===null).length;
  el.innerHTML=`<button class="link" id="quit">← Stop quiz</button>
  <div class="prog"><span>Question ${z.i+1} of ${N}</span><div class="track"><div class="fill" style="width:${(N-left)/N*100}%"></div></div><span>${N-left} answered</span></div>
  <div class="sec">${q.sec}</div>
  <div class="qbox"><div class="kind">${q.kind}</div>${prompt}</div>
  <div class="opts">${q.opts.map((o,k)=>`<button class="opt ${o.zh?'zhopt':''}" data-k="${k}" aria-pressed="${q.ans===k}"><span class="l">${letters[k]}</span><span class="t">${esc(o.t)}</span></button>`).join('')}</div>
  <div class="dots">${z.qs.map((x,k)=>`<button class="dot ${x.ans!==null?'done':''} ${k===z.i?'cur':''}" data-j="${k}" aria-label="Question ${k+1}">${k+1}</button>`).join('')}</div>
  <div class="qnav"><button class="btn" id="pv" ${z.i?'':'disabled'}>← Back</button>
    ${z.i<N-1?'<button class="btn p" id="nx">Next →</button>':'<button class="btn p" id="fin">Finish</button>'}</div>
  <p class="msg err" id="warn" style="margin-top:10px">${z.warn?left+' question'+(left>1?'s are':' is')+' not answered. Press Finish again to submit anyway.':''}</p>
  <p class="note">Keys: A to D choose an answer, arrow keys move between questions.</p>`;
  $('quit').onclick=leaveQuiz;
  if($('play')){$('play').onclick=()=>speak(q.audio);setTimeout(()=>speak(q.audio),250)}
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{q.ans=+b.dataset.k;z.warn=false;render()});
  el.querySelectorAll('.dot').forEach(b=>b.onclick=()=>{z.i=+b.dataset.j;z.warn=false;render()});
  $('pv').onclick=()=>{z.i--;render()};
  if($('nx'))$('nx').onclick=()=>{z.i++;render()};
  if($('fin'))$('fin').onclick=()=>{if(left&&!z.warn){z.warn=true;render();return}finishQuiz()};
}
function finishQuiz(){
  const z=app.quiz,d=app.quizDeck;
  z.secs=Date.now()-z.t0;
  if(d.id!=='__mix')z.qs.forEach(q=>{if(!q.opts[q.ans]||!q.opts[q.ans].c){const w=d.words.find(x=>x.id===q.wid);if(w)w.s=0}});
  save();go('quizres');
}
function vQuizRes(el){
  const z=app.quiz,d=app.quizDeck,mix=d.id==='__mix';
  const ok=q=>q.ans!==null&&q.opts[q.ans].c;
  const sc=s=>{const a=z.qs.filter(q=>!s||q.sec===s);return [a.filter(ok).length,a.length]};
  const [t,n]=sc(),[l,ln]=sc('Listening'),[r,rn]=sc('Reading');
  const pct=Math.round(t/n*100);
  const verdict=pct>=80?'Strong. You are ready for more words.':pct>=60?'Good progress. Review the missed words.':(mix?'Keep practicing.':'Keep practicing. The missed words are in your "Don\'t remember" pile.');
  const mins=Math.max(1,Math.round(z.secs/60000));
  const missed=[...new Set(z.qs.filter(q=>!ok(q)).map(q=>q.wid))];
  el.innerHTML=`<div class="top"><div class="grow"><h2>Quiz results</h2><p class="lead">${verdict}</p></div></div>
  <div class="res"><div class="box"><b>${t} / ${n}</b><span>total · ${pct}%</span></div>
   ${ln?`<div class="box"><b>${l} / ${ln}</b><span>listening</span></div>`:''}${rn?`<div class="box"><b>${r} / ${rn}</b><span>reading</span></div>`:''}
   <div class="box"><b>${mins} min</b><span>time</span></div></div>
  <div class="row" style="margin-bottom:16px">${missed.length&&!mix?`<button class="btn p" id="sm">Study the ${missed.length} missed word${missed.length>1?'s':''}</button>`:''}<button class="btn" id="again">New quiz</button><button class="btn" id="fin">Back to deck</button></div>
  <h3 style="margin-bottom:8px">Review</h3>
  ${z.qs.map((q,i)=>{const c=q.opts.find(o=>o.c),u=q.ans!==null?q.opts[q.ans]:null;
    const what=q.audio?`<button class="sm" data-p="${i}">▶ Play</button> ${q.type==='L2'?'<span class="z">'+esc(q.audio)+'</span>':''}`:q.blank?`<span class="z">${esc(q.blank.s)}</span>`:q.sent?`<span class="z">${esc(q.sent)}</span>`:`<span class="z">${esc(q.word)}</span>`;
    return `<div class="rv ${ok(q)?'ok':'no'}"><div class="tg">${i+1}. ${q.sec} · ${ok(q)?'Correct':'Wrong'}</div><div>${what}</div>
     <div>Correct answer: <b>${esc(c.t)}</b>${ok(q)?'':` · Your answer: ${u?esc(u.t):'none'}`}</div></div>`}).join('')}`;
  el.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>speak(z.qs[+b.dataset.p].audio));
  if($('sm'))$('sm').onclick=()=>{app.quiz=null;app.view='deck';startStudy(missed)};
  $('again').onclick=()=>{app.quiz=null;go('quizsetup')};
  $('fin').onclick=()=>{app.quiz=null;if(mix)go('decks');else go('deck',{filter:missed.length?'learn':'all'})};
}
document.addEventListener('keydown',e=>{
  if(app.view!=='quiz'||!app.quiz||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const z=app.quiz,q=z.qs[z.i],k='abcd'.indexOf(e.key.toLowerCase());
  if(k>=0&&k<q.opts.length){q.ans=k;z.warn=false;render()}
  else if(e.key==='ArrowRight'&&z.i<z.qs.length-1){z.i++;render()}
  else if(e.key==='ArrowLeft'&&z.i>0){z.i--;render()}
});


/* ---------- accounts ---------- */
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'Wrong email or password.',
  'auth/email-already-in-use': 'That email already has an account. Try logging in.', 'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/invalid-email': 'That email address does not look right.', 'auth/network-request-failed': 'No internet connection. Try again.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.', 'auth/missing-password': 'Enter your password.'
};
// Simple accounts kept in this browser (used when Firebase is not set up).
const ACC_KEY = 'huayu-accounts-v1', SES_KEY = 'huayu-session-v1';
const getAcc = () => { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch (e) { return {}; } };
const setAcc = x => { try { localStorage.setItem(ACC_KEY, JSON.stringify(x)); } catch (e) {} };
async function hashPw(pw, salt) {
  const data = salt + ':' + pw;
  try { if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } } catch (e) {}
  let h = 5381; for (const c of data) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'x' + h;
}
async function localAuth(mode, name, pw) {
  const key = name.trim().toLowerCase();
  if (!key) throw new Error('Type a username.');
  const acc = getAcc();
  if (mode === 'up') {
    if (acc[key]) throw new Error('That username is already used on this device. Try logging in.');
    if (pw.length < 4) throw new Error('Use a password with at least 4 characters.');
    const salt = uid() + uid(), id = uid() + uid();
    const first = Object.keys(acc).length === 0;
    acc[key] = { name: name.trim(), id, salt, hash: await hashPw(pw, salt) }; setAcc(acc);
    if (first) { try { const old = localStorage.getItem(KEY); if (old) localStorage.setItem(KEY + '-' + id, old); } catch (e) {} }   // keep decks made before accounts existed
  } else {
    const a = acc[key];
    if (!a || a.hash !== await hashPw(pw, a.salt)) throw new Error('Wrong username or password.');
  }
  signInLocal(key);
}
function signInLocal(key) {
  const a = getAcc()[key]; user = { uid: a.id, email: a.name };
  try { localStorage.setItem(SES_KEY, key); } catch (e) {}
  storageKey = KEY + '-' + a.id; loadLocal(); updateHeader(); setStatus('Saved on this device'); go('decks');
}
function signOutLocal() {
  try { localStorage.removeItem(SES_KEY); } catch (e) {}
  user = null; decks = []; storageKey = KEY; app.session = null; app.quiz = null; app.authMode = 'in'; updateHeader(); app.view = 'auth'; render();
}
function vAuth(el) {
  const mode = app.authMode || 'in', online = !!cloud;
  el.innerHTML = `<div class="authbox"><h2>${mode === 'in' ? 'Log in' : 'Create an account'}</h2>
  <p class="lead">${mode === 'in' ? 'Log in to get your own decks back.' : 'Pick a username and a password. Your decks will be saved under your account, and they will be here when you come back.'}</p>
  <form id="af"><label>${online ? 'Email' : 'Username'}<input type="${online ? 'email' : 'text'}" id="em" autocomplete="${online ? 'email' : 'username'}" autocapitalize="none" required></label>
  <label>Password<input type="password" id="pw" minlength="${online ? 6 : 4}" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" required></label>
  <button class="btn p" type="submit" id="sub">${mode === 'in' ? 'Log in' : 'Create account'}</button></form>
  <div class="msg" id="am" role="status"></div>
  <p style="font-size:14px;color:var(--muted)"><button class="link2" id="sw" type="button">${mode === 'in' ? 'New here? Create an account' : 'Already have an account? Log in'}</button>${online && mode === 'in' ? ' · <button class="link2" id="fp" type="button">Forgot password</button>' : ''}</p>
  ${online ? '' : '<p class="meta" style="font-size:13px;color:var(--muted)">Accounts are saved in this browser on this device. Log in from the same browser to see your decks. There is no password reset, so remember your password.</p>'}</div>`;
  const msg = (t, ok) => { $('am').className = 'msg ' + (ok ? 'ok' : 'err'); $('am').textContent = t; };
  $('sw').onclick = () => { app.authMode = mode === 'in' ? 'up' : 'in'; render(); };
  if ($('fp')) $('fp').onclick = () => {
    const em = $('em').value.trim(); if (!em) return msg('Type your email first, then press Forgot password.');
    auth.sendPasswordResetEmail(em).then(() => msg('Password reset email sent. Check your inbox.', true)).catch(e => msg(AUTH_ERRORS[e.code] || 'Something went wrong. Try again.'));
  };
  $('af').onsubmit = ev => {
    ev.preventDefault(); $('sub').disabled = true; msg('');
    const em = $('em').value.trim(), pw = $('pw').value;
    const run = online ? (mode === 'in' ? auth.signInWithEmailAndPassword(em, pw) : auth.createUserWithEmailAndPassword(em, pw)) : localAuth(mode, em, pw);
    Promise.resolve(run).catch(e => { msg(AUTH_ERRORS[e.code] || e.message || 'Something went wrong. Try again.'); $('sub').disabled = false; });
  };
}
function updateHeader() {
  const who = $('who'), out = $('logout');
  if (who) who.textContent = user ? user.email : '';
  if (out) out.hidden = !user;
  if (!user) setStatus('');
}
function boot() {
  if (!needAuth()) {                                           // simple accounts on this device
    $('logout').onclick = signOutLocal;
    const k = (() => { try { return localStorage.getItem(SES_KEY); } catch (e) { return null; } })();
    if (k && getAcc()[k]) { signInLocal(k); return; }
    app.view = 'auth'; render(); return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);                      // online accounts (optional)
  auth = firebase.auth(); cloud = firebase.firestore();
  $('logout').onclick = () => { try { auth.signOut(); } catch (e) {} };
  app.view = 'auth'; render();
  auth.onAuthStateChanged(async u => {
    user = u; updateHeader();
    if (!u) { decks = []; storageKey = KEY; app.session = null; app.quiz = null; app.authMode = 'in'; app.view = 'auth'; render(); return; }
    storageKey = KEY + '-' + u.uid; loadLocal();
    try {
      const snap = await cloud.collection('users').doc(u.uid).get();
      if (snap.exists) { decks = JSON.parse(snap.data().decks || '[]'); try { localStorage.setItem(storageKey, JSON.stringify(decks)); } catch (e) {} setStatus('Saved to your account'); }
      else pushCloud(true);
    } catch (e) { setStatus('Offline: showing the copy saved on this device', true); }
    go('decks');
  });
}

boot();