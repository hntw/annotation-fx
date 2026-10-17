#!/bin/zsh
# Serve the project on the LAN with no caching (for phones and headless tests): tools/serve.sh [port]
cd "${0:A:h}/.." && exec python3 -c "
import http.server,sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store'); super().end_headers()
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('0.0.0.0',int(sys.argv[1])),H).serve_forever()" ${1:-8793}
