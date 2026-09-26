#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""設計書HTMLの自己検査。

    python .claude/skills/design-doc/scripts/check_html.py .doc

チェック内容:
  1. タグの対応（閉じ忘れ・入れ子の崩れ）
  2. 目次アンカー #xxx に対応する id="xxx" が存在するか
  3. href の相対リンク先ファイルが存在するか
  4. mock/ 配下に外部CDN参照が混ざっていないか
"""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# Windowsのコンソールは既定がCP932のため、日本語が化ける。
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):  # Python 3.6以前 / 差し替え済みのstdout
    pass

# 終了タグを持たない要素（HTMLの void 要素 ＋ SVGで自己完結させる要素）
VOID = {
    "meta", "link", "br", "img", "hr", "input", "source", "col", "area",
    "base", "embed", "param", "track", "wbr",
    "path", "rect", "line", "circle", "ellipse", "polygon", "polyline",
    "use", "stop", "image",
}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.ids = set()
        self.anchors = []
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        href = d.get("href", "")
        if href.startswith("#"):
            self.anchors.append((href[1:], self.getpos()[0]))
        elif href and not re.match(r"^(https?:|mailto:|data:|//)", href):
            self.hrefs.append((href, self.getpos()[0]))
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        elif any(t == tag for t, _ in self.stack):
            open_tag, line = self.stack[-1]
            self.errors.append(
                f"  行{self.getpos()[0]}: </{tag}> の前に <{open_tag}>(行{line}) が閉じていない"
            )
            while self.stack and self.stack[-1][0] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()
        else:
            self.errors.append(f"  行{self.getpos()[0]}: 対応する開始タグのない </{tag}>")


def check(path: Path, root: Path) -> int:
    text = path.read_text(encoding="utf-8")
    c = Checker()
    c.feed(text)
    problems = list(c.errors)

    for tag, line in c.stack:
        problems.append(f"  行{line}: <{tag}> が閉じられていない")

    for anchor, line in c.anchors:
        if anchor not in c.ids:
            problems.append(f'  行{line}: アンカー #{anchor} に対応する id がない')

    for href, line in c.hrefs:
        target = (path.parent / href.split("#")[0].split("?")[0]).resolve()
        if not target.exists():
            problems.append(f"  行{line}: リンク先が見つからない {href}")

    # モックは外部依存ゼロであること
    if "mock" in path.parts and path.name != "index.html":
        for m in re.finditer(r'(?:src|href)="(https?://[^"]+)"', text):
            problems.append(f"  外部参照が混ざっている: {m.group(1)}")

    rel = path.relative_to(root.parent if root.name else root)
    if problems:
        print(f"NG  {rel}")
        for p in problems:
            print(p)
        return 1
    print(f"OK  {rel}")
    return 0


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".doc")
    if not root.exists():
        print(f"見つかりません: {root}")
        return 2

    files = sorted(root.rglob("*.html"))
    if not files:
        print(f"HTMLがありません: {root}")
        return 2

    ng = sum(check(f, root) for f in files)
    print()
    print(f"{len(files)}件中 {ng}件に問題あり" if ng else f"{len(files)}件すべて問題なし")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
