// ===== 모든 게임이 같이 쓰는 기능 =====
// 닉네임, 효과음, 온라인 랭킹(Firebase), 시작/일시정지/게임오버/랭킹 화면

// 게임 목록 (새 게임을 추가하면 여기에도 한 줄 추가)
// col: Firebase에 점수를 저장하는 곳 이름 (firestore.rules에도 같은 이름이 있어야 해요)
const GAMES = [
  { id: 'star',  col: 'scores',       emoji: '⭐', title: '별 잡기',   desc: '떨어지는 별을 바구니로 받아요',   color: '#ffd447' },
  { id: 'snake', col: 'scores_snake', emoji: '🐍', title: '뱀 키우기', desc: '사과를 먹고 길어지는 뱀',        color: '#7cf0b0' },
  { id: 'jump',  col: 'scores_jump',  emoji: '🦘', title: '점프 점프', desc: '탭해서 장애물을 뛰어넘어요',     color: '#ff9f5a' },
  { id: 'mole',  col: 'scores_mole',  emoji: '🔨', title: '두더지 잡기', desc: '30초 동안 두더지를 콕콕!',      color: '#c08457' },
  { id: 'brick', col: 'scores_brick', emoji: '🧱', title: '벽돌 깨기', desc: '공을 튕겨 벽돌을 모두 깨요',     color: '#5ad1ff' },
  { id: 'stack', col: 'scores_stack', emoji: '🏗️', title: '탑 쌓기',   desc: '타이밍 맞춰 블록을 높이 쌓아요', color: '#c084fc' },
];

