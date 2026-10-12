import {collaborationNetwork,filterNetwork} from './network.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>(n||0).toLocaleString('it-IT'), date=s=>s?new Date(s).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Non disponibile';
const urlPost=id=>`https://www.instagram.com/p/${encodeURIComponent(id)}/`, urlUser=id=>`https://www.instagram.com/${encodeURIComponent(id)}/`;
const COLORS={'Politico':'#3454b4','Partito Politico':'#6554a4','Giornalista':'#C08A2E','Media tradizionali':'#2F5D8C','New Media':'#2E8F8B','Content Creator':'#8097cc','Altro':'#6F7479','Fuori elenco':'#9AA0A6'};
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
  const q=state.query.toLowerCase().replace(/^@/,'');
  const selectedPosts=collabs.filter(p=>(!state.category||p.authors.some(a=>profiles.get(a)?.category===state.category))&&(!q||p.authors.some(a=>a.includes(q))));
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
function selectProfile(id){state.selected=id;state.feedLimit=9;state.rankLimit=12;userMoved=true;focusRequest=false;renderProfiles();renderFeed();updateGraphCaption();focusOnSelection();draw();updateUrl();}

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

// Immersive canvas: curves and lighting encode the existing graph, never extra links.
const canvas=$('graph'),area=$('graph-area'),ctx=canvas.getContext('2d');
let width=1,height=1,dpr=1,positions=new Map(),edges=[],transform=d3.zoomIdentity,hover=null,userMoved=false;
let graphVisible=true,framePending=0,lastFrame=0,labelsExpanded=false,immersive=false,focusRequest=false;
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');let motionEnabled=!reducedMotion.matches;
const GLOW=COLORS;
const glow=id=>GLOW[profiles.get(id)?.category]||GLOW.Altro;
const idOf=x=>typeof x==='object'?x.id:x;
const alpha=(hex,a)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
const graphPanel=document.querySelector('.network-panel');
graphPanel.querySelector('.panel-heading').insertAdjacentHTML('beforeend','<button class="immersive-button" id="immersive" aria-expanded="false"><span>⛶</span> Vista immersiva</button>');
area.insertAdjacentHTML('beforeend','<div class="graph-caption"><span class="graph-overline">ESPLORA LE CONNESSIONI</span><strong id="graph-focus-label">Una rete, molte voci.</strong><span id="graph-focus-note">Seleziona un nodo per seguirne i legami.</span></div><div class="graph-display-tools"><button id="graph-labels" aria-pressed="false">Aa <span>Etichette</span></button><button id="graph-motion" aria-pressed="true">◌ <span>Animazione</span></button></div>');
$('graph-motion').setAttribute('aria-pressed',String(motionEnabled));

