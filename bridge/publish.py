"""Publish only allowlisted snapshot JSON to a dedicated data branch.

The scraper and semantic worker are independent; semantic work cannot delay
the collaboration snapshot. No database, browser session, or log is published.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
from snapshot import read_snapshot, atomic_json

def git(repo,*args):
    return subprocess.run(['git','-C',str(repo),*args],capture_output=True,text=True,check=True,timeout=90).stdout.strip()

def publish(db,state,repo):
    repo=Path(repo);state=Path(state)
    if git(repo,'branch','--show-current')!='data':raise ValueError('Publisher requires the data branch.')
    snapshot=read_snapshot(db)
    # State files are never copied wholesale. Only the two public JSON views.
    candidate={'latest.json':snapshot}
    if (state/'semantic.json').is_file():
        semantic=json.loads((state/'semantic.json').read_text(encoding='utf-8'))
        if semantic.get('schema')==1 and 'periods' in semantic:candidate['semantic.json']=semantic
    for name,value in candidate.items():atomic_json(repo/name,value)
    paths=list(candidate)
    git(repo,'add','--',*paths)
    if git(repo,'diff','--cached','--name-only'):
        git(repo,'commit','-m','Aggiorna dati pubblici dell’ecosistema')
    # Retry an earlier failed push even when there are no new data changes.
    git(repo,'push','origin','data')
    print(f'Dati pubblicati: {snapshot["observed_at"]}',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--db',required=True);parser.add_argument('--state',required=True)
    parser.add_argument('--repo',required=True);parser.add_argument('--loop',action='store_true');parser.add_argument('--interval',type=int,default=120)
    args=parser.parse_args()
    while True:
        try:publish(args.db,args.state,args.repo)
        except Exception as exc:
            print(f'Pubblicazione rinviata: {type(exc).__name__}',flush=True)
            if not args.loop:raise
        if not args.loop:break
        time.sleep(max(60,args.interval))
