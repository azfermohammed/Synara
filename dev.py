"""Local dev server for Synara.

    python3 dev.py [port]        # default 4173

Identical to `python3 -m http.server`, plus `Cache-Control: no-cache` on
every response. Without that header the browser applies heuristic
caching: a file whose Last-Modified date is two weeks old is treated as
fresh for about a day and a half, so after an edit the browser can load
a new module next to a stale one it never re-requested — and the app
fails to start with a "does not provide an export named …" error.

`no-cache` still allows caching; it just makes the browser ask first,
which the server answers with a cheap 304 when nothing has changed.
"""

import contextlib
import socket
import socketserver
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class DualStackServer(ThreadingHTTPServer):
    """Accept both IPv4 and IPv6, like `python3 -m http.server` does —
    browsers often reach "localhost" over ::1."""

    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        # Bind directly. HTTPServer.server_bind would follow this with a
        # reverse-DNS lookup of "::" (socket.getfqdn), which can hang for
        # a long time when DNS is slow or blocked — the server sits bound
        # but never starts listening.
        socketserver.TCPServer.server_bind(self)
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    with DualStackServer(("::", port), NoCacheHandler) as httpd:
        print(f"Synara dev server: http://localhost:{port}", flush=True)
        httpd.serve_forever()
