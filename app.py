# -*- coding: utf-8 -*-
"""エントリポイント。

HTTPサーバは立てない。pywebview の js_api でプロセス内呼び出しにするため、
ポートもバインドも存在せず、ブラウザから開ける経路もない。
"""

import logging
import sys

import webview

from backend import csv_import, db
from backend.api import Api
from backend.config import (
    FIRST_WINDOW,
    INDEX_HTML,
    LOG_FILE,
    MIN_WINDOW,
    SCREEN_MARGIN,
)

WINDOW_SIZE_KEY = "window_size"

# resized イベントで受け取った最新サイズ。終了時にこれを保存する。
_last_size = None


def setup_logging() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(LOG_FILE),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        encoding="utf-8",
    )


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


def main() -> int:
    db.init()                   # DDL適用・スキーマ版確認・初期ジャンル投入
    setup_logging()
    db.backup_on_startup()      # data/backup へ世代バックアップ

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
        "タスク管理",
        str(INDEX_HTML),        # file:// で読む（HTTPではない）
        js_api=api,
        width=width,
        height=height,
        min_size=MIN_WINDOW,    # これ以下には縮められない
    )
    window.events.resized += _on_resized
    api.set_main_window(window)   # カレンダーからタスクを開くのに使う

    webview.start()             # ウィンドウを閉じるまでブロックする

    _save_size()                # 次回はこのサイズで開く
    db.checkpoint_and_close()   # WALを本体へ書き戻してから終了
    return 0


if __name__ == "__main__":
    sys.exit(main())
