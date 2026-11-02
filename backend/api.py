# -*- coding: utf-8 -*-
"""js_api として公開するクラス。フロントの窓口。

pywebview の版によって例外の伝わり方が変わるため、例外に頼らない。
業務エラーは {"error": "..."} を戻り値として返し、JS側の薄いラッパー
（web/js/api.js）が throw する。
"""

import functools
import logging
import threading

import webview

from . import csv_import, db, repository, settings
from .config import (
    CALENDAR_HTML,
    CALENDAR_WINDOW,
    MIN_WINDOW,
    NOTIFY_HTML,
    NOTIFY_MARGIN,
    NOTIFY_WINDOW,
)
from .repository import Conflict, NotFound
from .settings import SettingsError

log = logging.getLogger(__name__)


class ApiError(Exception):
    """利用者に見せる業務エラー。"""


def public(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (ApiError, NotFound, Conflict, SettingsError) as e:
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
        self._notify = None      # 期限通知の小窓（出していなければ None）
        self._wake = threading.Event()   # 設定変更・終了で定期通知の待ちを起こす
        self._stopping = False

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

    def close_all(self) -> None:
        """メインを閉じたら、カレンダー・通知も道連れに閉じる。"""
        self._stopping = True
        self._wake.set()
        for name in ("_calendar", "_notify"):
            win = getattr(self, name)
            setattr(self, name, None)
            if win is not None:
                try:
                    win.destroy()
                except Exception:
                    pass

    # ---------- 期限通知 ----------

    def start_notifier(self) -> None:
        """webview.start から呼ぶ。起動時の通知を出し、定期通知のスレッドを回す。"""
        if settings.get("notify_on_startup"):
            self.show_due_notification()
        threading.Thread(target=self._notify_loop, name="notifier", daemon=True).start()

    def _notify_loop(self) -> None:
        """設定の間隔ごとに通知する。間隔は毎回読み直す。

        設定を保存すると _wake で起こされ、その時点から数え直す。
        """
        while not self._stopping:
            try:
                minutes = settings.get("notify_interval_min")
            except Exception:
                log.exception("通知間隔の読み込みに失敗した")
                minutes = 0
            woke = self._wake.wait(minutes * 60 if minutes > 0 else None)
            self._wake.clear()
            if self._stopping:
                return
            if not woke:
                self.show_due_notification()

    def show_due_notification(self) -> None:
        """期限が来ているタスクがあれば、画面右下に通知の小窓を出す。

        最小化中でも見えるよう、メインとは別の最前面・枠なしウィンドウにする。
        フォーカスは奪わない。既に出ていれば中身を読み直すだけにする。
        """
        try:
            if not repository.due_tasks(settings.get("notify_include_today")):
                return
        except Exception:
            log.exception("期限タスクの取得に失敗した")
            return

        if self._notify is not None:
            try:
                self._notify.evaluate_js("window.reloadNotify && window.reloadNotify()")
                return
            except Exception:
                self._notify = None     # 既に閉じられている

        width, height = NOTIFY_WINDOW
        x, y = _bottom_right(width, height)
        win = webview.create_window(
            "期限のお知らせ",
            str(NOTIFY_HTML),
            js_api=self,
            width=width,
            height=height,
            x=x,
            y=y,
            resizable=False,
            frameless=True,
            easy_drag=False,
            on_top=True,
            focus=False,
        )
        win.events.closed += self._forget_notify
        self._notify = win

    def _forget_notify(self):
        self._notify = None

    @public
    def due_tasks(self):
        return {
            "tasks": repository.due_tasks(settings.get("notify_include_today")),
            "auto_close_sec": settings.get("notify_auto_close_sec"),
        }

    @public
    def test_notification(self):
        """設定画面の「いま通知する」。対象が無ければそう返す。"""
        if not repository.due_tasks(settings.get("notify_include_today")):
            return {"shown": False}
        self.show_due_notification()
        return {"shown": True}

    # ---------- 設定 ----------

    @public
    def get_settings(self):
        return {"values": settings.get_all(), "defaults": settings.defaults_info()}

    @public
    def save_settings(self, body):
        values = settings.save(body or {})
        self._wake.set()                # 通知間隔を新しい値で数え直す
        return {"values": values, "defaults": settings.defaults_info()}

    @public
    def backup_now(self):
        path = db.backup(settings.backup_dir(), settings.get("backup_keep"))
        if path is None:
            raise ApiError("データベースが見つかりません")
        return {"path": str(path)}

    @public
    def choose_folder(self, current=""):
        """フォルダ選択ダイアログ。取り消したら空文字。"""
        win = self._main
        if win is None:
            raise ApiError("メインウィンドウが見つかりません")
        result = win.create_file_dialog(webview.FileDialog.FOLDER, directory=current or "")
        if not result:
            return {"path": ""}
        return {"path": result[0] if isinstance(result, (list, tuple)) else str(result)}

    @public
    def close_notify(self):
        win, self._notify = self._notify, None
        if win is not None:
            try:
                win.destroy()
            except Exception:
                pass
        return {"ok": True}

    @public
    def focus_task(self, task_id):
        """カレンダーのバーから、メインウィンドウでそのタスクを開く。"""
        task_id = int(task_id)
        repository.get_task(task_id)      # 無ければここで NotFound
        if self._main is None:
            raise ApiError("メインウィンドウが見つかりません")
        if _is_minimized(self._main):
            self._main.restore()          # 最大化中に restore すると戻ってしまうので最小化時だけ
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
    def bulk_update_tasks(self, ids, body):
        """一覧の一括変更モードの「完了」。"""
        ids = list(ids or [])
        body = {k: v for k, v in (body or {}).items()
                if k in ("date_start", "date_end", "priority",
                         "genre_id", "category_id", "status")}
        if not ids:
            raise ApiError("タスクを選択してください")
        if not body:
            raise ApiError("変更する項目を指定してください")
        if "date_end" in body and "date_start" not in body:
            raise ApiError("期限は開始日と合わせて指定してください")
        if "genre_id" in body:
            _require_genre(body)
        _check_dates(body)
        _check_status(body)
        return {"updated": repository.bulk_update(ids, body)}

    @public
    def reorder_tasks(self, ids):
        repository.reorder_tasks(list(ids or []))
        return {"ok": True}

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


def _bottom_right(width, height):
    """通知窓を置く位置（論理ピクセル）。タスクバーを避けて作業領域の右下に置く。"""
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        rect = wintypes.RECT()
        user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)   # SPI_GETWORKAREA
        # 作業領域は物理ピクセルで返るが、pywebview の x, y は論理ピクセル
        scale = user32.GetDpiForSystem() / 96.0 or 1.0
        right, bottom = rect.right / scale, rect.bottom / scale
    except Exception:
        screen = webview.screens[0]
        right, bottom = screen.width, screen.height - 48
    return int(right - width - NOTIFY_MARGIN), int(bottom - height - NOTIFY_MARGIN)


def _is_minimized(window) -> bool:
    try:
        import ctypes
        return bool(ctypes.windll.user32.IsIconic(window.native.Handle.ToInt32()))
    except Exception:
        return False
