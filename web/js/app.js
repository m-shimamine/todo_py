/* ============================================================
   SCR-01 ダッシュボード / SCR-02 タスク一覧 / SCR-03 詳細
   SCR-04 ジャンル・カテゴリ管理

   データは Python 側（js_api）から取る。表示の出し分けは
   body[data-view] と CSS に任せ、JS は状態だけを持つ。
   ============================================================ */

const $ = id => document.getElementById(id);
const WIDE = window.matchMedia('(min-width: 1024px)');

/* ---------- スマートリストの定義（ラベル・色は移植元に合わせる） ---------- */

const SMART_LISTS = [
  { key: 'overdue',    label: '遅延',       icon: 'warning',      color: '#FF3B30' },
  { key: 'today',      label: '今日',       icon: 'calendar',     color: '#007AFF' },
  { key: 'tomorrow',   label: '明日',       icon: 'sun',          color: '#FF9500' },
  { key: 'this-week',  label: '今週',       icon: 'calendarDots', color: '#FF3B30' },
  { key: 'next-week',  label: '来週',       icon: 'calendarPlus', color: '#5856D6' },
  { key: 'this-month', label: '今月',       icon: 'calendarDot',  color: '#00C7BE' },
  { key: 'next-month', label: '来月',       icon: 'calendarChk',  color: '#AF52DE' },
  { key: 'all',        label: 'すべて',     icon: 'tray',         color: '#8E8E93' },
  { key: 'flagged',    label: 'フラグ付き', icon: 'flag',         color: '#FF9500' },
  { key: 'pending',    label: '保留',       icon: 'clock',        color: '#FF9500' },
  { key: 'completed',  label: '実行済',     icon: 'checkCircle',  color: '#34C759' },
];

const STATUS_LABEL = { active: '未完了', pending: '保留', completed: '完了' };

// ジャンルの色。backend/config.py の GENRE_PALETTE と同じ並び。
const GENRE_PALETTE = [
  '#007AFF', '#FF9500', '#AF52DE', '#34C759',
  '#5856D6', '#00C7BE', '#FF2D55', '#FF3B30',
];

function emptyFilters() {
  return {
    q: '', genre_id: '', category_id: '', priority: '',
    due_from: '', due_to: '',
    // ステータスの絞り込み。どちらもOFFなら未完了だけ、ONにしたものだけに絞る（'' = OFF、'1' = ON）
    show_pending: '', show_completed: '',
  };
}

const state = {
  view: 'dashboard',      // 'dashboard' | 'list'（広い時は併置される）
  listKey: 'today',
  genreId: null,
  categoryId: null,
  openGenreId: null,
  filters: emptyFilters(),
  editingId: null,
  isNew: false,
  manageGenreId: null,
  editing: null,          // {kind:'genre'|'category', id} 編集ビューの対象
  sorting: false,         // 並び替えモード（行をドラッグで動かす）
  bulk: false,            // 一括変更モード（行を選んで「完了」でまとめて変更）
};

let GENRES = [];
let CATEGORIES = [];
let TASKS = [];                                  // いま表示している一覧
let COUNTS = { lists: {}, genres: {}, categories: {} };
let TODAY = '';                                  // Python 側のローカル日付

/* ============================================================
   日付
   「今日」は Python 側で確定した値を使う。フロントで計算すると、
   日をまたいで開きっぱなしのときにずれる。
   ============================================================ */

function shiftDate(isoStr, days) {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.getFullYear() + '-' +
         String(dt.getMonth() + 1).padStart(2, '0') + '-' +
         String(dt.getDate()).padStart(2, '0');
}

function fmtDate(s) {
  if (!s) return '';
  if (TODAY) {
    if (s === TODAY)                 return '今日';
    if (s === shiftDate(TODAY, 1))   return '明日';
    if (s === shiftDate(TODAY, -1))  return '昨日';
  }
  const [, m, d] = s.split('-');
  return Number(m) + '/' + Number(d);
}

function endOf(t) { return t.date_end || t.date_start; }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ============================================================
   データ取得
   ============================================================ */

function visibilityParams() {
  return {
    show_pending: state.filters.show_pending,
    show_completed: state.filters.show_completed,
  };
}

/** 一覧取得に渡す条件。サイドバーの選択と絞り込みパネルを合わせる。 */
function queryParams() {
  const p = Object.assign({}, state.filters);
  if (state.categoryId) {
    p.list = 'all';
    p.category_id = state.categoryId;
  } else if (state.genreId) {
    p.list = 'all';
    p.genre_id = state.genreId;
  } else {
    p.list = state.listKey || 'all';
  }
  return p;
}

async function refreshMasters() {
  GENRES = await api.listGenres(true);
  CATEGORIES = [];
  GENRES.forEach(g => (g.categories || []).forEach(c => CATEGORIES.push(c)));
}

/** 一覧と件数をまとめて取り直して描画する。 */
async function reload() {
  try {
    const [tasks, counts] = await Promise.all([
      api.listTasks(queryParams()),
      api.counts(visibilityParams()),
    ]);
    TASKS = tasks;
    COUNTS = counts;
    TODAY = counts.today;
    render();
  } catch (e) {
    toast(e.message);
  }
}

/* ============================================================
   描画
   ============================================================ */

function render() {
  document.body.dataset.view = state.view;
  renderDashboard();
  renderList();
}

function renderDashboard() {
  // --- スマートカード ---
  $('smart-lists').innerHTML = SMART_LISTS.map(l => {
    const n = COUNTS.lists[l.key] || 0;
    const on = !state.genreId && !state.categoryId && state.listKey === l.key;
    return `<button class="smart-card${on ? ' active' : ''}" data-list="${l.key}">
      <div class="smart-card-header">
        <div class="smart-icon" style="background:${l.color}">${icon(l.icon)}</div>
        <span class="smart-count">${n}</span>
      </div>
      <span class="smart-label">${l.label}</span>
    </button>`;
  }).join('');

  // --- ジャンル一覧（＞ で配下カテゴリを開閉） ---
  const rows = [];
  GENRES.forEach(g => {
    const n = COUNTS.genres[String(g.id)] || 0;
    const open = state.openGenreId === g.id;
    const cats = g.categories || [];
    const gOn = state.genreId === g.id && !state.categoryId;

    rows.push(`<button class="project-row${gOn ? ' active' : ''}" data-genre="${g.id}">
      <span class="project-dot" style="background:${esc(g.color)}">${icon('folder')}</span>
      <span class="project-name">${esc(g.name)}</span>
      <span class="project-count">${n}</span>
      ${cats.length
        ? `<span class="caret-wrap" data-toggle="${g.id}">${icon('caretRight', 'caret' + (open ? ' open' : ''))}</span>`
        : ''}
    </button>`);

    if (open) {
      cats.forEach(c => {
        const cn = COUNTS.categories[String(c.id)] || 0;
        const cOn = state.categoryId === c.id;
        rows.push(`<button class="project-row category-row${cOn ? ' active' : ''}"
                           data-cat="${c.id}" data-cat-genre="${g.id}">
          <span class="project-name">${esc(c.name)}</span>
          <span class="project-count">${cn}</span>
          ${icon('caretRight', 'caret')}
        </button>`);
      });
      if (!cats.length) rows.push('<div class="project-empty">カテゴリがありません</div>');
    }
  });
  $('genre-list-items').innerHTML = rows.join('') ||
    '<div class="project-empty">ジャンルがありません</div>';
}

