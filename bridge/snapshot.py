"""Read-only, allowlisted public view of the collaboration database."""
import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

HANDLE = re.compile(r'^[a-zA-Z0-9_.]{1,30}$')
CODE = re.compile(r'^[a-zA-Z0-9_-]+$')

def read_snapshot(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    try:
        db.execute('BEGIN')
        catalog = {u: {'id': u, 'category': c or 'Altro', 'monitored': bool(active)}
                   for u, c, active in db.execute('select username,categoria,attivo from account') if HANDLE.fullmatch(u or '')}
        authors = {}
        for code, user in db.execute('select shortcode,username from autore order by username'):
            if HANDLE.fullmatch(user or ''):
                authors.setdefault(code, []).append(user)
        posts = []
        for code, owner, date, caption, seen in db.execute('select shortcode,owner,published_at,caption,ultimo_visto from post order by ts desc,shortcode'):
            if not CODE.fullmatch(code or ''):
                continue
            users = sorted(set(authors.get(code, [])))
            owner = owner if HANDLE.fullmatch(owner or '') else None
            if owner and owner not in users:
                users.append(owner)
                users.sort()
            for user in users:
                catalog.setdefault(user, {'id': user, 'category': 'Fuori elenco', 'monitored': False})
            posts.append({'id': code, 'owner': owner, 'authors': users, 'published': date,
                          'caption': (caption or '').strip(), 'observed': seen})
        observed = db.execute('select max(ultimo_visto) from post').fetchone()[0]
        db.commit()
        return {'schema': 1, 'observed_at': observed, 'profiles': sorted(catalog.values(), key=lambda n:n['id']), 'posts': posts}
    finally:
        db.close()

def atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temp.replace(path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    atomic_json(args.output, read_snapshot(args.db))
