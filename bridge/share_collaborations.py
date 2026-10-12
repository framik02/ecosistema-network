"""Continuously publish only collaborations and the matching public interface.

The source database is read-only. Captions, non-collaborative posts, unrelated
accounts, semantic results, operational state and logs never enter the export.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path
from snapshot import read_snapshot

SITE_FILES = ('index.html', 'styles.css', 'app.js', 'network.js',
              'vendor/d3.min.js', 'vendor/LICENSE-d3',
              'vendor/LICENSE-Archivo.txt', 'vendor/LICENSE-Bebas-Neue.txt')

def collaborations_snapshot(db):
    source = read_snapshot(db)
    posts = [{k: p[k] for k in ('id', 'owner', 'authors', 'published', 'observed')}
             for p in source['posts'] if len(set(p['authors'])) > 1]
    members = {user for p in posts for user in p['authors']}
    profiles = [{k: p[k] for k in ('id', 'category', 'monitored')}
                for p in source['profiles'] if p['id'] in members]
    return {'schema': 1, 'scope': 'collaborations', 'observed_at': source['observed_at'],
            'profiles': profiles, 'posts': posts}

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def public_site(site, snapshot_url, public_url):
    site = Path(site)
    files = {name: (site/name).read_bytes() for name in SITE_FILES}
    # Fingerprint the builder as well, so publishing-rule changes trigger a release.
    revision = hashlib.sha256(b''.join(files.values()) + Path(__file__).read_bytes()
                              + snapshot_url.encode() + public_url.encode()).hexdigest()[:16]
    html = files['index.html'].decode('utf-8')
    html = re.sub(r'<button\b[^>]*data-view="(?:semantic|topics)"[^>]*>.*?</button>', '', html, flags=re.S)
    html = re.sub(r'<section id="topics-view".*?</section>', '<section id="topics-view" hidden></section>', html, flags=re.S)
    html = re.sub(r'<h3>Affinità tra contenuti</h3>.*?(?=<h3>Copertura)', '', html, flags=re.S)
    html = re.sub(r'<h3>Copertura e aggiornamento</h3><p>.*?</p>',
        '<h3>Copertura e aggiornamento</h3><p>Questa versione condivide solo le collaborazioni osservate: profili, autori, date e collegamenti ai post originali. '
        'Le caption e le analisi dei testi non sono pubblicate. I dati vengono aggiornati automaticamente dal computer di raccolta. '
        'Se il computer è spento o non connesso, resta consultabile l’ultima versione. '
        'I filtri usano la data di pubblicazione; la copertura dipende dai contenuti raccolti.</p>', html, flags=re.S)
    html = html.replace('Due reti, due significati.', 'Come leggere la rete.')
    html = html.replace('Ecosistema · Liberi Network</title>', 'Collaborazioni · Liberi Network</title>')
    html = html.replace('Esplora collaborazioni, temi e affinità tra le voci dell’ecosistema pubblico italiano.', 'Esplora le collaborazioni osservate nell’ecosistema pubblico italiano.')
    html = html.replace('<body>', '<body class="collaborations-only">')
    html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow">\n</head>')
    for name in ('styles.css', 'config.js', 'app.js', 'vendor/d3.min.js'):
        html = html.replace('"'+name+'"', '"'+name+'?v='+revision+'"')
    files['index.html'] = html.encode('utf-8')
    app = files['app.js'].decode('utf-8').replace("from './network.js'", "from './network.js?v="+revision+"'")
    files['app.js'] = app.encode('utf-8')
    files['config.js'] = b'window.ECOSYSTEM_CONFIG = ' + encoded({
        'snapshot': snapshot_url, 'collaborationsOnly': True, 'refreshMs': 30000,
        'publicUrl': public_url, 'release': './release.json', 'revision': revision}) + b';\n'
    files['release.json'] = encoded({'revision': revision})
    files['.nojekyll'] = b''
    return files

def git(repo, *args, check=True):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True,
                            text=True, timeout=90, check=check)
    return result.stdout.strip()

def sync_repository(path, branch, remote, files, push):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    if not (path/'.git').exists():
        if any(path.iterdir()):
            raise ValueError('Publication directory must be empty before initialization.')
        git(path, 'init', '-b', branch)
        git(path, 'remote', 'add', 'origin', remote)
        git(path, 'config', 'user.name', 'Ecosistema Publisher')
        git(path, 'config', 'user.email', 'publisher@users.noreply.github.com')
    if git(path, 'branch', '--show-current') != branch or git(path, 'remote', 'get-url', 'origin') != remote:
        raise ValueError('Unexpected publication branch or remote.')
    tracked = set(git(path, 'ls-files').splitlines())
    if tracked - files.keys():
        raise ValueError('Unexpected tracked files in publication directory.')
    for name, body in files.items():
        dest = path/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or dest.read_bytes() != body:
            tmp = dest.with_suffix(dest.suffix+'.tmp')
            tmp.write_bytes(body)
            tmp.replace(dest)
    git(path, 'add', '--', *files)
    if git(path, 'diff', '--cached', '--name-only'):
        git(path, 'commit', '-m', 'Aggiorna collaborazioni condivise')
    local = git(path, 'rev-parse', 'HEAD')
    published = git(path, 'rev-parse', '--verify', 'refs/remotes/origin/'+branch, check=False)
    if push and local != published:
        git(path, 'push', '--set-upstream', 'origin', branch)

def publish_once(db, site, state, remote, public_url, snapshot_url, push=True):
    state = Path(state)
    snapshot = collaborations_snapshot(db)
    sync_repository(state/'collaboration-data', 'collaborations', remote,
                    {'latest.json': encoded(snapshot)}, push)
    sync_repository(state/'collaboration-pages', 'gh-pages', remote,
                    public_site(site, snapshot_url, public_url), push)
    return {'posts': len(snapshot['posts']), 'profiles': len(snapshot['profiles']),
            'scope': snapshot['scope'], 'published': push}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--state', required=True)
    parser.add_argument('--site', default=str(Path(__file__).resolve().parents[1]/'site'))
    parser.add_argument('--remote', required=True)
    parser.add_argument('--public-url', required=True)
    parser.add_argument('--snapshot-url', required=True)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--loop', action='store_true')
    parser.add_argument('--interval', type=int, default=120)
    args = parser.parse_args()
    while True:
        try:
            print(json.dumps(publish_once(args.db, args.site, args.state, args.remote,
                args.public_url, args.snapshot_url, not args.prepare_only)), flush=True)
        except Exception as exc:
            print('Pubblicazione rinviata: '+type(exc).__name__, flush=True)
            if not args.loop:
                raise
        if not args.loop:
            break
        time.sleep(max(60, args.interval))

if __name__ == '__main__':
    main()
