# -*- coding: utf-8 -*-
"""パス定数と既定値。

PyInstaller で固めた場合、web/ は展開先（sys._MEIPASS）に置かれるが
data/ と temp/ は書き込みが要るので実行ファイルの隣に置く。
"""

import sys
from pathlib import Path


def _bundle_dir() -> Path:
    """読み取り専用の同梱ファイル（web/）の置き場。"""
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    return Path(__file__).resolve().parent.parent


def _writable_dir() -> Path:
    """書き込みするファイル（data/ temp/）の置き場。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


BUNDLE_DIR = _bundle_dir()
WEB_DIR = BUNDLE_DIR / "web"
INDEX_HTML = WEB_DIR / "index.html"
CALENDAR_HTML = WEB_DIR / "calendar.html"

ROOT_DIR = _writable_dir()
DATA_DIR = ROOT_DIR / "data"
BACKUP_DIR = DATA_DIR / "backup"
TEMP_DIR = ROOT_DIR / "temp"
DB_FILE = DATA_DIR / "todo.db"
LOG_FILE = DATA_DIR / "app.log"

# app_meta.schema_version が保つ版数。DDLを変えたら上げる。
SCHEMA_VERSION = 1

# ウィンドウサイズ。
# 初回はスマホ相当（単一カラム・詳細は下からのシート）で開く。
# 2回目以降は前回閉じたときのサイズを app_meta から復元する。
FIRST_WINDOW = (390, 820)
MIN_WINDOW = (360, 480)

# カレンダーは別ウィンドウで開く。横に長いので幅を広めに取る。
CALENDAR_WINDOW = (1040, 720)

# 起動時の期限通知。画面右下（タスクバーの上）に出す小窓
NOTIFY_HTML = WEB_DIR / "notify.html"
NOTIFY_WINDOW = (340, 260)
NOTIFY_MARGIN = 12

# 二重起動を防ぐ名前付きミューテックスと、既存ウィンドウを探すためのタイトル
INSTANCE_MUTEX = "Local\\todo_py_task_manager"
MAIN_TITLE = "タスク管理"

# 復元したサイズが画面に収まらないときの余白（タスクバー等の分）
SCREEN_MARGIN = 60

# data/backup に残す世代数
BACKUP_KEEP = 10

# genres が空のときだけ投入する初期ジャンル（名前, 色）
DEFAULT_GENRES = [
    ("プライベート", "#007AFF"),
    ("学習", "#FF9500"),
    ("趣味", "#AF52DE"),
    ("家事", "#34C759"),
    ("その他", "#8E8E93"),
]

# ジャンル追加時に順番に割り当てる色（iOSシステムカラー）
GENRE_PALETTE = [
    "#007AFF", "#FF9500", "#AF52DE", "#34C759",
    "#5856D6", "#00C7BE", "#FF2D55", "#FF3B30",
]

STATUSES = ("active", "pending", "completed")

# ジャンルが見つからないタスクの逃がし先
FALLBACK_GENRE = "その他"
