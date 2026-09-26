# -*- coding: utf-8 -*-
"""旧 Electron 版の tasks.db から移行する。手動実行、1回限り。

    .venv\\Scripts\\python.exe tools\\migrate_from_old.py [旧DBのパス]

旧 tasks.project は顧客名（GP / らくすむ / …）であり私用アプリでは
意味を持たないが、捨てると紐付けが分からなくなるため、いったん
暫定ジャンルとして取り込む。移行後に画面で改名・統合する前提。

旧 tasks_archived は「完了タスク」として tasks に取り込む。
アーカイブという区分自体を持たないため。
"""

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import db                                  # noqa: E402
from backend.config import DB_FILE, FALLBACK_GENRE      # noqa: E402

DEFAULT_OLD = Path(r"C:\Windows11\work\todo_app\data\tasks.db")

GENRE_EXPR = (
    "CASE WHEN {t}.project IS NULL OR {t}.project = '' THEN '%s' "
    "ELSE {t}.project END" % FALLBACK_GENRE
)


def table_exists(c: sqlite3.Connection, name: str) -> bool:
    return c.execute(
        "SELECT 1 FROM old.sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def main() -> int:
    old_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OLD
    if not old_path.is_file():
        print("旧DBが見つかりません: %s" % old_path)
        return 1

    db.init()

    with db.conn() as c:
        existing = c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        if existing:
            # 再実行すると重複投入される。INSERT OR IGNORE が効くのは
            # ジャンル・カテゴリだけで、タスク本体には効かない。
            print("tasks に既に %d 件あります。空のDBに対して実行してください。" % existing)
            print("やり直す場合は %s を削除してから実行します。" % DB_FILE)
            return 1

        c.execute("ATTACH DATABASE ? AS old", (str(old_path),))
        has_archive = table_exists(c, "tasks_archived")
        ts = db.now()

        # 1) 旧 project を暫定ジャンルとして取り込む
        union = "SELECT project FROM old.tasks"
        if has_archive:
            union += " UNION SELECT project FROM old.tasks_archived"
        c.execute(
            """
            INSERT OR IGNORE INTO genres (name, color, sort_order, created_at)
            SELECT DISTINCT %s, '#007AFF', 0, ?
            FROM (%s) AS x
            """ % (GENRE_EXPR.format(t="x"), union),
            (ts,),
        )

        # 2) 旧 category を対応ジャンル配下のカテゴリとして取り込む
        union2 = "SELECT project, category FROM old.tasks"
        if has_archive:
            union2 += " UNION SELECT project, category FROM old.tasks_archived"
        c.execute(
            """
            INSERT OR IGNORE INTO categories (genre_id, name, sort_order, created_at)
            SELECT DISTINCT g.id, x.category, 0, ?
            FROM (%s) AS x
            JOIN genres g ON g.name = %s
            WHERE x.category IS NOT NULL AND x.category != ''
            """ % (union2, GENRE_EXPR.format(t="x")),
            (ts,),
        )

        # 3) タスク本体を移送（文字列 → ID解決）
        c.execute(
            """
            INSERT INTO tasks (no, genre_id, category_id, content, result,
                               date_start, date_end, priority, status,
                               completed_at, created_at, updated_at)
            SELECT t.no, g.id, c2.id, t.content, COALESCE(t.result, ''),
                   COALESCE(t.date, ''), COALESCE(t.date_end, ''),
                   CASE WHEN COALESCE(t.priority, 0) = 0 THEN 0 ELSE 1 END,
                   CASE WHEN t.status = 'completed' THEN 'completed'
                        WHEN t.status = 'pending'   THEN 'pending'
                        ELSE 'active' END,
                   -- 旧DBに完了日時は無い。完了済みは updatedAt で代用する
                   CASE WHEN t.status = 'completed'
                        THEN COALESCE(t.updatedAt, t.createdAt, '') ELSE '' END,
                   COALESCE(t.createdAt, ?), COALESCE(t.updatedAt, t.createdAt, ?)
            FROM old.tasks t
            JOIN genres g ON g.name = %s
            LEFT JOIN categories c2 ON c2.genre_id = g.id AND c2.name = t.category
            WHERE t.content IS NOT NULL AND t.content != ''
            """ % GENRE_EXPR.format(t="t"),
            (ts, ts),
        )
        moved = c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]

        # 4) 旧アーカイブは完了タスクとして同じ tasks へ
        archived = 0
        if has_archive:
            c.execute(
                """
                INSERT INTO tasks (no, genre_id, category_id, content, result,
                                   date_start, date_end, priority, status,
                                   completed_at, created_at, updated_at)
                SELECT a.no, g.id, c2.id, a.content, COALESCE(a.result, ''),
                       COALESCE(a.date, ''), COALESCE(a.date_end, ''),
                       CASE WHEN COALESCE(a.priority, 0) = 0 THEN 0 ELSE 1 END,
                       'completed',
                       COALESCE(a.archivedAt, a.updatedAt, a.createdAt, ''),
                       COALESCE(a.createdAt, ?), COALESCE(a.updatedAt, a.createdAt, ?)
                FROM old.tasks_archived a
                JOIN genres g ON g.name = %s
                LEFT JOIN categories c2 ON c2.genre_id = g.id AND c2.name = a.category
                WHERE a.content IS NOT NULL AND a.content != ''
                """ % GENRE_EXPR.format(t="a"),
                (ts, ts),
            )
            archived = c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] - moved

        # 5) no を振り直す（3と4で重複しているため）
        c.execute(
            "UPDATE tasks SET no = (SELECT COUNT(*) FROM tasks t2 WHERE t2.id <= tasks.id)"
        )

        # 点検：日付の書式が混ざっていないか
        bad = c.execute(
            "SELECT COUNT(*) FROM tasks WHERE date_start != '' "
            "AND date_start NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"
        ).fetchone()[0]

        # DETACH はトランザクション中に実行できないため、先に確定させる
        c.commit()
        c.execute("DETACH DATABASE old")

    print("移行しました: タスク %d 件 / 旧アーカイブ %d 件" % (moved, archived))
    if bad:
        print("注意: 日付の書式が 'YYYY-MM-DD' でない行が %d 件あります。" % bad)
        print("      画面で開いて直すか、SQLで確認してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
