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
