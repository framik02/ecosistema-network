export function collaborationNetwork(posts, relation='direct') {
  const nodes=new Map(), links=new Map();
  for (const p of posts) {
    if(p.authors.length<2) continue;
    for(const id of p.authors){if(!nodes.has(id))nodes.set(id,{id,count:0});nodes.get(id).count++;}
    const pairs=relation==='direct' ? p.authors.filter(a=>p.owner&&a!==p.owner).map(a=>[p.owner,a]) : p.authors.flatMap((a,i)=>p.authors.slice(i+1).map(b=>[a,b].sort()));
    for(const [source,target]of pairs){const key=JSON.stringify([source,target]);if(!links.has(key))links.set(key,{source,target,weight:0,posts:[]});const e=links.get(key);e.weight++;e.posts.push(p.id);}
  }
  return {nodes:[...nodes.values()],edges:[...links.values()]};
}
export function filterNetwork(graph,category,profiles,query=''){
  const q=query.toLowerCase().replace(/^@/,'');
  const matched=new Set(graph.nodes.filter(n=>(!category||profiles.get(n.id)?.category===category)&&(!q||n.id.includes(q))).map(n=>n.id));
  // Keep neighbours of matched profiles, preserving context across categories.
  const edges=graph.edges.filter(e=>matched.has(e.source)||matched.has(e.target));
  const keep=new Set(edges.flatMap(e=>[e.source,e.target]));
  for(const id of matched)keep.add(id);
  return{nodes:graph.nodes.filter(n=>keep.has(n.id)),edges};
}

// Connected components describe observed paths, not inferred political communities.
export function connectedGroups(graph){
  const adjacency=new Map(graph.nodes.map(n=>[n.id,new Set()]));
  for(const e of graph.edges){if(adjacency.has(e.source)&&adjacency.has(e.target)){adjacency.get(e.source).add(e.target);adjacency.get(e.target).add(e.source);}}
  const seen=new Set(),groups=[];
  for(const id of [...adjacency.keys()].sort()){
    if(seen.has(id))continue;const ids=[],queue=[id];seen.add(id);
    for(let i=0;i<queue.length;i++){const current=queue[i];ids.push(current);for(const other of [...adjacency.get(current)].sort()){if(!seen.has(other)){seen.add(other);queue.push(other);}}}
    ids.sort();groups.push({id:ids[0],ids});
  }
  return groups.sort((a,b)=>b.ids.length-a.ids.length||a.id.localeCompare(b.id));
}

export function focusNetwork(graph,id,depth=1){
  const levels=new Map();if(!graph.nodes.some(n=>n.id===id))return{nodes:[],edges:[],levels};
  levels.set(id,0);
  for(let level=0;level<depth;level++)for(const e of graph.edges){
    if(levels.get(e.source)===level&&!levels.has(e.target))levels.set(e.target,level+1);
    if(levels.get(e.target)===level&&!levels.has(e.source))levels.set(e.source,level+1);
  }
  return{nodes:graph.nodes.filter(n=>levels.has(n.id)),edges:graph.edges.filter(e=>levels.has(e.source)&&levels.has(e.target)),levels};
}

export function connectionPostIds(graph,source,target,directed=true){
  return [...new Set(graph.edges.filter(e=>(e.source===source&&e.target===target)||(!directed&&e.source===target&&e.target===source)).flatMap(e=>e.posts||[]))];
}

// Checkpoints contain collaboration identifiers only, never captions or visitor IDs.
export function collaborationCheckpoint(posts,seenAt=new Date().toISOString()){
  const shared=posts.filter(p=>new Set(p.authors).size>1),graph=collaborationNetwork(shared);
  return {version:1,seenAt,posts:[...new Set(shared.map(p=>p.id))].sort(),profiles:graph.nodes.map(n=>n.id).sort(),links:graph.edges.map(e=>JSON.stringify([e.source,e.target])).sort()};
}
export function validCheckpoint(value){
  return !!value&&value.version===1&&Number.isFinite(Date.parse(value.seenAt))&&['posts','profiles','links'].every(k=>Array.isArray(value[k])&&value[k].every(x=>typeof x==='string'))&&value.links.every(x=>{try{const p=JSON.parse(x);return Array.isArray(p)&&p.length===2&&p.every(id=>typeof id==='string');}catch{return false;}});
}
export function collaborationChanges(posts,baseline,now=new Date().toISOString()){
  const current=collaborationCheckpoint(posts,now),empty={current,firstVisit:true,posts:[],profiles:[],links:[],published:[],earlier:[],undated:[]};
  if(!validCheckpoint(baseline))return empty;
  const knownPosts=new Set(baseline.posts),knownProfiles=new Set(baseline.profiles),knownLinks=new Set(baseline.links);
  const fresh=[...new Map(posts.filter(p=>new Set(p.authors).size>1&&!knownPosts.has(p.id)).map(p=>[p.id,p])).values()];
  const since=Date.parse(baseline.seenAt),until=Date.parse(now);
  return {current,firstVisit:false,posts:fresh,profiles:current.profiles.filter(id=>!knownProfiles.has(id)),links:current.links.filter(key=>!knownLinks.has(key)).map(key=>JSON.parse(key)),published:fresh.filter(p=>Date.parse(p.published)>=since&&Date.parse(p.published)<=until),earlier:fresh.filter(p=>Date.parse(p.published)<since),undated:fresh.filter(p=>!Number.isFinite(Date.parse(p.published))||Date.parse(p.published)>until)};
}