function usableWidth(){return width-(window.innerWidth>900?290:0);}
function origin(){return[usableWidth()/2,height/2+12];}
function rounded(x,y,w,h,r=7){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function coordinates(n){const[oX,oY]=origin();return{x:oX+transform.x+n.x*transform.k,y:oY+transform.y+n.y*transform.k};}
function componentCenters(nodes,links){
  const parent=new Map(nodes.map(n=>[n.id,n.id]));
  const find=id=>{let p=id;while(parent.get(p)!==p)p=parent.get(p);return p;};
  for(const e of links){const a=find(e.source),b=find(e.target);if(a!==b)parent.set(b,a);}
  const groups=new Map();for(const n of nodes){const root=find(n.id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(n);}
  const sorted=[...groups.values()].sort((a,b)=>b.length-a.length);
  const circles=sorted.map((group,i)=>({r:Math.max(50,Math.sqrt(group.length)*37),group,index:i}));
  d3.packSiblings(circles);const enclosing=d3.packEnclose(circles);
  for(const c of circles)for(const n of c.group){n.cx=c.x-(enclosing?.x||0);n.cy=c.y-(enclosing?.y||0);}
}
const sim=d3.forceSimulation().force('charge',d3.forceManyBody().strength(n=>-160-n.r*8).distanceMax(480))
 .force('link',d3.forceLink().id(n=>n.id).distance(e=>95+(e.source.r||0)+(e.target.r||0)).strength(.33))
 .force('collision',d3.forceCollide().radius(n=>n.r+12).iterations(2))
 .force('x',d3.forceX(n=>n.cx||0).strength(.09)).force('y',d3.forceY(n=>n.cy||0).strength(.09))
 .alphaDecay(.055).velocityDecay(.43).on('tick',()=>{draw();if(firstFit&&!userMoved&&sim.alpha()<.24){fit(false);firstFit=false;}})
 .on('end',()=>{if(focusRequest&&state.selected){focusOnSelection(false);focusRequest=false;}else if(!userMoved)fit(false);});

function renderGraph(){
  const key=JSON.stringify([state.view,state.relation,network.nodes.map(n=>[n.id,n.count]),network.edges.map(e=>[e.source,e.target,e.weight])]);
  $('graph-empty').hidden=!!network.nodes.length;
  const legend=$('legend');legend.querySelectorAll('span').forEach(el=>{const category=el.textContent.trim();el.querySelector('i').style.background=GLOW[category]||GLOW.Altro;});
  updateGraphCaption();
  if(key===graphKey){draw();return;}graphKey=key;
  const next=new Map();
  network.nodes.forEach((n,i)=>{const old=positions.get(n.id),angle=i*2.3999632297;next.set(n.id,{...old,...n,x:old?.x??Math.cos(angle)*Math.sqrt(i+1)*28,y:old?.y??Math.sin(angle)*Math.sqrt(i+1)*28,r:Math.min(35,9+Math.sqrt(n.count)*3.7)});});
  componentCenters([...next.values()],network.edges);positions=next;edges=network.edges.map((e,i)=>({...e,phase:(i*.6180339887)%1}));
  sim.nodes([...positions.values()]);sim.force('link').links(edges);sim.force('x').initialize([...positions.values()]);sim.force('y').initialize([...positions.values()]);sim.alpha(.7).restart();
  focusRequest=!!state.selected&&!userMoved;if(!network.nodes.length)sim.stop();scheduleFrame();
}
function neighbours(id=state.selected){return id?new Set([id,...network.edges.filter(e=>e.source===id||e.target===id).flatMap(e=>[e.source,e.target])]):null;}
function updateGraphCaption(){
  $('graph-focus-label').textContent=state.selected?'@'+state.selected:state.view==='semantic'?'Idee vicine. Voci diverse.':'Una rete, molte voci.';
  $('graph-focus-note').textContent=state.selected?`${num((neighbours()?.size||1)-1)} profili collegati · clic sullo sfondo per tornare alla rete`:'Seleziona un nodo per seguirne i legami.';
}
function curve(s,t){const dx=t.x-s.x,dy=t.y-s.y;return{x:(s.x+t.x)/2-dy*.12,y:(s.y+t.y)/2+dx*.12};}
function onCurve(s,c,t,q){const a=1-q;return{x:a*a*s.x+2*a*q*c.x+q*q*t.x,y:a*a*s.y+2*a*q*c.y+q*q*t.y};}
function draw(now=performance.now()){
  if(!ctx||!graphVisible)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  // Very fine navigation grid, fixed to the camera, with no decorative fake nodes.
  const step=52* Math.max(.65,Math.min(1.3,transform.k));ctx.strokeStyle='#5465a407';ctx.lineWidth=1;
  for(let x=(transform.x%step+step)%step;x<width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
  for(let y=(transform.y%step+step)%step;y<height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  const focusId=state.selected||hover,focus=neighbours(focusId),direct=state.view==='collab'&&state.relation==='direct';
  const projected=new Map([...positions.values()].map(n=>[n.id,{...coordinates(n),node:n}]));
  const sorted=[...positions.values()].sort((a,b)=>b.count-a.count),important=new Set(sorted.slice(0,22).map(n=>n.id));
  // Soft light behind the true high-activity nodes gives depth without changing the data.
  for(const n of sorted.slice(0,18)){if(focus&&!focus.has(n.id))continue;const p=projected.get(n.id),r=Math.max(25,Math.min(100,n.r*transform.k*5));const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);halo.addColorStop(0,alpha(glow(n.id),focus?.09:.08));halo.addColorStop(1,alpha(glow(n.id),0));ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}
  let animated=0;
  for(const e of edges){const s=projected.get(idOf(e.source)),t=projected.get(idOf(e.target));if(!s||!t)continue;
    const active=!focus||s.node.id===focusId||t.node.id===focusId,c=curve(s,t),strong=focus&&active;
    const lineWidth=Math.min(4.2,.6+Math.log1p(e.weight)*(state.view==='semantic'?1.5:.75));
    ctx.lineWidth=strong?lineWidth+1:lineWidth;ctx.lineCap='round';
    if(strong){const gradient=ctx.createLinearGradient(s.x,s.y,t.x,t.y);gradient.addColorStop(0,alpha(glow(s.node.id),.92));gradient.addColorStop(1,alpha(glow(t.node.id),.65));ctx.strokeStyle=gradient;ctx.shadowColor=glow(s.node.id);ctx.shadowBlur=10;}
    else{ctx.strokeStyle=active?alpha(glow(s.node.id),.43):'#9aa0a60c';ctx.shadowBlur=0;}
    ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.quadraticCurveTo(c.x,c.y,t.x,t.y);ctx.stroke();ctx.shadowBlur=0;
    if(direct&&active){const tip=onCurve(s,c,t,.90),before=onCurve(s,c,t,.85),angle=Math.atan2(tip.y-before.y,tip.x-before.x),size=strong?5:3;ctx.fillStyle=alpha(glow(t.node.id),strong?.9:.55);ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-size*Math.cos(angle-.5),tip.y-size*Math.sin(angle-.5));ctx.lineTo(tip.x-size*Math.cos(angle+.5),tip.y-size*Math.sin(angle+.5));ctx.closePath();ctx.fill();}
    if(direct&&active&&motionEnabled&&animated<65&&(strong||important.has(s.node.id))){animated++;const q=(now/11000+e.phase)%1,p=onCurve(s,c,t,q);ctx.fillStyle=alpha(glow(s.node.id),strong?.9:.55);ctx.shadowColor=glow(s.node.id);ctx.shadowBlur=7;ctx.beginPath();ctx.arc(p.x,p.y,strong?2.1:1.25,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  }
  for(const n of [...sorted].reverse()){
    const p=projected.get(n.id),active=!focus||focus.has(n.id),selected=n.id===state.selected,hovered=n.id===hover;
    const r=Math.max(4.2,Math.min(48,n.r*Math.pow(transform.k,.55))),col=glow(n.id);if(p.x<-70||p.x>width+70||p.y<-70||p.y>height+70)continue;
    ctx.globalAlpha=active?1:.16;
    if(active&&(important.has(n.id)||selected||hovered)){ctx.shadowBlur=selected?20:8;ctx.shadowColor=alpha(col,.28);}
    const fill=ctx.createRadialGradient(p.x-r*.3,p.y-r*.4,0,p.x,p.y,r);fill.addColorStop(0,alpha(col,.22));fill.addColorStop(.45,alpha(col,.13));fill.addColorStop(1,alpha(col,.06));
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=alpha(col,selected||hovered?1:.80);ctx.lineWidth=selected?2.2:1.2;ctx.stroke();ctx.shadowBlur=0;
    if(selected||hovered){const pulse=motionEnabled&&selected?Math.sin(now/800)*1.4:0;ctx.beginPath();ctx.arc(p.x,p.y,r+5+pulse,0,Math.PI*2);ctx.strokeStyle=alpha(col,.35);ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,r+10+pulse,0,Math.PI*2);ctx.strokeStyle=alpha(col,.12);ctx.stroke();}
    if(r>=10){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`650 ${Math.min(14,Math.max(8,r*.66))}px 'Archivo',sans-serif`;ctx.fillStyle=active?'#1a1a1a':'#737373';ctx.fillText(initials(n.id),p.x,p.y+.5);}
    else{ctx.fillStyle=alpha(col,.85);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,r*.32),0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;ctx.textAlign='left';ctx.textBaseline='middle';let shown=0;const boxes=[];
  const labelNodes=[...sorted].sort((a,b)=>Number(b.id===state.selected||b.id===hover)-Number(a.id===state.selected||a.id===hover));
  for(const n of labelNodes){if(focus&&!focus.has(n.id))continue;const priority=n.id===state.selected||n.id===hover;const max=labelsExpanded?Math.min(150,positions.size):focus?24:Math.max(12,Math.round(17*transform.k));if(shown>=max&&!priority)continue;
    const p=projected.get(n.id),r=Math.max(4.2,Math.min(48,n.r*Math.pow(transform.k,.55)));if(p.x<10||p.x>usableWidth()-10||p.y<80||p.y>height-65)continue;
    ctx.font=`${priority?650:450} ${priority?12:10}px 'Archivo',sans-serif`;const label=n.id,labelWidth=ctx.measureText(label).width,w=labelWidth+18,h=priority?28:23,x=p.x-w/2,y=p.y+r+8;
    const box={x,y,w,h};if(!priority&&boxes.some(b=>box.x<b.x+b.w+8&&box.x+box.w+8>b.x&&box.y<b.y+b.h+5&&box.y+box.h+5>b.y))continue;if(x<8||x+w>usableWidth()-8)continue;boxes.push(box);shown++;
    rounded(x,y,w,h,6);ctx.fillStyle=priority?'#3454b4':'#fffffff2';ctx.fill();ctx.strokeStyle=alpha(glow(n.id),priority?.55:.20);ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=priority?'#ffffff':'#2c2c2c';ctx.fillText(label,x+9,y+h/2);
  }
}
function scheduleFrame(){if(framePending||!motionEnabled||!graphVisible||document.hidden||state.view==='topics')return;framePending=requestAnimationFrame(function tick(now){framePending=0;if(now-lastFrame>40){draw(now);lastFrame=now;}scheduleFrame();});}
new IntersectionObserver(entries=>{graphVisible=entries[0].isIntersecting;if(graphVisible){draw();scheduleFrame();}},{rootMargin:'100px'}).observe(area);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleFrame();});
function measure(){const rect=area.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=width*dpr;canvas.height=height*dpr;if(!userMoved&&positions.size)fit(false);else draw();}
new ResizeObserver(measure).observe(area);
function findNode(x,y){let hit=null,dist=Infinity;for(const n of positions.values()){const p=coordinates(n),r=Math.max(4.2,Math.min(48,n.r*Math.pow(transform.k,.55))),d=Math.hypot(p.x-x,p.y-y);if(d<r+5&&d<dist){hit=n;dist=d;}}return hit;}
const zoom=d3.zoom().scaleExtent([.08,6]).filter(ev=>ev.type==='wheel'||ev.type==='dblclick'||!findNode(...d3.pointer(ev,canvas))).on('zoom',e=>{transform=e.transform;if(e.sourceEvent){userMoved=true;firstFit=false;}draw();});
const selection=d3.select(canvas).call(zoom).on('dblclick.zoom',null);
selection.call(d3.drag().container(canvas).subject(e=>{const n=findNode(e.x,e.y);return n?{x:e.x,y:e.y,node:n}:null;})
 .on('start',e=>{userMoved=true;firstFit=false;focusRequest=false;if(!e.active)sim.alphaTarget(.06).restart();e.subject.node.fx=e.subject.node.x;e.subject.node.fy=e.subject.node.y;})
 .on('drag',e=>{const[oX,oY]=origin();e.subject.node.fx=(e.x-oX-transform.x)/transform.k;e.subject.node.fy=(e.y-oY-transform.y)/transform.k;draw();})
 .on('end',e=>{if(!e.active)sim.alphaTarget(0);e.subject.node.fx=null;e.subject.node.fy=null;}));
function camera(nodes,animate=true,cap=2){if(!nodes.length)return;const x0=Math.min(...nodes.map(n=>n.x-n.r)),x1=Math.max(...nodes.map(n=>n.x+n.r)),y0=Math.min(...nodes.map(n=>n.y-n.r)),y1=Math.max(...nodes.map(n=>n.y+n.r));const availableW=Math.max(180,usableWidth()-100),availableH=Math.max(180,height-200);const k=Math.max(.08,Math.min(cap,.92/Math.max((x1-x0+70)/availableW,(y1-y0+70)/availableH)));const t=d3.zoomIdentity.translate(-(x0+x1)/2*k,-(y0+y1)/2*k).scale(k);(animate&&!reducedMotion.matches?selection.transition().duration(800).ease(d3.easeCubicInOut):selection).call(zoom.transform,t);}
function fit(animate=true){camera([...positions.values()],animate,1.8);}
function focusOnSelection(animate=true){updateGraphCaption();if(state.selected){const set=neighbours();camera([...positions.values()].filter(n=>set.has(n.id)),animate,2.3);}else fit(animate);}
canvas.addEventListener('mousemove',e=>{const n=findNode(e.offsetX,e.offsetY);hover=n?.id;canvas.classList.toggle('pointing',!!n);$('tooltip').hidden=!n;if(n){$('tooltip').innerHTML=`<b>@${esc(n.id)}</b><small>${esc(profiles.get(n.id)?.category||'Fuori elenco')} · ${num(n.count)} ${state.view==='semantic'?'caption originali':'post condivisi'}</small>`;$('tooltip').style.left=Math.max(8,Math.min(e.offsetX+18,width-245))+'px';$('tooltip').style.top=Math.max(8,Math.min(e.offsetY-65,height-80))+'px';}draw();});
canvas.addEventListener('mouseleave',()=>{hover=null;$('tooltip').hidden=true;draw();});
canvas.addEventListener('click',e=>{const n=findNode(e.offsetX,e.offsetY);selectProfile(n?.id||null);});
$('fit').onclick=()=>{userMoved=true;focusRequest=false;fit();};$('zoom-in').onclick=()=>{userMoved=true;selection.transition().duration(reducedMotion.matches?0:250).call(zoom.scaleBy,1.4);};$('zoom-out').onclick=()=>{userMoved=true;selection.transition().duration(reducedMotion.matches?0:250).call(zoom.scaleBy,1/1.4);};
$('graph-labels').onclick=()=>{labelsExpanded=!labelsExpanded;$('graph-labels').setAttribute('aria-pressed',String(labelsExpanded));draw();};
$('graph-motion').onclick=()=>{motionEnabled=!motionEnabled;$('graph-motion').setAttribute('aria-pressed',String(motionEnabled));if(motionEnabled)scheduleFrame();else{cancelAnimationFrame(framePending);framePending=0;draw();}};
reducedMotion.addEventListener('change',e=>{if(e.matches){motionEnabled=false;$('graph-motion').setAttribute('aria-pressed','false');cancelAnimationFrame(framePending);framePending=0;draw();}});
let inertPanels=[];
function toggleImmersive(value=!immersive){immersive=value;if(immersive){inertPanels=[...document.querySelectorAll('main > :not(#network-view), .sidebar')].filter(el=>!el.inert);inertPanels.forEach(el=>el.inert=true);}else{inertPanels.forEach(el=>el.inert=false);inertPanels=[];}$('network-view').classList.toggle('immersive',immersive);document.body.classList.toggle('graph-immersive',immersive);$('immersive').setAttribute('aria-expanded',String(immersive));$('immersive').innerHTML=immersive?'<span>↙</span> Esci dalla vista':'<span>⛶</span> Vista immersiva';userMoved=false;setTimeout(()=>{measure();focusOnSelection(false);},50);}
$('immersive').onclick=()=>toggleImmersive();document.addEventListener('keydown',e=>{if(e.key==='Escape'&&immersive){toggleImmersive(false);$('immersive').focus();}});

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
