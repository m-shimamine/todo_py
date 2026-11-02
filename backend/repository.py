# -*- coding: utf-8 -*-
"""SQL実行層。

API境界に出す形（priority を bool に、NULL を '' に）への変換もここで行う。
"""

import sqlite3
from datetime import date
from typing import Dict, List, Optional

from . import filters, smartlist
from .config import FALLBACK_GENRE, GENRE_PALETTE, STATUSES
from .db import conn, now, today

SELECT_TASK = """
SELECT t.id, t.no, t.genre_id, g.name AS genre_name, g.color AS genre_color,
       t.category_id, COALESCE(c.name, '') AS category_name,
       t.content, t.result, t.date_start, t.date_end,
       t.priority, t.status, t.completed_at, t.created_at, t.updated_at
FROM tasks t
JOIN genres g ON g.id = t.genre_id
LEFT JOIN categories c ON c.id = t.category_id
"""

# 未完了 → 保留 → 完了 の順。その中では no 昇順。
ORDER_DEFAULT = (
    "ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, "
    "t.no ASC"
)
# 「実行済」だけは最近終えた順
ORDER_COMPLETED = "ORDER BY t.completed_at DESC, t.no DESC"


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


def _task(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["priority"] = d["priority"] == 1     # API境界では bool
    return d


def _where(clauses: List[str]) -> str:
    return ("WHERE " + " AND ".join(clauses)) if clauses else ""


# ============================================================
# タスク
# ============================================================

def find_tasks(params: Optional[dict] = None) -> List[dict]:
    params = params or {}
    key = params.get("list") or "all"
    base = date.fromisoformat(today())

    exempt = key in smartlist.VISIBILITY_EXEMPT
    clauses, args = filters.build(params, apply_visibility=not exempt)
    lc, la = smartlist.list_clause(key, base)
    clauses += lc
    args.update(la)

    order = ORDER_COMPLETED if key == "completed" else ORDER_DEFAULT
    sql = "%s %s %s" % (SELECT_TASK, _where(clauses), order)

    with conn() as c:
        return [_task(r) for r in c.execute(sql, args)]


def get_task(task_id: int) -> dict:
    with conn() as c:
        row = c.execute("%s WHERE t.id = :id" % SELECT_TASK, {"id": task_id}).fetchone()
    if row is None:
        raise NotFound("タスクが見つかりません")
    return _task(row)


def _completed_at(status: str, previous: Optional[dict]) -> str:
    """完了でなかったものが完了になった瞬間にだけ打つ。

    既に完了のものを編集保存しただけで打ち直すと、「実行済」の並びが
    編集順になってしまい、いつ終えたか分からなくなる。
    """
    if status != "completed":
        return ""
    if previous and previous["status"] == "completed" and previous["completed_at"]:
        return previous["completed_at"]
    return now()


def create_task(body: dict) -> dict:
    ts = now()
    status = body.get("status") or "active"
    with conn() as c:
        no = c.execute("SELECT COALESCE(MAX(no), 0) + 1 FROM tasks").fetchone()[0]
        cur = c.execute(
            """
            INSERT INTO tasks (no, genre_id, category_id, content, result,
                               date_start, date_end, priority, status,
                               completed_at, created_at, updated_at)
            VALUES (:no, :genre_id, :category_id, :content, :result,
                    :date_start, :date_end, :priority, :status,
                    :completed_at, :created_at, :updated_at)
            """,
            {
                "no": no,
                "genre_id": int(body["genre_id"]),
                "category_id": body.get("category_id") or None,
                "content": body["content"].strip(),
                "result": body.get("result") or "",
                "date_start": body.get("date_start") or "",
                "date_end": body.get("date_end") or "",
                "priority": 1 if body.get("priority") else 0,
                "status": status,
                "completed_at": _completed_at(status, None),
                "created_at": ts,
                "updated_at": ts,
            },
        )
        new_id = cur.lastrowid
        row = c.execute("%s WHERE t.id = :id" % SELECT_TASK, {"id": new_id}).fetchone()
    return _task(row)


UPDATABLE = (
    "genre_id", "category_id", "content", "result",
    "date_start", "date_end", "priority", "status",
)


def update_task(task_id: int, body: dict) -> dict:
    previous = get_task(task_id)

    sets, args = [], {"id": task_id}
    for key in UPDATABLE:
        if key not in body:
            continue
        value = body[key]
        if key == "priority":
            value = 1 if value else 0
        elif key == "category_id":
            value = int(value) if value else None
        elif key == "genre_id":
            value = int(value)
        elif value is None:
            value = ""
        sets.append("%s = :%s" % (key, key))
        args[key] = value

    status = body.get("status", previous["status"])
    if "status" in body or "completed_at" in body:
        sets.append("completed_at = :completed_at")
        args["completed_at"] = _completed_at(status, previous)

    sets.append("updated_at = :updated_at")
    args["updated_at"] = now()

    with conn() as c:
        c.execute("UPDATE tasks SET %s WHERE id = :id" % ", ".join(sets), args)
        row = c.execute("%s WHERE t.id = :id" % SELECT_TASK, {"id": task_id}).fetchone()
    return _task(row)


def bulk_update(ids: List[int], body: dict) -> int:
    """選んだタスクにまとめて同じ変更をかける。1トランザクションで行い、
    途中で不正があれば全件取り消す。変更した件数を返す。

    body に入っている項目だけ変える（入っていない項目は各タスクのまま）。
      date_start / date_end : 2つで1組。date_start が空なら期限なしにする
      priority              : bool
      genre_id              : ジャンルを変えると、合わないカテゴリは外す
      category_id           : None でカテゴリなし。結果のジャンルに属すること
      status                : 'active' | 'pending' | 'completed'
    """
    ids = [int(i) for i in ids]
    if not ids:
        return 0
    ts = now()

    with conn() as c:
        cat_genre = {r["id"]: r["genre_id"]
                     for r in c.execute("SELECT id, genre_id FROM categories")}

        if "genre_id" in body:
            if c.execute("SELECT 1 FROM genres WHERE id = ?",
                         (int(body["genre_id"]),)).fetchone() is None:
                raise NotFound("ジャンルが見つかりません")

        for task_id in ids:
            row = c.execute("%s WHERE t.id = :id" % SELECT_TASK, {"id": task_id}).fetchone()
            if row is None:
                raise NotFound("タスクが見つかりません（ID %d）" % task_id)
            prev = dict(row)
            sets = {"updated_at": ts}

            genre_id = prev["genre_id"]
            if "genre_id" in body:
                genre_id = int(body["genre_id"])
                sets["genre_id"] = genre_id

            if "category_id" in body:
                cid = int(body["category_id"]) if body["category_id"] else None
                if cid is not None and cat_genre.get(cid) != genre_id:
                    raise Conflict("選んだカテゴリはジャンルが合わないタスクがあります")
                sets["category_id"] = cid
            elif prev["category_id"] and cat_genre.get(prev["category_id"]) != genre_id:
                sets["category_id"] = None      # ジャンルを移したので外す

            if "date_start" in body:
                start = body.get("date_start") or ""
                sets["date_start"] = start
                sets["date_end"] = (body.get("date_end") or "") if start else ""

            if "priority" in body:
                sets["priority"] = 1 if body["priority"] else 0

            if "status" in body:
                sets["status"] = body["status"]
                sets["completed_at"] = _completed_at(body["status"], prev)

            c.execute(
                "UPDATE tasks SET %s WHERE id = :id"
                % ", ".join("%s = :%s" % (k, k) for k in sets),
                dict(sets, id=task_id),
            )
    return len(ids)


def reorder_tasks(ids: List[int]) -> None:
    """表示中のタスクを ids の順に並べ替える。

    一覧は絞り込まれているので 1..n を振り直すと、表示していない
    タスクとの前後関係が崩れる。渡されたタスクがいま持っている no を
    小さい順に取り、それを ids の順に配り直す（入れ替えるだけ）。
    """
    ids = [int(i) for i in ids]
    if not ids:
        return
    with conn() as c:
        marks = ",".join("?" * len(ids))
        nos = sorted(
            r[0] for r in c.execute("SELECT no FROM tasks WHERE id IN (%s)" % marks, ids)
        )
        if len(nos) != len(ids):
            raise NotFound("タスクが見つかりません")
        c.executemany(
            "UPDATE tasks SET no = ? WHERE id = ?",
            list(zip(nos, ids)),
        )


def delete_task(task_id: int) -> dict:
    task = get_task(task_id)
    with conn() as c:
        c.execute("DELETE FROM tasks WHERE id = :id", {"id": task_id})
    return task


def delete_completed(before: str = "") -> int:
    """完了タスクの一括削除。before を渡すとそれ以前に完了した分だけ。"""
    with conn() as c:
        if before:
            cur = c.execute(
                "DELETE FROM tasks WHERE status = 'completed' "
                "AND completed_at != '' AND completed_at < :before",
                {"before": before},
            )
        else:
            cur = c.execute("DELETE FROM tasks WHERE status = 'completed'")
        return cur.rowcount


def calendar_tasks(params: dict) -> List[dict]:
    """期間が from〜to と重なるタスク。date_start が空のものは除外。"""
    clauses = [smartlist.overlap_clause()]
    args = {"from": params["from"], "to": params["to"]}

    if params.get("genre_id"):
        clauses.append("t.genre_id = :genre_id")
        args["genre_id"] = int(params["genre_id"])
    if params.get("status"):
        clauses.append("t.status = :status")
        args["status"] = params["status"]

    sql = "%s %s ORDER BY t.date_start ASC, t.no ASC" % (SELECT_TASK, _where(clauses))
    with conn() as c:
        return [_task(r) for r in c.execute(sql, args)]


def due_tasks(include_today: bool = True) -> List[dict]:
    """期限が来ている未完了タスク。通知用。

    include_today=False なら遅延（終端日が昨日以前）だけ。
    保留・実行済は対象外。期限の古い順。
    """
    op = "<=" if include_today else "<"
    sql = "%s WHERE t.status = 'active' AND t.date_start != '' AND %s %s :today "           "ORDER BY %s ASC, t.no ASC" % (SELECT_TASK, smartlist.END_EXPR, op, smartlist.END_EXPR)
    with conn() as c:
        return [_task(r) for r in c.execute(sql, {"today": today()})]


def counts(params: Optional[dict] = None) -> dict:
    """スマートリスト・ジャンル・カテゴリの件数をまとめて返す。

    一覧と同じ規則で数える必要があるため表示可否を受け取る。
    数が食い違うと数字の方が信用されなくなる。
    """
    params = params or {}
    base = date.fromisoformat(today())

    with conn() as c:
        rows = [
            dict(r)
            for r in c.execute(
                "SELECT id, genre_id, category_id, date_start, date_end, "
                "priority, status FROM tasks"
            )
        ]

    visible = [r for r in rows if filters.visible(r, params)]

    lists = {}
    for key in smartlist.KEYS:
        source = rows if key in smartlist.VISIBILITY_EXEMPT else visible
        lists[key] = sum(1 for r in source if smartlist.matches(r, key, base))

    genres: Dict[str, int] = {}
    categories: Dict[str, int] = {}
    for r in visible:
        gid = str(r["genre_id"])
        genres[gid] = genres.get(gid, 0) + 1
        if r["category_id"]:
            cid = str(r["category_id"])
            categories[cid] = categories.get(cid, 0) + 1

    return {"lists": lists, "genres": genres, "categories": categories, "today": today()}


# ============================================================
# ジャンル・カテゴリ
# ============================================================

def list_genres(with_categories: bool = False) -> List[dict]:
    with conn() as c:
        genres = [
            dict(r)
            for r in c.execute(
                "SELECT id, name, color, sort_order FROM genres "
                "ORDER BY sort_order ASC, id ASC"
            )
        ]
        if not with_categories:
            return genres

        cats = [
            dict(r)
            for r in c.execute(
                "SELECT id, genre_id, name, sort_order FROM categories "
                "ORDER BY sort_order ASC, id ASC"
            )
        ]

    by_genre: Dict[int, List[dict]] = {}
    for cat in cats:
        by_genre.setdefault(cat["genre_id"], []).append(cat)
    for g in genres:
        g["categories"] = by_genre.get(g["id"], [])
    return genres


def create_genre(name: str, color: str = "") -> dict:
    with conn() as c:
        n = c.execute("SELECT COUNT(*) FROM genres").fetchone()[0]
        if not color:
            color = GENRE_PALETTE[n % len(GENRE_PALETTE)]
        try:
            cur = c.execute(
                "INSERT INTO genres (name, color, sort_order, created_at) "
                "VALUES (?, ?, ?, ?)",
                (name, color, n + 1, now()),
            )
        except sqlite3.IntegrityError:
            raise Conflict("同じ名前のジャンルがあります")
        row = c.execute(
            "SELECT id, name, color, sort_order FROM genres WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(row)


def update_genre(genre_id: int, body: dict) -> dict:
    sets, args = [], {"id": genre_id}
    for key in ("name", "color"):
        if body.get(key):
            sets.append("%s = :%s" % (key, key))
            args[key] = body[key]
    if not sets:
        return get_genre(genre_id)

    with conn() as c:
        if c.execute("SELECT 1 FROM genres WHERE id = :id", {"id": genre_id}).fetchone() is None:
            raise NotFound("ジャンルが見つかりません")
        try:
            c.execute("UPDATE genres SET %s WHERE id = :id" % ", ".join(sets), args)
        except sqlite3.IntegrityError:
            raise Conflict("同じ名前のジャンルがあります")
    return get_genre(genre_id)


def get_genre(genre_id: int) -> dict:
    with conn() as c:
        row = c.execute(
            "SELECT id, name, color, sort_order FROM genres WHERE id = ?", (genre_id,)
        ).fetchone()
    if row is None:
        raise NotFound("ジャンルが見つかりません")
    return dict(row)


def count_tasks_of_genre(genre_id: int) -> int:
    with conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM tasks WHERE genre_id = ?", (genre_id,)
        ).fetchone()[0]


def delete_genre(genre_id: int) -> None:
    """配下カテゴリは CASCADE で消える。タスクが残っていれば RESTRICT で失敗する。"""
    with conn() as c:
        if c.execute("SELECT 1 FROM genres WHERE id = ?", (genre_id,)).fetchone() is None:
            raise NotFound("ジャンルが見つかりません")
        try:
            c.execute("DELETE FROM genres WHERE id = ?", (genre_id,))
        except sqlite3.IntegrityError:
            raise Conflict("このジャンルにはタスクが残っています")


def reorder_genres(ids: List[int]) -> None:
    with conn() as c:
        c.executemany(
            "UPDATE genres SET sort_order = ? WHERE id = ?",
            [(i + 1, int(gid)) for i, gid in enumerate(ids)],
        )


def reorder_categories(genre_id: int, ids: List[int]) -> None:
    """同一ジャンル配下の並び順を一括更新する。

    genre_id を条件に入れて、他ジャンルのカテゴリIDを渡されても
    書き換わらないようにする。
    """
    with conn() as c:
        c.executemany(
            "UPDATE categories SET sort_order = ? WHERE id = ? AND genre_id = ?",
            [(i + 1, int(cid), genre_id) for i, cid in enumerate(ids)],
        )


def list_categories(genre_id: int) -> List[dict]:
    with conn() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT id, genre_id, name, sort_order FROM categories "
                "WHERE genre_id = ? ORDER BY sort_order ASC, id ASC",
                (genre_id,),
            )
        ]


