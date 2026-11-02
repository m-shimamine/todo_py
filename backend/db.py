# -*- coding: utf-8 -*-
"""接続管理・スキーマ適用・初期データ・バックアップ。

js_api の各呼び出しは UI とは別のワーカースレッドで実行される。
sqlite3.Connection は生成スレッド以外から使えないため、接続は
呼び出しごとに開いて閉じる（使い回さない）。
"""

import logging
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime

from .config import (
    BACKUP_DIR,
    BACKUP_KEEP,
    DATA_DIR,
    DB_FILE,
    DEFAULT_GENRES,
    SCHEMA_VERSION,
    TEMP_DIR,
)

log = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS genres (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT    NOT NULL DEFAULT '#007AFF',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    genre_id    INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
    UNIQUE (genre_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    no           INTEGER NOT NULL DEFAULT 0,
    genre_id     INTEGER NOT NULL,
    category_id  INTEGER,
    content      TEXT    NOT NULL,
    result       TEXT    NOT NULL DEFAULT '',
    date_start   TEXT    NOT NULL DEFAULT '',
    date_end     TEXT    NOT NULL DEFAULT '',
    priority     INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
    status       TEXT    NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'pending', 'completed')),
    completed_at TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    FOREIGN KEY (genre_id)    REFERENCES genres(id)     ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_genre     ON tasks(genre_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_category  ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_date      ON tasks(date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status, no);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cat_genre       ON categories(genre_id, sort_order);
"""


def now() -> str:
    """ローカル時刻の ISO8601（秒まで）。"""
    return datetime.now().isoformat(timespec="seconds")


def today() -> str:
    """ローカル日付 'YYYY-MM-DD'。スマートリストの基準はここだけで決める。"""
    return date.today().isoformat()


@contextmanager
def conn():
    """呼び出しごとに開いて閉じる接続。

    PRAGMA foreign_keys は接続ごとに要る（SQLiteの既定は無効）。
    """
    c = sqlite3.connect(str(DB_FILE))
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def init() -> None:
    """DDL適用・スキーマ版確認・初期ジャンル投入。"""
    for d in (DATA_DIR, BACKUP_DIR, TEMP_DIR):
        d.mkdir(parents=True, exist_ok=True)

    with conn() as c:
        c.execute("PRAGMA journal_mode = WAL")
        c.executescript(DDL)
        _migrate(c)
        _seed_genres(c)


def _migrate(c: sqlite3.Connection) -> None:
    """app_meta.schema_version による版数管理。

    版を上げるときは MIGRATIONS に関数を足す。ALTER TABLE を
    try/except で握りつぶす方式は採らない（何が適用済みか分からなくなる）。
    """
    row = c.execute("SELECT value FROM app_meta WHERE key = 'schema_version'").fetchone()
    if row is None:
        c.execute(
            "INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        return

    current = int(row["value"])
    if current > SCHEMA_VERSION:
        raise RuntimeError(
            "DBのスキーマ版(%d)がアプリ(%d)より新しい。アプリを更新してください。"
            % (current, SCHEMA_VERSION)
        )

    # 版を上げる処理はここに追加する（current < SCHEMA_VERSION のとき）
    if current < SCHEMA_VERSION:
        c.execute(
            "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
            (str(SCHEMA_VERSION),),
        )


def _seed_genres(c: sqlite3.Connection) -> None:
    if c.execute("SELECT COUNT(*) FROM genres").fetchone()[0]:
        return
    ts = now()
    c.executemany(
        "INSERT INTO genres (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)",
        [(name, color, i + 1, ts) for i, (name, color) in enumerate(DEFAULT_GENRES)],
    )


def get_meta(key: str, default: str = "") -> str:
    """app_meta の値を1つ読む。無ければ default。"""
    with conn() as c:
        row = c.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_meta(key: str, value: str) -> None:
    with conn() as c:
        c.execute(
            "INSERT INTO app_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


def backup(target_dir=BACKUP_DIR, keep: int = BACKUP_KEEP):
    """target_dir へ日付ごとのコピーを置く（同日分は上書き）。

    作ったファイルのパスを返す。DB が無ければ None。失敗は例外のまま上げる。
    """
    if not DB_FILE.exists():
        return None
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / ("todo_%s.db" % date.today().strftime("%Y%m%d"))

    # WAL の未反映分も含めてコピーするため sqlite3 の backup API を使う。
    # ファイルコピーだと -wal に残った分を取りこぼす。
    src = sqlite3.connect(str(DB_FILE))
    dst = sqlite3.connect(str(target))
    try:
        with dst:
            src.backup(dst)
    finally:
        dst.close()
        src.close()

    # 消すのは自分が作った名前のファイルだけ
    olds = sorted(target_dir.glob("todo_[0-9]*.db"))
    for path in olds[:-keep]:
        try:
            path.unlink()
        except OSError:
            log.warning("古いバックアップを消せなかった: %s", path)
    return target


def checkpoint_and_close() -> None:
    """WAL を本体へ書き戻してから終了する。

    これを省くと todo.db だけコピーしたときに未反映分を失う。
    """
    if not DB_FILE.exists():
        return
    try:
        c = sqlite3.connect(str(DB_FILE))
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        c.close()
    except Exception:
        log.exception("wal_checkpoint に失敗した")
