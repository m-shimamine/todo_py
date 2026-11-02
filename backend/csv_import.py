# -*- coding: utf-8 -*-
"""temp/ 配下のCSV取込。

フォーマット:
    ジャンル,カテゴリ,開始日,終了日,内容,優先度,ステータス
"""

import csv
import io
import logging
import re
from datetime import datetime
from typing import List, Optional

from . import repository, settings
from .db import conn, now

log = logging.getLogger(__name__)

ENCODINGS = ("utf-8-sig", "cp932")
DATE_PATTERNS = ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d")
IMPORTED_MARK = "_imported_"


def _read_text(path) -> Optional[str]:
    """UTF-8（BOM付き含む）→ CP932 の順で試す。

    Excelで保存したCSVはCP932になることが多い。
    """
    raw = path.read_bytes()
    for enc in ENCODINGS:
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        # 引用符内の改行は csv.reader が値としてそのまま残す。
        # CRLF / CR を LF に寄せ、内容に CR が混ざらないようにする。
        return text.replace("\r\n", "\n").replace("\r", "\n")
    log.warning("文字コードを判別できなかった: %s", path.name)
    return None


def _parse_date(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    # 2026/9/1 のようなゼロ埋めなしも受ける
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", value)
    if m:
        y, mo, d = (int(x) for x in m.groups())
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return ""
    for pattern in DATE_PATTERNS:
        try:
            return datetime.strptime(value, pattern).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _priority(value: str) -> int:
    return 1 if (value or "").strip() in ("高", "★", "1") else 0


def _stamp() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H-%M-%S")


def import_from_temp() -> dict:
    """取込フォルダ（既定 temp/）のCSVを取り込む。

    二重取込は「先にリネームしてから読む」順序で防ぐ。取り込んでから
    リネームすると、リネームに失敗した場合（Excelで開いている等）に
    次の起動でもう一度取り込まれてしまう。
    """
    folder = settings.import_dir()      # 設定画面で変えられる。既定は temp/
    folder.mkdir(parents=True, exist_ok=True)

    targets = sorted(
        p for p in folder.glob("*.csv")
        if p.is_file() and IMPORTED_MARK not in p.name
    )

    imported = 0
    files: List[str] = []
    skipped: List[str] = []

    for path in targets:
        renamed = path.with_name("%s%s%s.csv" % (path.stem, IMPORTED_MARK, _stamp()))
        try:
            path.rename(renamed)
        except OSError:
            # 開かれている等でリネームできない。読まずに飛ばす（二重取込を防ぐ）
            log.warning("リネームできないため取込を見送った: %s", path.name)
            skipped.append(path.name)
            continue

        try:
            count = _import_file(renamed)
        except Exception:
            log.exception("取込に失敗した: %s", renamed.name)
            skipped.append(path.name)
            continue

        imported += count
        files.append("%s (%d件)" % (path.name, count))

    return {"imported": imported, "files": files, "skipped": skipped}


def _import_file(path) -> int:
    text = _read_text(path)
    if text is None:
        return 0

    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return 0

    ts = now()
    count = 0

    # ファイル全体を単一トランザクションで処理する。
    # 1件でも失敗したらそのファイルはロールバックして次へ進む。
    with conn() as c:
        no = c.execute("SELECT COALESCE(MAX(no), 0) FROM tasks").fetchone()[0]

        for line in rows[1:]:                      # 1行目はヘッダ
            if len(line) < 5:
                continue
            content = (line[4] or "").strip()
            if not content:
                continue

            genre_id = repository.genre_id_by_name(c, line[0])
            # 同一ジャンル内で内容が完全一致するものは取り込まない
            dup = c.execute(
                "SELECT 1 FROM tasks WHERE genre_id = ? AND content = ?",
                (genre_id, content),
            ).fetchone()
            if dup:
                continue

            category_id = repository.category_id_by_name(c, genre_id, line[1])
            status = repository.normalize_status(line[6] if len(line) > 6 else "")
            no += 1

            c.execute(
                """
                INSERT INTO tasks (no, genre_id, category_id, content, result,
                                   date_start, date_end, priority, status,
                                   completed_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    no, genre_id, category_id, content,
                    _parse_date(line[2]),
                    _parse_date(line[3]),
                    _priority(line[5] if len(line) > 5 else ""),
                    status,
                    ts if status == "completed" else "",
                    ts, ts,
                ),
            )
            count += 1

    return count
