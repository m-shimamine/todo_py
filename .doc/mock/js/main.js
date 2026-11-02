/* ============================================================
   SCR-01 ダッシュボード / SCR-02 タスク一覧 / SCR-03 詳細シート
   SCR-04 ジャンル・カテゴリ管理
   モック実装。データはメモリ上（js/mock-data.js）。
   本番では各操作が backend の API 呼び出しに置き換わる。
   ============================================================ */

const $ = id => document.getElementById(id);

const WIDE = window.matchMedia('(min-width: 1024px)');

const state = {
  view: 'dashboard',      // 'dashboard' | 'list'（広い時は併置されるので表示の切替には使わない）
  listKey: 'today',       // スマートリストのキー（ジャンル表示時は null）
  genreId: null,          // ジャンル/カテゴリからの遷移
  categoryId: null,
  openGenreId: null,      // ダッシュボードで展開中のジャンル
  filters: emptyFilters(),
  editingId: null,
  isNew: false,
  manageGenreId: null
};

let nextTaskId = 100;

/* ============================================================
   ダッシュボード
   ============================================================ */

function renderDashboard() {
  // --- スマートカード ---
  $('smart-lists').innerHTML = SMART_LISTS.map(l => {
    // 件数も表示可否を反映させる。一覧と数が食い違うと数字が信用されなくなる
    const n = filterByList(TASKS, l.key, state.filters).length;
    const on = !state.genreId && !state.categoryId && state.listKey === l.key;
    return `<button class="smart-card${on ? ' active' : ''}" data-list="${l.key}">
      <div class="smart-card-header">
        <div class="smart-icon" style="background:${l.color}">${icon(l.icon)}</div>
        <span class="smart-count">${n}</span>
      </div>
      <span class="smart-label">${l.label}</span>
    </button>`;
  }).join('');

  // --- ジャンル一覧（行をタップで展開してカテゴリを出す） ---
  const rows = [];
  GENRES.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).forEach(g => {
    const n = applyVisibility(TASKS, state.filters).filter(t => t.genre_id === g.id).length;
    const open = state.openGenreId === g.id;
    const cats = CATEGORIES.filter(c => c.genre_id === g.id);

    const gOn = state.genreId === g.id && !state.categoryId;
    rows.push(`<button class="project-row${gOn ? ' active' : ''}" data-genre="${g.id}">
      <span class="project-dot" style="background:${g.color}">${icon('folder')}</span>
      <span class="project-name">${esc(g.name)}</span>
      <span class="project-count">${n}</span>
      ${cats.length ? `<span class="caret-wrap" data-toggle="${g.id}">${icon('caretRight', 'caret' + (open ? ' open' : ''))}</span>` : ''}
    </button>`);

    if (open) {
      cats.forEach(c => {
        const cn = applyVisibility(TASKS, state.filters).filter(t => t.category_id === c.id).length;
        const cOn = state.categoryId === c.id;
        rows.push(`<button class="project-row category-row${cOn ? ' active' : ''}" data-cat="${c.id}" data-cat-genre="${g.id}">
          <span class="project-name">${esc(c.name)}</span>
          <span class="project-count">${cn}</span>
          ${icon('caretRight', 'caret')}
        </button>`);
      });
      if (!cats.length) {
        rows.push('<div class="project-empty">カテゴリがありません</div>');
      }
    }
  });
  $('genre-list-items').innerHTML = rows.join('') ||
    '<div class="project-empty">ジャンルがありません</div>';
}

/* ============================================================
   タスク一覧
   ============================================================ */

function currentTasks() {
  let list;
  if (state.categoryId) {
    list = applyVisibility(TASKS, state.filters).filter(t => t.category_id === state.categoryId);
  } else if (state.genreId) {
    list = applyVisibility(TASKS, state.filters).filter(t => t.genre_id === state.genreId);
  } else {
    list = filterByList(TASKS, state.listKey, state.filters);
  }

  list = applyFilters(list, state.filters);
  return sortTasks(list, state.genreId ? null : state.listKey);
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
  const l = SMART_LISTS.find(l => l.key === state.listKey);
  return l ? l.label : '検索結果';
}

