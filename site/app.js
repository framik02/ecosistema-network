import {collaborationNetwork,filterNetwork} from './network.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>(n||0).toLocaleString('it-IT'), date=s=>s?new Date(s).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Non disponibile';
const urlPost=id=>`https://www.instagram.com/p/${encodeURIComponent(id)}/`, urlUser=id=>`https://www.instagram.com/${encodeURIComponent(id)}/`;
const COLORS={'Politico':'#559876','Partito Politico':'#a1b77a','Giornalista':'#c6a25c','Media tradizionali':'#748db2','New Media':'#549d9d','Content Creator':'#b18ba6','Altro':'#8c9988','Fuori elenco':'#b8beb3'};
const cfg=window.ECOSYSTEM_CONFIG||{snapshot:'/snapshot',semantic:'/semantic',refreshMs:10000};
const state={view:'collab',days:1,relation:'direct',threshold:.65,category:'',query:'',selected:null,topic:null,topicLabel:'',feedLimit:9,rankLimit:12};
let data=null,sem=null,profiles=new Map(),postIndex=new Map(),network={nodes:[],edges:[]},periodPosts=[],requesting=false,semanticError=false,graphKey='',firstFit=true;
const color=id=>COLORS[profiles.get(id)?.category]||COLORS.Altro;
const initials=id=>id.replace(/[_.]/g,'').slice(0,2).toUpperCase();
const semPeriod=()=>sem?.periods?.[String(state.days)];

