(() => {
  // =========================================================
  // 저장소
  // =========================================================
  const KEY = 'jp-kaiwa.v1';
  const DAY = 86400000;
  // 간격 반복: 레벨별 다음 복습까지의 기간 (Lv0=바로, Lv1=1일, Lv2=3일, Lv3=7일, Lv4=14일, Lv5=30일)
  const INTERVAL = [0, 1, 3, 7, 14, 30].map(d => d * DAY);
  const defaults = () => ({
    progress: {}, custom: [], stars: {}, daily: {},
    setup: { cats: [], scope: 'all', kind: 'all', count: 20, order: 'random', mode: 'study' },
    settings: { rate: 0.9, order: 'pron', autoplay: true },
  });
  let store = defaults();
  try { store = Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const d0 = defaults();
  store.settings = Object.assign(d0.settings, store.settings);
  store.setup = Object.assign(d0.setup, store.setup);
  store.stars = store.stars || {};
  store.daily = store.daily || {};
  store.custom = store.custom || [];
  store.progress = store.progress || {};
  // 예전 기록(ok/ng/due) → 레벨 방식으로 옮기기
  Object.values(store.progress).forEach(p => {
    if (p.lv === undefined) {
      p.lv = p.due ? 0 : (p.ok > 0 ? 2 : 0);
      p.next = Date.now() + INTERVAL[p.lv];
    }
  });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  save();

  // =========================================================
  // 데이터
  // =========================================================
  const toItem = (a, cat) => ({
    jp: a[0], kana: a[1] || a[0], ko: a[2], mean: a[3], cat,
    kind: (a[1] || a[0]).replace(/[\s？?！!、。]/g, '').length >= 7 ? 'phrase' : 'word',
  });
  let CATS = [];
  function buildCats() {
    CATS = JP_DATA.map(c => ({ id: c.id, name: c.name, icon: c.icon, list: c.items.map(a => toItem(a, c.id)) }));
    CATS.push({ id: 'mine', name: '내 단어', icon: '⭐', list: store.custom.map(a => toItem(a, 'mine')) });
  }
  buildCats();
  const allItems = () => CATS.flatMap(c => c.list);

  // 주제 묶음 (홈·설정 화면에서 그룹으로 표시)
  const GROUPS = [
    { name: '💬 친구·감정', ids: ['friend', 'emotion', 'react', 'react2', 'hangout', 'cheer', 'love', 'talk', 'talk2', 'person'] },
    { name: '🧳 상황별 회화', ids: ['greet', 'basic', 'intro', 'ask', 'food', 'food2', 'shop', 'cloth', 'move', 'trans2', 'hotel', 'tour', 'clinic', 'work', 'school', 'contact', 'sns'] },
    { name: '📚 기본 단어', ids: ['daily', 'verb', 'verb2', 'adj', 'adj2', 'adv', 'qword', 'people', 'job', 'eat', 'menu', 'place', 'home', 'thing', 'body', 'weather', 'nature', 'num', 'count', 'time', 'week', 'time2', 'color', 'animal', 'hobby', 'sport'] },
  ];
  function groupedCats() {
    const used = new Set();
    const out = GROUPS.map(g => {
      const cats = g.ids.map(id => CATS.find(c => c.id === id)).filter(Boolean);
      cats.forEach(c => used.add(c.id));
      return { name: g.name, cats };
    });
    const rest = CATS.filter(c => !used.has(c.id) && c.id !== 'mine');
    if (rest.length) out.push({ name: '📦 기타', cats: rest });
    out.push({ name: '⭐ 내 단어', cats: CATS.filter(c => c.id === 'mine') });
    return out.filter(g => g.cats.length);
  }

  // =========================================================
  // 학습 상태 / 간격 반복
  // =========================================================
  const rec = it => store.progress[it.jp];
  const isNew = it => !rec(it);
  const isDue = it => { const p = rec(it); return !!p && p.next <= Date.now(); };
  const isLearned = it => { const p = rec(it); return !!p && p.lv >= 2; };
  const isWeak = it => { const p = rec(it); return !!p && p.ng > 0; };
  const isStar = it => !!store.stars[it.jp];
  function toggleStar(it) { if (isStar(it)) delete store.stars[it.jp]; else store.stars[it.jp] = 1; save(); }

  const dayKey = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  const todayCount = () => store.daily[dayKey(new Date())] || 0;
  function bumpDaily() { const k = dayKey(new Date()); store.daily[k] = (store.daily[k] || 0) + 1; }
  function streak() {
    const d = new Date(); let n = 0;
    if (!store.daily[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (store.daily[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  // g: 0=모름, 1=애매, 2=알아요
  const nextLv = (lv, g) => g === 0 ? 0 : g === 1 ? (lv >= 2 ? lv - 1 : 1) : Math.min(5, lv + 1);
  function grade(it, g) {
    const now = Date.now();
    const p = Object.assign({ ok: 0, ng: 0, lv: 0, next: 0 }, rec(it));
    p.lv = nextLv(p.lv, g);
    if (g === 0) p.ng++; else if (g === 2) p.ok++;
    p.next = now + INTERVAL[p.lv]; p.t = now;
    store.progress[it.jp] = p; bumpDaily(); save();
  }
  function quizMark(it, right) {
    const p = rec(it);
    if (!right) return grade(it, 0);
    if (!p || p.next <= Date.now()) return grade(it, 2); // 복습 시기가 된 것만 레벨 업
    p.ok++; bumpDaily(); save();
  }
  function nextLabel(it, g) {
    if (g === 0) return '곧 다시';
    const lv = nextLv((rec(it) || { lv: 0 }).lv, g);
    return INTERVAL[lv] / DAY + '일 뒤';
  }
  function badge(it) {
    const p = rec(it);
    if (!p) return '<span class="lv new">새 단어</span>';
    if (isDue(it)) return '<span class="lv due">복습할 때</span>';
    return `<span class="lv">Lv ${p.lv}</span>`;
  }
  const dotClass = it => isNew(it) ? '' : isDue(it) ? 'due' : isLearned(it) ? 'ok' : 'mid';

  // =========================================================
  // 덱 만들기
  // =========================================================
  const SCOPES = { all: '전체', new: '새 단어', due: '복습할 때', weak: '약점', star: '⭐ 즐겨찾기' };
  const KINDS = { all: '전체', word: '단어', phrase: '문장' };
  const COUNTS = { 10: '10', 20: '20', 30: '30', 50: '50', 0: '전부' };
  const ORDER_OPTS = { random: '🎲 랜덤', seq: '순서대로' };
  const MODES = { study: '🃏 카드', p2m: '🎧 발음→뜻', m2p: '💡 뜻→발음', listen: '👂 듣기' };

  function buildDeck(cfg) {
    let l = (cfg.cats.length ? CATS.filter(c => cfg.cats.includes(c.id)) : CATS).flatMap(c => c.list);
    if (cfg.kind !== 'all') l = l.filter(i => i.kind === cfg.kind);
    if (cfg.scope === 'new') l = l.filter(isNew);
    if (cfg.scope === 'star') l = l.filter(isStar);
    if (cfg.scope === 'due') l = l.filter(isDue).sort((a, b) => rec(a).next - rec(b).next);
    if (cfg.scope === 'weak') l = l.filter(isWeak).sort((a, b) => (rec(b).ng - rec(b).ok) - (rec(a).ng - rec(a).ok) || rec(a).lv - rec(b).lv);
    const take = +cfg.count || l.length;
    if (cfg.scope === 'due' || cfg.scope === 'weak') {
      l = l.slice(0, take); // 급한 것부터 고른 뒤
      if (cfg.order === 'random') l = shuffle(l);
    } else {
      if (cfg.order === 'random') l = shuffle(l);
      l = l.slice(0, take);
    }
    return l;
  }
  function startSession(cfg, title) {
    const deck = buildDeck(cfg);
    if (!deck.length) return toast('조건에 맞는 표현이 없어요');
    if (cfg.mode === 'study') renderStudy(title, deck);
    else renderQuiz(title, deck, cfg.mode);
  }

  // =========================================================
  // 음성 (TTS)
  // =========================================================
  let jaVoice = null;
  const hasTTS = 'speechSynthesis' in window;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    jaVoice = vs.find(v => /ja[-_]JP/i.test(v.lang) && /google|kyoko|o-ren|nanami/i.test(v.name)) ||
              vs.find(v => /^ja/i.test(v.lang)) || null;
  }
  if (hasTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text, slow) {
    if (!hasTTS) { toast('이 브라우저는 음성 재생을 지원하지 않아요'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; if (jaVoice) u.voice = jaVoice;
    u.rate = slow ? 0.55 : store.settings.rate;
    speechSynthesis.speak(u);
  }
  const hush = () => { if (hasTTS) speechSynthesis.cancel(); };

  // =========================================================
  // 공통 UI
  // =========================================================
  const $view = document.getElementById('view');
  const $title = document.getElementById('title');
  const $back = document.getElementById('backBtn');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  let backTo = null;
  function setHeader(title, back) {
    $title.textContent = title; backTo = back || null;
    $back.classList.toggle('hidden', !back);
    window.scrollTo(0, 0);
  }
  $back.onclick = () => { hush(); backTo && backTo(); };
  document.getElementById('setBtn').onclick = () => { hush(); renderSettings(); };
  document.getElementById('addBtn').onclick = () => { hush(); renderAdd(); };
  const pct = list => list.length ? Math.round(list.filter(isLearned).length / list.length * 100) : 0;

  function rowHtml(it, i) {
    return `<div class="row" data-i="${i}"><span class="dot ${dotClass(it)}"></span>
      <div class="t"><div class="jp">${esc(it.jp)}${it.kana !== it.jp ? ` <span class="kana">${esc(it.kana)}</span>` : ''}</div>
      <div class="ko-pron">${esc(it.ko)}</div><div class="mean">${esc(it.mean)}</div></div>
      <button class="star-sm ${isStar(it) ? 'on' : ''}" data-star aria-label="즐겨찾기">${isStar(it) ? '★' : '☆'}</button></div>`;
  }
  function bindRows(root, list) {
    root.querySelectorAll('.row').forEach(r => r.onclick = e => {
      const it = list[+r.dataset.i];
      const s = e.target.closest('[data-star]');
      if (s) { toggleStar(it); s.classList.toggle('on', isStar(it)); s.textContent = isStar(it) ? '★' : '☆'; return; }
      speak(it.kana);
    });
  }

  // =========================================================
  // 홈
  // =========================================================
  function renderHome() {
    setHeader('일본어 회화');
    const all = allItems();
    const due = all.filter(isDue).length;
    const learned = all.filter(isLearned).length;
    const fresh = all.filter(isNew).length;
    const weak = all.filter(isWeak).length;
    const stars = all.filter(isStar).length;
    $view.innerHTML = `
      <div class="hero col">
        <div class="hero-top">
          <div><div class="big">${learned}<small> / ${all.length}</small></div><div class="sub">외운 표현 (Lv 2 이상)</div></div>
          <div class="streak"><div>🔥 ${streak()}일 연속</div><div class="sub">오늘 ${todayCount()}개 학습</div></div>
        </div>
        <div class="bar"><i style="width:${pct(all)}%"></i></div>
      </div>
      <button class="btn big-btn" id="dueBtn" ${due ? '' : 'disabled'}>${due ? `🔁 오늘의 복습 ${due}개` : '🔁 지금 복습할 것 없음 👍'}</button>
      <div class="quick">
        <button data-q="random"><span>🎲</span><b>랜덤 20</b><small>전체에서 섞기</small></button>
        <button data-q="new"><span>🆕</span><b>새 단어</b><small>${fresh}개 남음</small></button>
        <button data-q="weak"><span>🎯</span><b>약점 공략</b><small>틀린 ${weak}개</small></button>
        <button data-q="quiz"><span>🎧</span><b>랜덤 퀴즈</b><small>10문제</small></button>
        <button data-q="listen"><span>👂</span><b>듣기 퀴즈</b><small>소리만 듣고</small></button>
        <button data-q="star"><span>⭐</span><b>즐겨찾기</b><small>${stars}개</small></button>
      </div>
      <button class="setup-btn" id="setupBtn"><span>⚙️ 주제·범위·개수 직접 골라서 학습</span><span>›</span></button>
      ${groupedCats().map(g => {
        const items = g.cats.flatMap(c => c.list);
        return `<div class="section-title group-title"><span>${g.name}</span><span class="hint">${items.length}개 · 외움 ${pct(items)}%</span></div>
        <div class="grid">
        ${g.cats.map(c => {
          const d = c.list.filter(isDue).length;
          return `<button class="cat" data-id="${c.id}">
            <div class="emoji">${c.icon}</div><div class="name">${esc(c.name)}</div>
            <div class="meta">${c.list.length}개${d ? ` · <b class="due-txt">복습 ${d}</b>` : ''}${c.id === 'mine' && !c.list.length ? ' · ＋로 추가' : ''}</div>
            <div class="bar"><i style="width:${pct(c.list)}%"></i></div>
          </button>`;
        }).join('')}
        </div>`;
      }).join('')}`;
    const base = { cats: [], kind: 'all', order: 'random' };
    $view.querySelector('#dueBtn').onclick = () => startSession({ ...base, scope: 'due', count: 0, mode: 'study' }, '오늘의 복습');
    const quick = {
      random: [{ ...base, scope: 'all', count: 20, mode: 'study' }, '랜덤 20'],
      new:    [{ ...base, scope: 'new', count: 10, mode: 'study' }, '새 단어'],
      weak:   [{ ...base, scope: 'weak', count: 20, mode: 'study' }, '약점 공략'],
      quiz:   [{ ...base, scope: 'all', count: 10, mode: 'p2m' }, '랜덤 퀴즈'],
      listen: [{ ...base, scope: 'all', count: 10, mode: 'listen' }, '듣기 퀴즈'],
      star:   [{ ...base, scope: 'star', count: 0, mode: 'study' }, '즐겨찾기'],
    };
    $view.querySelector('.quick').onclick = e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      const [cfg, title] = quick[b.dataset.q];
      if (b.dataset.q === 'weak' && !weak) return toast('아직 틀린 표현이 없어요');
      if (b.dataset.q === 'star' && !stars) return toast('카드나 목록에서 ☆를 눌러 즐겨찾기 해 보세요');
      startSession(cfg, title);
    };
    $view.querySelector('#setupBtn').onclick = () => renderSetup();
    $view.querySelectorAll('.cat').forEach(b => b.onclick = () => openCatSheet(CATS.find(c => c.id === b.dataset.id)));
  }

  // =========================================================
  // 주제 시트
  // =========================================================
  function openCatSheet(cat) {
    const root = document.getElementById('sheetRoot');
    if (!cat.list.length) return toast(cat.id === 'mine' ? '오른쪽 위 ＋ 버튼으로 내 단어를 추가해 보세요' : '표현이 없어요');
    const d = cat.list.filter(isDue).length, n = cat.list.filter(isNew).length;
    root.innerHTML = `<div class="sheet-bg"><div class="sheet">
      <h2>${cat.icon} ${esc(cat.name)}</h2><p>${cat.list.length}개 · 새 단어 ${n} · 복습할 때 ${d}</p>
      <button class="mode" data-m="study"><span class="e">🃏</span><div><b>카드 학습</b><span>랜덤으로 전부 · 발음 → 뜻 연결</span></div></button>
      ${d ? `<button class="mode" data-m="due"><span class="e">🔁</span><div><b>복습만</b><span>복습할 때가 된 ${d}개</span></div></button>` : ''}
      <button class="mode" data-m="quiz"><span class="e">✅</span><div><b>퀴즈 10문제</b><span>발음 듣고 뜻 고르기</span></div></button>
      <button class="mode" data-m="list"><span class="e">📋</span><div><b>목록 보기</b><span>훑어보고 듣고 즐겨찾기</span></div></button>
      <button class="mode" data-m="setup"><span class="e">⚙️</span><div><b>이 주제로 상세 설정</b><span>범위·개수·순서·방식 고르기</span></div></button>
    </div></div>`;
    const bg = root.firstElementChild;
    bg.onclick = e => {
      if (e.target === bg) { root.innerHTML = ''; return; }
      const m = e.target.closest('.mode'); if (!m) return;
      root.innerHTML = '';
      const base = { cats: [cat.id], kind: 'all', order: 'random' };
      const mode = m.dataset.m;
      if (mode === 'study') startSession({ ...base, scope: 'all', count: 0, mode: 'study' }, cat.name);
      if (mode === 'due') startSession({ ...base, scope: 'due', count: 0, mode: 'study' }, cat.name + ' 복습');
      if (mode === 'quiz') startSession({ ...base, scope: 'all', count: 10, mode: 'p2m' }, cat.name + ' 퀴즈');
      if (mode === 'list') renderList(cat);
      if (mode === 'setup') renderSetup({ cats: [cat.id] });
    };
  }

  // =========================================================
  // 상세 설정 (주제 여러 개 선택)
  // =========================================================
  function renderSetup(preset) {
    const cfg = Object.assign({}, store.setup, preset || {});
    cfg.cats = cfg.cats.filter(id => CATS.some(c => c.id === id));
    setHeader('학습 설정', renderHome);
    const seg = (key, opts) => `<div class="seg">${Object.entries(opts).map(([v, l]) =>
      `<button data-set="${key}" data-v="${v}" class="${String(cfg[key]) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    function draw() {
      const n = buildDeck({ ...cfg, order: 'seq' }).length;
      $view.innerHTML = `
        <div class="section-title">주제 <span class="hint">${cfg.cats.length ? cfg.cats.length + '개 선택' : '선택 안 하면 전체'}</span></div>
        ${groupedCats().map((g, gi) => {
          const allOn = g.cats.every(c => cfg.cats.includes(c.id));
          return `<div class="group-head"><span>${g.name}</span><button data-grp="${gi}">${allOn ? '묶음 해제' : '묶음 전체 선택'}</button></div>
          <div class="chips wrap">${g.cats.map(c => `<button class="chip ${cfg.cats.includes(c.id) ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>`;
        }).join('')}
        <div class="link-row"><button data-act="clear">선택 해제 (전체)</button><button data-act="rand">🎲 주제 3개 랜덤</button></div>
        <div class="section-title">범위</div>${seg('scope', SCOPES)}
        <div class="section-title">종류</div>${seg('kind', KINDS)}
        <div class="section-title">개수</div>${seg('count', COUNTS)}
        <div class="section-title">순서</div>${seg('order', ORDER_OPTS)}
        <div class="section-title">방식</div>${seg('mode', MODES)}
        <button class="btn full" id="go" ${n ? '' : 'disabled'}>${n ? `시작하기 · ${Math.min(n, +cfg.count || n)}개` : '조건에 맞는 표현이 없어요'}</button>`;
    }
    $view.onclick = e => {
      if (!document.getElementById('go')) return;
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.cat) {
        const id = t.dataset.cat;
        cfg.cats = cfg.cats.includes(id) ? cfg.cats.filter(x => x !== id) : [...cfg.cats, id];
      } else if (t.dataset.grp !== undefined) {
        const ids = groupedCats()[+t.dataset.grp].cats.map(c => c.id);
        const allOn = ids.every(id => cfg.cats.includes(id));
        cfg.cats = allOn ? cfg.cats.filter(id => !ids.includes(id)) : [...new Set([...cfg.cats, ...ids])];
      } else if (t.dataset.set) {
        cfg[t.dataset.set] = t.dataset.set === 'count' ? +t.dataset.v : t.dataset.v;
      } else if (t.dataset.act === 'clear') {
        cfg.cats = [];
      } else if (t.dataset.act === 'rand') {
        cfg.cats = shuffle(CATS.filter(c => c.list.length)).slice(0, 3).map(c => c.id);
      } else if (t.id === 'go') {
        $view.onclick = null;
        store.setup = { ...cfg }; save();
        const title = cfg.cats.length === 1 ? CATS.find(c => c.id === cfg.cats[0]).name : '맞춤 학습';
        return startSession(cfg, title);
      } else return;
      draw();
    };
    draw();
  }

  // =========================================================
  // 카드 학습
  // =========================================================
  const ORDERS = {
    pron: { label: '발음 → 뜻 → 표기', seq: ['ko', 'mean', 'jp'] },
    jp:   { label: '표기 → 발음 → 뜻', seq: ['jp', 'ko', 'mean'] },
    mean: { label: '뜻 → 발음 → 표기', seq: ['mean', 'ko', 'jp'] },
  };
  const stepName = { ko: '발음', mean: '뜻', jp: '일본어' };
  function slotHtml(kind, it, first) {
    const f = first ? 'first' : '';
    if (kind === 'ko') return `<div class="slot ${f}"><div class="label">한글 발음</div><div class="ko-pron">${esc(it.ko)}</div></div>`;
    if (kind === 'mean') return `<div class="slot ${f}"><div class="label">뜻</div><div class="mean">${esc(it.mean)}</div></div>`;
    return `<div class="slot ${f}"><div class="label">일본어</div><div class="jp">${esc(it.jp)}</div>${it.kana !== it.jp ? `<div class="kana">${esc(it.kana)}</div>` : ''}</div>`;
  }

  function renderStudy(title, deck0) {
    $view.onclick = null;
    const deck = deck0.slice();
    const total = new Set(deck.map(i => i.jp)).size;
    const result = new Map(); // jp -> { it, g(가장 낮은 평가) }
    let idx = 0, step = 0;
    const seq = ORDERS[store.settings.order].seq;
    setHeader(title, renderHome);

    function draw() {
      if (idx >= deck.length) return finish();
      const it = deck[idx];
      const done = step >= seq.length - 1;
      $view.innerHTML = `
        <div class="progress-line"><span>${result.size} / ${total} 완료</span><div class="bar"><i style="width:${result.size / total * 100}%"></i></div><span>남은 카드 ${deck.length - idx}</span></div>
        <div class="card" id="card">
          <button class="star ${isStar(it) ? 'on' : ''}" id="star" aria-label="즐겨찾기">${isStar(it) ? '★' : '☆'}</button>
          <button class="speak slow" id="slow" aria-label="느리게 듣기">느리게</button>
          <button class="speak" id="spk" aria-label="듣기">🔊</button>
          <div style="margin-bottom:8px">${badge(it)}</div>
          <div class="steps">${seq.map((s, i) => `<span class="${i <= step ? 'on' : ''}">${stepName[s]}</span>`).join('<i>→</i>')}</div>
          ${seq.slice(0, step + 1).map((k, i) => slotHtml(k, it, i === 0)).join('')}
          <div class="tap-hint">${done ? '← 모름 &nbsp;·&nbsp; 옆으로 밀기 &nbsp;·&nbsp; 알아요 →' : `탭해서 <b>${stepName[seq[step + 1]]}</b> 보기`}</div>
        </div>
        ${done
          ? `<div class="actions three">
              <button class="btn bad" data-g="0">모름<small>${nextLabel(it, 0)}</small></button>
              <button class="btn warn" data-g="1">애매<small>${nextLabel(it, 1)}</small></button>
              <button class="btn good" data-g="2">알아요<small>${nextLabel(it, 2)}</small></button></div>`
          : `<button class="btn ghost full" id="reveal">전부 보기</button>`}
        <div class="nav-row"><span></span><button id="skip">건너뛰기 →</button></div>`;

      const say = slow => speak(it.kana, slow);
      const q = s => $view.querySelector(s);
      q('#spk').onclick = e => { e.stopPropagation(); say(false); };
      q('#slow').onclick = e => { e.stopPropagation(); say(true); };
      q('#star').onclick = e => { e.stopPropagation(); toggleStar(it); const s = q('#star'); s.classList.toggle('on', isStar(it)); s.textContent = isStar(it) ? '★' : '☆'; };
      const advanceTo = target => {
        const before = seq.slice(0, step + 1).includes('ko');
        step = target;
        if (!before && seq.slice(0, step + 1).includes('ko') && store.settings.autoplay) say(false);
        draw();
      };
      const card = q('#card');
      let swiped = false, sx = 0, sy = 0;
      card.onclick = () => { if (swiped) { swiped = false; return; } if (!done) advanceTo(step + 1); };
      card.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      card.addEventListener('touchmove', e => {
        if (!done) return;
        const dx = e.touches[0].clientX - sx;
        if (Math.abs(dx) > Math.abs(e.touches[0].clientY - sy)) {
          card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
          card.style.boxShadow = dx > 0 ? '0 0 0 3px var(--good)' : '0 0 0 3px var(--bad)';
        }
      }, { passive: true });
      card.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx;
        card.style.transform = ''; card.style.boxShadow = '';
        if (done && Math.abs(dx) > 80) { swiped = true; doGrade(dx > 0 ? 2 : 0); }
      });
      if (done) $view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => doGrade(+b.dataset.g));
      else q('#reveal').onclick = () => advanceTo(seq.length - 1);
      q('#skip').onclick = () => { idx++; step = 0; draw(); };
      if (step === 0 && seq[0] === 'ko' && store.settings.autoplay) say(false);

      function doGrade(g) {
        grade(it, g);
        const prev = result.get(it.jp);
        result.set(it.jp, { it, g: prev ? Math.min(prev.g, g) : g });
        if (g === 0) deck.splice(Math.min(idx + 4, deck.length), 0, it); // 모르면 3장 뒤에 다시
        idx++; step = 0; draw();
      }
    }

    function finish() {
      hush();
      const arr = [...result.values()];
      const by = g => arr.filter(r => r.g === g).map(r => r.it);
      const miss = [...by(0), ...by(1)];
      $view.innerHTML = `<div class="result"><div style="font-size:48px">🎉</div><h2 style="margin:6px 0">학습 완료!</h2>
        <p class="note">🔥 ${streak()}일 연속 · 오늘 ${todayCount()}개 학습</p></div>
        <div class="stats"><div><b style="color:var(--good)">${by(2).length}</b>알아요</div><div><b style="color:var(--warn)">${by(1).length}</b>애매</div><div><b style="color:var(--bad)">${by(0).length}</b>모름</div></div>
        ${miss.length ? `<div class="section-title">다시 볼 표현</div><div id="rows">${miss.map(rowHtml).join('')}</div>` : ''}
        <div class="actions">${miss.length ? `<button class="btn" id="again">헷갈린 것 다시 (${miss.length})</button>` : `<button class="btn ghost" id="home">홈으로</button>`}
          <button class="btn ghost" id="quiz">퀴즈로 확인</button></div>
        ${miss.length ? '<div class="nav-row"><span></span><button id="home">홈으로 →</button></div>' : ''}`;
      if (miss.length) { bindRows($view.querySelector('#rows'), miss); $view.querySelector('#again').onclick = () => renderStudy(title, shuffle(miss)); }
      $view.querySelector('#home').onclick = renderHome;
      $view.querySelector('#quiz').onclick = () => renderQuiz(title, shuffle(arr.map(r => r.it)).slice(0, 10), 'p2m');
    }
    draw();
  }

  // =========================================================
  // 퀴즈
  // =========================================================
  const QTYPES = { p2m: '🎧 발음→뜻', m2p: '💡 뜻→발음', listen: '👂 듣기' };
  function renderQuiz(title, items, type) {
    $view.onclick = null;
    let qtype = type || 'p2m';
    const pool = allItems();
    const qs = items.slice();
    let qi = 0, score = 0; const wrong = [];
    setHeader(title, renderHome);

    function optionsFor(it) {
      const field = qtype === 'm2p' ? 'ko' : 'mean';
      const same = pool.filter(x => x[field] !== it[field] && x.kind === it.kind);
      const others = shuffle(same.length >= 3 ? same : pool.filter(x => x[field] !== it[field]));
      const seen = new Set([it[field]]); const opts = [it];
      for (const o of others) { if (opts.length >= 4) break; if (!seen.has(o[field])) { seen.add(o[field]); opts.push(o); } }
      return { opts: shuffle(opts), field };
    }
    function draw() {
      if (qi >= qs.length) return finish();
      const it = qs[qi];
      const { opts, field } = optionsFor(it);
      let question;
      if (qtype === 'p2m') question = `<button class="speak" id="spk">🔊</button><div class="label">이 발음의 뜻은?</div><div class="ko-pron" style="font-size:32px">${esc(it.ko)}</div>`;
      else if (qtype === 'm2p') question = `<div class="label">이 뜻을 일본어로?</div><div class="mean" style="font-size:28px">${esc(it.mean)}</div>`;
      else question = `<div class="label">잘 듣고 뜻을 고르세요</div><button class="listen-btn" id="spk">🔊</button><button class="link" id="slowq">느리게 듣기</button>`;
      $view.innerHTML = `
        <div class="q-type">${Object.entries(QTYPES).map(([k, l]) => `<button data-t="${k}" class="${qtype === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="progress-line"><span>${qi + 1} / ${qs.length}</span><div class="bar"><i style="width:${qi / qs.length * 100}%"></i></div><span>✓ ${score}</span></div>
        <div class="q-card">${question}</div>
        <div class="options">${opts.map((o, i) => `<button class="opt" data-i="${i}">${esc(o[field])}</button>`).join('')}</div>
        <div id="fb"></div>`;
      $view.querySelector('.q-type').onclick = e => { const t = e.target.dataset.t; if (t && t !== qtype) { qtype = t; draw(); } };
      const spk = $view.querySelector('#spk');
      if (spk) { spk.onclick = () => speak(it.kana); if (store.settings.autoplay || qtype === 'listen') speak(it.kana); }
      const slowq = $view.querySelector('#slowq'); if (slowq) slowq.onclick = () => speak(it.kana, true);
      let answered = false;
      $view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (answered) return; answered = true;
        const right = opts[+b.dataset.i] === it;
        $view.querySelectorAll('.opt').forEach(x => { if (opts[+x.dataset.i] === it) x.classList.add('right'); });
        if (right) score++; else { b.classList.add('wrong'); wrong.push(it); }
        quizMark(it, right);
        speak(it.kana);
        $view.querySelector('#fb').innerHTML = `<div class="feedback">
          <div>${right ? '⭕ 정답!' : '❌ 아쉬워요'}</div>
          <div class="jp" style="font-size:22px;margin-top:6px">${esc(it.jp)}</div>
          <div><b style="color:var(--accent)">${esc(it.ko)}</b> · ${esc(it.mean)}</div>
          <button class="btn full" id="nx">${qi + 1 < qs.length ? '다음 문제' : '결과 보기'}</button></div>`;
        $view.querySelector('#nx').onclick = () => { qi++; draw(); };
        $view.querySelector('#nx').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    function finish() {
      hush();
      $view.innerHTML = `<div class="result"><div class="score">${score}<span style="font-size:22px;color:var(--muted)"> / ${qs.length}</span></div>
        <p class="note">${score === qs.length ? '완벽해요! 🎉' : '틀린 표현은 곧 [오늘의 복습]에 다시 나와요'}</p></div>
        ${wrong.length ? `<div id="rows">${wrong.map(rowHtml).join('')}</div>` : ''}
        <div class="actions">${wrong.length ? `<button class="btn" id="again">틀린 것만 다시 (${wrong.length})</button><button class="btn ghost" id="card">카드로 복습</button>`
          : `<button class="btn ghost" id="home">홈으로</button><button class="btn" id="more">새 문제 더</button>`}</div>
        ${wrong.length ? '<div class="nav-row"><span></span><button id="home">홈으로 →</button></div>' : ''}`;
      if (wrong.length) {
        bindRows($view.querySelector('#rows'), wrong);
        $view.querySelector('#again').onclick = () => renderQuiz(title, shuffle(wrong), qtype);
        $view.querySelector('#card').onclick = () => renderStudy(title, shuffle(wrong));
      } else {
        $view.querySelector('#more').onclick = () => renderQuiz(title, shuffle(pool.filter(x => qs.some(q => q.cat === x.cat))).slice(0, qs.length), qtype);
      }
      $view.querySelector('#home').onclick = renderHome;
    }
    draw();
  }

  // =========================================================
  // 목록
  // =========================================================
  function renderList(cat) {
    $view.onclick = null;
    setHeader(cat.name + ' · 목록', renderHome);
    $view.innerHTML = `<input class="search" id="q" placeholder="일본어 · 한글 발음 · 뜻으로 검색" autocomplete="off">
      <p class="note" style="margin:0 4px 10px">⚪ 새 단어 · 🟡 학습 중 · 🟢 외움 · 🔴 복습할 때 · 탭하면 발음 재생</p><div id="rows"></div>`;
    const $rows = $view.querySelector('#rows');
    const draw = q => {
      q = (q || '').trim().toLowerCase();
      const l = q ? cat.list.filter(i => [i.jp, i.kana, i.ko, i.mean].some(s => s.toLowerCase().includes(q))) : cat.list;
      $rows.innerHTML = l.length ? l.map(rowHtml).join('') : '<div class="empty">검색 결과가 없어요</div>';
      bindRows($rows, l);
    };
    $view.querySelector('#q').oninput = e => draw(e.target.value);
    draw();
  }

  // =========================================================
  // 내 단어 추가
  // =========================================================
  function renderAdd() {
    $view.onclick = null;
    setHeader('내 단어 추가', renderHome);
    $view.innerHTML = `<div class="panel">
        <div class="field"><label>일본어 *</label><input id="fJp" placeholder="예: 美味しい"></div>
        <div class="field"><label>읽기 (히라가나, 선택 · 음성 재생에 사용)</label><input id="fKana" placeholder="예: おいしい"></div>
        <div class="field"><label>한글 발음 *</label><input id="fKo" placeholder="예: 오이시-"></div>
        <div class="field"><label>뜻 *</label><input id="fMean" placeholder="예: 맛있다"></div>
        <div class="actions"><button class="btn ghost" id="test">🔊 들어보기</button><button class="btn" id="save">추가하기</button></div>
      </div>
      <div class="section-title">내 단어 (${store.custom.length})</div>
      <div id="mine">${store.custom.length ? '' : '<div class="empty">아직 추가한 표현이 없어요</div>'}</div>`;
    const v = id => $view.querySelector(id).value.trim();
    $view.querySelector('#test').onclick = () => { const t = v('#fKana') || v('#fJp'); t ? speak(t) : toast('일본어를 입력해 주세요'); };
    $view.querySelector('#save').onclick = () => {
      const jp = v('#fJp'), ko = v('#fKo'), mean = v('#fMean');
      if (!jp || !ko || !mean) return toast('일본어 · 한글 발음 · 뜻은 꼭 적어 주세요');
      store.custom.push([jp, v('#fKana') || jp, ko, mean]); save(); buildCats(); toast('추가했어요'); renderAdd();
    };
    const $m = $view.querySelector('#mine');
    store.custom.forEach((a, i) => {
      const it = toItem(a, 'mine');
      const d = document.createElement('div'); d.className = 'row';
      d.innerHTML = `<div class="t"><div class="jp">${esc(it.jp)}</div><div class="ko-pron">${esc(it.ko)}</div><div class="mean">${esc(it.mean)}</div></div>
        <button class="icon-btn" data-a="play">🔊</button><button class="icon-btn" data-a="del">🗑️</button>`;
      d.onclick = e => {
        const act = e.target.dataset.a;
        if (act === 'play') speak(it.kana);
        if (act === 'del' && confirm(`'${it.jp}'을(를) 삭제할까요?`)) { store.custom.splice(i, 1); save(); buildCats(); renderAdd(); }
      };
      $m.appendChild(d);
    });
  }

  // =========================================================
  // 설정
  // =========================================================
  function renderSettings() {
    $view.onclick = null;
    setHeader('설정', renderHome);
    const s = store.settings;
    $view.innerHTML = `
      <div class="panel">
        <div class="field"><label>카드 학습 순서</label>
          <select id="order">${Object.entries(ORDERS).map(([k, o]) => `<option value="${k}" ${s.order === k ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
        <div class="field"><label>말하기 속도: <span id="rv">${s.rate.toFixed(1)}</span>배</label>
          <input type="range" id="rate" min="0.5" max="1.3" step="0.1" value="${s.rate}" style="padding:0"></div>
        <label class="switch-row"><span>발음 자동 재생</span><input type="checkbox" id="auto" ${s.autoplay ? 'checked' : ''}></label>
      </div>
      <div class="panel">
        <div class="note">${hasTTS ? (jaVoice ? `🔊 일본어 음성: ${esc(jaVoice.name)}` : '⚠️ 일본어 음성이 아직 없어요. 휴대폰 설정 → 텍스트 음성 변환(TTS)에서 일본어 음성을 설치하면 더 자연스럽게 들려요.') : '⚠️ 이 브라우저는 음성 재생을 지원하지 않아요.'}</div>
        <button class="btn ghost full" id="testv">음성 테스트: こんにちは</button>
      </div>
      <div class="panel note">
        <b>복습 방식 (간격 반복)</b><br>
        알아요를 누를 때마다 다음 복습까지 1일 → 3일 → 7일 → 14일 → 30일로 늘어나요. 모름을 누르면 처음부터 다시, 애매는 한 단계 내려가요.
        복습할 때가 된 표현은 홈의 <b>오늘의 복습</b>에 모여요.<br><br>
        한글 발음 표기: 장음은 “-” (아리가토-), っ는 받침으로 (잇테키마스)
      </div>
      <div class="panel"><button class="btn bad full" style="margin-top:0" id="reset">학습 기록 초기화</button></div>`;
    const q = id => $view.querySelector(id);
    q('#order').onchange = e => { s.order = e.target.value; save(); };
    q('#rate').oninput = e => { s.rate = +e.target.value; q('#rv').textContent = s.rate.toFixed(1); save(); };
    q('#auto').onchange = e => { s.autoplay = e.target.checked; save(); };
    q('#testv').onclick = () => speak('こんにちは');
    q('#reset').onclick = () => {
      if (confirm('학습 기록·연속 학습일을 모두 지울까요? (내 단어와 즐겨찾기는 유지돼요)')) { store.progress = {}; store.daily = {}; save(); toast('초기화했어요'); }
    };
  }

  renderHome();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
