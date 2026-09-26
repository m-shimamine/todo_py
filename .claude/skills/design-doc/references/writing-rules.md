# 書き方の決まり

## デザイントークン

`assets/doc_template.html` の `<style>` に定義済み。値を変えるのはアクセント色だけにする。

| 変数 | 既定値 | 用途 |
|---|---|---|
| `--ink` | `#18222E` | 本文・見出し・図の線 |
| `--paper` | `#F6F7F4` | ページ背景 |
| `--surface` | `#FFFFFF` | カード背景 |
| `--line` | `#E4E5DE` | 罫線・枠線 |
| `--accent` | `#3E7C6B` | 見出しラベル・リンク・強調（**案件ごとに変えてよい**） |
| `--flag` | `#D2703A` | 注意喚起 |
| `--danger` | `#C9503F` | 危険・NOT NULL・エラー |
| `--muted` | `#767A73` | 補足テキスト |

フォントは Noto Sans JP（本文）／Zen Kaku Gothic New（見出し `.font-disp`）／
Roboto Mono（識別子 `.mono`）。設計書本体はGoogle Fonts CDNでよい。

## ページ構造

```html
<div class="max-w-5xl mx-auto px-4 sm:px-8 py-8">
  <!-- タイトルブロック：アイコン＋種別ラベル＋H1 -->
  <!-- サブタイトル1行 ＋ メタ情報（Ver / 日付 / 対象）を mono の小文字で -->
  <!-- 目次カード（.toc、2段組、アンカーリンク） -->
  <section id="xxx" class="mb-10">
    <h2 class="mb-3">1. 章タイトル</h2>
    ...
  </section>
</div>
```

`index.html` だけ `max-w-4xl` にして、他より少し狭く軽い見た目にする。

## 部品

**カード** ─ 本文はすべてカードに入れる。地の文を素で置かない。

```html
<div class="card p-5 text-sm space-y-3"> … </div>
```

**表** ─ カードの中に入れ、横溢れは `overflow-x-auto` で受ける。

```html
<div class="card overflow-x-auto">
  <table>
    <thead><tr><th style="width:130px">カラム</th>…</tr></thead>
    <tbody>…</tbody>
  </table>
</div>
```

1列目には `style="width:NNNpx"` を必ず指定する。指定しないと列幅が揃わない。

**注意ボックス（オレンジ）** ─ 実装時にハマる箇所。本文中のその場所に置く。

```html
<div class="p-3 rounded-lg" style="background:#FDF3EC;border:1px solid #F0D9C6">
  <b style="color:var(--flag)">見出し（何が起きるか）</b>
  <p class="mt-1" style="color:var(--muted)">なぜそうなるか、どう避けるか。</p>
</div>
```

**危険ボックス（赤）** ─ データを失う操作。移行SQLの再実行、破壊的コマンドなど。

```html
<div class="card p-4 mt-3 text-sm" style="border-left:4px solid var(--danger)">
```

**意図ボックス（緑）** ─ 設計判断の理由。

```html
<div class="card p-4 mt-3 text-sm" style="border-left:4px solid var(--accent)">
```

**コード** ─ ブロックは `<pre>`、インラインは `<code class="inl">`。
`<pre>` の中で `<` `>` は `&lt;` `&gt;` に必ず逃がす。ここを忘れると表示が崩れる。

## ER図・構成図のSVG

- `viewBox` を指定し `class="w-full min-w-[720px]"` で横スクロールを許す
- テーブルの箱は `rect`（角丸10）＋ヘッダ帯の `rect`（塗り `--accent` か `--ink`）
- カラム名は `font-size="11"`、箱のタイトルは `13` の `font-weight="700"`
- 主キーは `[PK]`、外部キーは `[FK]` を頭に付ける（絵文字は使わない ─ 環境で欠ける）
- 関連線は `marker-start="url(#one)"` / `marker-end="url(#many)"` で 1:N を表す
- FKを張らない関連は `stroke-dasharray="5 3"` の破線にし、図の下に理由を1文

```html
<defs>
  <marker id="one" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
    <path d="M6,1 V11" stroke="#18222E" stroke-width="1.5"/>
  </marker>
  <marker id="many" markerWidth="14" markerHeight="12" refX="2" refY="6" orient="auto">
    <path d="M12,1 L2,6 L12,11" fill="none" stroke="#18222E" stroke-width="1.5"/>
  </marker>
</defs>
```

## ワイヤーフレームのSVG

画面仕様の章の冒頭に置く。実物そっくりに描かず、**ペインの割り付けと主要要素の
位置関係だけ**を示す。文字は `font-size="10〜12"`、ダミーテキストは実データらしく
（「テキスト」ではなく「確定申告の書類をまとめる」と書く ─ 幅の感覚が掴める）。

## 文体

- 常体（だ・である）。「です・ます」は使わない
- 主語を省かない。「保存される」ではなく「サーバが保存する」
- 「等」「など」で濁さない。列挙しきれないなら表にする
- 章の冒頭に、その章が何を決めているのかを1文で書く
