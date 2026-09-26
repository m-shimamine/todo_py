/* ============================================================
   モック用ダミーデータと共通ロジック
   本番では GET /api/genres, GET /api/tasks に置き換わる。
   日付は「本日」を基準に組み立てるため、いつ開いても
   スマートリストが動く状態になる。
   ============================================================ */

/* ============================================================
   インラインSVGアイコン
   移植元は Phosphor Icons をCDNから読んでいたが、ローカルアプリは
   オフラインで動く必要があるため自前のSVGに置き換える。
   ============================================================ */

const ICONS = {
  search:       '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
  gear:         '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
  sliders:      '<path d="M4 7h10M18.5 7H20M4 17h4.5M13 17h7"/><circle cx="14" cy="7" r="2.2"/><circle cx="10.5" cy="17" r="2.2"/>',
  calendar:     '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calendarDots: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r=".9"/><circle cx="12" cy="15" r=".9"/><circle cx="16" cy="15" r=".9"/>',
  calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  calendarDot:  '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.2" r="1.7"/>',
  calendarChk:  '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M9.5 15l2 2 3.5-3.5"/>',
  warning:      '<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4M12 17.2v.1"/>',
  sun:          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5"/>',
  tray:         '<path d="M4.2 6.5 3 13v4.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V13l-1.2-6.5A2 2 0 0 0 17.85 5H6.15a2 2 0 0 0-1.95 1.5Z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>',
  flag:         '<path d="M5 22V4M5 4h12l-2.5 4L17 12H5"/>',
  checkCircle:  '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.6 2.6L16 9.4"/>',
  check:        '<path d="M5 12.5 9.5 17 19 7.5"/>',
  clock:        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.3 2"/>',
  caretLeft:    '<path d="M15 5 8 12l7 7"/>',
  caretRight:   '<path d="M9 5l7 7-7 7"/>',
  plus:         '<path d="M12 5v14M5 12h14"/>',
  x:            '<path d="M6 6l12 12M18 6 6 18"/>',
  trash:        '<path d="M4 7h16M10 4h4M9.5 11v7M14.5 11v7M6 7l1 13.2A1.8 1.8 0 0 0 8.8 22h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7"/>',
  tag:          '<path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7l9 9-8 8-9.5-9.5Z"/><circle cx="8" cy="8" r="1.4"/>',
  folder:       '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4L11 8.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z"/>',
  info:         '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  caretUp:      '<path d="M5 15l7-7 7 7"/>',
  caretDown:    '<path d="M5 9l7 7 7-7"/>',
  pencil:       '<path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z"/><path d="M14.5 6.5l3 3"/>',
  arrowsH:      '<path d="M7 9 4 12l3 3M17 9l3 3-3 3M4.5 12h15"/>'
};

/** アイコンのSVGを返す。fill指定が要る場合は cls に色クラスを渡す。 */
function icon(name, cls) {
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
         'stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
}

/* ============================================================
   日付ユーティリティ
   ============================================================ */

function iso(dt) {
  return dt.getFullYear() + '-' +
         String(dt.getMonth() + 1).padStart(2, '0') + '-' +
         String(dt.getDate()).padStart(2, '0');
}

function today0() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** 本日から offset 日後の 'YYYY-MM-DD' */
function day(offset) {
  const t = today0();
  t.setDate(t.getDate() + offset);
  return iso(t);
}

/** 'YYYY-MM-DD' → 'M/D'。今日・明日・昨日は語で返す */
function fmtDate(s) {
  if (!s) return '';
  if (s === day(0))  return '今日';
  if (s === day(1))  return '明日';
  if (s === day(-1)) return '昨日';
  const [, m, d] = s.split('-');
  return Number(m) + '/' + Number(d);
}

/* ============================================================
   マスタ
   色は移植元と同じ iOS システムカラーから採る。
   ============================================================ */

