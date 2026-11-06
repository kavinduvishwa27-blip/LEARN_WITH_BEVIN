#!/usr/bin/env python3
"""
Freelancer College builder: the public website and the ERP (admin panel).

Zero dependencies (Python 3.8+ standard library only), so it runs the same
on your laptop and on Cloudflare Pages.

The project has two parts, each in its own folder. The folders are found by their
marker file, so they can be renamed or moved anywhere inside this project:

  Public/  (marker: public.config.json)  the public website
    pages/**.html        pages, each with a small front matter block
    layouts/*.html       page shells ({{ content }} is replaced by the page)
    partials/*.html      reusable blocks, included with {{> name }}
    data/site.json       starting settings: prices, dates, contact details...
    data/content.json    starting collections: FAQs, testimonials, curriculum, blog posts, legal pages
    assets/, static/     copied as is
    server/*.js          code that serves the site on Cloudflare (live content, forms, payments)

  erp/     (marker: erp.config.json)     the ERP / admin panel
    panel/               the admin panel (served at /admin)
    server/*.js          database, login, leads, enrollments, payments, content editing

Both server/ folders are copied into _server/ on every build; the small files in
functions/ (required by Cloudflare) point there. That is how the two parts stay in sync.

Output (dist/):
  every page, fully rendered with the default content   -> works on its own
  _tpl/**.tpl             the same pages as templates   -> filled from the database at the edge
  _data/defaults.json     the default content           -> used when the database has no value

Template language (identical in Public/server/template.js):
  {{ site.cohort.price_early }}      value, HTML escaped
  {{{ this.body }}}                  value, raw HTML (tokens inside are rendered too)
  {{url site.contact.whatsapp_text}} value, URL encoded
  {{json this.q}}                    value as a JSON literal (for structured data)
  {{#each faqs.home}} {{ this.q }} {{else}} empty {{/each}}   loop (@index, @number, @first, @last)
  {{#if path}} ... {{else}} ... {{/if}}   and   {{#unless path}} ... {{/unless}}
  {{> partial-name }}                include Public/partials/partial-name.html (build time only)

Run:  python build.py          -> builds into dist/
      python build.py serve    -> builds, serves http://localhost:8788 and rebuilds on save
"""
import copy
import html
import json
import math
import re
import shutil
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
SERVER = ROOT / "_server"  # generated: both server/ folders merged, used by functions/
SKIP_DIRS = {"dist", "_server", "functions", ".git", "__pycache__", "node_modules", ".wrangler", ".claude"}


def find_part(marker):
    """Find a project part by its marker file, wherever it sits inside the project."""
    hits = []
    for path in ROOT.rglob(marker):
        if not SKIP_DIRS.intersection(path.relative_to(ROOT).parts[:-1]):
            hits.append(path.parent)
    if not hits:
        sys.exit(f"Could not find the folder containing {marker}. Keep that file inside the folder.")
    if len(hits) > 1:
        sys.exit(f"Found {marker} in more than one folder: {', '.join(str(h) for h in hits)}. Keep only one.")
    return hits[0]


PUBLIC = find_part("public.config.json")
ERP = find_part("erp.config.json")

PARTIAL = re.compile(r"\{\{>\s*([a-zA-Z0-9_\-/]+)\s*\}\}")
TAG = re.compile(
    r"\{\{\{\s*([\w.@-]+)\s*\}\}\}"                       # 1: raw
    r"|\{\{\s*(?:(#each|#if|#unless)\s+([\w.@-]+)"          # 2,3: block open
    r"|(/each|/if|/unless|else)"                            # 4: close / else
    r"|(json|url)\s+([\w.@-]+)"                             # 5,6: filter
    r"|([\w.@-]+))\s*\}\}"                                  # 7: value
)
MISSING = object()
WARN = set()


