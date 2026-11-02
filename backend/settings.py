# -*- coding: utf-8 -*-
"""利用者が設定画面から変えられる値。

app_meta に "setting.<名前>" のキーで文字列として持つ。
未保存の項目は DEFAULTS を返すので、項目を足しても移行は要らない。
パスは空なら既定のフォルダ、相対パスなら実行フォルダ基準で解決する。
"""

from pathlib import Path
from typing import Dict

from . import db
from .config import BACKUP_DIR, BACKUP_KEEP, ROOT_DIR, TEMP_DIR

PREFIX = "setting."

# 名前 → (型, 既定値)
SPEC = {
    "backup_enabled":       (bool, True),
    "backup_dir":           (str,  ""),          # 空 = data/backup
    "backup_keep":          (int,  BACKUP_KEEP),
    "import_dir":           (str,  ""),          # 空 = temp
    "notify_on_startup":    (bool, True),
    "notify_interval_min":  (int,  60),          # 0 = 定期通知しない
    "notify_include_today": (bool, True),        # False なら遅延だけ
    "notify_auto_close_sec": (int, 0),           # 0 = 自動で閉じない
}

# 数値の許容範囲
RANGES = {
    "backup_keep":           (1, 100),
    "notify_interval_min":   (0, 24 * 60),
    "notify_auto_close_sec": (0, 600),
}


class SettingsError(Exception):
    """入力値が不正。利用者に見せる。"""


def _decode(kind, raw: str):
    if kind is bool:
        return raw == "1"
    if kind is int:
        return int(raw)
    return raw


def _encode(kind, value) -> str:
    if kind is bool:
        return "1" if value else "0"
    return str(value)


def get_all() -> Dict[str, object]:
    out = {}
    for name, (kind, default) in SPEC.items():
        raw = db.get_meta(PREFIX + name, "")
        try:
            out[name] = _decode(kind, raw) if raw != "" else default
        except ValueError:
            out[name] = default
    return out


def get(name: str):
    return get_all()[name]


def _coerce(name: str, value):
    kind, _ = SPEC[name]
    if kind is bool:
        return bool(value)
    if kind is int:
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise SettingsError("数値で入力してください: %s" % LABELS.get(name, name))
        lo, hi = RANGES.get(name, (None, None))
        if lo is not None and not lo <= value <= hi:
            raise SettingsError("%s は %d〜%d の範囲で入力してください"
                                % (LABELS.get(name, name), lo, hi))
        return value
    return (value or "").strip()


def save(body: dict) -> Dict[str, object]:
    """渡された項目だけ検証して保存する。1つでも不正なら何も保存しない。"""
    values = {}
    for name, value in (body or {}).items():
        if name not in SPEC:
            continue
        values[name] = _coerce(name, value)

    for name in ("backup_dir", "import_dir"):
        if values.get(name):
            path = resolve(values[name], Path("."))
            try:
                path.mkdir(parents=True, exist_ok=True)
            except OSError:
                raise SettingsError("フォルダを作成できません: %s" % path)

    for name, value in values.items():
        db.set_meta(PREFIX + name, _encode(SPEC[name][0], value))
    return get_all()


def resolve(value: str, default: Path) -> Path:
    if not value:
        return default
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT_DIR / path


def backup_dir() -> Path:
    return resolve(get("backup_dir"), BACKUP_DIR)


def import_dir() -> Path:
    return resolve(get("import_dir"), TEMP_DIR)


def defaults_info() -> Dict[str, str]:
    """画面に既定フォルダを示すため。"""
    return {"backup_dir": str(BACKUP_DIR), "import_dir": str(TEMP_DIR)}


LABELS = {
    "backup_keep": "残す世代数",
    "notify_interval_min": "通知の間隔（分）",
    "notify_auto_close_sec": "自動で閉じるまでの秒数",
}
