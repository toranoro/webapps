#!/usr/bin/env python3
"""No-cache HTTP server for 3D Arcade Kart Racing Game."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
import os
import sys

# Ensure modern web MIME types, including WASM and ES modules
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('text/html; charset=utf-8', '.html')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('audio/flac', '.flac')


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.wasm': 'application/wasm',
        '.css': 'text/css',
        '.html': 'text/html; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.flac': 'audio/flac',
    }

    def end_headers(self) -> None:
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        # Keep console output clean
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    directory = os.path.dirname(os.path.abspath(__file__))
    os.chdir(directory)

    server = ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
    print(f'Serving no-cache HTTP on http://127.0.0.1:{port}/ from {directory}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server.', flush=True)
        server.server_close()


if __name__ == '__main__':
    main()