function currentTitle() {
  if (state.categoryId) {
    const c = CATEGORIES.find(x => x.id === state.categoryId);
    return c ? c.name : 'カテゴリ';
  }
  if (state.genreId) {
    const g = GENRES.find(x => x.id === state.genreId);
    return g ? g.name : 'ジャンル';
  }
  const l = SMART_LISTS.find(x => x.key === state.listKey);
  return l ? l.label : '検索結果';
}

/** 適用中の条件を「ラベル: 値」の配列で返す（チップ表示用） */
function describeFilters(f) {
  const out = [];
  if (f.q) out.push({ key: 'q', label: 'キーワード', value: f.q });
  if (f.genre_id) {
    const g = GENRES.find(x => x.id === Number(f.genre_id));
    out.push({ key: 'genre_id', label: 'ジャンル', value: g ? g.name : '' });
  }
  if (f.category_id) {
    const c = CATEGORIES.find(x => x.id === Number(f.category_id));
    out.push({ key: 'category_id', label: 'カテゴリ', value: c ? c.name : '' });
  }
  if (f.priority) out.push({ key: 'priority', label: 'フラグ', value: f.priority === '1' ? 'あり' : 'なし' });
  // 期限は2入力で1条件。チップも1つにまとめ、× で両方外す。
  if (f.due_from || f.due_to) {
    out.push({
      key: 'due', label: '期限',
      value: (f.due_from || '指定なし') + ' 〜 ' + (f.due_to || '指定なし'),
    });
  }
  // 既定と違う状態のときだけ出す
  if (f.show_pending   === '1') out.push({ key: 'show_pending',   label: 'ステータス', value: '保留済' });
  if (f.show_completed === '1') out.push({ key: 'show_completed', label: 'ステータス', value: '実行済' });
  return out;
}

/** 並び替えできる一覧か。「実行済」は完了日時順なので並びを持たない。 */
function canSort() {
  const completedList = !state.genreId && !state.categoryId && state.listKey === 'completed';
  return !completedList && TASKS.length > 1;
}

function renderList() {
  $('list-title').textContent = currentTitle();
  $('list-count').textContent = TASKS.length ? TASKS.length + '件' : '';

  if (state.sorting && !canSort()) state.sorting = false;
  if (state.bulk && !TASKS.length) state.bulk = false;
  $('task-list-view').classList.toggle('sorting', state.sorting);
  $('sort-btn').style.display = canSort() && !state.bulk ? '' : 'none';
  renderBulk();
  $('sort-btn').classList.toggle('on', state.sorting);
  $('sort-btn').innerHTML = state.sorting ? '完了' : icon('arrowsV') + '並び替え';

  $('active-filters').innerHTML = describeFilters(state.filters).map(d =>
    `<span class="chip"><b>${esc(d.label)}</b> ${esc(d.value)}
      <button data-unfilter="${d.key}" title="この条件を外す">${icon('x')}</button></span>`).join('');

  if (!TASKS.length) {
    $('task-items-card').innerHTML = '<div class="task-empty">該当するタスクはありません</div>';
    return;
  }

  $('task-items-card').innerHTML = isGroupedList()
    ? groupByCategory(TASKS).map(g => `<div class="task-group-head">
        <span class="gdot" style="background:${esc(g.color)}"></span>
        <span>${esc(g.category)}</span><span class="gname">${esc(g.genre)}</span>
        <span class="gcount">${g.tasks.length}</span>
      </div>` + g.tasks.map(taskRowHtml).join('')).join('')
    : TASKS.map(taskRowHtml).join('');
}

/** 「すべて」はカテゴリごとに見出しを付けて出す。並び替え中は行の入れ替えが
    見出しをまたぐと紛らわしいので、平らな一覧に戻す。 */
function isGroupedList() {
  return !state.genreId && !state.categoryId && state.listKey === 'all' && !state.sorting;
}

/** ジャンル → カテゴリの登録順にまとめる。カテゴリなしはそのジャンルの末尾。
    グループ内はサーバの並び（ステータス → no）のまま。 */
function groupByCategory(tasks) {
  const order = [];
  GENRES.forEach(g => {
    (g.categories || []).forEach(c => order.push(g.id + ':' + c.id));
    order.push(g.id + ':');
  });

  const groups = new Map();
  tasks.forEach(t => {
    const key = t.genre_id + ':' + (t.category_id || '');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        genre: t.genre_name,
        category: t.category_name || 'カテゴリなし',
        color: t.genre_color,
        tasks: [],
      });
    }
    groups.get(key).tasks.push(t);
  });

  const rank = k => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

