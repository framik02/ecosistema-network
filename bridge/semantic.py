"""Incremental multilingual embeddings; caption clusters and profile cosine graph.

Only a post's original owner contributes to a profile vector. This prevents a
collaboration copied into several grids from becoming false semantic evidence.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time

os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from snapshot import read_snapshot, atomic_json

MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
CACHE_VERSION = MODEL + ':chunks110-stride90-v1'
STOP = set('a ad al allo ai agli alla alle anche ancora andare avere abbiamo avete aveva bene che chi ci cio cioè come con contro cosa così cui da dal dallo dalla dalle dagli dei del dello della delle degli deve di dire dopo dove due e ed era essere fa fare fatto fino fra già gli ha hai hanno ho i il in io la le lei li lo loro lui ma me mentre mi mia mie mio modo molto ne nei nel nella nelle nello negli no noi non nostra nostro nostri nuova nuovo o oggi ogni ora per perché più poco poi proprio quale quali quando quanto questa queste questi questo qui quello quella quelli quelle quindi se sei senza si sia siamo siete sono sta stato stati stessa stesso su sul sulla sulle sugli sui tanto te ti tra tre tu tua tuo tutti tutte tutto un una uno uno via vi voi vuole sarà sempre solo solo già può possiamo nel perché all dell dall sull l d c è sarà vengono anni anno giorno giorni volta volte meglio video post link bio instagram https www com it grazie segui seguici pagina profilo reel reels news notizie notizia diretta guarda leggi commenti'.split())

FRAMES = [
    ('Critica alle istituzioni', 'Critica al governo e alle istituzioni: decisioni sbagliate, responsabilità politiche, fallimento delle promesse, richiesta di dimissioni.'),
    ('Diritti e solidarietà', 'Difesa dei diritti umani, solidarietà con le vittime, pace, uguaglianza, inclusione, denuncia delle discriminazioni.'),
    ('Sicurezza e ordine pubblico', 'Richiesta di sicurezza, controllo del territorio, contrasto alla criminalità, regole e ordine pubblico.'),
    ('Rivendicazione dei risultati', 'Il nostro lavoro ha portato risultati: misure realizzate, successi e obiettivi raggiunti, impegni mantenuti.'),
    ('Mobilitazione e partecipazione', 'Invito a partecipare, manifestare e mobilitarsi, scendere in piazza, firmare una petizione o votare per il cambiamento.'),
    ('Denuncia di una crisi', 'Allarme e denuncia di una crisi: emergenza economica, sociale o ambientale, situazione grave, conseguenze e urgenza di intervenire.'),
]

def normalize(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)

def clean(text):
    text = re.sub(r'https?://\S+|@[\w.]+', ' ', text)
    return re.sub(r'\s+', ' ', text.replace('#', ' ')).strip()

class Engine:
    def __init__(self, cache):
        import torch
        from sentence_transformers import SentenceTransformer
        torch.set_num_threads(2)
        self.model = SentenceTransformer(MODEL, device='cpu', local_files_only=True)
        self.db = sqlite3.connect(cache)
        self.db.execute('create table if not exists embedding (key text primary key, vector blob)')
        self.frames = self.encode([text for _, text in FRAMES])

    def encode(self, texts):
        # Token chunks avoid silently truncating long captions at 128 tokens.
        chunks, owners = [], []
        for i, text in enumerate(texts):
            tokens = self.model.tokenizer.encode(text, add_special_tokens=False)
            for start in range(0, max(1, len(tokens)), 90):
                chunks.append(self.model.tokenizer.decode(tokens[start:start+110], skip_special_tokens=True))
                owners.append(i)
                if start + 110 >= len(tokens): break
        vectors = self.model.encode(chunks, batch_size=24, normalize_embeddings=True, show_progress_bar=False)
        output = np.zeros((len(texts), vectors.shape[1]), dtype=np.float32)
        counts = np.zeros(len(texts), dtype=np.float32)
        for owner, vector in zip(owners, vectors):
            output[owner] += vector
            counts[owner] += 1
        return normalize(output / np.maximum(counts[:, None], 1))

    def vectors(self, texts):
        keys = [hashlib.sha256((CACHE_VERSION+'\n'+t).encode()).hexdigest() for t in texts]
        existing = {k: np.frombuffer(v, dtype=np.float32).copy() for k,v in self.db.execute('select key,vector from embedding')}
        missing = list(dict.fromkeys((k,t) for k,t in zip(keys,texts) if k not in existing))
        for start in range(0,len(missing),64):
            batch = missing[start:start+64]
            values = self.encode([t for _,t in batch])
            for (key,_), vector in zip(batch,values):
                existing[key] = vector
                self.db.execute('insert or replace into embedding values (?,?)',(key,vector.astype(np.float32).tobytes()))
            self.db.commit()
            print(f'Caption nuove elaborate: {min(start+64,len(missing))}/{len(missing)}',flush=True)
        return np.stack([existing[k] for k in keys]) if keys else np.zeros((0,384),dtype=np.float32)

    def analyze(self, snapshot):
        posts = [p for p in snapshot['posts'] if len(clean(p['caption']).split()) >= 5]
        texts = [clean(p['caption']) for p in posts]
        vectors = self.vectors(texts)
        now = datetime.now(timezone.utc)
        periods = {}
        for days in (1,7,30,0):
            indices = [i for i,p in enumerate(posts) if not days or datetime.fromisoformat(p['published']) >= now-timedelta(days=days)]
            subset = [posts[i] for i in indices]
            periods[str(days)] = self.period(subset,vectors[indices], [texts[i] for i in indices]) if indices else {'caption_count':0,'nodes':[],'edges':[],'topics':[],'narratives':[]}
        return {'schema':1,'model':MODEL,'generated_at':now.isoformat(), 'source_observed_at':snapshot['observed_at'],
                'method':{'profile':'Mean of normalized unique original-owner caption embeddings, normalized again; minimum 2 distinct captions.',
                          'similarity':'Cosine similarity; top 5 neighbours per profile, minimum 0.55.',
                          'topics':'K-means over unique caption embeddings; labels are TF-IDF keywords, not human annotations.',
                          'narratives':'Similarity to six explicit interpretive frames, threshold 0.42 and margin 0.04; hypotheses, not verified positions.',
                          'chunking':'110-token chunks, stride 90, normalized mean; CPU local inference.'},'periods':periods}

    def period(self,posts,vectors,texts):
        by_owner = defaultdict(list)
        seen = set()
        for i,p in enumerate(posts):
            key = (p['owner'],texts[i])
            if p['owner'] and key not in seen:
                by_owner[p['owner']].append(i)
                seen.add(key)
        ids = sorted(u for u,ix in by_owner.items() if len(ix)>=2)
        nodes = [{'id':u,'captions':len(by_owner[u])} for u in ids]
        edges = []
        if len(ids)>1:
            centroids = normalize(np.stack([vectors[by_owner[u]].mean(axis=0) for u in ids]))
            similarities = np.clip(centroids @ centroids.T,-1,1)
            np.fill_diagonal(similarities,-2)
            pairs = set()
            for i in range(len(ids)):
                for j in np.argsort(-similarities[i],kind='stable')[:5]:
                    if similarities[i,j]>=.55: pairs.add(tuple(sorted((i,int(j)))))
            for i,j in sorted(pairs):
                a,b=by_owner[ids[i]],by_owner[ids[j]]
                scores=vectors[a] @ vectors[b].T
                x,y=np.unravel_index(np.argmax(scores),scores.shape)
                edges.append({'source':ids[i],'target':ids[j],'score':round(float(similarities[i,j]),4),
                              'evidence':[posts[a[x]]['id'],posts[b[y]]['id']], 'caption_score':round(float(scores[x,y]),4)})
        unique = list(dict((text,i) for i,text in reversed(list(enumerate(texts)))).values())
        # The dictionary construction above keeps one representative per exact cleaned text.
        topics=[]
        if len(unique)>=3:
            k=min(10,max(2,int(np.sqrt(len(unique)/6))),len(unique))
            km=KMeans(n_clusters=k,random_state=42,n_init=5).fit(vectors[unique])
            labels={idx:int(label) for idx,label in zip(unique,km.labels_)}
            text_labels={texts[i]:labels[i] for i in unique}
            all_labels=np.array([text_labels[t] for t in texts])
            try:
                tf=TfidfVectorizer(stop_words=sorted(STOP),ngram_range=(1,2),min_df=1,max_df=.9,token_pattern=r'(?u)\b[^\W\d_]{3,}\b')
                terms=tf.fit_transform(texts); words=np.array(tf.get_feature_names_out())
            except ValueError:
                terms=None
            for label in range(k):
                ix=np.flatnonzero(all_labels==label)
                if not len(ix): continue
                keyword=[]
                if terms is not None:
                    weights=np.asarray(terms[ix].mean(axis=0)).ravel()
                    for word in words[np.argsort(-weights)[:30]]:
                        if not any(word in w or w in word for w in keyword): keyword.append(str(word))
                        if len(keyword)==4: break
                center=normalize(km.cluster_centers_[label][None,:])[0]
                order=ix[np.argsort(-(vectors[ix]@center))]
                topics.append({'id':str(label),'label':' · '.join(keyword[:3]) or 'Contenuti vari', 'keywords':keyword,
                               'count':len(ix),'profiles':len({posts[i]['owner'] for i in ix if posts[i]['owner']}),
                               'examples':[posts[i]['id'] for i in order[:4]],'posts':[posts[i]['id'] for i in ix]})
        narratives=[]
        if len(posts):
            scores=vectors @ self.frames.T
            best=np.argsort(-scores,axis=1)
            for j,(label,anchor) in enumerate(FRAMES):
                ix=[i for i in range(len(posts)) if best[i,0]==j and scores[i,j]>=.42 and scores[i,j]-scores[i,best[i,1]]>=.04]
                if ix:
                    ix.sort(key=lambda i:-scores[i,j])
                    narratives.append({'label':label,'anchor':anchor,'count':len(ix),'examples':[posts[i]['id'] for i in ix[:3]],'posts':[posts[i]['id'] for i in ix]})
        return {'caption_count':len(posts),'nodes':nodes,'edges':edges,'topics':sorted(topics,key=lambda t:-t['count']),
                'narratives':sorted(narratives,key=lambda n:-n['count'])}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--db',required=True); parser.add_argument('--state',required=True)
    parser.add_argument('--loop',action='store_true'); parser.add_argument('--interval',type=int,default=120)
    args=parser.parse_args(); state=Path(args.state); state.mkdir(parents=True,exist_ok=True)
    engine=Engine(state/'embeddings.sqlite3'); last=None
    while True:
        try:
            snapshot=read_snapshot(args.db)
            fingerprint=hashlib.sha256(json.dumps(snapshot,sort_keys=True).encode()).hexdigest()
            if fingerprint != last:
                result=engine.analyze(snapshot)
                atomic_json(state/'semantic.json',result)
                last=fingerprint
                print(f'Analisi aggiornata: {result["periods"]["0"]["caption_count"]} caption',flush=True)
        except Exception as exc:
            print(f'Analisi non aggiornata: {type(exc).__name__}: {exc}',flush=True)
            if not args.loop: raise
        if not args.loop: break
        time.sleep(max(30,args.interval))

if __name__=='__main__': main()