const GENRES = [
  { id: 1, name: 'プライベート', color: '#007AFF', sort_order: 1 },
  { id: 2, name: '学習',         color: '#FF9500', sort_order: 2 },
  { id: 3, name: '趣味',         color: '#AF52DE', sort_order: 3 },
  { id: 4, name: '家事',         color: '#34C759', sort_order: 4 },
  { id: 5, name: 'その他',       color: '#8E8E93', sort_order: 5 }
];

const CATEGORIES = [
  { id: 1, genre_id: 1, name: '手続き' },
  { id: 2, genre_id: 1, name: '買い物' },
  { id: 3, genre_id: 1, name: '健康' },
  { id: 4, genre_id: 2, name: '資格' },
  { id: 5, genre_id: 2, name: '読書' },
  { id: 6, genre_id: 3, name: 'カメラ' },
  { id: 7, genre_id: 3, name: '読書' },
  { id: 8, genre_id: 4, name: '掃除' },
  { id: 9, genre_id: 4, name: '修繕' }
];

/* ============================================================
   タスク
   status は active（未完了）/ pending（保留）/ completed（完了）の3値。
   date_end が空文字 = 単日タスク。
   completed_at は完了時刻。完了以外は空文字。
   ============================================================ */

const TASKS = [
  { id: 1,  no: 1,  genre_id: 1, category_id: 1, content: '確定申告の書類をまとめる',
    result: '', date_start: day(0),  date_end: '',      priority: 1, status: 'active',    completed_at: '' },
  { id: 2,  no: 2,  genre_id: 4, category_id: 8, content: '燃えるゴミを出す',
    result: '', date_start: day(0),  date_end: '',      priority: 0, status: 'completed', completed_at: day(0) + 'T07:20:00' },
  { id: 3,  no: 3,  genre_id: 2, category_id: 4, content: '参考書 第3章を読む',
    result: '演習問題は次回', date_start: day(-2), date_end: day(5), priority: 0, status: 'active', completed_at: '' },
  { id: 4,  no: 4,  genre_id: 1, category_id: 3, content: '歯科の予約を取る',
    result: '', date_start: day(-4), date_end: '',      priority: 1, status: 'active',    completed_at: '' },
  { id: 5,  no: 5,  genre_id: 3, category_id: 6, content: 'レンズの清掃キットを注文',
    result: '', date_start: day(1),  date_end: '',      priority: 0, status: 'active',    completed_at: '' },
  { id: 6,  no: 6,  genre_id: 1, category_id: 2, content: '米と洗剤を買う',
    result: '', date_start: day(1),  date_end: '',      priority: 0, status: 'active',    completed_at: '' },
  { id: 7,  no: 7,  genre_id: 2, category_id: 5, content: '積んでいる技術書を1冊読み切る',
    result: '', date_start: day(3),  date_end: day(17), priority: 0, status: 'active',    completed_at: '' },
  { id: 8,  no: 8,  genre_id: 4, category_id: 9, content: '網戸の張り替え',
    result: '部材の入荷待ち', date_start: day(6), date_end: day(7), priority: 0, status: 'pending', completed_at: '' },
  { id: 9,  no: 9,  genre_id: 3, category_id: 6, content: '週末の撮影場所を下調べ',
    result: '', date_start: day(4),  date_end: '',      priority: 1, status: 'active',    completed_at: '' },
  { id: 10, no: 10, genre_id: 1, category_id: 1, content: '免許の更新へ行く',
    result: '', date_start: day(12), date_end: '',      priority: 0, status: 'active',    completed_at: '' },
  { id: 11, no: 11, genre_id: 2, category_id: 4, content: '模擬試験を申し込む',
    result: '', date_start: day(9),  date_end: '',      priority: 0, status: 'active',    completed_at: '' },
  { id: 12, no: 12, genre_id: 4, category_id: 8, content: '換気扇の大掃除',
    result: '', date_start: day(20), date_end: day(21), priority: 0, status: 'active',    completed_at: '' },
  { id: 13, no: 13, genre_id: 5, category_id: null, content: '古いHDDのデータを整理する',
    result: '', date_start: '',      date_end: '',      priority: 0, status: 'pending',   completed_at: '' },
  { id: 14, no: 14, genre_id: 3, category_id: 7, content: '図書館に本を返す',
    result: '', date_start: day(-6), date_end: '',      priority: 0, status: 'completed', completed_at: day(-6) + 'T18:05:00' },
  { id: 15, no: 15, genre_id: 1, category_id: 3, content: '健康診断の結果を確認',
    result: '再検査なし', date_start: day(-9), date_end: '', priority: 0, status: 'completed', completed_at: day(-8) + 'T21:40:00' },
  { id: 16, no: 16, genre_id: 2, category_id: 5, content: '読書メモをまとめ直す',
    result: '', date_start: day(34), date_end: '',      priority: 0, status: 'active',    completed_at: '' },
  { id: 17, no: 17, genre_id: 4, category_id: 8, content: '洗濯機の排水口を掃除',
    result: '', date_start: day(-13), date_end: '',     priority: 0, status: 'completed', completed_at: day(-13) + 'T11:00:00' }
];

