#!/usr/bin/env python3
"""
Проставляет адрес сайта везде, где он нужен.

    python configure.py https://nashasvadba.github.io

Позже, когда появится свой домен, — просто запустить еще раз с новым адресом.
Правит: og:image, og:url в site/index.html и ALLOWED_ORIGIN в
worker/rsvp-worker.js.
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    site = sys.argv[1].rstrip("/")
    if not site.startswith("https://"):
        sys.exit("Адрес должен начинаться с https://")

    # ── site/index.html ───────────────────────────────────────────────
    idx = HERE / "site" / "index.html"
    s = idx.read_text(encoding="utf-8")

    s = re.sub(r'(<meta property="og:image" content=")[^"]*(">)',
               rf'\g<1>{site}/og.jpg\g<2>', s)
    s = re.sub(r'(<meta property="og:url" content=")[^"]*(">)',
               rf'\g<1>{site}/\g<2>', s)
    # комментарий-подсказка больше не нужен
    s = re.sub(r'<!-- ВАЖНО: полный URL.*?-->\n', '', s, flags=re.S)

    idx.write_text(s, encoding="utf-8")

    # ── worker/rsvp-worker.js ─────────────────────────────────────────
    # CORS сверяет origin — схема + хост, без пути. С путем отвалится.
    origin = "/".join(site.split("/")[:3])
    w = HERE / "worker" / "rsvp-worker.js"
    if w.exists():
        t = w.read_text(encoding="utf-8")
        t = re.sub(r'const ALLOWED_ORIGIN = "[^"]*";',
                   f'const ALLOWED_ORIGIN = "{origin}";', t)
        w.write_text(t, encoding="utf-8")

    print(f"Сайт:   {site}/")
    print(f"og.jpg: {site}/og.jpg")
    print(f"Origin: {origin}")
    print()
    print("Ссылки гостям пересобрать:")
    print(f"  cd site && python3 make_links.py guests.txt --base {site}")


if __name__ == "__main__":
    main()
