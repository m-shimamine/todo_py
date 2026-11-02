# -*- coding: utf-8 -*-
"""エントリポイント。

HTTPサーバは立てない。pywebview の js_api でプロセス内呼び出しにするため、
ポートもバインドも存在せず、ブラウザから開ける経路もない。
"""

import logging
import sys

import webview

from backend import csv_import, db, settings
from backend.api import Api
from backend.config import (
    FIRST_WINDOW,
    INDEX_HTML,
    INSTANCE_MUTEX,
    LOG_FILE,
    MAIN_TITLE,
    MIN_WINDOW,
    SCREEN_MARGIN,
)

WINDOW_SIZE_KEY = "window_size"

# resized イベントで受け取った最新サイズ。終了時にこれを保存する。
_last_size = None

# 二重起動防止のミューテックス。プロセスが終わるまで握り続ける。
_mutex = None


def setup_logging() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(LOG_FILE),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        encoding="utf-8",
    )


def _acquire_single_instance() -> bool:
    """既に起動していれば False。そのときは既存のメインウィンドウを前面に出す。"""
    global _mutex
    try:
        import ctypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        user32 = ctypes.windll.user32
    except Exception:
        return True                     # Windows 以外では見ない

    ERROR_ALREADY_EXISTS = 183
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    _mutex = kernel32.CreateMutexW(None, False, INSTANCE_MUTEX)
    if ctypes.get_last_error() != ERROR_ALREADY_EXISTS:
        return True

    hwnd = user32.FindWindowW(None, MAIN_TITLE)
    if hwnd:
        SW_RESTORE = 9
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        user32.SetForegroundWindow(hwnd)
    return False


def _primary_screen():
    """主画面（原点にある画面）のサイズ。取れなければ None。"""
    try:
        screens = list(webview.screens)
    except Exception:
        return None
    if not screens:
        return None
    for s in screens:
        if getattr(s, "x", 0) == 0 and getattr(s, "y", 0) == 0:
            return s.width, s.height
    return screens[0].width, screens[0].height


def _initial_size():
    """初回はスマホ相当。2回目以降は前回のサイズを復元する。"""
    saved = db.get_meta(WINDOW_SIZE_KEY, "")
    if not saved:
        return FIRST_WINDOW

    try:
        width, height = (int(v) for v in saved.split("x", 1))
    except ValueError:
        logging.warning("保存されたウィンドウサイズが読めない: %r", saved)
        return FIRST_WINDOW

    # 画面構成が変わって収まらなくなっている場合に備えて丸める。
    # 前の環境の大きさをそのまま復元すると画面外に出ることがある。
    screen = _primary_screen()
    if screen:
        width = min(width, screen[0] - SCREEN_MARGIN)
        height = min(height, screen[1] - SCREEN_MARGIN)
    width = max(width, MIN_WINDOW[0])
    height = max(height, MIN_WINDOW[1])
    return width, height


def _on_resized(width, height):
    global _last_size
    _last_size = (int(width), int(height))


def _save_size() -> None:
    if not _last_size:
        return
    width, height = _last_size
    if width < MIN_WINDOW[0] or height < MIN_WINDOW[1]:
        return                      # 最小化直後などの異常値は保存しない
    try:
        db.set_meta(WINDOW_SIZE_KEY, "%dx%d" % (width, height))
    except Exception:
        logging.exception("ウィンドウサイズの保存に失敗した")


def _backup_on_startup() -> None:
    """起動時のバックアップ。失敗しても起動は止めない。"""
    try:
        if not settings.get("backup_enabled"):
            return
        path = db.backup(settings.backup_dir(), settings.get("backup_keep"))
        if path:
            logging.info("バックアップを作成した: %s", path)
    except Exception:
        logging.exception("起動時のバックアップに失敗した")


def main() -> int:
    if not _acquire_single_instance():
        return 0

    db.init()                   # DDL適用・スキーマ版確認・初期ジャンル投入
    setup_logging()
    _backup_on_startup()        # 設定のフォルダへ世代バックアップ

    try:
        result = csv_import.import_from_temp()
        if result["imported"]:
            logging.info("起動時に %d 件を取り込んだ", result["imported"])
    except Exception:
        logging.exception("起動時のCSV取込に失敗した")

    if not INDEX_HTML.exists():
        print("web/index.html が見つかりません: %s" % INDEX_HTML, file=sys.stderr)
        return 1

    api = Api()
    width, height = _initial_size()
    window = webview.create_window(
        MAIN_TITLE,
        str(INDEX_HTML),        # file:// で読む（HTTPではない）
        js_api=api,
        width=width,
        height=height,
        min_size=MIN_WINDOW,    # これ以下には縮められない
    )
    window.events.resized += _on_resized
    window.events.closed += api.close_all   # メインを閉じたらカレンダー・通知も閉じる
    api.set_main_window(window)   # カレンダーからタスクを開くのに使う

    # 期限通知は GUI が動き出してから出す（DPI 設定が済んでから位置を測るため）。
    # 以後は設定の間隔で定期的に出す
    webview.start(api.start_notifier)   # ウィンドウを閉じるまでブロックする

    _save_size()                # 次回はこのサイズで開く
    db.checkpoint_and_close()   # WALを本体へ書き戻してから終了
    return 0


if __name__ == "__main__":
    sys.exit(main())
