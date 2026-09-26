/* ============================================================
   SCR-05 カレンダー（ガントチャート）

   date_start が空のタスクは対象外（Python 側の calendar_tasks が除外する）。
   ============================================================ */

const DAY_W  = 34;   // 1日あたりの幅(px)。CSS の .cal-date と合わせる
const BEFORE = 30;   // 本日より前に表示する日数
const AFTER  = 30;   // 本日より後に表示する日数
const WD     = ['日', '月', '火', '水', '木', '金', '土'];

const $ = id => document.getElementById(id);

const filter = { genre_id: '', status: '' };
let GENRES = [];
let TASKS = [];
let TODAY = '';      // Python 側のローカル日付
let days = [];       // 表示対象の日付（'YYYY-MM-DD' の配列）

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function toDate(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fromDate(dt) {
  return dt.getFullYear() + '-' +
         String(dt.getMonth() + 1).padStart(2, '0') + '-' +
         String(dt.getDate()).padStart(2, '0');
}

function buildDays() {
  days = [];
  const start = toDate(TODAY);
  start.setDate(start.getDate() - BEFORE);
  for (let i = 0; i <= BEFORE + AFTER; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(fromDate(d));
  }
}

function dayClass(isoStr) {
  const dow = toDate(isoStr).getDay();
  const cls = [];
  if (dow === 6) cls.push('sat');
  if (dow === 0) cls.push('sun');
  if (isoStr === TODAY) cls.push('today');
  return cls.join(' ');
}

function endOf(t) { return t.date_end || t.date_start; }

async function load() {
  try {
    TASKS = await api.calendarTasks({
      from: days[0],
      to: days[days.length - 1],
      genre_id: filter.genre_id,
      status: filter.status,
    });
    render();
  } catch (e) {
    $('cal-labels').innerHTML =
      '<div class="cal-label" style="color:var(--ios-red)">' + esc(e.message) + '</div>';
  }
}

function render() {
  const width = days.length * DAY_W;

  // --- 日付ヘッダ ---
  $('cal-dates').style.width = width + 'px';
  $('cal-dates').innerHTML = days.map((iso, i) => {
    const d = toDate(iso);
    return `<div class="cal-date ${dayClass(iso)}">
      ${d.getDate() === 1 || i === 0 ? (d.getMonth() + 1) + '月' : '&nbsp;'}<br>
      <span class="d">${d.getDate()}</span><br>${WD[d.getDay()]}
    </div>`;
  }).join('');

  // --- 左のタスク名 ---
  $('cal-labels').innerHTML = TASKS.length
    ? TASKS.map(t => `<div class="cal-label${t.status === 'completed' ? ' done' : ''}">
        <span class="cdot" style="background:${esc(t.genre_color)}"></span>
        <span class="t">${esc(t.content)}</span>
      </div>`).join('')
    : '<div class="cal-label" style="color:var(--text-tertiary)">該当なし</div>';

  // --- 背景の縦罫 ---
  const cols = days.map((iso, i) =>
    `<div class="cal-col ${dayClass(iso)}" style="left:${i * DAY_W}px"></div>`).join('');

  // --- バー ---
  $('cal-rows').style.width = width + 'px';
  $('cal-rows').innerHTML = TASKS.map(t => {
    // 表示範囲からはみ出す分は端で切る
    let si = days.indexOf(t.date_start);
    let ei = days.indexOf(endOf(t));
    if (si < 0) si = 0;
    if (ei < 0) ei = days.length - 1;

    const left = si * DAY_W + 2;
    const w    = (ei - si + 1) * DAY_W - 4;

    return `<div class="cal-row">${cols}
      <div class="bar${t.status === 'completed' ? ' done' : ''}"
           style="left:${left}px;width:${w}px;background:${esc(t.genre_color)}"
           data-id="${t.id}">${esc(t.content)}</div>
    </div>`;
  }).join('') || `<div class="cal-row">${cols}</div>`;
}

function scrollToToday() {
  $('cal-scroll').scrollLeft = Math.max(0, (BEFORE - 3) * DAY_W);
}

const STATUS_LABEL = { active: '未完了', pending: '保留', completed: '完了' };

window.addEventListener('pywebviewready', async () => {
  $('back-icon').innerHTML = icon('x');
  $('today-btn').innerHTML = icon('calendarDot');

  try {
    const [genres, counts] = await Promise.all([api.listGenres(false), api.counts({})]);
    GENRES = genres;
    TODAY = counts.today;
  } catch (e) {
    $('cal-labels').innerHTML =
      '<div class="cal-label" style="color:var(--ios-red)">' + esc(e.message) + '</div>';
    return;
  }

  $('genre-filter').innerHTML =
    '<option value="">すべてのジャンル</option>' +
    GENRES.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');

  // 別ウィンドウなので「閉じる」。ハーネスでは戻るしかないので代用する。
  $('back-btn').addEventListener('click', async () => {
    try {
      await api.closeCalendar();
    } catch (e) {
      location.href = 'index.html';
    }
  });
  $('genre-filter').addEventListener('change', e => { filter.genre_id = e.target.value; load(); });
  $('status-filter').addEventListener('change', e => { filter.status = e.target.value; load(); });
  $('today-btn').addEventListener('click', scrollToToday);

  // 縦スクロールを左のラベル列に同期させる（ラベル側は overflow:hidden のため
  // scrollTop を代入しても動かない。transform で動かす）
  $('cal-scroll').addEventListener('scroll', () => {
    $('cal-labels').style.transform = `translateY(${-$('cal-scroll').scrollTop}px)`;
  });

  // バーのツールチップ
  const tip = $('tooltip');
  $('cal-rows').addEventListener('mouseover', ev => {
    const bar = ev.target.closest('[data-id]');
    if (!bar) return;
    const t = TASKS.find(x => x.id === Number(bar.dataset.id));
    if (!t) return;
    const period = t.date_end ? `${t.date_start} 〜 ${t.date_end}` : t.date_start;
    tip.innerHTML = `<b>${esc(t.content)}</b><br>` +
      `${esc(t.genre_name)}${t.category_name ? ' ・ ' + esc(t.category_name) : ''}<br>` +
      `${period}<br>${STATUS_LABEL[t.status] || ''}`;
    tip.classList.add('show');
  });
  $('cal-rows').addEventListener('mousemove', ev => {
    tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + 'px';
    tip.style.top  = Math.min(ev.clientY + 16, innerHeight - 110) + 'px';
  });
  $('cal-rows').addEventListener('mouseout', () => tip.classList.remove('show'));

  // バークリックでメインウィンドウを前面に出し、その詳細を開く
  $('cal-rows').addEventListener('click', async ev => {
    const bar = ev.target.closest('[data-id]');
    if (!bar) return;
    try {
      await api.focusTask(Number(bar.dataset.id));
    } catch (e) {
      location.href = 'index.html?task=' + bar.dataset.id;
    }
  });

  buildDays();
  await load();
  scrollToToday();
});
