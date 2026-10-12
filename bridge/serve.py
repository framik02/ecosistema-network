"""Local read-only server. No scraper control, logs, cookies, or runtime files."""
import argparse
import json
import mimetypes
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from snapshot import read_snapshot

def handler(db,site,state):
    site=Path(site).resolve(); state=Path(state).resolve()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path=urlsplit(self.path).path
            status=200
            try:
                if path=='/snapshot':
                    body=json.dumps(read_snapshot(db),ensure_ascii=False).encode(); content='application/json; charset=utf-8'
                elif path=='/semantic':
                    source=state/'semantic.json'
                    if not source.is_file():
                        status=202;body=b'{"pending":true}'
                    else: body=source.read_bytes()
                    content='application/json; charset=utf-8'
                elif path in ('/','/index.html','/styles.css','/app.js','/network.js','/config.js','/vendor/d3.min.js'):
                    file=site/('index.html' if path=='/' else path.lstrip('/'))
                    body=file.read_bytes();content=mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
                    if file.suffix=='.js':content='text/javascript'
                    if file.suffix in ('.html','.css','.js'):content+='; charset=utf-8'
                else:
                    status=404;body=b'Not found';content='text/plain'
            except (OSError,sqlite3.Error):
                status=503;body=b'{"error":"temporarily_unavailable"}';content='application/json'
            self.send_response(status);self.send_header('Content-Type',content)
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def log_message(self,*args):pass
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--db',required=True);parser.add_argument('--state',required=True)
    parser.add_argument('--site',default=str(Path(__file__).resolve().parents[1]/'site'));parser.add_argument('--port',type=int,default=8766)
    args=parser.parse_args()
    print(f'Osservatorio su http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),handler(args.db,args.site,args.state)).serve_forever()
