import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from share_collaborations import collaborations_snapshot, public_site

class SharingTest(unittest.TestCase):
    def test_export_is_scoped_and_reflects_edits_and_deletions(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'source.sqlite3'
            db=sqlite3.connect(path)
            db.executescript('create table account(username,categoria,attivo);create table autore(shortcode,username);create table post(shortcode,owner,published_at,caption,ultimo_visto,ts);')
            db.executemany('insert into account values (?,?,?)',[('alice','Media',1),('bob','Altro',1),('private_watchlist','Altro',1)])
            db.executemany('insert into post values (?,?,?,?,?,?)',[
                ('shared','alice','2026-10-12','SECRET_CAPTION','2026-10-12',2),
                ('solo','private_watchlist','2026-10-12','SECRET_SOLO','2026-10-12',1)])
            db.executemany('insert into autore values (?,?)',[('shared','alice'),('shared','bob'),('solo','private_watchlist')]);db.commit()
            first=collaborations_snapshot(path)
            self.assertEqual(first['scope'],'collaborations')
            self.assertEqual([p['id'] for p in first['posts']],['shared'])
            self.assertEqual({p['id'] for p in first['profiles']},{'alice','bob'})
            self.assertNotIn('SECRET',json.dumps(first))
            self.assertEqual(set(first['posts'][0]),{'id','owner','authors','published','observed'})
            db.execute("update account set categoria='New Media' where username='alice'")
            db.execute("insert into autore values ('shared','carol')");db.commit()
            next=collaborations_snapshot(path)
            self.assertEqual(next['posts'][0]['authors'],['alice','bob','carol'])
            self.assertEqual(next['profiles'][0]['category'],'New Media')
            db.execute("delete from autore where username in ('bob','carol')");db.commit()
            self.assertEqual(collaborations_snapshot(path)['posts'],[])
            self.assertEqual(collaborations_snapshot(path)['profiles'],[])
            db.close()

    def test_public_bundle_has_no_semantic_navigation_or_endpoint(self):
        site=Path(__file__).resolve().parents[1]/'site'
        bundle=public_site(site,'https://example.org/latest.json','https://example.org/')
        html=bundle['index.html'].decode()
        self.assertNotIn('data-view="semantic"',html)
        self.assertNotIn('data-view="topics"',html)
        self.assertNotIn('paraphrase-multilingual',html)
        self.assertNotIn('semantic.json',str(bundle.keys()))
        config=json.loads(bundle['config.js'].decode().split(' = ',1)[1].rstrip(';\n'))
        self.assertTrue(config['collaborationsOnly'])
        self.assertNotIn('semantic',config)
        self.assertIn(config['revision'],html)
        self.assertEqual(config['revision'],json.loads(bundle['release.json'])['revision'])

if __name__=='__main__':unittest.main()