function taskRowHtml(t) {
  const done    = t.status === 'completed';
  const pending = t.status === 'pending';
  const overdue = t.date_start && TODAY && endOf(t) < TODAY && !done;

  let dateText = '';
  if (t.date_start) {
    dateText = fmtDate(t.date_start) + (t.date_end ? ' 〜 ' + fmtDate(t.date_end) : '');
  }

  const moved = state.sorting && sortMoved.has(t.id);
  // 一括変更中の丸は「選択」を表す（完了の印ではない）
  const picked = state.bulk && bulkSelected.has(t.id);
  const circleOn = state.bulk ? picked : done;
  return `<div class="task-row${moved ? ' moved' : ''}${picked ? ' picked' : ''}" data-id="${t.id}" data-status="${t.status}">
    <div class="task-circle-container">
      <div class="task-circle ${circleOn ? 'checked' : ''}" data-check="${t.id}">
        ${circleOn ? icon('check') : ''}
      </div>
    </div>
    <div class="task-body" data-open="${t.id}">
      <div class="task-content-text ${done ? 'strikethrough' : ''}">${esc(t.content)}</div>
      <div class="task-meta">
        <span class="task-project-badge" style="background:${esc(t.genre_color)}">${esc(t.genre_name)}</span>
        ${t.category_name ? `<span class="task-category-label">${esc(t.category_name)}</span>` : ''}
        ${dateText ? `<span class="task-date-label ${overdue ? 'overdue' : ''}">${icon('calendar')}${dateText}</span>` : ''}
        ${pending ? '<span class="task-status-label">保留</span>' : ''}
      </div>
    </div>
    <div class="task-trailing">
      <span class="task-toggle task-hold ${pending ? 'active' : ''}" data-hold="${t.id}"
            title="${pending ? '保留を解除' : '保留にする'}">${icon('clock')}</span>
      <span class="task-toggle task-flag ${t.priority ? 'active' : ''}" data-flag="${t.id}"
            title="${t.priority ? 'フラグを外す' : 'フラグを付ける'}">${icon('flag')}</span>
      <span class="task-grip" data-grip="${t.id}" title="ドラッグで移動">${icon('grip')}</span>
    </div>
  </div>`;
}

/* ============================================================
   タスクの並び替え（並び替えモード中だけ）
   一覧は ステータス → no の順なので、動かせるのは同じステータスの
   行の間だけ。HTML5 の drag&drop は WebView2 で挙動が揺れるため
   pointer イベントで自前に動かす。
   ドラッグ中は画面上で動かすだけで、「完了」を押した時にまとめて登録する。
   ============================================================ */

let drag = null;          // { row, status, before: [ids], pointerId }
let sortStartIds = [];    // モードに入った時点の並び（変更があったかの判定用）
const sortMoved = new Set();   // このモード中に動かしたタスクのID

function groupIds(status) {
  return [...$('task-items-card').querySelectorAll(`.task-row[data-status="${status}"]`)]
    .map(r => Number(r.dataset.id));
}

function startDrag(ev, grip) {
  const row = grip.closest('.task-row');
  ev.preventDefault();
  grip.setPointerCapture(ev.pointerId);
  drag = { row, status: row.dataset.status, before: groupIds(row.dataset.status), pointerId: ev.pointerId };
  row.classList.add('dragging');
  document.body.classList.add('is-dragging');
}

function moveDrag(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  const y = ev.clientY;

  // 端に寄せたら一覧をスクロールする
  const box = $('task-items-card').parentElement;
  const r = box.getBoundingClientRect();
  if (y < r.top + 40)         box.scrollTop -= 12;
  else if (y > r.bottom - 40) box.scrollTop += 12;

  // 同じステータスの行の中で、ポインタが中線を越えた行と入れ替える
  const rows = [...$('task-items-card').querySelectorAll(`.task-row[data-status="${drag.status}"]`)];
  for (const other of rows) {
    if (other === drag.row) continue;
    const b = other.getBoundingClientRect();
    const mid = b.top + b.height / 2;
    const isBelow = drag.row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (isBelow && y > mid) {
      other.after(drag.row);
    } else if (!isBelow && y < mid) {
      other.before(drag.row);
      break;
    }
  }
}

function endDrag(ev) {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  const { row, status, before } = drag;
  drag = null;
  row.classList.remove('dragging');
  document.body.classList.remove('is-dragging');

  // 描き直しても崩れないよう、TASKS も画面の並びに揃えておく
  const order = groupIds('active').concat(groupIds('pending'), groupIds('completed'));
  TASKS.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  // 動かした行に色を付け、未登録の変更があると分かるようにする。
  // 元の並びに戻したら印も消す
  if (groupIds(status).join() !== before.join()) sortMoved.add(Number(row.dataset.id));
  if (order.join() === sortStartIds.join()) sortMoved.clear();
  $('task-items-card').querySelectorAll('.task-row').forEach(r =>
    r.classList.toggle('moved', sortMoved.has(Number(r.dataset.id))));
}

/* ============================================================
   一括変更（一括変更モード中だけ）
   並び替えと同じく、モードに入って行を選び、「完了」でまとめて登録する。
   「変更しない」のままの項目は送らない。何も選んでいない・何も
   変えていなければ、登録せずにモードを抜ける。
   ============================================================ */

const bulkSelected = new Set();   // 選んだタスクのID

function startBulk() {
  bulkSelected.clear();
  ['b-due', 'b-flag', 'b-status', 'b-start', 'b-end'].forEach(id => { $(id).value = ''; });
  fillGenreSelect($('b-genre'), '', '変更しない');
  state.bulk = true;
  renderList();
}

function cancelBulk() {
  state.bulk = false;
  bulkSelected.clear();
  renderList();
}

/** 選んだタスクのジャンル。ジャンルを変えない場合のカテゴリ候補に使う。 */
function bulkGenreId() {
  if ($('b-genre').value) return Number($('b-genre').value);
  const gids = new Set(TASKS.filter(t => bulkSelected.has(t.id)).map(t => t.genre_id));
  return gids.size === 1 ? [...gids][0] : null;
}

/** カテゴリの候補を出し直す。ジャンルが1つに決まらないときは「なし」しか選べない。 */
function fillBulkCategories() {
  const keep = $('b-cat').value;
  const gid = bulkGenreId();
  const g = GENRES.find(x => x.id === gid);
  const cats = g ? (g.categories || []) : [];
  $('b-cat').innerHTML =
    '<option value="">変更しない</option><option value="none">なし</option>' +
    cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('b-cat').value = [...$('b-cat').options].some(o => o.value === keep) ? keep : '';
  $('b-cat').title = gid ? '' : '複数のジャンルが混ざっているため「なし」だけ選べます';
}

function renderBulk() {
  // 一覧に無くなったタスクは選択から外す
  const shown = new Set(TASKS.map(t => t.id));
  [...bulkSelected].forEach(id => { if (!shown.has(id)) bulkSelected.delete(id); });

  $('task-list-view').classList.toggle('bulk', state.bulk);
  document.body.classList.toggle('is-bulk', state.bulk);
  $('bulk-btn').style.display = TASKS.length && !state.sorting ? '' : 'none';
  $('bulk-btn').classList.toggle('on', state.bulk);
  $('bulk-btn').innerHTML = state.bulk ? '完了' : icon('checkCircle') + '一括変更';
  if (!state.bulk) return;

  $('bulk-count').textContent = bulkSelected.size + '件選択';
  $('bulk-all').textContent = bulkSelected.size === TASKS.length ? '選択を解除' : 'すべて選択';
  $('b-dates').style.display = $('b-due').value === 'set' ? '' : 'none';
  fillBulkCategories();
}