const G = (() => {
  const $ = id => document.getElementById(id);

  // ----- 저장 (localStorage) -----
  function load(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  // ----- 닉네임 (기존 별 잡기에서 쓰던 'name' 그대로 사용) -----
  function getName() { return String(load('name', '') || '').trim().slice(0, 10); }
  function setName(n) { save('name', n); }

  // ----- 최고 점수 (게임마다 따로) -----
  function getBest(id) {
    let b = load('best_' + id, null);
    if (b === null && id === 'star') b = load('best', 0); // 예전 별 잡기 기록 이어받기
    return Number(b) || 0;
  }
  function setBest(id, v) { save('best_' + id, v); }

  // ----- 효과음 -----
  let audio = null;
  let soundOn = load('sound', true);
  function beep(freq, dur = 0.08, type = 'sine', vol = 0.15, slide = 0) {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function notes(list, gap = 90, type = 'triangle', dur = 0.12) {
    list.forEach((f, i) => setTimeout(() => beep(f, dur, type), i * gap));
  }
  const sfx = {
    good:  (n = 0) => beep(600 + Math.min(n, 30) * 20, 0.08, 'triangle'),
    great: () => notes([880, 1320], 70),
    bad:   () => beep(180, 0.35, 'sawtooth', 0.2, -140),
    miss:  () => beep(300, 0.15, 'sine', 0.12, -150),
    power: () => notes([520, 780, 1040], 60, 'sine', 0.1),
    level: () => notes([523, 659, 784, 1046]),
    over:  () => notes([392, 330, 262], 180, 'triangle', 0.25),
    tap:   () => beep(660, 0.05),
  };
  const vibrate = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };

  // ----- 화면 크기 / 노치 영역 -----
  const safe = { top: 0, bottom: 0 };
  function readSafe() {
    let el = $('safe');
    if (!el) { el = document.createElement('div'); el.id = 'safe'; document.body.append(el); }
    const cs = getComputedStyle(el);
    safe.top = parseFloat(cs.paddingTop) || 0;
    safe.bottom = parseFloat(cs.paddingBottom) || 0;
  }
  // 캔버스를 화면 크기에 맞추고, 크기가 바뀔 때마다 onResize(W, H) 호출
  function fitCanvas(canvas, onResize) {
    const ctx = canvas.getContext('2d');
    const view = { ctx, W: 0, H: 0 };
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      view.W = window.innerWidth; view.H = window.innerHeight;
      canvas.width = view.W * dpr; canvas.height = view.H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readSafe();
      onResize?.(view.W, view.H);
    }
    window.addEventListener('resize', resize);
    resize();
    return view;
  }

  // ----- 온라인 랭킹 (Firebase Firestore) -----
  // 아래 값들은 웹에 공개해도 되는 설정값이에요. 조작 방지는 firestore.rules(보안 규칙)가 담당해요.
  const FIREBASE = { apiKey: 'AIzaSyA5tuonUw2EDO7shGrFqIwhI8HaXgbWe9I', projectId: 'phonegame-edbcc' };
  const DB = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

  async function fetchTop(col, n = 10) {
    const res = await fetch(`${DB}:runQuery?key=${FIREBASE.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: col }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        limit: n,
      } }),
    });
    if (!res.ok) throw new Error('랭킹 불러오기 실패 ' + res.status);
    const rows = await res.json();
    return rows.filter(r => r.document).map(r => ({
      id: r.document.name.split('/').pop(),
      name: r.document.fields.name?.stringValue || '???',
      score: Number(r.document.fields.score?.integerValue || 0),
    }));
  }

  async function submitScore(col, name, score, level) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const res = await fetch(`${DB}:commit?key=${FIREBASE.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{
        update: {
          name: `projects/${FIREBASE.projectId}/databases/(default)/documents/${col}/${id}`,
          fields: { name: { stringValue: name }, score: { integerValue: String(score) },
                    level: { integerValue: String(level) } },
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      }] }),
    });
    if (!res.ok) throw new Error('등록 실패 ' + res.status);
    return id;
  }

  // 랭킹 목록을 <ul>에 그리기 (이름은 textContent로 넣어서 안전하게)
  async function renderRanking(col, listEl, msgEl, myId) {
    listEl.innerHTML = ''; msgEl.textContent = '불러오는 중...';
    try {
      const top = await fetchTop(col, 10);
      msgEl.textContent = top.length ? '' : '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
      const medals = ['🥇', '🥈', '🥉'];
      top.forEach((r, i) => {
        const li = document.createElement('li');
        if (myId && r.id === myId) li.className = 'me';
        const no = document.createElement('span'); no.className = 'no'; no.textContent = medals[i] || (i + 1);
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
        const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score;
        li.append(no, nm, sc); listEl.append(li);
      });
    } catch (e) {
      msgEl.textContent = '랭킹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
    }
  }

  // ===== 게임 화면 틀 (시작 / 일시정지 / 게임오버 / 랭킹) =====
  // cfg: { id, legend: [[아이콘, 설명], ...], tip, onStart() }
  // 반환: { running, paused, loop(step), over(score, level, stats) }
  function shell(cfg) {
    const info = GAMES.find(g => g.id === cfg.id);
    const name = getName();
    if (!name) { location.replace('../index.html'); return null; } // 닉네임 없으면 로비로

    document.title = info.title;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="hudBtns hidden" id="g-hud">
        <button id="g-sound" aria-label="소리">🔊</button>
        <button id="g-pause" aria-label="일시정지">⏸</button>
      </div>
      <div class="overlay" id="g-start">
        <h1>${info.emoji} ${info.title}</h1>
        <h2>${info.desc}</h2>
        <div class="legend" id="g-legend"></div>
        <p id="g-tip"></p>
        <p id="g-best"></p>
        <button class="btn" id="g-go">시작</button>
        <button class="btn2" id="g-rank1">🏆 랭킹 보기</button>
        <button class="link" id="g-home1">← 게임 목록</button>
      </div>
      <div class="overlay hidden" id="g-pausemenu">
        <h1>⏸ 일시정지</h1>
        <button class="btn" id="g-resume">계속하기</button>
        <button class="btn2" id="g-restart">처음부터 다시</button>
        <button class="link" id="g-home2">← 게임 목록</button>
      </div>
      <div class="overlay hidden" id="g-over">
        <h1>게임 오버</h1>
        <h2 id="g-score"></h2>
        <p class="newRecord hidden" id="g-record">🎉 새 최고 기록!</p>
        <p id="g-stats"></p>
        <p id="g-best2"></p>
        <p class="submitMsg" id="g-submitmsg"></p>
        <button class="retrySubmit hidden" id="g-retrysubmit">다시 시도</button>
        <button class="btn" id="g-again">다시 하기</button>
        <button class="btn2" id="g-rank2">🏆 랭킹 보기</button>
        <button class="link" id="g-home3">← 게임 목록</button>
      </div>
      <div class="overlay hidden" id="g-rank">
        <h1>🏆 랭킹</h1>
        <h2>${info.emoji} ${info.title} TOP 10</h2>
        <ul class="rankList" id="g-ranklist"></ul>
        <p class="rankMsg" id="g-rankmsg"></p>
        <button class="btn" id="g-rankclose">닫기</button>
      </div>`;
    document.body.append(wrap);

    // 설명 표
    const legend = $('g-legend');
    (cfg.legend || []).forEach(([icon, text]) => {
      const a = document.createElement('span'); a.textContent = icon;
      const b = document.createElement('span'); b.textContent = text;
      legend.append(a, b);
    });
    if (!cfg.legend?.length) legend.classList.add('hidden');
    $('g-tip').textContent = cfg.tip || '';

    const S = { running: false, paused: false, gen: 0, myDocId: load('myDoc_' + cfg.id, null) };
    const screens = ['g-start', 'g-pausemenu', 'g-over', 'g-rank'];
    const show = id => screens.forEach(s => $(s).classList.toggle('hidden', s !== id));
    const showBest = () => {
      const b = getBest(cfg.id);
      const t = b ? `🏆 내 최고 점수: ${b}` : '';
      $('g-best').textContent = t; $('g-best2').textContent = t;
    };
    showBest();

    const updSound = () => { $('g-sound').textContent = soundOn ? '🔊' : '🔇'; };
    updSound();
    $('g-sound').onclick = () => { soundOn = !soundOn; save('sound', soundOn); updSound(); sfx.tap(); };

    function start() {
      show(null); $('g-hud').classList.remove('hidden');
      S.running = true; S.paused = false; S.gen++;
      sfx.tap();
      cfg.onStart();
    }
    function pause() {
      if (!S.running || S.paused) return;
      S.paused = true; show('g-pausemenu');
    }
    $('g-go').onclick = start;
    $('g-again').onclick = start;
    $('g-restart').onclick = start;
    $('g-pause').onclick = pause;
    $('g-resume').onclick = () => { S.paused = false; show(null); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    ['g-home1', 'g-home2', 'g-home3'].forEach(id => { $(id).onclick = () => { location.href = '../index.html'; }; });

    let rankBack = 'g-start';
    function openRank(from) {
      rankBack = from; show('g-rank');
      renderRanking(info.col, $('g-ranklist'), $('g-rankmsg'), S.myDocId);
    }
    $('g-rank1').onclick = () => openRank('g-start');
    $('g-rank2').onclick = () => openRank('g-over');
    $('g-rankclose').onclick = () => show(rankBack);

    // 게임 루프: step(dt초, now)를 매 프레임 호출. 일시정지 중엔 멈춤.
    function loop(step) {
      const gen = S.gen;
      let last = performance.now();
      function frame(now) {
        if (gen !== S.gen || !S.running) return;
        if (S.paused) { last = now; requestAnimationFrame(frame); return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        step(dt, now);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    // 랭킹 자동 등록
    let lastResult = null, submitting = false;
    async function autoSubmit() {
      const r = lastResult;
      if (!r || r.submitted || r.score <= 0 || submitting) return;
      submitting = true;
      $('g-retrysubmit').classList.add('hidden');
      $('g-submitmsg').textContent = `🏆 '${name}' 이름으로 랭킹에 등록 중...`;
      try {
        const id = await submitScore(info.col, name, r.score, r.level);
        r.submitted = true; S.myDocId = id; save('myDoc_' + cfg.id, id);
        if (r === lastResult) $('g-submitmsg').textContent = `✅ '${name}' 이름으로 랭킹에 등록됐어요!`;
      } catch (e) {
        if (r === lastResult) {
          $('g-submitmsg').textContent = '⚠️ 랭킹 등록에 실패했어요. 인터넷 연결을 확인해 주세요.';
          $('g-retrysubmit').classList.remove('hidden');
        }
      } finally { submitting = false; }
    }
    $('g-retrysubmit').onclick = autoSubmit;

    function over(score, level = 1, stats = '') {
      if (!S.running) return;
      S.running = false;
      score = Math.max(0, Math.floor(score));
      level = Math.max(1, Math.floor(level));
      sfx.over();
      const isRecord = score > getBest(cfg.id);
      if (isRecord) setBest(cfg.id, score);
      $('g-score').textContent = `점수 ${score}`;
      $('g-record').classList.toggle('hidden', !isRecord);
      $('g-stats').textContent = stats;
      showBest();
      $('g-hud').classList.add('hidden');
      $('g-retrysubmit').classList.add('hidden');
      $('g-submitmsg').textContent = score > 0 ? '' : '1점 이상이면 랭킹에 자동 등록돼요';
      lastResult = { score, level, submitted: false };
      setTimeout(() => show('g-over'), 600);
      if (score > 0) autoSubmit();
    }

    return {
      get running() { return S.running; },
      get paused() { return S.paused; },
      loop, over,
    };
  }

  return { load, save, getName, setName, getBest, beep, notes, sfx, vibrate, safe,
    fitCanvas, fetchTop, renderRanking, shell };
})();