/* ---------- 参照ヘルパ ---------- */

function genreOf(t)    { return GENRES.find(g => g.id === t.genre_id) || GENRES[4]; }
function categoryOf(t) { return t.category_id ? CATEGORIES.find(c => c.id === t.category_id) || null : null; }

/** タスクの終端日。date_end が空なら date_start */
function endOf(t) { return t.date_end || t.date_start; }

const STATUS_LABEL = { active: '未完了', pending: '保留', completed: '完了' };

/* ============================================================
   スマートリスト
   ラベル・並び・色は移植元 electron-app.html と同じ。
   「保留」だけは新規追加（移植元は status に保留を持ちながら
   一覧する手段が無かった）。
   ============================================================ */

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
  { key: 'completed',  label: '実行済',     icon: 'checkCircle',  color: '#34C759' }
];

/** 対象期間 [from, to] を返す。日付を持たないリストは null。 */
function periodOf(key) {
  const t = today0();

  if (key === 'today')    return [iso(t), iso(t)];
  if (key === 'tomorrow') return [day(1), day(1)];

  if (key === 'this-week' || key === 'next-week') {
    // 月曜始まり。getDay() は日曜=0 なので月曜起点に直す。
    const monday = today0();
    monday.setDate(monday.getDate() - ((t.getDay() + 6) % 7));
    if (key === 'next-week') monday.setDate(monday.getDate() + 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return [iso(monday), iso(sunday)];
  }

  if (key === 'this-month' || key === 'next-month') {
    let y = t.getFullYear(), m = t.getMonth();
    if (key === 'next-month') { m += 1; if (m > 11) { m = 0; y += 1; } }
    return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  }

  return null;
}

/**
 * 期間 [date_start, 終端日] と [from, to] の重なり判定。
 * 日付未設定（空文字）は必ず除外する。空文字はどの日付より
 * 辞書順で小さいため、除外しないと全期間にヒットしてしまう。
 */
function overlaps(t, from, to) {
  if (!t.date_start) return false;
  return (!to || t.date_start <= to) && (!from || endOf(t) >= from);
}

/**
 * スマートリストのキーでタスクを絞り込む。
 * 「保留」「実行済」はそのステータスを見るためのリストなので、
 * 表示可否の対象外（チェックを入れなくても中身が出る）。
 */
function filterByList(tasks, key, f) {
  const td = day(0);

  if (key === 'completed') return tasks.filter(t => t.status === 'completed');
  if (key === 'pending')   return tasks.filter(t => t.status === 'pending');

  const list = applyVisibility(tasks, f || emptyFilters());

  if (key === 'all')     return list.slice();
  if (key === 'flagged') return list.filter(t => t.priority === 1);
  if (key === 'overdue') return list.filter(t => t.date_start && endOf(t) < td);

  const p = periodOf(key);
  if (!p) return list.slice();
  return list.filter(t => overlaps(t, p[0], p[1]));
}

/* ============================================================
   絞り込み条件
   キーワードに加え、ジャンル／カテゴリ／ステータス／フラグ／期間で
   絞り込める。本番では GET /api/tasks のクエリパラメータになる。
   ============================================================ */

function emptyFilters() {
  return {
    q: '', genre_id: '', category_id: '', priority: '',
    // 期限の範囲。片方だけでも成立する
    due_from: '', due_to: '',
    // 保留済・実行済の表示可否。既定はどちらも非表示（'' = OFF、'1' = ON）
    show_pending: '', show_completed: ''
  };
}

/**
 * 保留済・実行済を落とす。
 * 既定では未完了だけを見せ、チェックを入れたぶんだけ足していく。
 */
function applyVisibility(list, f) {
  if (f.show_pending   !== '1') list = list.filter(t => t.status !== 'pending');
  if (f.show_completed !== '1') list = list.filter(t => t.status !== 'completed');
  return list;
}

/**
 * 絞り込みの「幅を狭める」条件が入っているか。
 * 表示可否（show_*）は範囲を広げる操作なので含めない。
 */
function hasNarrowingFilters(f) {
  return ['q', 'genre_id', 'category_id', 'priority', 'due_from', 'due_to']
    .some(k => f[k] !== '');
}

function applyFilters(tasks, f) {
  let list = tasks;

  if (f.q) {
    const k = f.q.toLowerCase();
    list = list.filter(t =>
      t.content.toLowerCase().includes(k) || (t.result || '').toLowerCase().includes(k));
  }
  if (f.genre_id)    list = list.filter(t => t.genre_id === Number(f.genre_id));
  if (f.category_id) list = list.filter(t => t.category_id === Number(f.category_id));
  if (f.priority)    list = list.filter(t => t.priority === Number(f.priority));

  // 期限の範囲。タスクの期間（date_start〜終端日）が範囲と重なるものを拾う。
  // 片側だけ指定された場合、欠けている側は無制限として扱う。
  if (f.due_from || f.due_to) list = list.filter(t => overlaps(t, f.due_from, f.due_to));

  return list;
}

/** 適用中の条件を「ラベル: 値」の配列で返す（チップ表示用） */
function describeFilters(f) {
  const out = [];
  if (f.q)        out.push({ key: 'q',           label: 'キーワード', value: f.q });
  if (f.genre_id) {
    const g = GENRES.find(x => x.id === Number(f.genre_id));
    out.push({ key: 'genre_id', label: 'ジャンル', value: g ? g.name : '' });
  }
  if (f.category_id) {
    const c = CATEGORIES.find(x => x.id === Number(f.category_id));
    out.push({ key: 'category_id', label: 'カテゴリ', value: c ? c.name : '' });
  }
  if (f.priority) out.push({ key: 'priority', label: 'フラグ', value: f.priority === '1' ? 'あり' : 'なし' });
  // 既定と違う状態のときだけ出す（＝チェックが入っているとき）
  if (f.show_pending   === '1') out.push({ key: 'show_pending',   label: '表示', value: '保留済' });
  if (f.show_completed === '1') out.push({ key: 'show_completed', label: '表示', value: '実行済' });

  // 期限は2つの入力で1つの条件。チップも1つにまとめ、×で両方外す。
  if (f.due_from || f.due_to) {
    out.push({
      key: 'due', label: '期限',
      value: (f.due_from || '指定なし') + ' 〜 ' + (f.due_to || '指定なし')
    });
  }
  return out;
}

/* ============================================================
   並び順
   既定：未完了→保留→完了、その中で no 昇順。
   ただし「実行済」リストだけは完了日時の降順（最近終えた順）。
   ============================================================ */

const STATUS_ORDER = { active: 0, pending: 1, completed: 2 };

function sortTasks(list, listKey) {
  if (listKey === 'completed') {
    return list.slice().sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  }
  return list.slice().sort((a, b) =>
    (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.no - b.no));
}

/* ---------- 共通 ---------- */

function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
