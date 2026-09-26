# -*- coding: utf-8 -*-
"""絞り込み条件 → WHERE句の組み立て。

値は必ずプレースホルダで渡す。文字列連結でWHERE句を作らない。
"""

from typing import Dict, List, Tuple

from .smartlist import END_EXPR


def hidden_statuses(params: dict) -> List[str]:
    """既定で隠すステータス。

    既定は未完了だけを見せ、チェックを入れたぶんだけ足していく。
    """
    hidden = []
    if str(params.get("show_pending", "")) != "1":
        hidden.append("pending")
    if str(params.get("show_completed", "")) != "1":
        hidden.append("completed")
    return hidden


def build(params: dict, apply_visibility: bool = True) -> Tuple[List[str], Dict[str, object]]:
    """絞り込み条件から WHERE 句の断片とパラメータ辞書を作る。

    apply_visibility=False は「保留」「実行済」リスト用。そのステータスを
    見るためのリストなので表示可否を効かせない。
    """
    clauses: List[str] = []
    args: Dict[str, object] = {}

    if params.get("q"):
        clauses.append("(t.content LIKE :q OR t.result LIKE :q)")
        args["q"] = "%%%s%%" % params["q"]

    if apply_visibility:
        hidden = hidden_statuses(params)
        if hidden:
            keys = [":hide%d" % i for i in range(len(hidden))]
            clauses.append("t.status NOT IN (%s)" % ", ".join(keys))
            for k, v in zip(keys, hidden):
                args[k[1:]] = v

    for key in ("genre_id", "category_id", "priority"):
        value = params.get(key)
        if value not in (None, ""):
            clauses.append("t.%s = :%s" % (key, key))
            args[key] = int(value)

    # 期限の範囲。2入力で1条件。片方だけでも成立させる。
    due_from = params.get("due_from") or ""
    due_to = params.get("due_to") or ""
    if due_from or due_to:
        clauses.append("t.date_start != ''")       # 期限なしは常に対象外
        if due_to:
            clauses.append("t.date_start <= :due_to")
            args["due_to"] = due_to
        if due_from:
            clauses.append("%s >= :due_from" % END_EXPR)
            args["due_from"] = due_from

    return clauses, args


def visible(task: dict, params: dict) -> bool:
    """1件が表示可否を通るか（件数集計用）。build と同じ規則。"""
    return task["status"] not in hidden_statuses(params)
