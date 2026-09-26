# -*- coding: utf-8 -*-
"""js_api として公開するクラス。フロントの窓口。

pywebview の版によって例外の伝わり方が変わるため、例外に頼らない。
業務エラーは {"error": "..."} を戻り値として返し、JS側の薄いラッパー
（web/js/api.js）が throw する。
"""

import functools
import logging

import webview

from . import csv_import, repository
from .config import CALENDAR_HTML, CALENDAR_WINDOW, MIN_WINDOW
from .repository import Conflict, NotFound

log = logging.getLogger(__name__)


class ApiError(Exception):
    """利用者に見せる業務エラー。"""


def public(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (ApiError, NotFound, Conflict) as e:
            return {"error": str(e)}
        except Exception:
            log.exception("%s failed", fn.__name__)
            return {"error": "処理に失敗しました"}
    return wrapper


def _require_content(body):
    if not (body.get("content") or "").strip():
        raise ApiError("タスク内容を入力してください")


def _require_genre(body):
    if not body.get("genre_id"):
        raise ApiError("ジャンルを選択してください")


def _check_dates(body):
    s, e = body.get("date_start") or "", body.get("date_end") or ""
    if s and e and s > e:
        raise ApiError("終了日は開始日以降にしてください")


def _check_status(body):
    if "status" in body and not repository.valid_status(body["status"]):
        raise ApiError("ステータスの値が不正です")


class Api:
    def __init__(self):
        self._main = None        # メインウィンドウ
        self._calendar = None    # カレンダーウィンドウ（開いていなければ None）

    def set_main_window(self, window) -> None:
        """app.py から渡す。カレンダーからタスクを開くときに使う。"""
        self._main = window

    # ---------- ウィンドウ ----------

    @public
    def open_calendar(self):
        """カレンダーを別ウィンドウで開く。既に開いていれば前面に出す。"""
        if self._calendar is not None:
            try:
                self._calendar.show()
                return {"ok": True, "reused": True}
            except Exception:
                self._calendar = None   # 既に閉じられている

        win = webview.create_window(
            "カレンダー",
            str(CALENDAR_HTML),
            js_api=self,                # 同じ Api を共有する
            width=CALENDAR_WINDOW[0],
            height=CALENDAR_WINDOW[1],
            min_size=MIN_WINDOW,
        )
        win.events.closed += self._forget_calendar
        self._calendar = win
        return {"ok": True}

    @public
    def close_calendar(self):
        win, self._calendar = self._calendar, None
        if win is not None:
            try:
                win.destroy()
            except Exception:
                pass
        return {"ok": True}

    def _forget_calendar(self):
        self._calendar = None

    @public
    def focus_task(self, task_id):
        """カレンダーのバーから、メインウィンドウでそのタスクを開く。"""
        task_id = int(task_id)
        repository.get_task(task_id)      # 無ければここで NotFound
        if self._main is None:
            raise ApiError("メインウィンドウが見つかりません")
        self._main.show()
        self._main.evaluate_js("window.openTaskById && window.openTaskById(%d)" % task_id)
        return {"ok": True}

    # ---------- タスク ----------

    @public
    def list_tasks(self, params=None):
        return repository.find_tasks(params or {})

    @public
    def get_task(self, task_id):
        return repository.get_task(int(task_id))

    @public
    def create_task(self, body):
        body = body or {}
        _require_content(body)
        _require_genre(body)
        _check_dates(body)
        _check_status(body)
        return repository.create_task(body)

    @public
    def update_task(self, task_id, body):
        body = body or {}
        if "content" in body:
            _require_content(body)
        if "genre_id" in body:
            _require_genre(body)
        _check_dates(body)
        _check_status(body)
        return repository.update_task(int(task_id), body)

    @public
    def delete_task(self, task_id):
        return repository.delete_task(int(task_id))

    @public
    def delete_completed(self, before=""):
        return {"deleted": repository.delete_completed(before or "")}

    @public
    def calendar_tasks(self, params):
        params = params or {}
        if not params.get("from") or not params.get("to"):
            raise ApiError("期間の指定が必要です")
        return repository.calendar_tasks(params)

    @public
    def counts(self, params=None):
        return repository.counts(params or {})

    # ---------- ジャンル・カテゴリ ----------

    @public
    def list_genres(self, with_categories=False):
        return repository.list_genres(bool(with_categories))

    @public
    def create_genre(self, name, color=""):
        name = (name or "").strip()
        if not name:
            raise ApiError("ジャンル名を入力してください")
        return repository.create_genre(name, color or "")

    @public
    def update_genre(self, genre_id, body):
        body = body or {}
        if "name" in body and not (body.get("name") or "").strip():
            raise ApiError("ジャンル名を入力してください")
        return repository.update_genre(int(genre_id), body)

    @public
    def delete_genre(self, genre_id):
        genre_id = int(genre_id)
        remaining = repository.count_tasks_of_genre(genre_id)
        if remaining:
            # DB側は ON DELETE RESTRICT。先に件数を見て文言を出す。
            raise ApiError("このジャンルにタスクが%d件残っています" % remaining)
        repository.delete_genre(genre_id)
        return {"ok": True}

    @public
    def reorder_genres(self, ids):
        repository.reorder_genres(list(ids or []))
        return {"ok": True}

    @public
    def reorder_categories(self, genre_id, ids):
        repository.reorder_categories(int(genre_id), list(ids or []))
        return {"ok": True}

    @public
    def list_categories(self, genre_id):
        return repository.list_categories(int(genre_id))

    @public
    def create_category(self, genre_id, name):
        name = (name or "").strip()
        if not name:
            raise ApiError("カテゴリ名を入力してください")
        return repository.create_category(int(genre_id), name)

    @public
    def update_category(self, category_id, name):
        name = (name or "").strip()
        if not name:
            raise ApiError("カテゴリ名を入力してください")
        return repository.update_category(int(category_id), name)

    @public
    def count_tasks_of_category(self, category_id):
        return {"count": repository.count_tasks_of_category(int(category_id))}

    @public
    def delete_category(self, category_id):
        repository.delete_category(int(category_id))
        return {"ok": True}

    # ---------- インポート ----------

    @public
    def import_csv(self):
        return csv_import.import_from_temp()