/** 画面の入力から送る変更を作る。不正なら Error を投げる。 */
function readBulk() {
  const body = {};
  const due = $('b-due').value;
  if (due === 'set') {
    if (!$('b-start').value) throw new Error('開始日を入力してください');
    body.date_start = $('b-start').value;
    body.date_end = $('b-end').value;
  } else if (due === 'clear') {
    body.date_start = '';
    body.date_end = '';
  }
  if ($('b-flag').value !== '')   body.priority = $('b-flag').value === '1';
  if ($('b-genre').value)         body.genre_id = Number($('b-genre').value);
  if ($('b-cat').value === 'none') body.category_id = null;
  else if ($('b-cat').value)      body.category_id = Number($('b-cat').value);
  if ($('b-status').value)        body.status = $('b-status').value;
  return body;
}

/** 「完了」：選んでいて変更もあれば登録してからモードを抜ける。 */
async function finishBulk() {
  let body;
  try {
    body = readBulk();
  } catch (e) {
    return toast(e.message);
  }
  const ids = TASKS.filter(t => bulkSelected.has(t.id)).map(t => t.id);
  if (!ids.length || !Object.keys(body).length) return cancelBulk();

  try {
    const r = await api.bulkUpdateTasks(ids, body);
    toast(r.updated + '件を変更しました');
  } catch (e) {
    return toast(e.message);      // モードは保つ。直して押し直せる
  }
  state.bulk = false;
  bulkSelected.clear();
  await reload();
}

function startSorting() {
  sortStartIds = TASKS.map(t => t.id);
  sortMoved.clear();
  state.sorting = true;
  renderList();
}

/** 「完了」：動かしていれば登録してからモードを抜ける。 */
async function finishSorting() {
  const changed = TASKS.map(t => t.id).join() !== sortStartIds.join();
  state.sorting = false;
  if (!changed) return renderList();

  try {
    // ステータスごとに送る。まとめて送るとグループをまたいで no を配り直してしまう
    for (const status of ['active', 'pending', 'completed']) {
      const ids = TASKS.filter(t => t.status === status).map(t => t.id);
      if (ids.length > 1) await api.reorderTasks(ids);
    }
    toast('並び順を登録しました');
  } catch (e) {
    toast(e.message);
  }
  await reload();
}

/* ============================================================
   ビュー切替
   ============================================================ */

function showDashboard() {
  state.view = 'dashboard';
  state.genreId = state.categoryId = null;
  state.bulk = false;
  // 広い時はサイドバーが出たままなので、一覧の中身も保っておく
  if (WIDE.matches) state.view = 'list';
  reload();
}

function showList(opts) {
  Object.assign(state, { view: 'list', sorting: false, bulk: false }, opts);
  reload();
}

/* ============================================================
   詳細
   ============================================================ */