# ---------------------------------------------------------------------------
# Template engine
# ---------------------------------------------------------------------------
def parse(text):
    root = []
    stack = [{"nodes": root}]
    pos = 0
    for m in TAG.finditer(text):
        if m.start() > pos:
            stack[-1]["nodes"].append(("text", text[pos:m.start()]))
        pos = m.end()
        raw, kind, bpath, close, filt, fpath, var = m.groups()
        if raw:
            stack[-1]["nodes"].append(("var", "raw", raw, m.group(0)))
        elif filt:
            stack[-1]["nodes"].append(("var", filt, fpath, m.group(0)))
        elif var:
            stack[-1]["nodes"].append(("var", "esc", var, m.group(0)))
        elif kind:
            block = {"kind": kind[1:], "path": bpath, "body": [], "else": [], "start": m.start()}
            block["nodes"] = block["body"]
            stack.append(block)
        elif close == "else":
            if len(stack) > 1:
                stack[-1]["nodes"] = stack[-1]["else"]
            else:
                stack[-1]["nodes"].append(("text", m.group(0)))
        else:
            if len(stack) == 1 or stack[-1]["kind"] != close[1:]:
                raise ValueError(f"Unexpected {m.group(0)} near: {text[max(0, m.start() - 60):m.start()]!r}")
            b = stack.pop()
            stack[-1]["nodes"].append(("block", b["kind"], b["path"], b["body"], b["else"], text[b["start"]:m.end()]))
    if len(stack) > 1:
        raise ValueError(f"Unclosed {{{{#{stack[-1]['kind']} {stack[-1]['path']}}}}}")
    if pos < len(text):
        root.append(("text", text[pos:]))
    return root


def resolve(path, scopes):
    parts = path.split(".")
    for sc in reversed(scopes):
        if parts[0] in sc:
            cur = sc[parts[0]]
            break
    else:
        return MISSING
    for p in parts[1:]:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        elif isinstance(cur, list) and p.isdigit() and int(p) < len(cur):
            cur = cur[int(p)]
        else:
            return None
    return cur


def truthy(v):
    if v is None or v is False or v == "" or v == 0 or v == "false" or v == "0":
        return False
    if isinstance(v, (list, dict)) and not v:
        return False
    return True


def to_str(v):
    if v is None:
        return ""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#39;"))


