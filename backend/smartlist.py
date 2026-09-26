# -*- coding: utf-8 -*-
"""スマートリストの期間計算と抽出条件。

日付は 'YYYY-MM-DD' の文字列で保持しているため、辞書順比較が
そのまま日付比較になる。
"""

import calendar
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

# 画面に出す順。キー・ラベルは設計書 DB設計書 7章と対応する。
KEYS = (
    "overdue", "today", "tomorrow", "this-week", "next-week",
    "this-month", "next-month", "all", "flagged", "pending", "completed",
)

# 「保留」「実行済」はそのステータスを見るためのリストなので、
# 表示可否（show_pending / show_completed）を効かせない。
VISIBILITY_EXEMPT = ("pending", "completed")

# 終端日。date_end が空なら date_start を使う。
END_EXPR = "(CASE WHEN t.date_end = '' THEN t.date_start ELSE t.date_end END)"


def period_of(key: str, base: date) -> Optional[Tuple[date, date]]:
    """対象期間 [from, to] を返す。日付を持たないリストは None。"""
    if key == "today":
        return base, base
    if key == "tomorrow":
        d = base + timedelta(days=1)
        return d, d
    if key in ("this-week", "next-week"):
        monday = base - timedelta(days=base.weekday())   # 月曜始まり
        if key == "next-week":
            monday += timedelta(days=7)
        return monday, monday + timedelta(days=6)
    if key in ("this-month", "next-month"):
        y, m = base.year, base.month
        if key == "next-month":
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
    return None


def overlap_clause(prefix: str = "") -> str:
    """タスクの期間が [from, to] と重なる条件。

    date_start が空文字の行は必ず除外する。空文字はどの日付より
    辞書順で小さいため、除外しないと未設定タスクが全期間にヒットする。
    """
    return (
        "t.date_start != '' "
        "AND t.date_start <= :{p}to "
        "AND {end} >= :{p}from"
    ).format(p=prefix, end=END_EXPR)


def list_clause(key: str, base: date) -> Tuple[List[str], Dict[str, str]]:
    """スマートリストの WHERE 断片とパラメータを返す。"""
    if key == "all":
        return [], {}
    if key == "pending":
        return ["t.status = 'pending'"], {}
    if key == "completed":
        return ["t.status = 'completed'"], {}
    if key == "flagged":
        return ["t.priority = 1"], {}
    if key == "overdue":
        return (
            ["t.date_start != ''", "%s < :today" % END_EXPR],
            {"today": base.isoformat()},
        )

    period = period_of(key, base)
    if period is None:
        return [], {}
    return (
        [overlap_clause()],
        {"from": period[0].isoformat(), "to": period[1].isoformat()},
    )


def matches(task: dict, key: str, base: date) -> bool:
    """1件のタスクがそのリストに入るか（件数集計用）。

    SQLと同じ規則で書く。食い違うと一覧と件数がずれる。
    """
    if key == "all":
        return True
    if key == "pending":
        return task["status"] == "pending"
    if key == "completed":
        return task["status"] == "completed"
    if key == "flagged":
        return task["priority"] == 1

    start = task["date_start"]
    if not start:
        return False
    end = task["date_end"] or start

    if key == "overdue":
        return end < base.isoformat()

    period = period_of(key, base)
    if period is None:
        return True
    return start <= period[1].isoformat() and end >= period[0].isoformat()