function renderList() {
  const list = currentTasks();
  $('list-title').textContent = currentTitle();
  $('list-count').textContent = list.length ? list.length + '件' : '';

  // 適用中の絞り込み条件をチップで出す
  $('active-filters').innerHTML = describeFilters(state.filters).map(d =>
    `<span class="chip"><b>${esc(d.label)}</b> ${esc(d.value)}
      <button data-unfilter="${d.key}" title="この条件を外す">${icon('x')}</button></span>`).join('');

  if (!list.length) {
    $('task-items-card').innerHTML =
      '<div class="task-empty">該当するタスクはありません</div>';
    return;
  }

  const td = day(0);
  $('task-items-card').innerHTML = list.map(t => {
    const g = genreOf(t), c = categoryOf(t);
    const done    = t.status === 'completed';
    const pending = t.status === 'pending';
    const overdue = t.date_start && endOf(t) < td && !done;

    let dateText = '';
    if (t.date_start) {
      dateText = fmtDate(t.date_start) + (t.date_end ? ' 〜 ' + fmtDate(t.date_end) : '');
    }

    return `<div class="task-row" data-id="${t.id}">
      <div class="task-circle-container">
        <div class="task-circle ${done ? 'checked' : ''}" data-check="${t.id}">
          ${done ? icon('check') : ''}
        </div>
      </div>
      <div class="task-body" data-open="${t.id}">
        <div class="task-content-text ${done ? 'strikethrough' : ''}">${esc(t.content)}</div>
        <div class="task-meta">
          <span class="task-project-badge" style="background:${g.color}">${esc(g.name)}</span>
          ${c ? `<span class="task-category-label">${esc(c.name)}</span>` : ''}
          ${dateText ? `<span class="task-date-label ${overdue ? 'overdue' : ''}">${icon('calendar')}${dateText}</span>` : ''}
          ${pending ? '<span class="task-status-label">保留</span>' : ''}
        </div>
      </div>
      <div class="task-trailing">
        <span class="task-toggle task-hold ${pending ? 'active' : ''}" data-hold="${t.id}"
              title="${pending ? '保留を解除' : '保留にする'}">${icon('clock')}</span>
        <span class="task-toggle task-flag ${t.priority ? 'active' : ''}" data-flag="${t.id}"
              title="${t.priority ? 'フラグを外す' : 'フラグを付ける'}">${icon('flag')}</span>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   ビュー切替
   ============================================================ */

function showDashboard() {
  state.view = 'dashboard';
  state.genreId = state.categoryId = null;
  // 広い時はサイドバーが出たままなので、一覧の中身も保っておく
  if (WIDE.matches) state.view = 'list';
  renderAll();
}

function showList(opts) {
  Object.assign(state, { view: 'list' }, opts);
  renderAll();
}

/**
 * 表示の切替はCSSに任せ、JSは body の data-view を書くだけにする。
 * 広い時は両方出す（app.css のワイド用メディアクエリが上書きする）。
 */
function renderAll() {
  document.body.dataset.view = state.view;
  renderDashboard();
  renderList();
}

/* ============================================================
   詳細シート
   ============================================================ */

function fillGenreSelect(sel, genreId, allLabel) {
  sel.innerHTML = (allLabel ? `<option value="">${allLabel}</option>` : '') +
    GENRES.map(g => `<option value="${g.id}"${g.id === genreId ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
}

function fillCategorySelect(sel, genreId, categoryId, allLabel) {
  const cats = genreId ? CATEGORIES.filter(c => c.genre_id === Number(genreId)) : CATEGORIES;
  sel.innerHTML = `<option value="">${allLabel || 'なし'}</option>` +
    cats.map(c => `<option value="${c.id}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

function openDetail(task) {
  state.isNew = !task;
  state.editingId = task ? task.id : null;

  const t = task || {
    genre_id: state.genreId || GENRES[0].id, category_id: state.categoryId || null,
    content: '', result: '', date_start: '', date_end: '',
    priority: 0, status: 'active'
  };

  $('detail-title').textContent = state.isNew ? '新規タスク' : '詳細';
  $('d-content').value  = t.content;
  $('d-result').value   = t.result || '';
  $('d-start').value    = t.date_start;
  $('d-end').value      = t.date_end;
  $('d-status').value   = t.status;
  $('d-priority').checked = t.priority === 1;

  fillGenreSelect($('d-genre'), t.genre_id);
  fillCategorySelect($('d-category'), t.genre_id, t.category_id);

  setRange(!!t.date_end);
  $('d-delete').style.display = state.isNew ? 'none' : '';

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
}

function saveDetail() {
  const content = $('d-content').value.trim();
  if (!content) return toast('タスク内容を入力してください');

  const s = $('d-start').value;
  const e = $('d-range').classList.contains('on') ? $('d-end').value : '';
  if (s && e && s > e) return toast('終了日は開始日以降にしてください');

  const status = $('d-status').value;
  const prev = state.isNew ? null : TASKS.find(t => t.id === state.editingId);

  const payload = {
    genre_id: Number($('d-genre').value),
    category_id: $('d-category').value ? Number($('d-category').value) : null,
    content,
    result: $('d-result').value,
    date_start: s,
    date_end: e,
    priority: $('d-priority').checked ? 1 : 0,
    status,
    // 完了へ移った時だけ completed_at を打つ。完了のままなら元の値を保つ。
    completed_at: status === 'completed'
      ? (prev && prev.status === 'completed' && prev.completed_at
          ? prev.completed_at : nowISO())
      : ''
  };

  if (state.isNew) {
    const no = Math.max(0, ...TASKS.map(t => t.no)) + 1;
    TASKS.push(Object.assign({ id: nextTaskId++, no }, payload));
    toast('追加しました');
  } else {
    Object.assign(prev, payload);
    toast('保存しました');
  }
  closeDetail();
  renderAll();
}

function deleteDetail() {
  if (!state.editingId) return;
  if (!confirm('このタスクを削除します。よろしいですか？')) return;
  TASKS.splice(TASKS.findIndex(t => t.id === state.editingId), 1);
  closeDetail();
  toast('削除しました');
  renderAll();
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

/**
 * 絞り込みが効いている間は「すべて」を母集合にした一覧へ移る。
 */
function runFilters() {
  if (hasNarrowingFilters(state.filters)) {
    showList({ listKey: 'all', genreId: null, categoryId: null });
  } else if (state.view === 'list' && !state.genreId) {
    showList({ listKey: state.listKey });
  } else {
    renderAll();
  }
}

/* ============================================================
   管理モーダル
   ============================================================ */

function renderManage() {
  $('genre-panel').innerHTML = GENRES.map(g => {
    const n = TASKS.filter(t => t.genre_id === g.id).length;
    return `<li class="${state.manageGenreId === g.id ? 'active' : ''}" data-mg="${g.id}">
      <span class="project-dot" style="background:${g.color};width:22px;height:22px;border-radius:6px"></span>
      <span class="name">${esc(g.name)}</span>
      <span class="n">${n}</span>
      <button class="row-btn" data-mg-rename="${g.id}" title="改名">${icon('tag')}</button>
      <button class="row-btn del" data-mg-del="${g.id}" title="削除">${icon('trash')}</button>
    </li>`;
  }).join('') || '<div class="panel-placeholder">ジャンルがありません</div>';

  const gid = state.manageGenreId;
  const g = gid ? GENRES.find(x => x.id === gid) : null;

  $('selected-genre-label').textContent = g ? g.name : '';
  $('cat-add-form').style.display   = g ? 'flex' : 'none';
  $('cat-placeholder').style.display = g ? 'none' : '';
  $('cat-panel').style.display      = g ? '' : 'none';

  if (!g) return;

  const cats = CATEGORIES.filter(c => c.genre_id === gid);
  $('cat-panel').innerHTML = cats.map(c => {
    const n = TASKS.filter(t => t.category_id === c.id).length;
    return `<li>
      <span class="name">${esc(c.name)}</span>
      <span class="n">${n}</span>
      <button class="row-btn" data-mc-rename="${c.id}" title="改名">${icon('tag')}</button>
      <button class="row-btn del" data-mc-del="${c.id}" title="削除">${icon('trash')}</button>
    </li>`;
  }).join('') || '<li style="color:var(--text-tertiary);font-size:13px">カテゴリがありません</li>';
}

/* ============================================================
   起動
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // アイコンの流し込み
  $('search-icon').innerHTML  = icon('search');
  $('search-clear').innerHTML = icon('x');
  $('filter-btn').innerHTML   = icon('search');
  $('calendar-link').innerHTML = icon('calendarDots');
  $('manage-btn').innerHTML   = icon('gear');
  $('back-icon').innerHTML    = icon('caretLeft');
  $('fab-icon').innerHTML     = icon('plus');
  $('i-date').innerHTML       = icon('calendar');
  $('i-date-end').innerHTML   = icon('calendarChk');
  $('i-flag').innerHTML       = icon('flag');
  $('i-genre').innerHTML      = icon('folder');
  $('i-cat').innerHTML        = icon('tag');
  $('i-status').innerHTML     = icon('info');
  $('i-trash').innerHTML      = icon('trash');
  $('d-range').innerHTML      = icon('arrowsH');
  $('add-genre').innerHTML    = icon('plus');
  $('add-cat').innerHTML      = icon('plus');

  /* ---- ダッシュボード ---- */
  $('smart-lists').addEventListener('click', ev => {
    const card = ev.target.closest('[data-list]');
    if (card) showList({ listKey: card.dataset.list, genreId: null, categoryId: null });
  });

  $('genre-list-items').addEventListener('click', ev => {
    const toggle = ev.target.closest('[data-toggle]');
    if (toggle) {                       // ＞ をタップ：カテゴリの開閉
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

  /* ---- タスク一覧 ---- */
  $('task-items-card').addEventListener('click', ev => {
    // ステータスを変えるとスマートカードの件数も動く。
    // 広い時はサイドバーが出たままなので、renderList だけだと件数が古くなる。
    const chk = ev.target.closest('[data-check]');
    if (chk) {
      const t = TASKS.find(x => x.id === Number(chk.dataset.check));
      if (t.status === 'completed') { t.status = 'active';    t.completed_at = ''; }
      else                          { t.status = 'completed'; t.completed_at = nowISO(); }
      return renderAll();
    }
    // 保留トグル。完了中に押した場合は完了を解いて保留にする
    const hold = ev.target.closest('[data-hold]');
    if (hold) {
      const t = TASKS.find(x => x.id === Number(hold.dataset.hold));
      if (t.status === 'pending') {
        t.status = 'active';
      } else {
        t.status = 'pending';
        t.completed_at = '';
      }
      return renderAll();
    }
    const flag = ev.target.closest('[data-flag]');
    if (flag) {
      const t = TASKS.find(x => x.id === Number(flag.dataset.flag));
      t.priority = t.priority ? 0 : 1;
      return renderAll();
    }
    const body = ev.target.closest('[data-open]');
    if (body) openDetail(TASKS.find(t => t.id === Number(body.dataset.open)));
  });

  // チップの × で条件を1つだけ外す
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
    if (key === 'q') $('search-input').value = '';
    $('search-container').classList.toggle('filled', !!state.filters.q);
    syncFilterInputs();
    // 表示可否を外すと件数も動くので、一覧だけでなくサイドバーも描き直す
    renderAll();
  });

  /* ---- 検索（250ms デバウンス） ---- */
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
        renderAll();
      }
    }, 250);
  });

  $('search-clear').addEventListener('click', () => {
    $('search-input').value = '';
    $('search-container').classList.remove('filled');
    state.filters.q = '';
    renderAll();
  });

  /* ---- 絞り込みパネル ---- */
  $('filter-btn').addEventListener('click', () => {
    const open = !$('filter-panel').classList.contains('open');
    if (open) syncFilterInputs();
    openFilterPanel(open);
  });

  $('f-genre').addEventListener('change', () => {
    // ジャンルを変えたらカテゴリ候補を絞り直す
    state.filters.category_id = '';
    fillCategorySelect($('f-category'), $('f-genre').value, null, 'すべて');
  });

  // 条件は変えた瞬間に反映する。ジャンル側の change が先に走り、カテゴリを空にしてから読む
  $('filter-panel').addEventListener('change', () => {
    readFilterInputs();
    runFilters();
  });

  $('f-clear').addEventListener('click', () => {
    const q = state.filters.q;          // キーワードは検索欄側なので残す
    state.filters = emptyFilters();
    state.filters.q = q;
    syncFilterInputs();
    runFilters();
  });

  /* ---- 詳細シート ---- */
  $('fab-add').addEventListener('click', () => openDetail(null));
  $('detail-cancel').addEventListener('click', closeDetail);
  $('detail-overlay').addEventListener('click', closeDetail);
  $('detail-save').addEventListener('click', saveDetail);
  $('d-delete').addEventListener('click', deleteDetail);
  $('d-range').addEventListener('click', () => setRange(!$('d-range').classList.contains('on')));
  $('d-genre').addEventListener('change', () =>
    fillCategorySelect($('d-category'), $('d-genre').value, null));

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { closeDetail(); $('manage-modal').classList.remove('open'); }
  });

  /* ---- 管理モーダル ---- */
  $('manage-btn').addEventListener('click', () => {
    state.manageGenreId = null;
    renderManage();
    $('manage-modal').classList.add('open');
  });
  $('manage-close').addEventListener('click', () => {
    $('manage-modal').classList.remove('open');
    renderAll();
  });
  $('manage-modal').addEventListener('click', ev => {
    if (ev.target.id === 'manage-modal') {
      $('manage-modal').classList.remove('open');
      renderAll();
    }
  });

  $('genre-panel').addEventListener('click', ev => {
    const del = ev.target.closest('[data-mg-del]');
    if (del) {
      const id = Number(del.dataset.mgDel);
      const n = TASKS.filter(t => t.genre_id === id).length;
      // DB側は ON DELETE RESTRICT。API は 409 を返す。
      if (n) return toast(`このジャンルにタスクが${n}件残っています`);
      GENRES.splice(GENRES.findIndex(g => g.id === id), 1);
      for (let i = CATEGORIES.length - 1; i >= 0; i--)
        if (CATEGORIES[i].genre_id === id) CATEGORIES.splice(i, 1);   // CASCADE
      if (state.manageGenreId === id) state.manageGenreId = null;
      return renderManage();
    }
    const ren = ev.target.closest('[data-mg-rename]');
    if (ren) {
      const g = GENRES.find(x => x.id === Number(ren.dataset.mgRename));
      const name = prompt('ジャンル名', g.name);
      // ID参照のためタスク側の更新は不要
      if (name && name.trim()) g.name = name.trim();
      return renderManage();
    }
    const row = ev.target.closest('[data-mg]');
    if (row) { state.manageGenreId = Number(row.dataset.mg); renderManage(); }
  });

  $('cat-panel').addEventListener('click', ev => {
    const del = ev.target.closest('[data-mc-del]');
    if (del) {
      const id = Number(del.dataset.mcDel);
      const n = TASKS.filter(t => t.category_id === id).length;
      if (!confirm(n ? `このカテゴリのタスク${n}件は「なし」になります。削除しますか？`
                     : 'このカテゴリを削除しますか？')) return;
      CATEGORIES.splice(CATEGORIES.findIndex(c => c.id === id), 1);
      TASKS.forEach(t => { if (t.category_id === id) t.category_id = null; });  // SET NULL
      return renderManage();
    }
    const ren = ev.target.closest('[data-mc-rename]');
    if (ren) {
      const c = CATEGORIES.find(x => x.id === Number(ren.dataset.mcRename));
      const name = prompt('カテゴリ名', c.name);
      if (name && name.trim()) c.name = name.trim();
      renderManage();
    }
  });

  $('add-genre').addEventListener('click', () => {
    const name = $('new-genre').value.trim();
    if (!name) return;
    if (GENRES.some(g => g.name === name)) return toast('同じ名前のジャンルがあります');
    const palette = ['#007AFF', '#FF9500', '#AF52DE', '#34C759', '#5856D6', '#00C7BE', '#FF2D55'];
    GENRES.push({
      id: Math.max(0, ...GENRES.map(g => g.id)) + 1, name,
      color: palette[GENRES.length % palette.length],
      sort_order: GENRES.length + 1
    });
    $('new-genre').value = '';
    renderManage();
  });

  $('add-cat').addEventListener('click', () => {
    const name = $('new-cat').value.trim();
    const gid = state.manageGenreId;
    if (!name || !gid) return;
    // UNIQUE(genre_id, name)。別ジャンルなら同名でも作れる。
    if (CATEGORIES.some(c => c.genre_id === gid && c.name === name))
      return toast('このジャンルに同じカテゴリがあります');
    CATEGORIES.push({ id: Math.max(0, ...CATEGORIES.map(c => c.id)) + 1, genre_id: gid, name });
    $('new-cat').value = '';
    renderManage();
  });

  // 幅が切り替わったら描画し直す。
  // 広い時は一覧が常に見えているため、data-view が 'dashboard' のままだと
  // 狭くしたときに中身の無い一覧が残る。
  WIDE.addEventListener('change', () => {
    if (WIDE.matches && state.view === 'dashboard') state.view = 'list';
    renderAll();
  });

  showDashboard();
});

/* ============================================================
   共通
   ============================================================ */

function nowISO() {
  const d = new Date();
  return iso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
