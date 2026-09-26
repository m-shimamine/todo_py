/* ============================================================
   SCR-05 カレンダー（ガントチャート）
   本番では GET /api/tasks/calendar?from=&to= に置き換わる。
   date_start が空のタスクは表示対象外。
   ============================================================ */

const DAY_W  = 34;   // 1日あたりの幅(px)。CSS の .cal-date と合わせる
const BEFORE = 30;   // 本日より前に表示する日数
const AFTER  = 30;   // 本日より後に表示する日数
const WD     = ['日', '月', '火', '水', '木', '金', '土'];

const $ = id => document.getElementById(id);
const filter = { genre_id: '', status: '' };

let days = [];   // 表示対象の日付（Date配列）

function buildDays() {
  days = [];
  const start = today0();
  start.setDate(start.getDate() - BEFORE);
  for (let i = 0; i <= BEFORE + AFTER; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
}

function dayClass(d) {
  const cls = [];
  if (d.getDay() === 6) cls.push('sat');
  if (d.getDay() === 0) cls.push('sun');
  if (iso(d) === day(0)) cls.push('today');
  return cls.join(' ');
}

/** 表示対象タスク：日付ありのものだけを開始日順に並べる */
function targetTasks() {
  const from = iso(days[0]), to = iso(days[days.length - 1]);
  return TASKS
    .filter(t => t.date_start)
    .filter(t => overlaps(t, from, to))
    .filter(t => !filter.genre_id || t.genre_id === Number(filter.genre_id))
    .filter(t => !filter.status   || t.status === filter.status)
    .sort((a, b) => a.date_start.localeCompare(b.date_start) || a.no - b.no);
}

function render() {
  const tasks = targetTasks();
  const width = days.length * DAY_W;

  // --- 日付ヘッダ ---
  $('cal-dates').style.width = width + 'px';
  $('cal-dates').innerHTML = days.map((d, i) => `
    <div class="cal-date ${dayClass(d)}">
      ${d.getDate() === 1 || i === 0 ? (d.getMonth() + 1) + '月' : '&nbsp;'}<br>
      <span class="d">${d.getDate()}</span><br>${WD[d.getDay()]}
    </div>`).join('');

  // --- 左のタスク名 ---
  $('cal-labels').innerHTML = tasks.length
    ? tasks.map(t => {
        const g = genreOf(t);
        return `<div class="cal-label${t.status === 'completed' ? ' done' : ''}">
          <span class="cdot" style="background:${g.color}"></span>
          <span class="t">${esc(t.content)}</span>
        </div>`;
      }).join('')
    : '<div class="cal-label" style="color:var(--text-tertiary)">該当なし</div>';

  // --- 背景の縦罫 ---
  const cols = days.map((d, i) =>
    `<div class="cal-col ${dayClass(d)}" style="left:${i * DAY_W}px"></div>`).join('');

  // --- バー ---
  $('cal-rows').style.width = width + 'px';
  $('cal-rows').innerHTML = tasks.map(t => {
    const g = genreOf(t);
    // 表示範囲からはみ出す分は端で切る
    let si = days.findIndex(d => iso(d) === t.date_start);
    let ei = days.findIndex(d => iso(d) === endOf(t));
    if (si < 0) si = 0;
    if (ei < 0) ei = days.length - 1;

    const left = si * DAY_W + 2;
    const w    = (ei - si + 1) * DAY_W - 4;

    return `<div class="cal-row">${cols}
      <div class="bar${t.status === 'completed' ? ' done' : ''}"
           style="left:${left}px;width:${w}px;background:${g.color}"
           data-id="${t.id}">${esc(t.content)}</div>
    </div>`;
  }).join('') || `<div class="cal-row">${cols}</div>`;
}

function scrollToToday() {
  $('cal-scroll').scrollLeft = Math.max(0, (BEFORE - 3) * DAY_W);
}

document.addEventListener('DOMContentLoaded', () => {
  $('back-icon').innerHTML = icon('caretLeft');
  $('today-btn').innerHTML = icon('calendarDot');

  $('genre-filter').innerHTML =
    '<option value="">すべてのジャンル</option>' +
    GENRES.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');

  $('back-btn').addEventListener('click', () => location.href = 'main.html');
  $('genre-filter').addEventListener('change', e => { filter.genre_id = e.target.value; render(); });
  $('status-filter').addEventListener('change', e => { filter.status = e.target.value; render(); });
  $('today-btn').addEventListener('click', scrollToToday);

  // 縦スクロールを左のラベル列に同期させる（ラベル側は overflow:hidden）
  $('cal-scroll').addEventListener('scroll', () => {
    $('cal-labels').style.transform = `translateY(${-$('cal-scroll').scrollTop}px)`;
  });

  // バーのツールチップ
  const tip = $('tooltip');
  $('cal-rows').addEventListener('mouseover', ev => {
    const bar = ev.target.closest('[data-id]');
    if (!bar) return;
    const t = TASKS.find(x => x.id === Number(bar.dataset.id));
    const g = genreOf(t), c = categoryOf(t);
    const period = t.date_end ? `${t.date_start} 〜 ${t.date_end}` : t.date_start;
    tip.innerHTML = `<b>${esc(t.content)}</b><br>` +
      `${esc(g.name)}${c ? ' ・ ' + esc(c.name) : ''}<br>${period}<br>${STATUS_LABEL[t.status]}`;
    tip.classList.add('show');
  });
  $('cal-rows').addEventListener('mousemove', ev => {
    tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + 'px';
    tip.style.top  = Math.min(ev.clientY + 16, innerHeight - 110) + 'px';
  });
  $('cal-rows').addEventListener('mouseout', () => tip.classList.remove('show'));

  // バークリックでメイン画面の詳細を開く
  $('cal-rows').addEventListener('click', ev => {
    const bar = ev.target.closest('[data-id]');
    if (bar) location.href = 'main.html?task=' + bar.dataset.id;
  });

  buildDays();
  render();
  scrollToToday();
});