def create_category(genre_id: int, name: str) -> dict:
    with conn() as c:
        if c.execute("SELECT 1 FROM genres WHERE id = ?", (genre_id,)).fetchone() is None:
            raise NotFound("ジャンルが見つかりません")
        n = c.execute(
            "SELECT COUNT(*) FROM categories WHERE genre_id = ?", (genre_id,)
        ).fetchone()[0]
        try:
            cur = c.execute(
                "INSERT INTO categories (genre_id, name, sort_order, created_at) "
                "VALUES (?, ?, ?, ?)",
                (genre_id, name, n + 1, now()),
            )
        except sqlite3.IntegrityError:
            raise Conflict("このジャンルに同じカテゴリがあります")
        row = c.execute(
            "SELECT id, genre_id, name, sort_order FROM categories WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(row)


def update_category(category_id: int, name: str) -> dict:
    with conn() as c:
        if c.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone() is None:
            raise NotFound("カテゴリが見つかりません")
        try:
            c.execute(
                "UPDATE categories SET name = ? WHERE id = ?", (name, category_id)
            )
        except sqlite3.IntegrityError:
            raise Conflict("このジャンルに同じカテゴリがあります")
        row = c.execute(
            "SELECT id, genre_id, name, sort_order FROM categories WHERE id = ?",
            (category_id,),
        ).fetchone()
    return dict(row)


def count_tasks_of_category(category_id: int) -> int:
    with conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM tasks WHERE category_id = ?", (category_id,)
        ).fetchone()[0]


