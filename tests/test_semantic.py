import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from semantic import Engine,normalize

class SemanticTest(unittest.TestCase):
    def test_cosine_and_owner_attribution(self):
        engine=Engine.__new__(Engine);engine.frames=np.zeros((6,3),dtype=np.float32)
        posts=[{'id':str(i),'owner':u,'authors':[u,'coauthor']} for i,u in enumerate(['a','a','b','b','c'])]
        vectors=normalize(np.array([[1,0,0],[1,.1,0],[1,0,0],[1,.2,0],[0,0,1]],dtype=np.float32))
        texts=['primo testo politica economia','secondo contenuto politica lavoro','terzo testo economia europa','quarto contenuto lavoro europa','quinto testo sport calcio']
        result=engine.period(posts,vectors,texts)
        self.assertEqual({n['id'] for n in result['nodes']},{'a','b'})
        self.assertEqual(len(result['edges']),1)
        self.assertGreater(result['edges'][0]['score'],.99)
        self.assertTrue(all(-1<=e['score']<=1 for e in result['edges']))
        self.assertEqual(sum(t['count'] for t in result['topics']),5)

    def test_duplicate_caption_does_not_meet_minimum(self):
        engine=Engine.__new__(Engine);engine.frames=np.zeros((6,3),dtype=np.float32)
        posts=[{'id':'a','owner':'alice'},{'id':'b','owner':'alice'}]
        result=engine.period(posts,np.array([[1.,0,0],[1.,0,0]]),['same caption','same caption'])
        self.assertEqual(result['nodes'],[]);self.assertEqual(result['edges'],[])

if __name__=='__main__':unittest.main()
