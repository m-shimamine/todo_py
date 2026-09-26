# -*- coding: utf-8 -*-
"""開発用の確認ハーネス。アプリ本体の一部ではない。

アプリは pywebview の js_api でPythonを直接呼ぶため、ブラウザからは
開けない。一方でフロントの挙動をブラウザの開発者ツールで確かめたい
ことがあるので、このスクリプトだけが web/ をHTTPで配り、
window.pywebview.api を同じ形の関数へ差し替えるシムを差し込む。

    .venv\\Scripts\\python.exe tools\\devserver.py [port]

本番の起動は app.py であり、こちらは配布物に含めない。
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import db                      # noqa: E402
from backend.api import Api                 # noqa: E402
from backend.config import WEB_DIR          # noqa: E402

API = Api()

# js_api と同じ呼び出し形にするシム。
# pywebviewready は本物と同じく読み込み後に飛ばす。
SHIM = """
window.pywebview = {
  api: new Proxy({}, {
    get: (_, name) => (...args) =>
      fetch('/__api__/' + String(name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }).then(r => r.json())
  })
};
window.addEventListener('DOMContentLoaded', () => {
  window.dispatchEvent(new Event('pywebviewready'));
});
"""

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/__shim__.js":
            return self._send(200, SHIM, CONTENT_TYPES[".js"])

        rel = "index.html" if path == "/" else path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
            return self._send(404, "not found", "text/plain; charset=utf-8")

        ctype = CONTENT_TYPES.get(target.suffix, "application/octet-stream")
        text = target.read_bytes()
        if target.suffix == ".html":
            # 他のスクリプトより前にシムを読ませる
            text = text.decode("utf-8").replace(
                '<script src="js/icons.js"></script>',
                '<script src="/__shim__.js"></script>\n<script src="js/icons.js"></script>',
            ).encode("utf-8")
        return self._send(200, text, ctype)

    def do_POST(self):
        if not self.path.startswith("/__api__/"):
            return self._send(404, "not found", "text/plain; charset=utf-8")

        name = self.path[len("/__api__/"):]
        length = int(self.headers.get("Content-Length") or 0)
        args = json.loads(self.rfile.read(length) or b"[]")

        fn = getattr(API, name, None)
        if fn is None or name.startswith("_"):
            return self._send(
                200, json.dumps({"error": "unknown method: %s" % name}),
                "application/json; charset=utf-8")

        result = fn(*args)
        return self._send(
            200, json.dumps(result, ensure_ascii=False),
            "application/json; charset=utf-8")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    db.init()
    print("dev harness: http://127.0.0.1:%d  (アプリ本体の起動は app.py)" % port)
    # 単スレッドの HTTPServer だと、ブラウザが接続を掴んだままのときに
    # 後続のリクエストが返らなくなる。
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
