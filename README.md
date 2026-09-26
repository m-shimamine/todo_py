# タスク管理

ジャンル／カテゴリでタスクを管理するローカルアプリ。
Python + pywebview + SQLite の単一プロセスで動く。

設計書は [.doc/index.html](.doc/index.html) を開く。

## 必要環境

- Python 3.9 以上
- Windows 10 / 11（WebView2 Runtime は標準搭載）

## セットアップ

```
py -3.9 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 起動

`start.bat` をダブルクリックする。コマンドからなら：

```
.venv\Scripts\python.exe app.py
```

ウィンドウを閉じれば終了する。HTTPサーバを持たないため、
停止用のバッチやブラウザからのアクセスは無い。

**ウィンドウサイズ** … 初回はスマホ相当（390×820）で開く。
2回目以降は前回閉じたときのサイズを復元する。
広げると 1024px で3カラム（サイドバー＋一覧＋詳細）に変わる。
カレンダーは上部バーのカレンダーアイコンから**別ウィンドウ**で開く。

## 旧アプリからのデータ移行（任意・1回限り）

Electron 版の `tasks.db` を引き継ぐ場合のみ、**空のDBに対して**実行する。

```
.venv\Scripts\python.exe tools\migrate_from_old.py
.venv\Scripts\python.exe tools\migrate_from_old.py <旧DBのパス>
```

旧 `project`（顧客名）は暫定ジャンルとして取り込まれる。移行後に
画面の「ジャンル・カテゴリ管理」で改名・統合する。
旧アーカイブは完了タスクとして取り込まれる。

## CSVインポート

`temp\` に CSV を置くと、起動時に自動で取り込む。

```csv
ジャンル,カテゴリ,開始日,終了日,内容,優先度,ステータス
プライベート,手続き,2026-09-21,,確定申告の書類をまとめる,高,未完了
学習,資格,2026-09-18,2026-09-25,参考書 第3章を読む,,完了
```

- 文字コードは UTF-8 / CP932 のどちらでもよい（Excel 保存でも可）
- ジャンル・カテゴリは無ければ自動で作られる
- 優先度は `高` または `★` でフラグ付き
- ステータスは `完了` / `保留` / それ以外（未完了）
- 取り込んだファイルは `_imported_日時` を付けてリネームされる

## データ

| 場所 | 内容 |
|---|---|
| `data\todo.db` | 全データ。これ1つを退避すればバックアップになる |
| `data\backup\` | 起動時の自動バックアップ（直近10世代） |
| `data\app.log` | ログ |
| `temp\` | CSV取込用 |

## ファイル構成

```
app.py              エントリポイント
backend\
  config.py         パス定数・既定値
  db.py             接続管理・スキーマ・バックアップ
  api.py            js_api として公開するクラス（フロントの窓口）
  repository.py     SQL実行層
  smartlist.py      スマートリストの期間計算
  filters.py        絞り込み条件 → WHERE句
  csv_import.py     CSV取込
web\                フロントエンド（pywebview が file:// で読む）
tools\
  migrate_from_old.py  旧DBからの移行
  devserver.py         開発用の確認ハーネス（配布物には含めない）
.doc\               設計書一式（mock\ に操作できる画面モック）
```

## 開発時の確認

フロントだけをブラウザで確かめたいときは、開発用ハーネスを使う。
`window.pywebview.api` を同じ形の関数へ差し替えて `web\` を配る。

```
.venv\Scripts\python.exe tools\devserver.py 8800
```

アプリ本体はこれを使わない（`app.py` は HTTP を一切使わない）。
