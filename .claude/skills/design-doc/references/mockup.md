# 画面モックの作り方

モックは「絵」ではなく「動くもの」を作る。
クリックして初めて分かる設計の穴（ペインの幅、状態の持ち方、削除時の挙動）を
実装前に洗い出すのが目的。

## 守ること

**外部依存ゼロ。** CDN・Webフォント・npmパッケージを使わない。
ローカルアプリのモックがネット接続を要求してはいけない。フォントは
`system-ui` を含むOS標準のスタックで済ませる。

```css
--font: "Yu Gothic UI", "Meiryo", "Hiragino Sans", system-ui, sans-serif;
```

**そのまま実装ベースになるように書く。** モックの `css/app.css` と `js/` は
捨てるためのものではない。本番の `web/` 配下へコピーして、
データ取得部分だけ API 呼び出しに差し替えられる粒度で書く。

**ダミーデータは「開いた日」を基準に生成する。**
固定日付を埋め込むと、翌週に開いた時「今日」が空になって使い物にならなくなる。

```js
function day(offset) {          // 本日から offset 日後の 'YYYY-MM-DD'
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + offset);
  return iso(t);
}
```

**設計書に書いたロジックを、そのままの規則で実装する。**
日付の期間判定やソート順は、設計書の該当章と同じ計算にする。
食い違ったらモックが嘘をつくことになる。該当箇所にコメントで章番号を残す。

```js
/** 対象期間 [from, to] を返す（設計書 詳細設計書 8章と同じ規則） */
function periodOf(key) { … }
```

**削除制約などのサーバ側の挙動も再現する。**
「タスクが残っているジャンルは削除できない（RESTRICT）」のような制約は、
モックでも拒否してメッセージを出す。ここを素通りさせると
設計レビューで一番大事な会話が起きない。

## ファイル分割

```
mock/
├─ index.html        # モック一覧。設計書と同じ体裁（ここだけCDN可）
├─ main.html         # 画面ごと。<link> と <script> 以外のロジックを書かない
├─ css/app.css       # 全画面共通。本番 web/css/app.css の元
└─ js/
   ├─ mock-data.js   # ダミーデータ＋日付ユーティリティ＋絞り込みロジック（共通）
   └─ main.js        # 画面ごとのレンダリングとイベント
```

`mock/index.html` には**「試せる操作」の表**を必ず置く。
どこをクリックすれば何が起きるかを書かないと、レビューする人は気付かず素通りする。

## 実装の型

状態は1つのオブジェクトに集める。DOMに状態を持たせない。

```js
const state = {
  view: 'list', listKey: 'today', genreId: null, categoryId: null,
  keyword: '', selectedId: null
};
function renderAll() { renderSidebar(); renderList(); }
```

イベントは親要素に1つ委譲して `closest('[data-xxx]')` で拾う。
行ごとに `addEventListener` を張ると再描画のたびに漏れる。

```js
$('task-items').addEventListener('click', ev => {
  const row = ev.target.closest('[data-id]');
  if (row) openDetail(Number(row.dataset.id));
});
```

ユーザー入力を描画に混ぜる箇所は必ずエスケープする（モックでも癖を付ける）。

```js
function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
```

## よく踏む罠

**`grid` の `1fr` は既定で `min-width: auto`。**
内容幅を下回れないため、ウィンドウが狭いと隣のペインを画面外へ押し出す。
可変幅のペインには必ず `min-width: 0` を付ける。

**`file://` では相対パスのCSS/JSが読めないことがある。**
確認は必ずローカルサーバ経由で行う。

```bash
python -m http.server 8777 --directory .doc/mock
```

**縦スクロールの同期は `transform` で行う。**
`overflow: hidden` の要素に `scrollTop` を代入しても動かない。

```js
$('cal-scroll').addEventListener('scroll', () => {
  $('labels').style.transform = `translateY(${-$('cal-scroll').scrollTop}px)`;
});
```

## 確認

作ったら必ず**実際にクリックして**確認する。表示されただけでは終わりにしない。

- [ ] 一覧の絞り込みを一通り切り替えた
- [ ] 新規追加 → 編集 → 削除を通した
- [ ] バリデーション（必須・日付の前後関係）が効いた
- [ ] 制約による拒否（削除できないケース）がメッセージ付きで出た
- [ ] 画面間のリンクが通った
- [ ] ネットワークタブに外部ホストへのリクエストが無い
