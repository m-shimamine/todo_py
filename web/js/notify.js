/* ============================================================
   起動時の期限通知（画面右下の小窓）

   メインが最小化されていても見えるよう、Python 側が最前面・枠なしの
   別ウィンドウとして開く。行をクリックするとメインでそのタスクを開く。
   ============================================================ */

const $ = id => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtDate(s, today) {
  if (s === today) return '今日';
  const [, m, d] = s.split('-');
  return Number(m) + '/' + Number(d);
}

async function closeNotify() {
  try { await api.closeNotify(); } catch (e) { window.close(); }
}

let closeTimer = null;

/** 一覧を取り直して描く。定期通知のたびに Python 側からも呼ばれる。 */
async function loadNotify() {
  let data, today;
  try {
    const [d, counts] = await Promise.all([api.dueTasks(), api.counts({})]);
    data = d;
    today = counts.today;
  } catch (e) {
    $('notify-list').innerHTML = `<div class="notify-empty">${esc(e.message)}</div>`;
    return;
  }

  const tasks = data.tasks;
  if (!tasks.length) return closeNotify();     // 出ている間に片付いた

  const overdue = tasks.filter(t => (t.date_end || t.date_start) < today).length;
  $('notify-title').textContent = `期限が来ているタスク ${tasks.length}件` +
    (overdue ? `（遅延 ${overdue}件）` : '');

  $('notify-list').innerHTML = tasks.map(t => {
    const end = t.date_end || t.date_start;
    return `<button class="notify-row" data-id="${t.id}">
      <span class="cdot" style="background:${esc(t.genre_color)}"></span>
      <span class="t">${esc(t.content)}</span>
      <span class="d${end < today ? ' overdue' : ''}">${fmtDate(end, today)}</span>
    </button>`;
  }).join('');

  // 設定で秒数があれば自動で閉じる。マウスを載せている間は待つ
  clearTimeout(closeTimer);
  if (data.auto_close_sec > 0) {
    const arm = () => { closeTimer = setTimeout(closeNotify, data.auto_close_sec * 1000); };
    document.body.onmouseenter = () => clearTimeout(closeTimer);
    document.body.onmouseleave = arm;
    arm();
  }
}

window.reloadNotify = loadNotify;

window.addEventListener('pywebviewready', async () => {
  $('notify-icon').innerHTML = icon('warning');
  $('notify-close').innerHTML = icon('x');
  $('notify-close').addEventListener('click', closeNotify);

  // 行クリックでメインを前面に出してそのタスクを開き、通知は閉じる
  $('notify-list').addEventListener('click', async ev => {
    const row = ev.target.closest('[data-id]');
    if (!row) return;
    try {
      await api.focusTask(Number(row.dataset.id));
      await closeNotify();
    } catch (e) {
      row.querySelector('.t').textContent = e.message;
    }
  });

  await loadNotify();
});