def render_nodes(nodes, scopes, lenient, depth=0):
    out = []
    for n in nodes:
        if n[0] == "text":
            out.append(n[1])
        elif n[0] == "var":
            _, mode, path, src = n
            v = resolve(path, scopes)
            if v is MISSING:
                if lenient:
                    out.append(src)
                else:
                    WARN.add(path)
                continue
            if isinstance(v, str) and mode in ("raw", "json") and "{{" in v and depth < 2:
                v = render_nodes(parse(v), scopes, lenient, depth + 1)
            if mode == "raw":
                out.append(to_str(v))
            elif mode == "json":
                out.append(json.dumps(v if v is not None else "", ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
            elif mode == "url":
                out.append(quote(to_str(v), safe="!~*'()"))
            else:
                out.append(esc(to_str(v)))
        else:
            _, kind, path, body, other, src = n
            v = resolve(path, scopes)
            if v is MISSING and lenient:
                out.append(src)
                continue
            if v is MISSING:
                WARN.add(path)
                v = None
            if kind == "each":
                items = v if isinstance(v, list) else []
                if not items:
                    out.append(render_nodes(other, scopes, lenient, depth))
                for i, item in enumerate(items):
                    scope = {"this": item, "@index": i, "@number": i + 1, "@first": i == 0, "@last": i == len(items) - 1}
                    out.append(render_nodes(body, scopes + [scope], lenient, depth))
            else:
                ok = truthy(v) if kind == "if" else not truthy(v)
                out.append(render_nodes(body if ok else other, scopes, lenient, depth))
    return "".join(out)


def render(text, ctx, lenient=False):
    return render_nodes(parse(text), [ctx], lenient)


# ---------------------------------------------------------------------------
# Content helpers (mirrored in Public/server/template.js -> normalize)
# ---------------------------------------------------------------------------
TAG_STRIP = re.compile(r"<(script|style)[\s\S]*?</\1>")


def strip_tags(s):
    s = TAG_STRIP.sub(" ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\{\{[\s\S]*?\}\}", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def date_human(iso):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", iso or "")
    if not m or not 1 <= int(m.group(2)) <= 12:
        return iso or ""
    return f"{int(m.group(3))} {MONTHS[int(m.group(2)) - 1]} {m.group(1)}"


FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
WHEN = re.compile(r"(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?")


def parse_when(s):
    """'2026-11-20T19:30:00+05:30' or '2026-11-20' (Sri Lanka time when no zone is given).
    The date parts returned are always in Sri Lanka time, whatever zone was written."""
    m = WHEN.fullmatch(str(s or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        day = date(y, mo, d)
    except ValueError:
        return None
    timed = m.group(4) is not None
    h, mi = (int(m.group(4)), int(m.group(5))) if timed else (0, 0)
    tz = m.group(6) or "+05:30"
    off = 0 if tz == "Z" else (1 if tz[0] == "+" else -1) * (int(tz[1:3]) * 60 + int(tz[4:6]))
    ms = ((day.toordinal() - 719163) * 86400 + h * 3600 + mi * 60 - off * 60) * 1000
    sl = ms // 1000 + 19800  # seconds, Sri Lanka wall clock
    local = date.fromordinal(sl // 86400 + 719163)
    secs = sl % 86400
    return {"ms": ms, "y": local.year, "mo": local.month, "d": local.day, "h": secs // 3600, "mi": secs % 3600 // 60, "timed": timed, "wd": local.weekday()}


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")[:60]


def normalize_events(items, now_ms):
    """Published events with display dates, split into upcoming (soonest first) and past (latest first)."""
    upcoming, past, used = [], [], set()
    for i, e in enumerate(items or []):
        if not isinstance(e, dict) or not truthy(e.get("published", True)):
            continue
        start = parse_when(e.get("starts_at"))
        if not start:
            continue
        end = parse_when(e.get("ends_at"))
        end_ms = end["ms"] if end and end["ms"] > start["ms"] else start["ms"] + (3 * 3600000 if start["timed"] else 86400000)
        slug = slugify(e.get("title")) or f"event-{i + 1}"
        while slug in used:
            slug += "-2"
        used.add(slug)
        e = dict(e)
        for k in ("type", "place", "image", "summary", "notes", "button", "link"):
            if e.get(k) is None:
                e[k] = ""
        e["slug"] = slug
        e["date_human"] = f"{WEEKDAYS[start['wd']]}, {start['d']} {FULL_MONTHS[start['mo'] - 1]} {start['y']}"
        e["time_human"] = f"{start['h'] % 12 or 12}.{start['mi']:02d} {'am' if start['h'] < 12 else 'pm'}" if start["timed"] else ""
        e["day"] = str(start["d"])
        e["month"] = MONTHS[start["mo"] - 1]
        e["start_ms"] = str(start["ms"])
        e["ends_ms"] = str(end_ms)
        e["past"] = end_ms <= now_ms
        e["live"] = start["ms"] <= now_ms < end_ms
        (past if e["past"] else upcoming).append(e)
    upcoming.sort(key=lambda e: int(e["start_ms"]))
    past.sort(key=lambda e: int(e["start_ms"]), reverse=True)
    return upcoming, past


def normalize(data, now_ms=None):
    """Derived fields the templates need. Keep in sync with normalize() in template.js."""
    d = copy.deepcopy(data)
    posts = []
    for p in d.get("posts") or []:
        if not truthy(p.get("published", True)):
            continue
        p = dict(p)
        words = len(strip_tags(p.get("body", "")).split())
        p["url"] = "/blog/" + p.get("slug", "") + "/"
        p["readtime"] = str(max(1, math.ceil(words / 220)))
        p["date_human"] = date_human(p.get("date", ""))
        posts.append(p)
    posts.sort(key=lambda p: p.get("date", ""), reverse=True)
    d["posts"] = posts
    upcoming, past = normalize_events(d.get("events"), int(time.time() * 1000) if now_ms is None else now_ms)
    d["events"] = upcoming
    d["events_past"] = past[:12]
    d["events_home"] = [e for e in upcoming if truthy(e.get("featured", True))][:3]
    return d


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def read(p):
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")


def parse_page(path):
    text = read(path)
    meta = {}
    if text.startswith("---"):
        _, head, body = text.split("---", 2)
        for line in head.strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        text = body.lstrip("\n")
    return meta, text


def expand_partials(text, depth=0):
    if depth > 8:
        raise RuntimeError("Partial include depth exceeded (circular include?)")

    def inc(m):
        p = PUBLIC / "partials" / f"{m.group(1)}.html"
        if not p.exists():
            raise FileNotFoundError(f"Missing partial: {p}")
        return expand_partials(read(p), depth + 1)

    return PARTIAL.sub(inc, text)


def out_path(rel):
    """pages/about.html -> about/index.html (pretty URLs)."""
    if rel.name in ("index.html", "404.html"):
        return rel
    return rel.with_suffix("") / "index.html"


def url_for(rel):
    o = out_path(rel).as_posix()
    if o == "index.html":
        return "/"
    if o == "404.html":
        return "/404"
    return "/" + o[: -len("index.html")]


def clean(folder):
    """Empty a folder without failing on folders locked by OneDrive/Explorer."""
    folder.mkdir(exist_ok=True)
    for p in sorted(folder.rglob("*"), key=lambda x: len(x.parts), reverse=True):
        try:
            p.unlink() if p.is_file() else p.rmdir()
        except OSError:
            pass


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Always LF line endings, so output is identical on Windows and on Cloudflare (Linux)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def make_template(shell, body, meta):
    """Layout + partials + page values. Site and collection tokens stay for later."""
    full = expand_partials(shell).replace("{{ content }}", expand_partials(body))
    return render(full, {"page": meta}, lenient=True)


def build(dev=False):
    WARN.clear()
    site = json.loads(read(PUBLIC / "data" / "site.json"))
    content = json.loads(read(PUBLIC / "data" / "content.json"))
    defaults = {"site": site, **content}
    data = normalize(defaults)
    clean(DIST)

    shell = read(PUBLIC / "layouts" / "base.html")
    search_index = []

    def emit(rel_out, meta, template):
        write(DIST / "_tpl" / rel_out.with_suffix(".tpl"), template)
        page_html = render(template, data)
        write(DIST / rel_out, page_html)
        return page_html

    # Regular pages
    count = 0
    for path in sorted((PUBLIC / "pages").rglob("*.html")):
        rel = path.relative_to(PUBLIC / "pages")
        meta, body = parse_page(path)
        meta.setdefault("title", "{{ site.brand.name }}")
        meta.setdefault("description", "{{ site.brand.tagline }}")
        meta.setdefault("bodyclass", "")
        meta["url"] = url_for(rel)
        meta["canonical"] = "{{ site.url }}" + meta["url"]
        page_html = emit(out_path(rel), meta, make_template(shell, body, meta))
        count += 1
        if meta.get("noindex") != "true" and rel.name != "404.html":
            add_to_search(search_index, page_html, meta, data)

    # Blog posts: one template, one page per post
    post_meta = {
        "title": "{{ post.seo_title }}",
        "description": "{{ post.description }}",
        "bodyclass": "page-post",
        "url": "{{ post.url }}",
        "canonical": "{{ site.url }}{{ post.url }}",
    }
    post_body = read(PUBLIC / "layouts" / "post.html")
    post_tpl = make_template(shell, post_body, post_meta)
    write(DIST / "_tpl" / "blog" / "_post.tpl", post_tpl)
    for post in data["posts"]:
        page_html = render(post_tpl, {**data, "post": post})
        write(DIST / "blog" / post["slug"] / "index.html", page_html)
        count += 1
        add_to_search(search_index, page_html, {"title": post["title"], "description": post["description"], "url": post["url"], "kind": "Article"}, data)

    # Assets, ERP panel and static root files
    shutil.copytree(PUBLIC / "assets", DIST / "assets", dirs_exist_ok=True)
    shutil.copytree(ERP / "panel", DIST / "admin", dirs_exist_ok=True)
    for f in (PUBLIC / "static").iterdir():
        if f.is_file():
            shutil.copy(f, DIST / f.name)
        else:
            shutil.copytree(f, DIST / f.name, dirs_exist_ok=True)

    assemble_server()
    if dev:
        # Local preview only: lets the ERP panel (and tests) run the server code in the browser
        shutil.copytree(SERVER, DIST / "admin" / "dev", dirs_exist_ok=True)

    write(DIST / "_data" / "defaults.json", json.dumps(defaults, ensure_ascii=False))
    write(DIST / "search.json", json.dumps(search_index, ensure_ascii=False))

    base = site["url"].rstrip("/")
    today = datetime.now().strftime("%Y-%m-%d")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for e in search_index:
        sm.append(f"  <url><loc>{base}{e['u']}</loc><lastmod>{today}</lastmod></url>")
    sm.append("</urlset>")
    write(DIST / "sitemap.xml", "\n".join(sm))

    for w in sorted(WARN):
        print(f"  ! unknown value: {w}")
    print(f"Done. {count} pages -> {DIST}")


def assemble_server():
    """Merge Public/server and erp/server into _server/ (what functions/ imports)."""
    clean(SERVER)
    seen = {}
    for part in (PUBLIC, ERP):
        for f in sorted((part / "server").glob("*.js")):
            if f.name in seen:
                sys.exit(f"Two server files are both called {f.name} ({seen[f.name]} and {f}). Rename one.")
            seen[f.name] = f
            write(SERVER / f.name, read(f))
    write(SERVER / "README.txt", "Generated by build.py from Public/server and erp/server. Do not edit here.\n")


def add_to_search(index, page_html, meta, data):
    main = re.search(r"<main[^>]*>([\s\S]*)</main>", page_html)
    content = main.group(1) if main else page_html
    headings = re.findall(r"<h[12][^>]*>([\s\S]*?)</h[12]>", content)
    title = render(meta["title"], data).split(" | ")[0]
    index.append({
        "t": html.unescape(title),
        "d": html.unescape(render(meta["description"], data)),
        "u": render(meta["url"], data),
        "h": [strip_tags(h) for h in headings][:8],
        "x": strip_tags(content)[:600],
        "k": meta.get("kind", "Page"),
    })


# ---------------------------------------------------------------------------
# Local dev server
# ---------------------------------------------------------------------------
def serve(port=8788):
    import functools
    import http.server
    import threading
    import time

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # Never cache while developing, so every refresh shows your latest edits
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def send_head(self):
            if self.path.split("?")[0] in ("/erp", "/erp/", "/admin"):
                self.send_response(302)
                self.send_header("Location", "/admin/")
                self.end_headers()
                return None
            # Mimic Cloudflare Pages: unknown paths get 404.html
            p = Path(self.translate_path(self.path))
            if not p.exists() and not p.with_suffix(".html").exists():
                self.path = "/404.html"
            return super().send_head()

        def log_message(self, fmt, *args):
            pass

    def snapshot():
        files = list(PUBLIC.rglob("*")) + list(ERP.rglob("*"))
        return max((f.stat().st_mtime for f in files if f.is_file()), default=0)

    def watch():
        last = snapshot()
        while True:
            time.sleep(1)
            now = snapshot()
            if now != last:
                last = now
                try:
                    build(dev=True)
                except Exception as e:  # keep serving on template errors
                    print("  ! build failed:", e)

    threading.Thread(target=watch, daemon=True).start()
    handler = functools.partial(Handler, directory=str(DIST))
    print(f"Public website:  http://localhost:{port}")
    print(f"ERP / admin:     http://localhost:{port}/erp   (local preview password: demo)")
    print("Press Ctrl+C to stop.")
    if "open" in sys.argv:
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    class Server(http.server.ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            # The browser often cancels downloads when you navigate away; that is not an error
            if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
                return
            super().handle_error(request, client_address)

    Server(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    dev = len(sys.argv) > 1 and sys.argv[1] == "serve"
    build(dev=dev)
    if dev:
        serve(int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 8788)