function fillGenreSelect(sel, genreId, allLabel) {
  sel.innerHTML = (allLabel ? `<option value="">${allLabel}</option>` : '') +
    GENRES.map(g =>
      `<option value="${g.id}"${g.id === genreId ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
}

function fillCategorySelect(sel, genreId, categoryId, allLabel) {
  const gid = Number(genreId);
  const cats = gid ? CATEGORIES.filter(c => c.genre_id === gid) : CATEGORIES;
  sel.innerHTML = `<option value="">${allLabel || 'なし'}</option>` +
    cats.map(c =>
      `<option value="${c.id}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

function openDetail(task) {
  state.isNew = !task;
  state.editingId = task ? task.id : null;

  const t = task || {
    genre_id: state.genreId || (GENRES[0] && GENRES[0].id),
    category_id: state.categoryId || null,
    content: '', result: '',
    date_start: '', date_end: '',
    priority: false, status: 'active',
  };

  $('detail-title').textContent = state.isNew ? '新規タスク' : '詳細';
  $('d-content').value    = t.content;
  $('d-result').value     = t.result || '';
  $('d-start').value      = t.date_start || '';
  $('d-end').value        = t.date_end || '';
  $('d-status').value     = t.status;
  $('d-priority').checked = !!t.priority;

  fillGenreSelect($('d-genre'), t.genre_id);
  fillCategorySelect($('d-category'), t.genre_id, t.category_id);

  setRange(!!t.date_end);
  hideTaskConfirm();

  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

function setRange(on) {
  $('d-range').classList.toggle('on', on);
  $('d-end-row').style.display = on ? '' : 'none';
  $('d-date-label').textContent = on ? '開始日' : '期限';
  if (!on) $('d-end').value = '';
}

function closeDetail() {
  $('detail-overlay').classList.remove('open');
  $('detail-panel').classList.remove('open');
  state.editingId = null;
  state.isNew = false;
  hideTaskConfirm();
}

async function saveDetail() {
  const body = {
    genre_id: Number($('d-genre').value),
    category_id: $('d-category').value ? Number($('d-category').value) : null,
    content: $('d-content').value.trim(),
    result: $('d-result').value,
    date_start: $('d-start').value,
    date_end: $('d-range').classList.contains('on') ? $('d-end').value : '',
    priority: $('d-priority').checked ? 1 : 0,
    status: $('d-status').value,
  };

  try {
    if (state.isNew) {
      await api.createTask(body);
      toast('追加しました');
    } else {
      await api.updateTask(state.editingId, body);
      toast('保存しました');
    }
    closeDetail();
    await reload();
  } catch (e) {
    toast(e.message);           // 検証エラーはシートを開いたままにする
  }
}

/** 詳細の削除確認。管理モーダルと同じ2段階にし、confirm() は使わない。 */
function hideTaskConfirm() {
  $('d-confirm').classList.remove('open');
  $('d-delete').style.display = state.isNew ? 'none' : '';
}

async function deleteDetail() {
  if (!state.editingId) return;
  try {
    await api.deleteTask(state.editingId);
    closeDetail();
    toast('削除しました');
    await reload();
  } catch (e) {
    hideTaskConfirm();
    toast(e.message);
  }
}

/* ============================================================
   絞り込み
   ============================================================ */

function openFilterPanel(on) {
  $('filter-panel').classList.toggle('open', on);
  $('filter-btn').classList.toggle('on', on);
}

function syncFilterInputs() {
  const f = state.filters;
  fillGenreSelect($('f-genre'), f.genre_id ? Number(f.genre_id) : null, 'すべて');
  fillCategorySelect($('f-category'), f.genre_id, f.category_id ? Number(f.category_id) : null, 'すべて');
  $('f-priority').value = f.priority;
  $('f-due-from').value = f.due_from;
  $('f-due-to').value   = f.due_to;
  $('f-show-pending').checked   = f.show_pending   === '1';
  $('f-show-completed').checked = f.show_completed === '1';
}

function readFilterInputs() {
  state.filters.genre_id    = $('f-genre').value;
  state.filters.category_id = $('f-category').value;
  state.filters.priority    = $('f-priority').value;
  state.filters.due_from    = $('f-due-from').value;
  state.filters.due_to      = $('f-due-to').value;
  state.filters.show_pending   = $('f-show-pending').checked   ? '1' : '';
  state.filters.show_completed = $('f-show-completed').checked ? '1' : '';
}

/** 絞り込みが1つでも入っていれば「すべて」を母集合にする。 */
function hasNarrowingFilters(f) {
  return ['q', 'genre_id', 'category_id', 'priority', 'due_from', 'due_to',
          'show_pending', 'show_completed']
    .some(k => f[k] !== '');
}

function runFilters() {
  if (hasNarrowingFilters(state.filters)) {
    showList({ listKey: 'all', genreId: null, categoryId: null });
  } else {
    reload();
  }
}

/* ============================================================
   管理モーダル
   ============================================================ */

function renderManage() {
  const rowBtns = (kind, id, idx, total) => `
      <span class="order-btns">
        <button class="order-btn" data-move="${kind}:${id}:-1" ${idx === 0 ? 'disabled' : ''}
                title="上へ">${icon('caretUp')}</button>
        <button class="order-btn" data-move="${kind}:${id}:1" ${idx === total - 1 ? 'disabled' : ''}
                title="下へ">${icon('caretDown')}</button>
      </span>`;

  $('genre-panel').innerHTML = GENRES.map((g, i) => {
    const n = COUNTS.genres[String(g.id)] || 0;
    return `<li class="${state.manageGenreId === g.id ? 'active' : ''}" data-mg="${g.id}">
      ${rowBtns('genre', g.id, i, GENRES.length)}
      <span class="project-dot" style="background:${esc(g.color)};width:22px;height:22px;border-radius:6px"></span>
      <span class="name">${esc(g.name)}</span>
      <span class="n">${n}</span>
      <button class="row-btn" data-edit-genre="${g.id}" title="編集">${icon('pencil')}</button>
    </li>`;
  }).join('') || '<div class="panel-placeholder">ジャンルがありません</div>';

  const gid = state.manageGenreId;
  const g = gid ? GENRES.find(x => x.id === gid) : null;

  $('selected-genre-label').textContent = g ? g.name : '';
  $('cat-add-form').style.display    = g ? 'flex' : 'none';
  $('cat-placeholder').style.display = g ? 'none' : '';
  $('cat-panel').style.display       = g ? '' : 'none';
  if (!g) return;

  const cats = CATEGORIES.filter(c => c.genre_id === gid);
  $('cat-panel').innerHTML = cats.map((c, i) => {
    const n = COUNTS.categories[String(c.id)] || 0;
    return `<li>
      ${rowBtns('category', c.id, i, cats.length)}
      <span class="name">${esc(c.name)}</span>
      <span class="n">${n}</span>
      <button class="row-btn" data-edit-cat="${c.id}" title="編集">${icon('pencil')}</button>
    </li>`;
  }).join('') || '<li style="color:var(--text-tertiary);font-size:13px">カテゴリがありません</li>';
}

/* ---------- 並び替え ---------- */

/** 配列内で1つ動かした結果のID配列を返す。端なら null。 */
function movedIds(items, id, delta) {
  const from = items.findIndex(x => x.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return null;
  const ids = items.map(x => x.id);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  return ids;
}

async function moveItem(kind, id, delta) {
  if (kind === 'genre') {
    const ids = movedIds(GENRES, id, delta);
    if (!ids) return;
    await api.reorderGenres(ids);
  } else {
    const gid = state.manageGenreId;
    const cats = CATEGORIES.filter(c => c.genre_id === gid);
    const ids = movedIds(cats, id, delta);
    if (!ids) return;
    await api.reorderCategories(gid, ids);
  }
  await afterMasterChange();
}

/* ---------- 編集ビュー ---------- */

function setManageView(view) {
  $('manage-content').dataset.mview = view;
}

/** 削除の確認はモーダル内に出す。confirm() には頼らない。 */
function hideConfirm() {
  $('edit-confirm').classList.remove('open');
  $('edit-delete').style.display = '';
}

function openEdit(kind, id) {
  const item = kind === 'genre'
    ? GENRES.find(x => x.id === id)
    : CATEGORIES.find(x => x.id === id);
  if (!item) return;

  state.editing = { kind, id };
  hideConfirm();

  $('edit-title').textContent = kind === 'genre' ? 'ジャンルを編集' : 'カテゴリを編集';
  $('edit-name').value = item.name;
  $('edit-color-field').style.display = kind === 'genre' ? '' : 'none';

  if (kind === 'genre') {
    renderColors(item.color);
    const n = COUNTS.genres[String(id)] || 0;
    $('edit-note').textContent = n
      ? `このジャンルのタスクは ${n} 件です。タスクが残っていると削除できません。`
      : 'このジャンルにタスクはありません。';
    $('edit-delete').disabled = n > 0;
  } else {
    const n = COUNTS.categories[String(id)] || 0;
    $('edit-note').textContent = n
      ? `このカテゴリのタスクは ${n} 件です。削除するとカテゴリは「なし」になります。`
      : 'このカテゴリにタスクはありません。';
    $('edit-delete').disabled = false;
  }

  setManageView('edit');
  $('edit-name').focus();
  $('edit-name').select();
}

function renderColors(current) {
  $('edit-colors').innerHTML = GENRE_PALETTE.map(c =>
    `<button class="color-dot${c === current ? ' on' : ''}" data-color="${c}"
             style="background:${c};color:${c}" title="${c}">${icon('check')}</button>`).join('');
  // チェックマークだけは白で出す
  $('edit-colors').querySelectorAll('.color-dot .ic')
    .forEach(el => (el.style.stroke = '#fff'));
}

function selectedColor() {
  const on = $('edit-colors').querySelector('.color-dot.on');
  return on ? on.dataset.color : '';
}

async function saveEdit() {
  const name = $('edit-name').value.trim();
  if (!name) return toast('名前を入力してください');
  const { kind, id } = state.editing || {};
  if (!kind) return;

  try {
    if (kind === 'genre') {
      await api.updateGenre(id, { name, color: selectedColor() });
    } else {
      await api.updateCategory(id, name);
    }
    state.editing = null;
    setManageView('list');
    await afterMasterChange();
    toast('保存しました');
  } catch (e) {
    toast(e.message);          // 重複などは編集ビューに留まる
  }
}

async function deleteEditing() {
  const { kind, id } = state.editing || {};
  if (!kind) return;
  try {
    if (kind === 'genre') await api.deleteGenre(id);
    else                  await api.deleteCategory(id);
    state.editing = null;
    hideConfirm();
    setManageView('list');
    await afterMasterChange();
    toast('削除しました');
  } catch (e) {
    hideConfirm();
    toast(e.message);
  }
}

/** マスタを取り直してモーダルと本体を描き直す。 */
async function afterMasterChange() {
  await refreshMasters();
  // 選択中のジャンル・カテゴリが消えていたら選択を解く
  if (state.genreId && !GENRES.some(g => g.id === state.genreId)) {
    state.genreId = state.categoryId = null;
  }
  if (state.categoryId && !CATEGORIES.some(c => c.id === state.categoryId)) {
    state.categoryId = null;
  }
  if (state.manageGenreId && !GENRES.some(g => g.id === state.manageGenreId)) {
    state.manageGenreId = null;
  }
  await reload();
  renderManage();
}

/* ============================================================
   イベント
   ============================================================ */

function bindEvents() {
  // --- ダッシュボード ---
  $('smart-lists').addEventListener('click', ev => {
    const card = ev.target.closest('[data-list]');
    if (card) showList({ listKey: card.dataset.list, genreId: null, categoryId: null });
  });

  $('genre-list-items').addEventListener('click', ev => {
    const toggle = ev.target.closest('[data-toggle]');
    if (toggle) {                          // ＞ をタップ：カテゴリの開閉
      ev.stopPropagation();
      const id = Number(toggle.dataset.toggle);
      state.openGenreId = state.openGenreId === id ? null : id;
      return renderDashboard();
    }
    const cat = ev.target.closest('[data-cat]');
    if (cat) return showList({
      genreId: Number(cat.dataset.catGenre), categoryId: Number(cat.dataset.cat), listKey: null });

    const g = ev.target.closest('[data-genre]');
    if (g) showList({ genreId: Number(g.dataset.genre), categoryId: null, listKey: null });
  });

  $('back-btn').addEventListener('click', showDashboard);

  // カレンダーは別ウィンドウ。開発ハーネス（ブラウザ）には
  // ウィンドウを作る手段がないので、その場合だけページ遷移で代用する。
  $('calendar-link').addEventListener('click', async () => {
    try {
      await api.openCalendar();
    } catch (e) {
      location.href = 'calendar.html';
    }
  });

  // --- タスク一覧 ---
  $('sort-btn').addEventListener('click', () => {
    if (state.sorting) finishSorting();
    else startSorting();
  });

  $('task-items-card').addEventListener('pointerdown', ev => {
    const grip = state.sorting && ev.target.closest('[data-grip]');
    if (grip) startDrag(ev, grip);
  });
  $('task-items-card').addEventListener('pointermove', moveDrag);
  $('task-items-card').addEventListener('pointerup', endDrag);
  $('task-items-card').addEventListener('pointercancel', endDrag);

  $('bulk-btn').addEventListener('click', () => {
    if (state.bulk) finishBulk();
    else startBulk();
  });
  $('bulk-cancel').addEventListener('click', cancelBulk);
  $('bulk-all').addEventListener('click', () => {
    if (bulkSelected.size === TASKS.length) bulkSelected.clear();
    else TASKS.forEach(t => bulkSelected.add(t.id));
    renderList();
  });
  $('b-due').addEventListener('change', renderBulk);
  $('b-genre').addEventListener('change', () => { $('b-cat').value = ''; renderBulk(); });

  $('task-items-card').addEventListener('click', async ev => {
    if (state.sorting) return;      // 並び替え中は完了・保留・詳細を開かない
    // 一括変更中は行のどこを押しても選択の切り替えだけ
    if (state.bulk) {
      const row = ev.target.closest('.task-row');
      if (!row) return;
      const id = Number(row.dataset.id);
      if (bulkSelected.has(id)) bulkSelected.delete(id); else bulkSelected.add(id);
      return renderList();
    }
    try {
      const chk = ev.target.closest('[data-check]');
      if (chk) {
        const t = TASKS.find(x => x.id === Number(chk.dataset.check));
        await api.updateTask(t.id, { status: t.status === 'completed' ? 'active' : 'completed' });
        return reload();
      }
      // 保留トグル。完了中に押した場合は完了を解いて保留にする
      const hold = ev.target.closest('[data-hold]');
      if (hold) {
        const t = TASKS.find(x => x.id === Number(hold.dataset.hold));
        await api.updateTask(t.id, { status: t.status === 'pending' ? 'active' : 'pending' });
        return reload();
      }
      const flag = ev.target.closest('[data-flag]');
      if (flag) {
        const t = TASKS.find(x => x.id === Number(flag.dataset.flag));
        await api.updateTask(t.id, { priority: t.priority ? 0 : 1 });
        return reload();
      }
      const body = ev.target.closest('[data-open]');
      if (body) openDetail(TASKS.find(t => t.id === Number(body.dataset.open)));
    } catch (e) {
      toast(e.message);
    }
  });

  // チップの × で条件を外す
  $('active-filters').addEventListener('click', ev => {
    const b = ev.target.closest('[data-unfilter]');
    if (!b) return;
    const key = b.dataset.unfilter;
    if (key === 'due') {
      // 期限は2入力で1条件。片方だけ残すと意図しない絞り込みになる
      state.filters.due_from = state.filters.due_to = '';
    } else {
      state.filters[key] = '';
    }
    // ジャンルを外したらカテゴリも外す（ジャンル外のカテゴリが残ると矛盾する）
    if (key === 'genre_id') state.filters.category_id = '';
    if (key === 'q') {
      $('search-input').value = '';
      $('search-container').classList.remove('filled');
    }
    syncFilterInputs();
    reload();
  });

  // --- 検索（250ms デバウンス） ---
  let timer;
  $('search-input').addEventListener('input', ev => {
    const v = ev.target.value;
    $('search-container').classList.toggle('filled', !!v);
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters.q = v.trim();
      if (state.filters.q && state.view === 'dashboard') {
        showList({ listKey: 'all', genreId: null, categoryId: null });
      } else {
        reload();
      }
    }, 250);
  });

  $('search-clear').addEventListener('click', () => {
    $('search-input').value = '';
    $('search-container').classList.remove('filled');
    state.filters.q = '';
    reload();
  });

  // --- 絞り込みパネル ---
  $('filter-btn').addEventListener('click', () => {
    const open = !$('filter-panel').classList.contains('open');
    if (open) syncFilterInputs();
    openFilterPanel(open);
  });

  $('f-genre').addEventListener('change', () => {
    state.filters.category_id = '';
    fillCategorySelect($('f-category'), $('f-genre').value, null, 'すべて');
  });

  // 条件は変えた瞬間に反映する。ジャンル側の change が先に走り、カテゴリを空にしてから読む
  $('filter-panel').addEventListener('change', () => {
    readFilterInputs();
    runFilters();
  });

  $('f-clear').addEventListener('click', () => {
    const q = state.filters.q;        // キーワードは検索欄側なので残す
    state.filters = emptyFilters();
    state.filters.q = q;
    syncFilterInputs();
    runFilters();
  });

  // --- 詳細 ---
  $('fab-add').addEventListener('click', () => openDetail(null));
  $('detail-cancel').addEventListener('click', closeDetail);
  $('detail-overlay').addEventListener('click', closeDetail);
  $('detail-save').addEventListener('click', saveDetail);
  $('d-delete').addEventListener('click', () => {
    $('d-delete').style.display = 'none';
    $('d-confirm').classList.add('open');
  });
  $('d-confirm-no').addEventListener('click', hideTaskConfirm);
  $('d-confirm-yes').addEventListener('click', deleteDetail);
  $('d-range').addEventListener('click', () => setRange(!$('d-range').classList.contains('on')));
  $('d-genre').addEventListener('change', () =>
    fillCategorySelect($('d-category'), $('d-genre').value, null));

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if ($('menu-pop').classList.contains('open')) return openMenu(false);
    if ($('settings-modal').classList.contains('open')) return closeSettings();
    if (state.bulk) return cancelBulk();
    // 編集ビューを開いている間は、一覧へ戻すだけにする
    if ($('manage-modal').classList.contains('open')) {
      if ($('manage-content').dataset.mview === 'edit') {
        state.editing = null;
        hideConfirm();
        return setManageView('list');
      }
      $('manage-modal').classList.remove('open');
      return;
    }
    closeDetail();
  });

  // --- 管理モーダル ---
  $('manage-btn').addEventListener('click', () => {
    openMenu(false);
    state.manageGenreId = null;
    state.editing = null;
    hideConfirm();
    setManageView('list');
    renderManage();
    $('manage-modal').classList.add('open');
  });
  const closeManage = () => {
    $('manage-modal').classList.remove('open');
    state.editing = null;
    hideConfirm();
    setManageView('list');
  };
  $('manage-close').addEventListener('click', closeManage);
  $('manage-modal').addEventListener('click', ev => {
    if (ev.target.id === 'manage-modal') closeManage();
  });

  const onPanelClick = async ev => {
    const mv = ev.target.closest('[data-move]');
    if (mv) {
      const [kind, id, delta] = mv.dataset.move.split(':');
      try {
        await moveItem(kind, Number(id), Number(delta));
      } catch (e) {
        toast(e.message);
      }
      return;
    }
    const eg = ev.target.closest('[data-edit-genre]');
    if (eg) return openEdit('genre', Number(eg.dataset.editGenre));

    const ec = ev.target.closest('[data-edit-cat]');
    if (ec) return openEdit('category', Number(ec.dataset.editCat));

    const row = ev.target.closest('[data-mg]');
    if (row) { state.manageGenreId = Number(row.dataset.mg); renderManage(); }
  };

  $('genre-panel').addEventListener('click', onPanelClick);
  $('cat-panel').addEventListener('click', onPanelClick);

  // --- 編集ビュー ---
  $('edit-back').addEventListener('click', () => {
    state.editing = null;
    hideConfirm();
    setManageView('list');
  });
  $('edit-save').addEventListener('click', saveEdit);
  $('edit-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); });

  $('edit-colors').addEventListener('click', ev => {
    const dot = ev.target.closest('[data-color]');
    if (dot) renderColors(dot.dataset.color);
  });

  $('edit-delete').addEventListener('click', () => {
    if ($('edit-delete').disabled) return;
    const { kind, id } = state.editing || {};
    if (!kind) return;
    const n = kind === 'genre'
      ? (COUNTS.genres[String(id)] || 0)
      : (COUNTS.categories[String(id)] || 0);
    $('edit-confirm-text').textContent = kind === 'genre'
      ? 'このジャンルを削除します。配下のカテゴリも一緒に消えます。'
      : (n ? `このカテゴリを削除します。タスク${n}件のカテゴリは「なし」になります。`
           : 'このカテゴリを削除します。');
    $('edit-delete').style.display = 'none';
    $('edit-confirm').classList.add('open');
  });

  $('edit-confirm-no').addEventListener('click', hideConfirm);
  $('edit-confirm-yes').addEventListener('click', deleteEditing);

  $('add-genre').addEventListener('click', async () => {
    const name = $('new-genre').value.trim();
    if (!name) return;
    try {
      await api.createGenre(name);
      $('new-genre').value = '';
      await afterMasterChange();
    } catch (e) {
      toast(e.message);
    }
  });

  $('add-cat').addEventListener('click', async () => {
    const name = $('new-cat').value.trim();
    const gid = state.manageGenreId;
    if (!name || !gid) return;
    try {
      // UNIQUE(genre_id, name)。別ジャンルなら同名でも作れる。
      await api.createCategory(gid, name);
      $('new-cat').value = '';
      await afterMasterChange();
    } catch (e) {
      toast(e.message);
    }
  });

  // Enter でも追加できるようにする
  $('new-genre').addEventListener('keydown', e => { if (e.key === 'Enter') $('add-genre').click(); });
  $('new-cat').addEventListener('keydown', e => { if (e.key === 'Enter') $('add-cat').click(); });

  // --- 幅の切り替わり ---
  WIDE.addEventListener('change', () => {
    if (WIDE.matches && state.view === 'dashboard') state.view = 'list';
    render();
  });
}

/* ============================================================
   メニュー（歯車）と設定
   設定値は Python 側（app_meta）が持つ。画面は開くたびに読み直し、
   「保存」でまとめて送る。不正な値があれば何も保存されない。
   ============================================================ */

function openMenu(on) {
  $('menu-pop').classList.toggle('open', on);
}

// 入力欄 ↔ 設定項目の対応。kind: 'check' | 'num' | 'text'
const SETTING_FIELDS = [
  ['s-backup-enabled',  'backup_enabled',        'check'],
  ['s-backup-dir',      'backup_dir',            'text'],
  ['s-backup-keep',     'backup_keep',           'num'],
  ['s-notify-startup',  'notify_on_startup',     'check'],
  ['s-notify-interval', 'notify_interval_min',   'num'],
  ['s-notify-today',    'notify_include_today',  'check'],
  ['s-notify-close',    'notify_auto_close_sec', 'num'],
  ['s-import-dir',      'import_dir',            'text'],
];

function fillSettings(data) {
  SETTING_FIELDS.forEach(([id, key, kind]) => {
    const el = $(id);
    if (kind === 'check') el.checked = !!data.values[key];
    else el.value = data.values[key];
  });
  // 空欄のときに使われる既定フォルダを見せておく
  $('s-backup-dir').placeholder = '既定: ' + data.defaults.backup_dir;
  $('s-import-dir').placeholder = '既定: ' + data.defaults.import_dir;
}

function readSettings() {
  const body = {};
  SETTING_FIELDS.forEach(([id, key, kind]) => {
    const el = $(id);
    body[key] = kind === 'check' ? el.checked : kind === 'num' ? el.value : el.value.trim();
  });
  return body;
}

function settingsError(msg) {
  $('settings-error').textContent = msg || '';
}

async function openSettings() {
  openMenu(false);
  settingsError('');
  try {
    fillSettings(await api.getSettings());
  } catch (e) {
    return toast(e.message);
  }
  $('settings-modal').classList.add('open');
}

function closeSettings() {
  $('settings-modal').classList.remove('open');
}

/** 保存してから実行したい操作（今すぐバックアップ等）の前にも呼ぶ。 */
async function saveSettings() {
  settingsError('');
  try {
    fillSettings(await api.saveSettings(readSettings()));
    return true;
  } catch (e) {
    settingsError(e.message);
    return false;
  }
}

function bindSettings() {
  $('menu-btn').addEventListener('click', ev => {
    ev.stopPropagation();
    openMenu(!$('menu-pop').classList.contains('open'));
  });
  document.addEventListener('click', ev => {
    if (!ev.target.closest('.menu-wrap')) openMenu(false);
  });

  $('settings-btn').addEventListener('click', openSettings);
  $('settings-cancel').addEventListener('click', closeSettings);
  $('settings-modal').addEventListener('click', ev => {
    if (ev.target.id === 'settings-modal') closeSettings();
  });
  $('settings-save').addEventListener('click', async () => {
    if (await saveSettings()) {
      closeSettings();
      toast('設定を保存しました');
    }
  });

  // 参照：フォルダ選択ダイアログ
  document.querySelectorAll('[data-browse]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const input = $(btn.dataset.browse);
      try {
        const r = await api.chooseFolder(input.value || input.placeholder.replace(/^既定: /, ''));
        if (r.path) input.value = r.path;
      } catch (e) {
        settingsError(e.message);
      }
    }));

  // 下の3つは入力中の値で動くよう、先に保存する
  $('s-backup-now').addEventListener('click', async () => {
    if (!await saveSettings()) return;
    try {
      const r = await api.backupNow();
      toast('バックアップしました: ' + r.path);
    } catch (e) {
      settingsError(e.message);
    }
  });
  $('s-notify-test').addEventListener('click', async () => {
    if (!await saveSettings()) return;
    try {
      const r = await api.testNotification();
      if (!r.shown) toast('期限が来ているタスクはありません');
    } catch (e) {
      settingsError(e.message);
    }
  });
  $('s-import-now').addEventListener('click', async () => {
    if (!await saveSettings()) return;
    try {
      const r = await api.importCsv();
      toast(r.imported ? r.imported + '件取り込みました' : '取り込むCSVはありませんでした');
      if (r.imported) { await refreshMasters(); await reload(); }
    } catch (e) {
      settingsError(e.message);
    }
  });
}