def delete_category(category_id: int) -> None:
    """該当タスクの category_id は SET NULL で「なし」になる。"""
    with conn() as c:
        if c.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone() is None:
            raise NotFound("カテゴリが見つかりません")
        c.execute("DELETE FROM categories WHERE id = ?", (category_id,))


# ============================================================
# CSV取込が使う補助
# ============================================================

def genre_id_by_name(c: sqlite3.Connection, name: str) -> int:
    """無ければ作る。"""
    name = (name or "").strip() or FALLBACK_GENRE
    row = c.execute("SELECT id FROM genres WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    n = c.execute("SELECT COUNT(*) FROM genres").fetchone()[0]
    cur = c.execute(
        "INSERT INTO genres (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)",
        (name, GENRE_PALETTE[n % len(GENRE_PALETTE)], n + 1, now()),
    )
    return cur.lastrowid


def category_id_by_name(c: sqlite3.Connection, genre_id: int, name: str):
    """無ければ作る。空欄なら None。"""
    name = (name or "").strip()
    if not name:
        return None
    row = c.execute(
        "SELECT id FROM categories WHERE genre_id = ? AND name = ?", (genre_id, name)
    ).fetchone()
    if row:
        return row["id"]
    n = c.execute(
        "SELECT COUNT(*) FROM categories WHERE genre_id = ?", (genre_id,)
    ).fetchone()[0]
    cur = c.execute(
        "INSERT INTO categories (genre_id, name, sort_order, created_at) "
        "VALUES (?, ?, ?, ?)",
        (genre_id, name, n + 1, now()),
    )
    return cur.lastrowid


def normalize_status(value: str) -> str:
    value = (value or "").strip()
    if value in ("完了", "completed"):
        return "completed"
    if value in ("保留", "pending"):
        return "pending"
    return "active"


def valid_status(value: str) -> bool:
    return value in STATUSES