function metric(label,value,note,symbol){return`<article class="metric"><span class="metric-label">${label}</span><span class="metric-symbol" aria-hidden="true">${symbol}</span><strong>${typeof value==='number'?num(value):esc(value)}</strong><small>${note}</small></article>`;}
function showNotice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function freshness(){
  if(!data)return;
  const age=Date.now()-new Date(data.observed_at).getTime(),stale=age>30*60000;
  $('fresh-title').textContent=stale?'Ultimi dati disponibili':'Dati aggiornati';$('fresh-time').textContent=date(data.observed_at);$('status-dot').classList.toggle('stale',stale);
  $('method-meta').textContent=`Ultima osservazione: ${date(data.observed_at)}. Analisi semantica: ${date(sem?.generated_at)}. Le mappe mostrano il periodo selezionato; i dati pubblicati possono arrivare con qualche minuto di ritardo.`;
}
function setView(view){state.view=view;state.selected=null;state.topic=null;state.feedLimit=9;state.rankLimit=12;firstFit=true;userMoved=false;render();updateUrl();}
function updateUrl(){const q=new URLSearchParams({view:state.view,days:state.days});if(state.selected)q.set('profile',state.selected);history.replaceState(null,'',`${location.pathname}?${q}`);}
function render(){
  if(!data)return;
  const semantic=state.view==='semantic',topics=state.view==='topics',sp=semPeriod();
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
  $('title').innerHTML=topics?'I contenuti, <em>in prospettiva.</em>':semantic?'Le affinità, <em>oltre i legami.</em>':'Le relazioni, <em>in chiaro.</em>';
  $('subtitle').textContent=topics?'Temi ricorrenti e possibili cornici narrative nelle caption dei profili osservati.':semantic?'Profili vicini per ciò che scrivono. Esplora le somiglianze tra i contenuti, anche senza collaborazioni.':'Chi pubblica con chi. Esplora la rete delle collaborazioni nell’ecosistema pubblico italiano.';
  $('network-view').hidden=topics;$('topics-view').hidden=!topics;$('relations').hidden=semantic;$('threshold-wrap').hidden=!semantic;
  $('search').disabled=topics;$('category').disabled=topics;
  $('network-title').textContent=semantic?'La rete delle affinità semantiche':'La rete delle collaborazioni';
  $('network-kicker').textContent=semantic?'SIMILITUDINE TRA CAPTION':'MAPPA DELLE RELAZIONI';
  $('graph-footnote').textContent=semantic?'La vicinanza deriva dai contenuti originali di ciascun profilo (almeno 2 caption). Non implica accordo o collaborazione.':state.relation==='direct'?'Le frecce vanno dall’autore principale ai collaboratori. La dimensione dei nodi indica i post condivisi osservati.':'Ogni linea indica almeno un post in comune. Due coautori possono essere collegati tramite un terzo autore.';
  const cutoff=state.days?Date.now()-state.days*86400000:0;
  periodPosts=data.posts.filter(p=>new Date(p.published).getTime()>=cutoff);
  const collabs=periodPosts.filter(p=>p.authors.length>1);
  const base=semantic?{nodes:(sp?.nodes||[]).map(n=>({...n,count:n.captions})),edges:(sp?.edges||[]).filter(e=>e.score>=state.threshold).map(e=>({...e,weight:e.score}))}:collaborationNetwork(collabs,state.relation);
  network=filterNetwork(base,state.category,profiles,state.query);
  if(semantic){const connected=new Set(network.edges.flatMap(e=>[e.source,e.target]));network.nodes=network.nodes.filter(n=>connected.has(n.id));}
  if(state.selected&&!network.nodes.some(n=>n.id===state.selected))state.selected=null;
  const displayedIds=new Set(network.nodes.map(n=>n.id));
  const selectedPosts=collabs.filter(p=>p.authors.some(a=>displayedIds.has(a)));
  const external=network.nodes.filter(n=>!profiles.get(n.id)?.monitored).length;
  $('metrics').innerHTML=topics?metric('Caption analizzate',sp?.caption_count,'Nel periodo selezionato','≋')+metric('Temi emersi',sp?.topics?.length,'Raggruppamenti automatici','◌')+metric('Cornici suggerite',sp?.narratives?.length,'Ipotesi da verificare nei testi','↗')+metric('Profili confrontabili',sp?.nodes?.length,'Con almeno 2 caption originali','◎'):semantic?metric('Profili connessi',network.nodes.length,'Con affinità sopra la soglia','◎')+metric('Affinità individuate',network.edges.length,'Connessioni visibili nella mappa','↗')+metric('Caption analizzate',sp?.caption_count,'Testi del periodo, non solo collab','≋')+metric('Soglia di similarità',state.threshold.toFixed(2).replace('.',','),'Cosine similarity, non probabilità','≈'):metric('Post in collaborazione',selectedPosts.length,'Contenuti condivisi nel periodo','↗')+metric('Profili nella rete',network.nodes.length,'Autori e collaboratori osservati','◎')+metric('Connessioni',network.edges.length,state.relation==='direct'?'Relazioni autore → collaboratore':'Coppie presenti nello stesso post','⌘')+metric('Profili fuori elenco',external,'Emersi attraverso collaborazioni','＋');
  $('graph-count').textContent=`${num(network.nodes.length)} profili · ${num(network.edges.length)} legami`;
  const cats=[...new Set(network.nodes.map(n=>profiles.get(n.id)?.category||'Altro'))];
  $('legend').innerHTML=cats.map(c=>`<span><i style="background:${COLORS[c]||COLORS.Altro}"></i>${esc(c)}</span>`).join('');
  if(!topics){renderGraph();renderProfiles();}else renderTopics();
  renderFeed();freshness();
  if((topics||semantic)&&!sp)showNotice('L’analisi delle caption non è ancora disponibile. La mappa delle collaborazioni è già consultabile.');
  else if((topics||semantic)&&semanticError)showNotice('L’aggiornamento dell’analisi non è disponibile. Stai consultando l’ultima versione ricevuta.');
}