function renderIcons() {
  $('search-icon').innerHTML   = icon('search');
  $('search-clear').innerHTML  = icon('x');
  $('filter-btn').innerHTML    = icon('search');
  $('calendar-link').innerHTML = icon('calendarDots');
  $('menu-btn').innerHTML      = icon('gear');
  $('manage-icon').innerHTML   = icon('folder');
  $('settings-icon').innerHTML = icon('sliders');
  $('back-icon').innerHTML     = icon('caretLeft');
  $('fab-icon').innerHTML      = icon('plus');
  $('i-date').innerHTML        = icon('calendar');
  $('i-date-end').innerHTML    = icon('calendarChk');
  $('i-flag').innerHTML        = icon('flag');
  $('i-genre').innerHTML       = icon('folder');
  $('i-cat').innerHTML         = icon('tag');
  $('i-status').innerHTML      = icon('info');
  $('i-trash').innerHTML       = icon('trash');
  $('d-range').innerHTML       = icon('arrowsH');
  $('add-genre').innerHTML     = icon('plus');
  $('add-cat').innerHTML       = icon('plus');
  $('edit-back-icon').innerHTML = icon('caretLeft');
  $('edit-del-icon').innerHTML  = icon('trash');
}

/* ============================================================
   起動
   window.pywebview はページ読込直後には存在しない。
   DOMContentLoaded ではなく pywebviewready を待つ。
   ============================================================ */

window.addEventListener('pywebviewready', async () => {
  renderIcons();
  bindEvents();
  bindSettings();
  try {
    await refreshMasters();
  } catch (e) {
    toast(e.message);
  }
  if (WIDE.matches) state.view = 'list';
  await reload();

  // カレンダーから index.html?task=ID で戻ってきた場合はその詳細を開く
  const m = location.search.match(/[?&]task=(\d+)/);
  if (m) {
    try {
      openDetail(await api.getTask(Number(m[1])));
    } catch (e) {
      toast(e.message);
    }
  }
});

/* ============================================================
   共通
   ============================================================ */

/**
 * カレンダーウィンドウのバーをクリックしたとき、Python 側の
 * focus_task() がこれを呼ぶ。メインウィンドウでその詳細を開く。
 */
window.openTaskById = async id => {
  try {
    openDetail(await api.getTask(Number(id)));
  } catch (e) {
    toast(e.message);
  }
};

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
