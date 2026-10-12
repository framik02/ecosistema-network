import sys
from pathlib import Path
import tempfile
import sqlite3
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from snapshot import read_snapshot

class SnapshotTest(unittest.TestCase):
    def test_read_only_allowlist_and_incremental_updates(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'collab.sqlite3';db=sqlite3.connect(path)
            db.executescript('create table account(username,categoria,attivo);create table autore(shortcode,username);create table post(shortcode,owner,published_at,caption,ultimo_visto,ts);create table passaggio(motivo);')
            db.execute('insert into account values (?,?,?)',('alice','Politico',1))
            db.execute('insert into post values (?,?,?,?,?,?)',('p','alice','2026-10-12T10:00:00+00:00','Un testo pubblico','2026-10-12T11:00:00+00:00',1))
            db.executemany('insert into autore values (?,?)',[('p','alice'),('p','bob')])
            db.execute('insert into passaggio values (?)',('SECRET_LOG',));db.commit()
            first=read_snapshot(path)
            self.assertNotIn('SECRET_LOG',str(first));self.assertEqual(first['posts'][0]['authors'],['alice','bob'])
            self.assertEqual(set(first),{'schema','observed_at','profiles','posts'})
            db.execute('insert into autore values (?,?)',('p','carol'));db.commit()
            self.assertEqual(read_snapshot(path)['posts'][0]['authors'],['alice','bob','carol'])
            self.assertEqual(db.execute('select count(*) from post').fetchone()[0],1);db.close()

if __name__=='__main__':unittest.main()