function renderProfiles(){
  const id=state.selected,semantic=state.view==='semantic';
  $('close-profile').hidden=!id;$('profile-detail').innerHTML='';$('ranking-note').textContent=semantic?'Profili ordinati per numero di caption originali nel periodo.':'Ordinati per numero di post in collaborazione osservati.';
  $('detail-title').textContent=id?'@'+id:'Profili in evidenza';$('detail-kicker').textContent=id?(profiles.get(id)?.category||'Profilo osservato'):'NEL PERIODO SELEZIONATO';
  let rows;
  if(id){
    const n=network.nodes.find(n=>n.id===id);
    const links=network.edges.filter(e=>e.source===id||e.target===id);
    const neighbours=new Map();
    for(const e of links){const other=e.source===id?e.target:e.source;const old=neighbours.get(other);if(!old||semantic||e.weight>old.weight)neighbours.set(other,{...e,id:other});}
    rows=[...neighbours.values()].sort((a,b)=>b.weight-a.weight);
    $('profile-detail').innerHTML=`<div class="profile-metrics"><div><strong>${num(n?.count)}</strong><small>${semantic?'caption originali':'post condivisi'}</small></div><div><strong>${num(neighbours.size)}</strong><small>${semantic?'profili affini':'profili collegati'}</small></div></div><a class="profile-link" href="${urlUser(id)}" target="_blank" rel="noopener">Apri il profilo Instagram ↗</a><div class="profile-description">${semantic?'Somiglianza fra i vettori medi dei profili. Le coppie di testi sotto ogni voce sono esempi della vicinanza rilevata.':'Le connessioni rispettano la modalità selezionata. Seleziona un altro profilo per esplorare i suoi legami.'}</div>`;
    $('ranking-note').textContent=semantic?'Ogni punteggio è una cosine similarity fra i profili.':'Il valore indica il peso del legame nella direzione più frequente, se presente in entrambe le direzioni.';
  }else rows=[...network.nodes].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).map(n=>({...n,weight:n.count}));
  $('ranking').innerHTML=rows.slice(0,state.rankLimit).map((r,i)=>`<div><button class="rank-row" data-profile="${esc(r.id)}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="avatar" style="box-shadow:inset 0 0 0 1px ${color(r.id)}55">${esc(initials(r.id))}</span><span class="rank-name"><b>@${esc(r.id)}</b><small>${esc(profiles.get(r.id)?.category||'Fuori elenco')}</small></span><span class="rank-value">${semantic&&id?r.weight.toFixed(2).replace('.',','):num(r.weight)}</span></button>${semantic&&id&&r.evidence?`<div class="evidence"><b>Esempio di caption affini · ${r.caption_score.toFixed(2).replace('.',',')}</b>${r.evidence.map(code=>{const p=postIndex.get(code);return p?`<a href="${urlPost(code)}" target="_blank" rel="noopener">@${esc(p.owner)}: ${esc(p.caption.slice(0,180))}… ↗</a>`:'';}).join('')}</div>`:''}</div>`).join('')||'<div class="profile-description">Nessun profilo per i filtri selezionati.</div>';
  $('ranking').querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>selectProfile(b.dataset.profile));
  $('more-profiles').hidden=rows.length<=state.rankLimit;
}
function selectProfile(id){state.selected=id;state.feedLimit=9;state.rankLimit=12;renderProfiles();renderFeed();draw();updateUrl();}

function renderTopics(){
  const sp=semPeriod();$('semantic-date').textContent=sem?`Analisi del ${date(sem.generated_at)}`:'In attesa della prima analisi';
  $('topic-grid').innerHTML=(sp?.topics||[]).map((t,i)=>{const example=postIndex.get(t.examples[0]);return`<button class="topic-card ${state.topicLabel===t.label?'active':''}" data-topic="${i}"><span class="topic-top"><span>TEMA ${String(i+1).padStart(2,'0')}</span><span>↗</span></span><h3>${esc(t.label)}</h3><p>${esc(example?.caption.slice(0,180)||'Esplora le caption di questo gruppo.')}…</p><div class="topic-bar"><i style="width:${Math.max(4,t.count/sp.caption_count*100)}%"></i></div><small>${num(t.count)} caption · ${num(t.profiles)} profili</small></button>`;}).join('')||'<p class="empty-feed">Non ci sono ancora abbastanza caption per individuare temi in questo periodo.</p>';
  $('narrative-grid').innerHTML=(sp?.narratives||[]).map((n,i)=>`<button class="narrative-card" data-narrative="${i}"><h3>${esc(n.label)} <span>↗</span></h3><p>${num(n.count)} caption candidate · Leggi gli esempi</p></button>`).join('')||'<p class="empty-feed">Nessuna cornice supera le soglie di confidenza previste in questo periodo.</p>';
  $('topic-grid').querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>chooseTopic(sp.topics[+b.dataset.topic]));
  $('narrative-grid').querySelectorAll('[data-narrative]').forEach(b=>b.onclick=()=>chooseTopic(sp.narratives[+b.dataset.narrative]));
}
function chooseTopic(topic){state.topic=new Set(topic.posts);state.topicLabel=topic.label;state.feedLimit=9;renderTopics();renderFeed();$('feed-title').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});}
function renderFeed(){
  const topics=state.view==='topics',semantic=state.view==='semantic';
  let posts=periodPosts;
  if(!topics&&!semantic)posts=posts.filter(p=>p.authors.length>1);
  if(state.selected)posts=posts.filter(p=>semantic?p.owner===state.selected:p.authors.includes(state.selected));
  if(!topics&&state.query){const q=state.query.toLowerCase().replace(/^@/,'');posts=posts.filter(p=>p.authors.some(a=>a.includes(q)));}
  if(!topics&&state.category)posts=posts.filter(p=>p.authors.some(a=>profiles.get(a)?.category===state.category));
  if(topics&&state.topic)posts=posts.filter(p=>state.topic.has(p.id));
  if(topics||semantic)posts=posts.filter(p=>p.caption);
  $('feed-title').textContent=state.topic&&topics?state.topicLabel:state.selected?'Contenuti di @'+state.selected:topics?'Le caption da esplorare':semantic?'I contenuti alla base della rete':'Le collaborazioni più recenti';
  $('feed-kicker').textContent=state.topic&&topics?'CAPTION DEL GRUPPO SELEZIONATO':'CONTENUTI OSSERVATI';
  $('clear-topic').hidden=!state.topic||!topics;$('feed-count').textContent=`${num(posts.length)} contenuti`;
  $('feed').innerHTML=posts.slice(0,state.feedLimit).map(p=>`<article class="post-card"><div class="post-head"><span class="avatar">${esc(initials(p.owner||'?'))}</span><div><a class="post-author" href="${urlUser(p.owner||'')}" target="_blank" rel="noopener">${p.owner?'@'+esc(p.owner):'Autore non identificato'}</a><small>${date(p.published)}</small></div></div><p class="post-caption">${esc(p.caption||'Caption non disponibile per questo contenuto.')}</p><div class="post-partners">${p.authors.length>1?'Con '+p.authors.filter(a=>a!==p.owner).map(a=>'@'+esc(a)).join(' · '):'Contenuto originale del profilo'}</div><div class="post-bottom"><a href="${urlPost(p.id)}" target="_blank" rel="noopener">Leggi il post completo ↗</a><span>INSTAGRAM</span></div></article>`).join('')||'<p class="empty-feed">Nessun contenuto per questa selezione. Prova a cambiare periodo o filtri.</p>';
  $('more-posts').hidden=posts.length<=state.feedLimit;
}

// Canvas graph: stable node positions across incremental updates.
const canvas=$('graph'),area=$('graph-area'),ctx=canvas.getContext('2d');let width=1,height=1,dpr=1,positions=new Map(),edges=[],transform=d3.zoomIdentity,hover=null,userMoved=false;
const sim=d3.forceSimulation().force('charge',d3.forceManyBody().strength(-100).distanceMax(420)).force('link',d3.forceLink().id(n=>n.id).distance(65).strength(.28)).force('collision',d3.forceCollide().radius(n=>n.r+6)).force('x',d3.forceX().strength(.035)).force('y',d3.forceY().strength(.035)).alphaDecay(.045).on('tick',()=>{draw();if(firstFit&&!userMoved&&sim.alpha()<.18){fit(false);firstFit=false;}});
const idOf=x=>typeof x==='object'?x.id:x;
function renderGraph(){
  const key=JSON.stringify([state.view,state.relation,network.nodes.map(n=>[n.id,n.count]),network.edges.map(e=>[e.source,e.target,e.weight])]);
  $('graph-empty').hidden=!!network.nodes.length;
  if(key===graphKey){draw();return;}graphKey=key;
  const next=new Map();
  network.nodes.forEach((n,i)=>{const old=positions.get(n.id),angle=i*2.3999632297;next.set(n.id,{...old,...n,x:old?.x??Math.cos(angle)*Math.sqrt(i+1)*16,y:old?.y??Math.sin(angle)*Math.sqrt(i+1)*16,r:Math.min(18,4+Math.sqrt(n.count)*1.6)});});
  positions=next;edges=network.edges.map(e=>({...e}));sim.nodes([...positions.values()]);sim.force('link').links(edges);sim.alpha(.65).restart();
  if(!network.nodes.length)sim.stop();
}
function neighbours(){return state.selected?new Set([state.selected,...network.edges.filter(e=>e.source===state.selected||e.target===state.selected).flatMap(e=>[e.source,e.target])]):null;}
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2+transform.x,height/2+transform.y);ctx.scale(transform.k,transform.k);
  const focus=neighbours(),direct=state.view==='collab'&&state.relation==='direct';
  for(const e of edges){const s=e.source,t=e.target;if(typeof s!=='object'||typeof t!=='object')continue;const active=!focus||s.id===state.selected||t.id===state.selected;ctx.strokeStyle=active?(focus?'#527d6899':'#9bac9466'):'#bcc6b318';ctx.lineWidth=(active?(state.view==='semantic'?1.3:Math.min(4,.65+Math.log1p(e.weight))):.5)/Math.sqrt(transform.k);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(t.x,t.y);ctx.stroke();if(direct&&active&&(transform.k>.7||focus)){const angle=Math.atan2(t.y-s.y,t.x-s.x),x=t.x-Math.cos(angle)*(t.r+3/transform.k),y=t.y-Math.sin(angle)*(t.r+3/transform.k),a=4/transform.k;ctx.fillStyle=focus?'#527d68':'#a0b095';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(angle-.5)*a,y-Math.sin(angle-.5)*a);ctx.lineTo(x-Math.cos(angle+.5)*a,y-Math.sin(angle+.5)*a);ctx.closePath();ctx.fill();}}
  const sorted=[...positions.values()].sort((a,b)=>b.count-a.count);ctx.textBaseline='middle';
  for(const n of sorted){const active=!focus||focus.has(n.id);ctx.globalAlpha=active?1:.14;ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle=color(n.id);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2/transform.k;ctx.stroke();if(n.id===state.selected||n.id===hover){ctx.beginPath();ctx.arc(n.x,n.y,n.r+4/transform.k,0,Math.PI*2);ctx.strokeStyle='#214e3c';ctx.lineWidth=1.5/transform.k;ctx.stroke();}}
  ctx.globalAlpha=1;let shown=0;const boxes=[];
  for(const n of sorted){if(focus&&!focus.has(n.id))continue;if(!focus&&shown>=Math.max(10,Math.round(12*transform.k)))continue;const font= n.id===state.selected?12:10;ctx.font=`${n.id===state.selected?700:500} ${font/transform.k}px 'DM Sans',sans-serif`;const x=n.x+n.r+5/transform.k,y=n.y,w=ctx.measureText(n.id).width,h=14/transform.k;const box={x,y:y-h/2,w,h};if(n.id!==state.selected&&n.id!==hover&&boxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))continue;boxes.push(box);shown++;ctx.strokeStyle='#ffffffed';ctx.lineWidth=4/transform.k;ctx.strokeText(n.id,x,y);ctx.fillStyle='#365344';ctx.fillText(n.id,x,y);}
}
function measure(){const rect=area.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=width*dpr;canvas.height=height*dpr;draw();}
new ResizeObserver(measure).observe(area);
function findNode(x,y){x=(x-width/2-transform.x)/transform.k;y=(y-height/2-transform.y)/transform.k;let hit=null,dist=Infinity;for(const n of positions.values()){const d=Math.hypot(n.x-x,n.y-y);if(d<n.r+5/transform.k&&d<dist){hit=n;dist=d;}}return hit;}
const zoom=d3.zoom().scaleExtent([.08,6]).on('zoom',e=>{transform=e.transform;if(e.sourceEvent){userMoved=true;firstFit=false;}draw();});
const selection=d3.select(canvas).call(zoom).on('dblclick.zoom',null);
sim.on('end',()=>{if(!userMoved)fit(false);});
function fit(animate=true){if(!positions.size)return;const ns=[...positions.values()],x0=Math.min(...ns.map(n=>n.x-n.r)),x1=Math.max(...ns.map(n=>n.x+n.r)),y0=Math.min(...ns.map(n=>n.y-n.r)),y1=Math.max(...ns.map(n=>n.y+n.r)),k=Math.max(.08,Math.min(2,.8/Math.max((x1-x0+60)/width,(y1-y0+60)/height)));const t=d3.zoomIdentity.translate(-(x0+x1)/2*k,-(y0+y1)/2*k).scale(k);(animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches?selection.transition().duration(350):selection).call(zoom.transform,t);}
canvas.addEventListener('mousemove',e=>{const n=findNode(e.offsetX,e.offsetY);hover=n?.id;canvas.classList.toggle('pointing',!!n);$('tooltip').hidden=!n;if(n){$('tooltip').innerHTML=`<b>@${esc(n.id)}</b><small>${esc(profiles.get(n.id)?.category||'Fuori elenco')} · ${num(n.count)} ${state.view==='semantic'?'caption':'post condivisi'}</small>`;$('tooltip').style.left=Math.min(e.offsetX+14,width-240)+'px';$('tooltip').style.top=Math.min(e.offsetY+14,height-65)+'px';}draw();});
canvas.addEventListener('mouseleave',()=>{hover=null;$('tooltip').hidden=true;draw();});
canvas.addEventListener('click',e=>{const n=findNode(e.offsetX,e.offsetY);if(n)selectProfile(n.id);});
$('fit').onclick=()=>{userMoved=true;fit();};$('zoom-in').onclick=()=>selection.transition().duration(200).call(zoom.scaleBy,1.4);$('zoom-out').onclick=()=>selection.transition().duration(200).call(zoom.scaleBy,1/1.4);

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{state.days=+b.dataset.days;state.selected=null;state.topic=null;state.feedLimit=9;state.rankLimit=12;firstFit=true;userMoved=false;document.querySelectorAll('[data-days]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});render();updateUrl();});
document.querySelectorAll('[data-relation]').forEach(b=>b.onclick=()=>{state.relation=b.dataset.relation;document.querySelectorAll('[data-relation]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});render();});
$('threshold').oninput=e=>{state.threshold=+e.target.value/100;$('threshold-value').textContent=state.threshold.toFixed(2).replace('.',',');render();};
let searchTimer;$('search').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=e.target.value.trim();state.selected=null;firstFit=true;userMoved=false;render();},200);};
$('category').onchange=e=>{state.category=e.target.value;state.selected=null;firstFit=true;userMoved=false;render();};
$('reset').onclick=()=>{state.query='';state.category='';state.selected=null;$('search').value='';$('category').value='';userMoved=false;firstFit=true;graphKey='';render();updateUrl();};
$('close-profile').onclick=()=>selectProfile(null);$('more-profiles').onclick=()=>{state.rankLimit+=20;renderProfiles();};$('more-posts').onclick=()=>{state.feedLimit+=12;renderFeed();};$('clear-topic').onclick=()=>{state.topic=null;renderTopics();renderFeed();};
for(const id of ['method-open','method-footer'])$(id).onclick=()=>$('method').showModal();
$('method').onclick=e=>{if(e.target===$('method')){const r=$('method').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('method').close();}};
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,5000);}
$('share').onclick=async()=>{const link=cfg.publicUrl?`${cfg.publicUrl}${location.search}`:location.href;try{await navigator.clipboard.writeText(link);toast('Link copiato. La selezione del periodo e del profilo è inclusa.');}catch{window.prompt('Copia questo link',link);}};
async function fetchJson(url){const sep=url.includes('?')?'&':'?';const r=await fetch(url+sep+'v='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('Dati non disponibili');return r.json();}
async function refresh(){
  if(requesting)return;requesting=true;
  try{
    const next=await fetchJson(cfg.snapshot);if(next.schema!==1||!Array.isArray(next.posts)||!Array.isArray(next.profiles))throw Error('Formato non disponibile');
    data=next;profiles=new Map(data.profiles.map(p=>[p.id,p]));postIndex=new Map(data.posts.map(p=>[p.id,p]));
    const categoryOptions=[...new Set(data.profiles.map(p=>p.category))].sort();
    $('category').innerHTML='<option value="">Tutte le categorie</option>'+categoryOptions.map(c=>`<option ${c===state.category?'selected':''}>${esc(c)}</option>`).join('');
    $('profiles').innerHTML=data.profiles.map(p=>`<option value="${esc(p.id)}">`).join('');
    showNotice('');
    try{const analysis=await fetchJson(cfg.semantic);if(analysis.schema===1&&analysis.periods){sem=analysis;semanticError=false;}else semanticError=true;}catch{semanticError=true;}
    render();
  }catch{showNotice(data?'Connessione ai nuovi dati momentaneamente non disponibile. Restano visibili gli ultimi dati ricevuti.':'Non riesco a caricare i dati. Riproverò automaticamente.');$('fresh-title').textContent=data?'Ultimi dati ricevuti':'Dati non disponibili';$('status-dot').classList.add('stale');}
  finally{requesting=false;}
}
const params=new URLSearchParams(location.search);if(['collab','semantic','topics'].includes(params.get('view')))state.view=params.get('view');if(['0','1','7','30'].includes(params.get('days')))state.days=+params.get('days');state.selected=params.get('profile');
document.querySelectorAll('[data-days]').forEach(x=>{const active=+x.dataset.days===state.days;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});
refresh();setInterval(()=>{if(!document.hidden)refresh();},cfg.refreshMs);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
