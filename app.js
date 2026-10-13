import {collaborationNetwork,ecosystemNetwork,categoryPairs,filterNetwork,connectedGroups,focusNetwork,connectionPostIds,collaborationCheckpoint,collaborationChanges,validCheckpoint} from './network.js?v=686db2293faf46a9';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>(n||0).toLocaleString('it-IT'), date=s=>s?new Date(s).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Non disponibile';
const urlPost=id=>`https://www.instagram.com/p/${encodeURIComponent(id)}/`, urlUser=id=>`https://www.instagram.com/${encodeURIComponent(id)}/`;
const COLORS={'Politico':'#2c3e8f','Partito Politico':'#7b3fb8','Giornalista':'#0e8e9b','Media tradizionali':'#3e8a2e','New Media':'#ec008c','Content Creator':'#d9930f','Altro':'#7a7f87','Fuori elenco':'#b9b3ac'};
let atlas=false;
const cfg=window.ECOSYSTEM_CONFIG||{snapshot:'/snapshot',semantic:'/semantic',refreshMs:10000};
const state={view:'collab',days:7,scope:'ecosystem',relation:'direct',threshold:.65,category:'',query:'',selected:null,topic:null,topicLabel:'',feedLimit:9,rankLimit:12};
let data=null,sem=null,profiles=new Map(),postIndex=new Map(),network={nodes:[],edges:[]},periodPosts=[],requesting=false,semanticError=false,graphKey='',firstFit=true;
const color=id=>COLORS[profiles.get(id)?.category]||COLORS.Altro;
const initials=id=>id.replace(/[_.]/g,'').slice(0,2).toUpperCase();
const semPeriod=()=>sem?.periods?.[String(state.days)];
const monitored=id=>!!profiles.get(id)?.monitored,catOf=id=>profiles.get(id)?.category||'Fuori elenco';
const CATEGORY_ORDER=['Politico','Partito Politico','Giornalista','Media tradizionali','New Media','Content Creator','Altro'];
const ecosystemView=()=>state.view==='collab'&&state.scope==='ecosystem';

function metric(label,value,note,symbol){return`<article class="metric"><span class="metric-label">${label}</span><span class="metric-symbol" aria-hidden="true">${symbol}</span><strong>${typeof value==='number'?num(value):esc(value)}</strong><small>${note}</small></article>`;}
function showNotice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function freshness(){
  if(!data)return;
  const age=Date.now()-new Date(data.observed_at).getTime(),stale=age>30*60000;
  $('fresh-title').textContent=stale?'Ultimi dati disponibili':'Dati aggiornati';$('fresh-time').textContent=date(data.observed_at);$('status-dot').classList.toggle('stale',stale);
  $('method-meta').textContent=cfg.collaborationsOnly?`Ultima osservazione: ${date(data.observed_at)}. Aggiornamento automatico delle collaborazioni osservate.`:`Ultima osservazione: ${date(data.observed_at)}. Analisi semantica: ${date(sem?.generated_at)}. Le mappe mostrano il periodo selezionato; i dati pubblicati possono arrivare con qualche minuto di ritardo.`;
}
function setView(view){state.view=cfg.collaborationsOnly?'collab':view;state.selected=null;state.topic=null;state.feedLimit=9;state.rankLimit=12;firstFit=true;userMoved=false;render();updateUrl();}
function updateUrl(){const q=new URLSearchParams({view:state.view,days:state.days});if(state.scope==='all')q.set('scope','all');if(state.selected)q.set('profile',state.selected);history.replaceState(null,'',`${location.pathname}?${q}`);}
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
  $('graph-footnote').textContent=semantic?'La vicinanza deriva dai contenuti originali di ciascun profilo (almeno 2 caption). Non implica accordo o collaborazione.':state.relation==='direct'?'Le frecce vanno dall’autore principale ai collaboratori. La dimensione dei nodi indica con quanti profili diversi collabora ciascuno; le coppie isolate restano più chiare.':'Ogni linea indica almeno un post in comune. Due coautori possono essere collegati tramite un terzo autore.';
  const cutoff=state.days?Date.now()-state.days*86400000:0;
  periodPosts=data.posts.filter(p=>new Date(p.published).getTime()>=cutoff);
  const collabs=periodPosts.filter(p=>p.authors.length>1);
  const full=semantic?{nodes:(sp?.nodes||[]).map(n=>({...n,count:n.captions})),edges:(sp?.edges||[]).filter(e=>e.score>=state.threshold).map(e=>({...e,weight:e.score}))}:collaborationNetwork(collabs,state.relation);
  const eco=ecosystemView(),base=eco?ecosystemNetwork(full,monitored):full;
  network=filterNetwork(base,state.category,profiles,state.query);
  if(semantic){const connected=new Set(network.edges.flatMap(e=>[e.source,e.target]));network.nodes=network.nodes.filter(n=>connected.has(n.id));}
  if(state.selected&&!network.nodes.some(n=>n.id===state.selected))state.selected=null;
  const displayedIds=new Set(network.nodes.map(n=>n.id));
  const q=state.query.toLowerCase().replace(/^@/,'');
  const selectedPosts=collabs.filter(p=>(!eco||p.authors.filter(monitored).length>1)&&(!state.category||p.authors.some(a=>profiles.get(a)?.category===state.category))&&(!q||p.authors.some(a=>a.includes(q))));
  const external=network.nodes.filter(n=>!profiles.get(n.id)?.monitored).length;
  $('metrics').innerHTML=topics?metric('Caption analizzate',sp?.caption_count,'Nel periodo selezionato','≋')+metric('Temi emersi',sp?.topics?.length,'Raggruppamenti automatici','◌')+metric('Cornici suggerite',sp?.narratives?.length,'Ipotesi da verificare nei testi','↗')+metric('Profili confrontabili',sp?.nodes?.length,'Con almeno 2 caption originali','◎'):semantic?metric('Profili connessi',network.nodes.length,'Con affinità sopra la soglia','◎')+metric('Affinità individuate',network.edges.length,'Connessioni visibili nella mappa','↗')+metric('Caption analizzate',sp?.caption_count,'Testi del periodo, non solo collab','≋')+metric('Soglia di similarità',state.threshold.toFixed(2).replace('.',','),'Cosine similarity, non probabilità','≈'):eco?metric('Legami nell’ecosistema',network.edges.length,'Fra due profili monitorati','↔')+metric('Profili collegati',network.nodes.length,'Monitorati con almeno un legame','◎')+metric('Post fra monitorati',selectedPosts.length,'Pubblicati insieme nel periodo','↗')+metric('Profili esterni coinvolti',full.nodes.filter(n=>!monitored(n.id)).length,'Visibili con «Con profili esterni»','＋'):metric('Post in collaborazione',selectedPosts.length,'Contenuti condivisi nel periodo','↗')+metric('Profili nella rete',network.nodes.length,'Autori e collaboratori osservati','◎')+metric('Connessioni',network.edges.length,state.relation==='direct'?'Relazioni autore → collaboratore':'Coppie presenti nello stesso post','↔')+metric('Profili fuori elenco',external,'Emersi attraverso collaborazioni','＋');
  $('graph-count').textContent=`${num(network.nodes.length)} profili · ${num(network.edges.length)} legami`;
  const cats=[...new Set(network.nodes.map(n=>profiles.get(n.id)?.category||'Altro'))];
  $('legend').innerHTML=cats.map(c=>`<span><i style="background:${COLORS[c]||COLORS.Altro}"></i>${esc(c)}</span>`).join('');
  $('scope').hidden=state.view!=='collab';$('graph-empty').innerHTML=eco?'Nessun legame fra profili monitorati in questo periodo.<br><span>Prova un periodo più ampio o mostra i profili esterni.</span>':'Nessuna connessione per questi filtri.<br><span>Prova un periodo più ampio.</span>';
  renderReadings(collabs);
  if(!topics){renderGraph();renderProfiles();}else renderTopics();
  renderFeed();freshness();renderAtlas();
  if((topics||semantic)&&!sp)showNotice('L’analisi delle caption non è ancora disponibile. La mappa delle collaborazioni è già consultabile.');
  else if((topics||semantic)&&semanticError)showNotice('L’aggiornamento dell’analisi non è disponibile. Stai consultando l’ultima versione ricevuta.');
}

function renderProfiles(){
  if(atlas)$('atlas-right').classList.toggle('selected',!!state.selected);
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
    $('profile-detail').innerHTML=`<div class="profile-metrics"><div><strong>${num(n?.count)}</strong><small>${semantic?'caption originali':'post condivisi'}</small></div><div><strong>${num(neighbours.size)}</strong><small>${semantic?'profili affini':ecosystemView()?'profili monitorati':'profili collegati'}</small></div>${n?.external?`<div><strong>${num(n.external)}</strong><small>profili esterni</small></div>`:''}</div><a class="profile-link" href="${urlUser(id)}" target="_blank" rel="noopener">Apri il profilo Instagram ↗</a><div class="profile-description">${semantic?'Somiglianza fra i vettori medi dei profili. Le coppie di testi sotto ogni voce sono esempi della vicinanza rilevata.':'Le connessioni rispettano la modalità selezionata. Seleziona un altro profilo per esplorare i suoi legami.'}</div>`;
    $('ranking-note').textContent=semantic?'Ogni punteggio è una cosine similarity fra i profili.':'Il valore indica il peso del legame nella direzione più frequente, se presente in entrambe le direzioni.';
  }else rows=[...network.nodes].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).map(n=>({...n,weight:n.count}));
  $('ranking').innerHTML=rows.slice(0,state.rankLimit).map((r,i)=>`<div><button class="rank-row" data-profile="${esc(r.id)}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="avatar" style="box-shadow:inset 0 0 0 1px ${color(r.id)}55">${esc(initials(r.id))}</span><span class="rank-name"><b>@${esc(r.id)}</b><small>${esc(profiles.get(r.id)?.category||'Fuori elenco')}</small></span><span class="rank-value">${semantic&&id?r.weight.toFixed(2).replace('.',','):num(r.weight)}</span></button>${semantic&&id&&r.evidence?`<div class="evidence"><b>Esempio di caption affini · ${r.caption_score.toFixed(2).replace('.',',')}</b>${r.evidence.map(code=>{const p=postIndex.get(code);return p?`<a href="${urlPost(code)}" target="_blank" rel="noopener">@${esc(p.owner)}: ${esc(p.caption.slice(0,180))}… ↗</a>`:'';}).join('')}</div>`:''}</div>`).join('')||'<div class="profile-description">Nessun profilo per i filtri selezionati.</div>';
  $('ranking').querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>selectProfile(b.dataset.profile));
  if(id&&!semantic)$('ranking').querySelectorAll('[data-profile]').forEach(b=>{
    const other=b.dataset.profile,count=connectionPostIds(network,id,other,false).length;
    const button=document.createElement('button');button.className='connection-button';button.textContent=`Vedi ${num(count)} post ↗`;button.setAttribute('aria-label',`Vedi i post tra ${id} e ${other}`);button.onclick=()=>openConnection(id,other,false);b.after(button);
  });
  $('more-profiles').hidden=rows.length<=state.rankLimit;
}
function selectProfile(id){if(id&&panelCollapsed){panelCollapsed=false;$('network-view').classList.remove('panel-collapsed');$('panel-toggle').setAttribute('aria-expanded','true');$('panel-toggle').textContent='Nascondi elenco';}state.selected=id;focusDepth=1;hover=null;hoverEdge=null;rebuildFocus();state.feedLimit=9;state.rankLimit=12;userMoved=true;focusRequest=false;renderProfiles();renderFeed();updateGraphCaption();focusOnSelection();draw();updateUrl();}

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
  if(!topics&&!semantic)posts=posts.filter(p=>p.authors.length>1&&(!ecosystemView()||p.authors.filter(monitored).length>1));
  if(state.selected)posts=posts.filter(p=>semantic?p.owner===state.selected:p.authors.includes(state.selected));
  if(!topics&&state.query){const q=state.query.toLowerCase().replace(/^@/,'');posts=posts.filter(p=>p.authors.some(a=>a.includes(q)));}
  if(!topics&&state.category)posts=posts.filter(p=>p.authors.some(a=>profiles.get(a)?.category===state.category));
  if(topics&&state.topic)posts=posts.filter(p=>state.topic.has(p.id));
  if(topics||semantic)posts=posts.filter(p=>p.caption);
  $('feed-title').textContent=state.topic&&topics?state.topicLabel:state.selected?'Contenuti di @'+state.selected:topics?'Le caption da esplorare':semantic?'I contenuti alla base della rete':'Le collaborazioni più recenti';
  $('feed-kicker').textContent=state.topic&&topics?'CAPTION DEL GRUPPO SELEZIONATO':'CONTENUTI OSSERVATI';
  $('clear-topic').hidden=!state.topic||!topics;$('feed-count').textContent=`${num(posts.length)} contenuti`;
  $('feed').innerHTML=posts.slice(0,state.feedLimit).map(p=>`<article class="post-card"><div class="post-head"><span class="avatar" style="border-color:${p.owner?color(p.owner):'#9AA0A6'}">${esc(initials(p.owner||'?'))}</span><div>${p.owner?`<button class="post-author" data-focus="${esc(p.owner)}" title="Mostra @${esc(p.owner)} sulla mappa">@${esc(p.owner)}</button>`:'<span class="post-author">Autore non identificato</span>'}<small>${date(p.published)}</small></div></div>${cfg.collaborationsOnly?'':`<p class="post-caption">${esc(p.caption||'Caption non disponibile per questo contenuto.')}</p>`}<div class="post-partners">${p.authors.length>1?'<span>Con</span>'+p.authors.filter(a=>a!==p.owner).map(a=>`<button data-focus="${esc(a)}" title="Mostra @${esc(a)} sulla mappa"><i style="background:${color(a)}"></i>@${esc(a)}</button>`).join(''):'Contenuto originale del profilo'}</div><div class="post-bottom"><a href="${urlPost(p.id)}" target="_blank" rel="noopener">Leggi il post completo ↗</a><span>INSTAGRAM</span></div></article>`).join('')||'<p class="empty-feed">Nessun contenuto per questa selezione. Prova a cambiare periodo o filtri.</p>';
  $('more-posts').hidden=posts.length<=state.feedLimit;
}

// Separated observed components, progressive labels and an explicit ego network.
const canvas=$('graph'),area=$('graph-area'),ctx=canvas.getContext('2d');
let width=1,height=1,dpr=1,positions=new Map(),overview=new Map(),edges=[],groups=[],transform=d3.zoomIdentity,hover=null,hoverEdge=null,userMoved=false;
let graphVisible=true,framePending=0,lastFrame=0,labelsExpanded=false,immersive=false,focusRequest=false,focusDepth=1,panelCollapsed=true,layoutContext='',displayContext='',groupHits=[],labelHits=[];
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');let motionEnabled=!reducedMotion.matches;
const glow=id=>color(id),idOf=x=>typeof x==='object'?x.id:x;
const alpha=(hex,a)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
const graphPanel=document.querySelector('.network-panel');
graphPanel.querySelector('.panel-heading').insertAdjacentHTML('beforeend','<button class="panel-toggle" id="panel-toggle" aria-expanded="false" aria-controls="profile-panel">Mostra elenco</button><button class="immersive-button" id="immersive" aria-expanded="false"><span>⛶</span> Vista immersiva</button>');
document.querySelector('.profile-panel').id='profile-panel';
$('network-view').classList.add('panel-collapsed');
area.insertAdjacentHTML('beforeend','<div class="graph-caption"><span class="graph-overline">ESPLORA LE CONNESSIONI</span><strong id="graph-focus-label">Una rete, molte voci.</strong><span id="graph-focus-note"></span><div class="focus-actions"><button id="graph-overview" hidden>← Tutta la rete</button><button id="graph-depth" aria-pressed="false" hidden>Espandi al secondo livello</button></div></div><div class="graph-display-tools"><button id="graph-labels" aria-pressed="false">Aa <span>Etichette</span></button><button id="graph-motion" aria-pressed="true">◌ <span>Animazione</span></button><button id="graph-reorder">↺ <span>Riordina</span></button></div>');
$('network-view').insertAdjacentHTML('beforeend','<dialog id="connection-dialog" aria-labelledby="connection-title"><form method="dialog"><button class="dialog-close" aria-label="Chiudi dettaglio del collegamento">×</button></form><span class="kicker">POST ALLA BASE DEL COLLEGAMENTO</span><h2 id="connection-title"></h2><p id="connection-summary"></p><div id="connection-posts"></div><button id="connection-more" class="more-button">Mostra altri post</button></dialog>');

const visitKey='ecosystem-collaboration-visit-v1:'+cfg.snapshot;
let visitBaseline=null,visitReady=false,visitStorage=true,visitChanges=null,visitPostLimit=12;
try{const saved=JSON.parse(localStorage.getItem(visitKey)||'null');if(validCheckpoint(saved))visitBaseline=saved;}catch{visitStorage=false;}
graphPanel.querySelector('.panel-heading').insertAdjacentHTML('beforeend','<button id="updates-open" class="updates-button" aria-haspopup="dialog">Novità <span id="updates-dot" hidden>●</span></button>');
graphPanel.querySelector('.network-tools').insertAdjacentHTML('beforeend','<button id="show-all" class="overview-button">↖ Panoramica completa</button>');
area.insertAdjacentHTML('beforebegin','<div class="featured-profiles" id="featured-profiles" aria-label="Profili più attivi nel periodo"></div>');
$('network-view').insertAdjacentHTML('beforeend',`<dialog id="updates-dialog" aria-labelledby="updates-title"><form method="dialog"><button class="dialog-close" aria-label="Chiudi novità">×</button></form><span class="kicker">DALL’ULTIMA VISITA</span><h2 id="updates-title">Cosa è cambiato</h2><p id="updates-context"></p><div id="updates-metrics" class="updates-metrics"></div><p id="updates-dates"></p><div id="updates-profiles"></div><div id="updates-links"></div><div id="updates-posts"></div><button id="updates-more" class="more-button" hidden>Mostra altri post</button><div class="updates-footer"><p id="updates-storage"></p><button id="updates-read">Segna come visto</button></div></dialog>`);
function saveVisit(checkpoint){try{localStorage.setItem(visitKey,JSON.stringify(checkpoint));visitStorage=true;}catch{visitStorage=false;}}
function updateVisit(){
  visitChanges=collaborationChanges(data.posts,visitBaseline);
  if(!visitReady&&!visitBaseline){visitBaseline=visitChanges.current;visitReady=true;}
  saveVisit(visitChanges.current);
  $('updates-dot').hidden=!(visitChanges.posts.length||visitChanges.profiles.length||visitChanges.links.length);
  $('updates-open').setAttribute('aria-label',`Novità: ${visitChanges.posts.length} post, ${visitChanges.profiles.length} profili e ${visitChanges.links.length} legami aggiunti`);
  if($('updates-dialog').open)renderVisit();
}
function renderVisit(){
  if(!visitChanges)return;
  const c=visitChanges;
  $('updates-context').textContent=c.firstVisit?'Questa è la prima visita registrata in questo browser. Le novità compariranno dai prossimi aggiornamenti.':`Confronto con i dati consultati il ${date(visitBaseline.seenAt)}. Il riepilogo riguarda l’intero archivio delle collaborazioni, indipendentemente dai filtri della mappa.`;
  $('updates-metrics').innerHTML=[['Post aggiunti',c.posts.length],['Profili aggiunti',c.profiles.length],['Legami aggiunti',c.links.length]].map(([label,count])=>`<div><strong>${num(count)}</strong><span>${label}</span></div>`).join('');
  $('updates-dates').textContent=c.posts.length?`${num(c.published.length)} post pubblicati dopo l’ultima visita · ${num(c.earlier.length)} post precedenti, appena raccolti${c.undated.length?' · '+num(c.undated.length)+' con data non verificabile':''}. Un’aggiunta all’archivio non indica necessariamente una collaborazione appena iniziata.`:c.firstVisit?'':'Nessun nuovo post raccolto rispetto al confronto. Le modifiche ai coautori possono comunque aggiungere profili o legami.';
  $('updates-profiles').innerHTML=c.profiles.length?`<h3>Nuovi profili osservati</h3><p>${c.profiles.slice(0,20).map(id=>'@'+esc(id)).join(' · ')}${c.profiles.length>20?' · e altri '+num(c.profiles.length-20):''}</p>`:'';
  $('updates-links').innerHTML=c.links.length?`<h3>Nuovi legami autore → collaboratore</h3><ul>${c.links.slice(0,10).map(([a,b])=>`<li>@${esc(a)} → @${esc(b)}</li>`).join('')}</ul>${c.links.length>10?`<p>e altri ${num(c.links.length-10)} legami osservati.</p>`:''}`:'';
  const recent=new Set(c.published.map(p=>p.id));
  $('updates-posts').innerHTML=c.posts.slice(0,visitPostLimit).map(p=>`<a class="connection-post" href="${urlPost(p.id)}" target="_blank" rel="noopener"><span><strong>@${esc(p.owner||p.authors[0])}</strong><small>Pubblicato: ${date(p.published)}</small><small>${recent.has(p.id)?'Pubblicato dopo l’ultima visita':'Aggiunto ora all’archivio'}</small></span><span>Apri post ↗</span></a>`).join('');
  $('updates-more').hidden=c.posts.length<=visitPostLimit;
  $('updates-storage').textContent=visitStorage?'Confronto salvato solo in questo browser. Non misura gli accessi al sito.':'Il browser non consente il salvataggio: il confronto resterà disponibile solo durante questa visita.';
}
$('updates-open').onclick=()=>{visitPostLimit=12;renderVisit();$('updates-dialog').showModal();};
$('updates-more').onclick=()=>{visitPostLimit+=12;renderVisit();};
$('updates-read').onclick=()=>{visitBaseline=collaborationCheckpoint(data.posts);visitReady=true;updateVisit();renderVisit();};
$('updates-dialog').addEventListener('close',()=>$('updates-open').focus({preventScroll:true}));
// Scope: the monitored ecosystem by default, external profiles on request.
graphPanel.querySelector('.network-tools').insertAdjacentHTML('afterbegin','<div class="segmented scope-control" id="scope" role="group" aria-label="Profili mostrati"><button data-scope="ecosystem">Ecosistema monitorato</button><button data-scope="all">Con profili esterni</button></div>');
$('scope').onclick=e=>{const b=e.target.closest('[data-scope]');if(!b||b.dataset.scope===state.scope)return;state.scope=b.dataset.scope;state.selected=null;state.feedLimit=9;firstFit=true;userMoved=false;render();updateUrl();};
$('network-view').insertAdjacentHTML('beforebegin','<section class="readings-section" id="readings" aria-labelledby="readings-title"><div class="readings-heading"><span class="kicker">LETTURE DEL PERIODO</span><h2 id="readings-title">In breve, fra i profili monitorati</h2></div><div class="readings" id="readings-list"></div></section>');
$('network-view').insertAdjacentHTML('afterend','<section class="matrix-section" id="matrix-section" aria-labelledby="matrix-title"><div class="section-heading"><div><span class="kicker">FRA CATEGORIE</span><h2 id="matrix-title">Quali mondi collaborano</h2></div><span class="small-label" id="matrix-note"></span></div><p class="section-intro">Ogni casella conta le coppie di profili monitorati che hanno pubblicato insieme nel periodo. Più è scura, più quei due mondi si incontrano.</p><div class="matrix-wrap"><table class="matrix" id="matrix"></table></div></section>');
$('readings-list').onclick=e=>{const b=e.target.closest('[data-profile]');if(!b||!network.nodes.some(n=>n.id===b.dataset.profile))return;selectProfile(b.dataset.profile);document.querySelector('.network-panel').scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});};
const SHORT={'Politico':'Politici','Partito Politico':'Partiti','Giornalista':'Giornalisti','Media tradizionali':'Media','New Media':'New media','Content Creator':'Creator','Altro':'Altro'};
function renderReadings(collabs){
  const show=state.view==='collab';$('readings').hidden=$('matrix-section').hidden=!show;
  document.querySelectorAll('[data-scope]').forEach(b=>{const on=b.dataset.scope===state.scope;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  if(!show)return;
  const eg=ecosystemNetwork(collaborationNetwork(collabs,'direct'),monitored);
  const pairs=new Map(),partners=new Map();
  for(const e of eg.edges){
    const key=[e.source,e.target].sort().join('\u0000');if(!pairs.has(key))pairs.set(key,{a:e.source,b:e.target,posts:new Set()});e.posts.forEach(id=>pairs.get(key).posts.add(id));
    for(const[a,b]of[[e.source,e.target],[e.target,e.source]]){if(!partners.has(a))partners.set(a,new Set());partners.get(a).add(b);}
  }
  const cards=[];
  const strongest=[...pairs.values()].sort((x,y)=>y.posts.size-x.posts.size||x.a.localeCompare(y.a))[0];
  if(strongest)cards.push({value:`${num(strongest.posts.size)} post`,text:`Il legame più frequente è fra <b>@${esc(strongest.a)}</b> e <b>@${esc(strongest.b)}</b>.`,profile:strongest.a});
  const ranked=[...partners].sort((x,y)=>y[1].size-x[1].size||x[0].localeCompare(y[0]));
  const hub=ranked[0]&&ranked[0][1].size>1?ranked[0][0]:null;
  if(hub)cards.push({value:`${num(ranked[0][1].size)} profili`,text:`<b>@${esc(hub)}</b> collabora con più profili monitorati di chiunque altro.`,profile:hub});
  const bridge=[...partners].map(([id,set])=>[id,new Set([...set].map(catOf)).size]).filter(([id,k])=>k>1&&id!==hub).sort((x,y)=>y[1]-x[1]||(partners.get(y[0]).size-partners.get(x[0]).size)||x[0].localeCompare(y[0]))[0];
  if(bridge)cards.push({value:`${num(bridge[1])} categorie`,text:`<b>@${esc(bridge[0])}</b> fa da ponte, i suoi legami toccano mondi diversi.`,profile:bridge[0]});
  const cats=categoryPairs(eg,catOf),topPair=[...cats].sort((x,y)=>y[1]-x[1])[0];
  const low=c=>esc(SHORT[c]||c).toLowerCase();
  if(topPair){const[a,b]=topPair[0].split('|');cards.push({value:`${num(topPair[1])} legami`,text:a===b?`Le collaborazioni più frequenti restano fra <b>${low(a)}</b>.`:`Le collaborazioni più frequenti uniscono <b>${low(a)}</b> e <b>${low(b)}</b>.`});}
  $('readings-list').innerHTML=cards.map(c=>c.profile?`<button class="reading" data-profile="${esc(c.profile)}"><strong>${c.value}</strong><span>${c.text}</span><small>Vedi sulla mappa ↗</small></button>`:`<div class="reading"><strong>${c.value}</strong><span>${c.text}</span></div>`).join('')||'<p class="empty-feed">Nessun legame fra profili monitorati in questo periodo. Prova un periodo più ampio.</p>';
  // Lower triangle of the category matrix, diagonal included.
  const present=CATEGORY_ORDER.filter(c=>eg.nodes.some(n=>catOf(n.id)===c)),max=Math.max(1,...cats.values());
  $('matrix-note').textContent=`${num(eg.edges.length)} legami fra ${num(eg.nodes.length)} profili monitorati`;
  $('matrix').innerHTML=present.length<2?'<caption>Servono legami fra almeno due categorie.</caption>':`<thead><tr><th></th>${present.map(c=>`<th scope="col">${esc(SHORT[c]||c)}</th>`).join('')}</tr></thead><tbody>${present.map((r,i)=>`<tr><th scope="row">${esc(SHORT[r]||r)}</th>${present.map((c,j)=>{if(j>i)return'<td class="void"></td>';const v=cats.get([r,c].sort().join('|'))||0;return`<td style="background:rgba(48,44,117,${v?(.08+.62*v/max).toFixed(3):0});color:${v/max>.5?'#fff':'var(--ink)'}" title="${esc(SHORT[r]||r)} e ${esc(SHORT[c]||c)}, ${num(v)} legami">${v?num(v):''}</td>`;}).join('')}</tr>`).join('')}</tbody>`;
}
let featuredMarkup='';
function renderFeatured(){
  const featured=$('featured-profiles');
  featured.hidden=state.view!=='collab'||!network.nodes.length;$('updates-open').hidden=state.view!=='collab';
  const eco=ecosystemView(),links=new Map();
  if(eco)for(const e of network.edges)for(const[a,b]of[[e.source,e.target],[e.target,e.source]]){if(!links.has(a))links.set(a,new Set());links.get(a).add(b);}
  const value=n=>eco?links.get(n.id)?.size||0:n.count;
  const leaders=[...network.nodes].sort((a,b)=>value(b)-value(a)||b.count-a.count||a.id.localeCompare(b.id)).slice(0,5);
  const html=`<span class="featured-label">PIÙ COLLEGATI <small>${eco?'Profili monitorati':'Post condivisi'}</small></span>`+leaders.map(n=>`<button data-featured="${esc(n.id)}" aria-pressed="${n.id===state.selected}"><span>@${esc(n.id)}</span><b>${num(value(n))}</b></button>`).join('');
  if(featuredMarkup!==html){featuredMarkup=html;const active=document.activeElement?.dataset.featured;featured.innerHTML=html;if(active)[...featured.querySelectorAll('button')].find(b=>b.dataset.featured===active)?.focus({preventScroll:true});}
}
$('featured-profiles').onclick=e=>{const b=e.target.closest('[data-featured]');if(b)selectProfile(b.dataset.featured);};
$('featured-profiles').onpointerover=e=>{const b=e.target.closest('[data-featured]');if(b){hover=b.dataset.featured;draw();}};
$('featured-profiles').onpointerleave=()=>{hover=null;draw();};
$('featured-profiles').onfocusin=e=>{if(e.target.dataset.featured){hover=e.target.dataset.featured;draw();}};
$('featured-profiles').onfocusout=()=>{hover=null;draw();};
$('show-all').onclick=()=>{panelCollapsed=true;$('network-view').classList.add('panel-collapsed');$('panel-toggle').setAttribute('aria-expanded','false');$('panel-toggle').textContent='Mostra elenco';selectProfile(null);userMoved=false;fit();};

$('graph-motion').setAttribute('aria-pressed',String(motionEnabled));
area.querySelector('.graph-hint').textContent='Trascina e ingrandisci · clic su un profilo o un collegamento';
function inset(){return atlas&&window.innerWidth>900?{l:300,r:332,t:66,b:18}:{l:0,r:0,t:0,b:0};}
function usableWidth(){if(atlas){const i=inset();return Math.max(180,width-i.l-i.r);}return Math.max(180,width-(window.innerWidth>900&&!panelCollapsed?290:0));}
function origin(){if(atlas){const i=inset();return[i.l+usableWidth()/2,i.t+(height-i.t-i.b)/2];}return[usableWidth()/2,height/2+20];}
function bounds(){if(atlas){const i=inset();return{l:i.l+4,r:width-i.r-4,t:i.t+4,b:height-i.b-4};}return{l:7,r:usableWidth()-7,t:105,b:height-64};}
function rounded(x,y,w,h,r=3){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function coordinates(n){const[x,y]=origin();return{x:x+transform.x+n.x*transform.k,y:y+transform.y+n.y*transform.k};}
function radius(n){return atlas?Math.max(2.5,Math.min(30,n.r*.72*Math.pow(transform.k,.8))):Math.max(5,Math.min(44,n.r*Math.pow(transform.k,.8)));}

function arrangeOverview(force=false){
  const next=new Map(),components=connectedGroups(network),fresh=force||!overview.size;
  const partners=new Map(network.nodes.map(n=>[n.id,new Set()]));
  for(const e of network.edges){partners.get(e.source)?.add(e.target);partners.get(e.target)?.add(e.source);}
  const meta=new Map();
  components.forEach((g,gi)=>{g.hub=[...g.ids].sort((a,b)=>partners.get(b).size-partners.get(a).size||a.localeCompare(b))[0];for(const id of g.ids)meta.set(id,{deg:partners.get(id).size,group:gi,size:g.ids.length,hub:g.ids.length>2&&id===g.hub});});
  // Size follows distinct collaborators; isolated pairs stay small, in the background.
  const nodeRadius=n=>{const m=meta.get(n.id);return m.size===2?7:Math.min(46,9+Math.sqrt(m.deg-1)*7);};
  const withMeta=n=>({...n,...meta.get(n.id),r:nodeRadius(n)});
  if(!fresh){
    for(const n of network.nodes){const old=overview.get(n.id);if(old)next.set(n.id,{...old,...withMeta(n)});}
    for(const n of network.nodes){
      if(next.has(n.id))continue;
      const edge=network.edges.find(e=>(e.source===n.id&&next.has(e.target))||(e.target===n.id&&next.has(e.source)));
      const near=edge?next.get(edge.source===n.id?edge.target:edge.source):null;
      const anchor=near||{x:Math.max(0,...[...next.values()].map(p=>p.x))+70,y:0};
      let point;
      for(let i=0;i<300;i++){const a=i*2.39996,r=35+Math.sqrt(i)*12;point={...withMeta(n),x:anchor.x+Math.cos(a)*r,y:anchor.y+Math.sin(a)*r};if(![...next.values()].some(p=>Math.hypot(p.x-point.x,p.y-point.y)<p.r+point.r+14))break;}
      next.set(n.id,point);
    }
  }else{
    // Three passes. 1) Inside each group: the profiles with several links form a skeleton,
    // their single-link collaborators sit on rings around them like fans.
    // 2) Between groups: each group's real footprint is packed around the largest one.
    // 3) All together: groups keep their own shape in one continuous map.
    const aspect=Math.max(.55,Math.min(2.2,usableWidth()/Math.max(300,height-190)));
    const prominent=new Set([...network.nodes].sort((a,b)=>meta.get(b.id).deg-meta.get(a.id).deg||a.id.localeCompare(b.id)).slice(0,18).map(n=>n.id));
    const byId=new Map(network.nodes.map(n=>[n.id,n]));
    const groupLayout=g=>{
      const ns=new Map(g.ids.map(id=>[id,withMeta(byId.get(id))]));
      const inGroup=network.edges.filter(e=>ns.has(e.source)&&ns.has(e.target));
      const near=new Map(g.ids.map(id=>[id,new Set()]));
      for(const e of inGroup){near.get(e.source).add(e.target);near.get(e.target).add(e.source);}
      if(g.ids.length<=2){const[a,b]=g.ids.map(id=>ns.get(id)),d=(a.r+(b?.r||0))/2+16;a.x=b?-d:0;a.y=0;if(b){b.x=d;b.y=0;}return[...ns.values()];}
      const isLeaf=id=>near.get(id).size===1&&near.get([...near.get(id)][0]).size>1;
      const core=g.ids.filter(id=>!isLeaf(id)).map(id=>ns.get(id));
      const fans=new Map(core.map(c=>[c.id,g.ids.filter(id=>isLeaf(id)&&near.get(id).has(c.id)).sort((a,b)=>catOf(a).localeCompare(catOf(b))||a.localeCompare(b))]));
      // Rings sized on the leaves they hold; the outer ring sets how much room the profile needs.
      const rings=new Map();
      for(const c of core){
        const leaves=fans.get(c.id),out=[];let i=0,R=c.r+30;
        while(i<leaves.length){const cap=Math.max(6,Math.floor(2*Math.PI*R/22)),ring=leaves.slice(i,i+cap);out.push({R,ids:ring});i+=ring.length;R+=22;}
        rings.set(c.id,out);c.extent=(out.length?out[out.length-1].R+10:c.r)+(prominent.has(c.id)||c.hub?26:8);
      }
      if(core.length===1){core[0].x=0;core[0].y=0;}
      else{
        core.forEach((c,i)=>{const a=i*2.399963,r=Math.sqrt(i)*40;c.x=Math.cos(a)*r;c.y=Math.sin(a)*r;});
        const links=inGroup.filter(e=>!isLeaf(e.source)&&!isLeaf(e.target)).map(e=>({source:e.source,target:e.target}));
        d3.forceSimulation(core).randomSource(d3.randomLcg(.42))
          .force('link',d3.forceLink(links).id(n=>n.id).distance(e=>e.source.extent+e.target.extent+18).strength(.9))
          .force('charge',d3.forceManyBody().strength(-60))
          .force('collision',d3.forceCollide(n=>n.extent+6).iterations(4))
          .force('x',d3.forceX().strength(.05)).force('y',d3.forceY().strength(.05)).stop().tick(Math.min(300,80+core.length*4));
      }
      for(const c of core)rings.get(c.id).forEach(({R,ids},k)=>ids.forEach((id,i)=>{const a=(i+(k%2)*.5)/ids.length*Math.PI*2-Math.PI/2,n=ns.get(id);n.x=c.x+Math.cos(a)*R;n.y=c.y+Math.sin(a)*R;}));
      const all=[...ns.values()],cx=d3.mean(all,n=>n.x),cy=d3.mean(all,n=>n.y);
      for(const n of all){n.x-=cx;n.y-=cy;}
      return all;
    };
    const layouts=components.map(groupLayout);
    const territories=layouts.map((ns,i)=>({i,r:d3.max(ns,n=>Math.hypot(n.x,n.y)+n.r)+(ns.length>2?70:30)}));
    d3.packSiblings(territories);
    const stretchX=Math.max(1,aspect*.85),stretchY=Math.max(1,1/aspect);
    territories.forEach(t=>{for(const n of layouts[t.i]){n.x+=t.x*stretchX;n.y+=t.y*stretchY;next.set(n.id,n);}});
  }
  overview=next;groups=components;
}

function rebuildFocus(preserve=false){
  const key=[layoutContext,state.selected,focusDepth].join('|'),same=preserve&&displayContext===key,old=positions;displayContext=key;
  if(!state.selected||state.view==='collab'){positions=new Map([...overview].map(([id,n])=>[id,{...n}]));edges=network.edges;return;}
  const focus=focusNetwork(network,state.selected,focusDepth),next=new Map(),center=overview.get(state.selected);
  if(!center){positions=new Map();edges=[];return;}
  next.set(center.id,{...center,x:0,y:0});
  let ringIndex=0;
  for(let level=1;level<=focusDepth;level++){
    const nodes=focus.nodes.filter(n=>focus.levels.get(n.id)===level).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
    for(let start=0;start<nodes.length;start+=14){const ring=nodes.slice(start,start+14);const r=160+ringIndex++*150;ring.forEach((n,i)=>{const a=i/ring.length*Math.PI*2-Math.PI/2;next.set(n.id,{...overview.get(n.id),x:Math.cos(a)*r,y:Math.sin(a)*r,level});});}
  }
  if(same)for(const[id,n]of next){if(old.has(id)){n.x=old.get(id).x;n.y=old.get(id).y;}}
  positions=next;edges=focus.edges;
}
function renderGraph(){
  const context=JSON.stringify([state.view,state.days,state.relation,state.category,state.query]);
  const key=JSON.stringify([context,network.nodes.map(n=>[n.id,n.count]),network.edges.map(e=>[e.source,e.target,e.weight])]);
  $('graph-empty').hidden=!!network.nodes.length;
  if(key!==graphKey){const changed=context!==layoutContext;if(changed){hover=null;hoverEdge=null;}layoutContext=context;graphKey=key;arrangeOverview(changed);rebuildFocus(!changed);if(changed||firstFit){userMoved=false;firstFit=false;focusOnSelection(false);}}
  if(!userMoved&&positions.size)fit(false);updateGraphCaption();if(activeConnection&&$('connection-dialog').open)updateConnectionEvidence();draw();scheduleFrame();
}
function neighbours(id=state.selected){return id?new Set([id,...network.edges.filter(e=>e.source===id||e.target===id).flatMap(e=>[e.source,e.target])]):null;}
function updateGraphCaption(){
  renderFeatured();$('show-all').hidden=!state.selected;
  $('graph-focus-label').textContent=state.selected?'@'+state.selected:state.view==='semantic'?'Idee vicine. Voci diverse.':ecosystemView()?'Chi collabora con chi, fra i profili monitorati.':'L’ecosistema e i profili esterni.';
  $('graph-focus-note').textContent=state.selected?`${num((neighbours()?.size||1)-1)} profili direttamente collegati${focusDepth===2?' · secondo livello visibile':''} · ${state.view==='collab'?'in primo piano sulla mappa completa':'seleziona un profilo per le affinità'}`:`${num(network.nodes.length)} profili e ${num(network.edges.length)} collegamenti · passa sopra un profilo per vederne i legami`;
  if(!$('graph-footnote').textContent.includes('I gruppi'))$('graph-footnote').textContent+=' I gruppi raccolgono profili connessi dai post osservati.';
  $('graph-overview').textContent=state.view==='collab'?'Rimuovi evidenziazione':'← Tutta la rete';$('graph-overview').hidden=!state.selected;$('graph-depth').hidden=!state.selected||state.view==='collab';
  $('graph-depth').setAttribute('aria-pressed',String(focusDepth===2));$('graph-depth').textContent=focusDepth===2?'Solo collegamenti diretti':'Espandi al secondo livello';
}
function curve(s,t){const dx=t.x-s.x,dy=t.y-s.y;return{x:(s.x+t.x)/2-dy*.09,y:(s.y+t.y)/2+dx*.09};}
function onCurve(s,c,t,q){const a=1-q;return{x:a*a*s.x+2*a*q*c.x+q*q*t.x,y:a*a*s.y+2*a*q*c.y+q*q*t.y};}
function edgeKey(e){return JSON.stringify([e.source,e.target]);}
// Squared paper that pans and zooms with the map; spacing doubles or halves to stay legible.
function drawGrid(){
  const[ox,oy]=origin();let step=40*transform.k;while(step<28)step*=2;while(step>84)step/=2;
  const x0=((ox+transform.x)%step+step)%step,y0=((oy+transform.y)%step+step)%step;
  ctx.beginPath();for(let x=x0;x<width;x+=step){ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,height);}for(let y=y0;y<height;y+=step){ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(width,Math.round(y)+.5);}
  ctx.strokeStyle=atlas?'rgba(20,22,26,.05)':'rgba(48,44,117,.035)';ctx.lineWidth=1;ctx.stroke();
  if(!atlas)return;ctx.beginPath();const gx=ox+transform.x,gy=oy+transform.y;
  for(let x=x0;x<width;x+=step)for(let y=y0;y<height;y+=step){if(Math.round((x-gx)/step)%4||Math.round((y-gy)/step)%4)continue;const X=Math.round(x)+.5,Y=Math.round(y)+.5;ctx.moveTo(X-4,Y);ctx.lineTo(X+4,Y);ctx.moveTo(X,Y-4);ctx.lineTo(X,Y+4);}
  ctx.strokeStyle='rgba(20,22,26,.28)';ctx.stroke();
}
// A soft territory behind every group of 3+ profiles: one map, readable zones.
function drawHalos(projected,hoverSet){
  if(state.view!=='collab')return;
  const byGroup=new Map();
  for(const {x,y,node}of projected.values()){if(node.size>2&&node.group!=null){if(!byGroup.has(node.group))byGroup.set(node.group,[]);byGroup.get(node.group).push({x,y,r:radius(node),id:node.id});}}
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const [group,members]of byGroup){
    const pad=Math.max(5,Math.min(26,16*transform.k));
    const pts=members.flatMap(m=>[[m.x-m.r,m.y-m.r],[m.x+m.r,m.y-m.r],[m.x-m.r,m.y+m.r],[m.x+m.r,m.y+m.r]]);
    const hull=d3.polygonHull(pts);if(!hull)continue;
    const active=hoverSet&&members.some(m=>hoverSet.has(m.id)),faded=hoverSet&&!active;
    ctx.beginPath();hull.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    ctx.fillStyle=ctx.strokeStyle=atlas?(active?'#e2deda':faded?'#eeebe8':'#e8e5e1'):active?'#e6e3ef':faded?'#f1efee':'#ebe8ef';ctx.lineWidth=pad*2;ctx.stroke();ctx.fill();
    const xs=hull.map(p=>p[0]),ys=hull.map(p=>p[1]);
    groupHits.push({x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+2*pad,h:Math.max(...ys)-Math.min(...ys)+2*pad,group:groups[group]});
  }
}
function draw(now=performance.now()){
  if(!ctx||!graphVisible)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);groupHits=[];labelHits=[];drawGrid();
  const projected=new Map([...positions].map(([id,n])=>[id,{...coordinates(n),node:n}])),V=bounds();
  const sorted=[...positions.values()].sort((a,b)=>(b.deg||0)-(a.deg||0)||b.count-a.count||a.id.localeCompare(b.id));
  const hoverSet=hover?neighbours(hover):state.selected?neighbours():null;
  drawHalos(projected,hoverSet);
  for(const e of edges){const s=projected.get(e.source),t=projected.get(e.target);if(!s||!t)continue;
    const incident=!hover&&state.selected&&(e.source===state.selected||e.target===state.selected),pointed=hoverEdge&&edgeKey(hoverEdge)===edgeKey(e),hovered=hover&&(e.source===hover||e.target===hover),highlight=pointed||hovered||incident;
    const opacity=hover&&!hovered?.07:state.selected&&!incident&&!hover?.10:highlight?.92:s.node.size===2?.13:.26;
    ctx.strokeStyle=atlas?alpha(glow(e.source),pointed?1:hover&&!hovered?.06:state.selected&&!incident&&!hover?.08:highlight?.9:s.node.size===2?.2:.4):pointed?'#302c75':alpha(highlight?'#302c75':'#514d87',opacity);ctx.lineWidth=pointed?4.2:Math.min(highlight?5:3.2,(highlight?1.4:.5)+Math.sqrt(e.weight)*.55);ctx.lineCap='round';
    const c=curve(s,t);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.quadraticCurveTo(c.x,c.y,t.x,t.y);ctx.stroke();
    if(state.view==='collab'&&state.relation==='direct'&&(highlight||transform.k>.8)){const tip=onCurve(s,c,t,.82),before=onCurve(s,c,t,.76),a=Math.atan2(tip.y-before.y,tip.x-before.x),z=highlight?5:3;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-z*Math.cos(a-.5),tip.y-z*Math.sin(a-.5));ctx.lineTo(tip.x-z*Math.cos(a+.5),tip.y-z*Math.sin(a+.5));ctx.closePath();ctx.fill();}
    if(highlight&&motionEnabled&&state.view==='collab'&&state.relation==='direct'){const p=onCurve(s,c,t,(now/8000+(e.weight%7)/7)%1);ctx.fillStyle=glow(e.source);ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill();}
  }
  for(const n of [...sorted].reverse()){
    const p=projected.get(n.id),r=radius(n),selected=n.id===state.selected,col=glow(n.id);if(p.x<-60||p.x>width+60||p.y<-60||p.y>height+60)continue;
    ctx.globalAlpha=hoverSet&&!hoverSet.has(n.id)?.3:n.size===2&&!hoverSet?.55:1;
    if(atlas){ctx.fillStyle=col;ctx.fillRect(p.x-r,p.y-r,2*r,2*r);if(selected||n.id===hover){ctx.strokeStyle='#14161a';ctx.lineWidth=1.4;ctx.strokeRect(p.x-r-3.5,p.y-r-3.5,2*r+7,2*r+7);}continue;}
    if(selected||n.id===hover){ctx.fillStyle=alpha(col,.45);ctx.fillRect(p.x-r+3,p.y-r+3,2*r,2*r);}
    else{ctx.fillStyle='#302c7510';ctx.fillRect(p.x-r+2,p.y-r+2,2*r,2*r);}
    rounded(p.x-r,p.y-r,2*r,2*r,1);ctx.fillStyle=selected?'#302c75':n.count>=5?'#eeedf8':'#fcfbf9';ctx.fill();ctx.strokeStyle=selected||n.id===hover?'#302c75':alpha(col,.9);ctx.lineWidth=selected?2.2:1.4;ctx.stroke();
    if(r>=7){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`650 ${Math.min(15,Math.max(9,r*.78))}px Archivo,sans-serif`;ctx.fillStyle=selected?'#fff':'#302c75';ctx.fillText(initials(n.id),p.x,p.y+.5);}
    else{ctx.fillStyle=alpha(col,.75);ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}
  }
  ctx.globalAlpha=1;const boxes=[];let shown=0;
  const rank=n=>Number(n.id===state.selected||n.id===hover)*4+Number(!!hoverSet?.has(n.id))*2+Number(!!n.hub);
  const candidates=[...sorted].sort((a,b)=>rank(b)-rank(a)||Number(!!b.hub)*(b.size||0)-Number(!!a.hub)*(a.size||0));
  const leaders=new Set([...sorted.slice(0,24).map(n=>n.id),...sorted.filter(n=>n.hub).map(n=>n.id)]);
  const max=labelsExpanded?150:state.selected?Math.max(22,Math.round(60*transform.k)):Math.max(32,Math.round(55*transform.k));
  for(const n of candidates){const anchor=n.hub&&n.size>=8&&!hoverSet,priority=n.id===state.selected||n.id===hover,p=projected.get(n.id),r=radius(n);if(!priority&&!n.hub&&shown>=max)continue;if(hoverSet&&!hoverSet.has(n.id)&&!labelsExpanded)continue;if(!priority&&!anchor&&!labelsExpanded&&!hoverSet?.has(n.id)&&(n.deg||0)<(ecosystemView()?2:4))continue;if(!state.selected&&!labelsExpanded&&transform.k<.4&&!leaders.has(n.id)&&!priority)continue;if(p.x<V.l+3||p.x>V.r-1||p.y<V.t+5||p.y>V.b-11)continue;
    const fontSize=priority?13:anchor?12:11;ctx.font=atlas?`${priority||anchor?600:400} ${priority?12:11}px ui-monospace,"SF Mono",Menlo,Consolas,monospace`:`${priority||anchor?650:500} ${fontSize}px Archivo,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
    const name=n.id.length>27?n.id.slice(0,25)+'…':n.id,w=ctx.measureText(name).width+(atlas?(priority?16:6):14),h=atlas?(priority?22:15):priority?27:23;
    const placements=[{x:p.x-w/2,y:p.y+r+6},{x:p.x+r+7,y:p.y-h/2},{x:p.x-r-w-7,y:p.y-h/2},{x:p.x-w/2,y:p.y-r-h-6}];
    if(leaders.has(n.id)||priority)for(const gap of [22,42,62])placements.push({x:p.x-w/2,y:p.y+r+gap},{x:p.x-w/2,y:p.y-r-h-gap},{x:p.x+r+gap,y:p.y-h/2},{x:p.x-r-w-gap,y:p.y-h/2});
    const slot=placements.find(b=>![...projected.values()].some(q=>q.node.id!==n.id&&b.x<q.x+radius(q.node)+3&&b.x+w>q.x-radius(q.node)-3&&b.y<q.y+radius(q.node)+3&&b.y+h>q.y-radius(q.node)-3)&&b.x>V.l&&b.x+w<V.r&&b.y>V.t&&b.y+h<V.b&&!boxes.some(a=>b.x<a.x+a.w+5&&b.x+w+5>a.x&&b.y<a.y+a.h+4&&b.y+h+4>a.y));const clear=c=>c.x>V.l&&c.x+w<V.r&&c.y>V.t&&c.y+h<V.b&&!boxes.some(o=>c.x<o.x+o.w+5&&c.x+w+5>o.x&&c.y<o.y+o.h+4&&c.y+h+4>o.y);
    // Anchors may cover nodes, never another name.
    const fallback=anchor&&!slot?placements.find(clear):null;if(!slot&&!priority&&!fallback)continue;const b={...(slot||fallback||placements[0]),w,h};
    boxes.push(b);shown++;if(atlas){if(slot&&placements.indexOf(slot)>3){ctx.strokeStyle='rgba(20,22,26,.3)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(Math.max(b.x,Math.min(p.x,b.x+w)),Math.max(b.y,Math.min(p.y,b.y+h)));ctx.stroke();}if(priority){ctx.fillStyle='#14161a';ctx.fillRect(b.x,b.y,w,h);ctx.fillStyle='#fff';ctx.fillText(name,b.x+8,b.y+h/2);}else{ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.strokeStyle='rgba(241,239,237,.95)';ctx.strokeText(name,b.x+3,b.y+h/2);ctx.fillStyle=anchor?'#14161a':'#3c4046';ctx.fillText(name,b.x+3,b.y+h/2);}labelHits.push({...b,id:n.id});continue;}if(slot&&placements.indexOf(slot)>3){ctx.strokeStyle='#302c7550';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(Math.max(b.x,Math.min(p.x,b.x+w)),Math.max(b.y,Math.min(p.y,b.y+h)));ctx.stroke();}rounded(b.x,b.y,w,h,3);ctx.fillStyle=priority?'#302c75':'#fcfbf9f5';ctx.fill();ctx.strokeStyle=priority?'#302c75':'#d9d5e2';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=priority?'#fff':'#34303e';ctx.fillText(name,b.x+7,b.y+h/2);labelHits.push({...b,id:n.id});
  }
}
function scheduleFrame(){if(framePending||!motionEnabled||!graphVisible||document.hidden||state.view==='topics'||(!state.selected&&!hover&&!hoverEdge))return;framePending=requestAnimationFrame(function tick(now){framePending=0;if(now-lastFrame>40){draw(now);lastFrame=now;}scheduleFrame();});}
new IntersectionObserver(entries=>{graphVisible=atlas||entries[0].isIntersecting;if(graphVisible){draw();scheduleFrame();}},{rootMargin:'100px'}).observe(area);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleFrame();});
function measure(){const rect=area.getBoundingClientRect();if(!rect.width||!rect.height)return;const resized=Math.abs(width-rect.width)>50||Math.abs(height-rect.height)>80;width=rect.width;height=rect.height;if(resized&&overview.size){arrangeOverview(true);rebuildFocus();userMoved=false;}dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=width*dpr;canvas.height=height*dpr;if(!userMoved&&positions.size)fit(false);else draw();}
new ResizeObserver(measure).observe(area);
function findNode(x,y){const label=labelHits.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);if(label)return positions.get(label.id);let hit=null,dist=Infinity;for(const n of positions.values()){const p=coordinates(n),r=radius(n),d=Math.hypot(p.x-x,p.y-y);if(Math.abs(p.x-x)<r+4&&Math.abs(p.y-y)<r+4&&d<dist){hit=n;dist=d;}}return hit;}
function findEdge(x,y){if(state.view!=='collab')return null;let best=null,dist=7;for(const e of edges){const a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)continue;const s=coordinates(a),t=coordinates(b),c=curve(s,t);let prev=s;for(let i=1;i<=24;i++){const p=onCurve(s,c,t,i/24),dx=p.x-prev.x,dy=p.y-prev.y,q=Math.max(0,Math.min(1,((x-prev.x)*dx+(y-prev.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-prev.x-q*dx,y-prev.y-q*dy);if(d<dist){best=e;dist=d;}prev=p;}}return best;}
const zoom=d3.zoom().scaleExtent([.05,5]).filter(ev=>ev.type==='wheel'||ev.type==='dblclick'||!findNode(...d3.pointer(ev,canvas))).on('zoom',e=>{transform=e.transform;if(e.sourceEvent){userMoved=true;firstFit=false;}draw();});
const selection=d3.select(canvas).call(zoom).on('dblclick.zoom',null);
selection.call(d3.drag().container(canvas).subject(e=>{const n=findNode(e.x,e.y);return n?{x:e.x,y:e.y,node:n}:null;})
 .on('start',()=>{userMoved=true;firstFit=false;focusRequest=false;})
 .on('drag',e=>{const[oX,oY]=origin();e.subject.node.x=(e.x-oX-transform.x)/transform.k;e.subject.node.y=(e.y-oY-transform.y)/transform.k;if(!state.selected||state.view==='collab')overview.set(e.subject.node.id,{...e.subject.node});draw();}));
function camera(nodes,animate=true,cap=2){if(!nodes.length)return;const x0=Math.min(...nodes.map(n=>n.x-n.r)),x1=Math.max(...nodes.map(n=>n.x+n.r)),y0=Math.min(...nodes.map(n=>n.y-n.r)),y1=Math.max(...nodes.map(n=>n.y+n.r));const aw=Math.max(160,usableWidth()-(atlas?40:85)),ah=Math.max(160,atlas?height-inset().t-inset().b-40:height-190),k=Math.max(.05,Math.min(cap,.92/Math.max((x1-x0+70)/aw,(y1-y0+70)/ah)));const t=d3.zoomIdentity.translate(-(x0+x1)/2*k,-(y0+y1)/2*k).scale(k);(animate&&!reducedMotion.matches?selection.transition().duration(550).ease(d3.easeCubicInOut):selection).call(zoom.transform,t);}
function fit(animate=true,whole=false){const near=state.selected&&state.view==='collab'?[...neighbours()].map(id=>positions.get(id)).filter(Boolean):!whole&&!state.selected&&usableWidth()<600&&groups[0]?.ids.length>2?groups[0].ids.map(id=>positions.get(id)).filter(Boolean):[];camera(near.length?near:[...positions.values()],animate,near.length?1.6:state.selected?1.5:1.8);}
function focusOnSelection(animate=true){updateGraphCaption();fit(animate);scheduleFrame();}
canvas.addEventListener('mousemove',e=>{const n=findNode(e.offsetX,e.offsetY);hover=n?.id||null;hoverEdge=n?null:findEdge(e.offsetX,e.offsetY);canvas.classList.toggle('pointing',!!n||!!hoverEdge);$('tooltip').hidden=!n&&!hoverEdge;if(n||hoverEdge){$('tooltip').innerHTML=n?`<b>@${esc(n.id)}</b><small>${esc(profiles.get(n.id)?.category||'Fuori elenco')} · ${num(n.count)} ${state.view==='semantic'?'caption originali':'post condivisi'}${n.external?` · collabora anche con ${num(n.external)} profili esterni`:''}</small>`:`<b>@${esc(hoverEdge.source)} ${state.relation==='direct'?'→':'↔'} @${esc(hoverEdge.target)}</b><small>${num(hoverEdge.posts?.length||hoverEdge.weight)} post · clic per consultarli</small>`;$('tooltip').style.left=Math.max(8,Math.min(e.offsetX+18,width-245))+'px';$('tooltip').style.top=Math.max(8,Math.min(e.offsetY-65,height-80))+'px';}draw();scheduleFrame();});
canvas.addEventListener('mouseleave',()=>{hover=null;hoverEdge=null;$('tooltip').hidden=true;draw();});
canvas.addEventListener('click',e=>{const n=findNode(e.offsetX,e.offsetY);if(n){selectProfile(n.id);return;}const edge=findEdge(e.offsetX,e.offsetY);if(edge){openConnection(edge.source,edge.target,state.relation==='direct');return;}if(state.selected){selectProfile(null);return;}const hit=groupHits.find(g=>e.offsetX>=g.x&&e.offsetX<=g.x+g.w&&e.offsetY>=g.y&&e.offsetY<=g.y+g.h);if(hit){userMoved=true;camera(hit.group.ids.map(id=>positions.get(id)));}});
$('fit').onclick=()=>{userMoved=true;fit(true,true);};$('zoom-in').onclick=()=>{userMoved=true;selection.transition().duration(reducedMotion.matches?0:250).call(zoom.scaleBy,1.4);};$('zoom-out').onclick=()=>{userMoved=true;selection.transition().duration(reducedMotion.matches?0:250).call(zoom.scaleBy,1/1.4);};
$('graph-labels').onclick=()=>{labelsExpanded=!labelsExpanded;$('graph-labels').setAttribute('aria-pressed',String(labelsExpanded));draw();};
$('graph-motion').onclick=()=>{motionEnabled=!motionEnabled;$('graph-motion').setAttribute('aria-pressed',String(motionEnabled));if(motionEnabled)scheduleFrame();else{cancelAnimationFrame(framePending);framePending=0;draw();}};
$('graph-overview').onclick=()=>selectProfile(null);$('graph-depth').onclick=()=>{focusDepth=focusDepth===1?2:1;rebuildFocus();focusOnSelection();};
$('graph-reorder').onclick=()=>{arrangeOverview(true);rebuildFocus();focusOnSelection();};
$('panel-toggle').onclick=()=>{panelCollapsed=!panelCollapsed;$('network-view').classList.toggle('panel-collapsed',panelCollapsed);$('panel-toggle').setAttribute('aria-expanded',String(!panelCollapsed));$('panel-toggle').textContent=panelCollapsed?'Mostra elenco':'Nascondi elenco';userMoved=false;measure();};
reducedMotion.addEventListener('change',e=>{if(e.matches){motionEnabled=false;$('graph-motion').setAttribute('aria-pressed','false');cancelAnimationFrame(framePending);framePending=0;draw();}});
let inertPanels=[];
function toggleImmersive(value=!immersive){immersive=value;if(immersive){inertPanels=[...document.querySelectorAll('main > :not(#network-view), .sidebar')].filter(el=>!el.inert);inertPanels.forEach(el=>el.inert=true);}else{inertPanels.forEach(el=>el.inert=false);inertPanels=[];}$('network-view').classList.toggle('immersive',immersive);document.body.classList.toggle('graph-immersive',immersive);$('immersive').setAttribute('aria-expanded',String(immersive));$('immersive').innerHTML=immersive?'<span>↙</span> Esci dalla vista':'<span>⛶</span> Vista immersiva';userMoved=false;setTimeout(()=>{measure();focusOnSelection(false);},50);}
$('immersive').onclick=()=>toggleImmersive();document.addEventListener('keydown',e=>{if(e.key==='Escape'&&immersive&&!$('connection-dialog').open&&!$('updates-dialog').open){toggleImmersive(false);$('immersive').focus();}});
let connectionCodes=[],connectionLimit=20,connectionReturnFocus=null,activeConnection=null;
function openConnection(a,b,directed=false){
  activeConnection={a,b,directed};connectionLimit=20;updateConnectionEvidence();connectionReturnFocus=document.activeElement;$('connection-dialog').showModal();
}
function updateConnectionEvidence(){
  const {a,b,directed}=activeConnection;
  connectionCodes=connectionPostIds(network,a,b,directed).filter(id=>postIndex.has(id)).sort((a,b)=>new Date(postIndex.get(b).published)-new Date(postIndex.get(a).published));
  $('connection-title').textContent=`@${a} ${directed?'→':'↔'} @${b}`;
  $('connection-summary').textContent=`${num(connectionCodes.length)} post nel periodo selezionato. ${directed?'L’autore principale è @'+a+'.':'Compresenza nei post osservati; non implica un rapporto diretto al di fuori dei contenuti.'}`;
  renderConnectionPosts();
}
function renderConnectionPosts(){
  $('connection-posts').innerHTML=connectionCodes.slice(0,connectionLimit).map(id=>{const p=postIndex.get(id);return`<a class="connection-post" href="${urlPost(id)}" target="_blank" rel="noopener"><span><strong>${p.owner?'@'+esc(p.owner):'Autore non identificato'}</strong><small>${date(p.published)} · ${num(p.authors.length)} coautori</small></span><span>Apri post ↗</span></a>`;}).join('')||'<p>Nessun post disponibile per questa selezione.</p>';
  $('connection-more').hidden=connectionCodes.length<=connectionLimit;
}
$('connection-more').onclick=()=>{connectionLimit+=20;renderConnectionPosts();};
$('connection-dialog').addEventListener('close',()=>{activeConnection=null;if(connectionReturnFocus?.isConnected)connectionReturnFocus.focus();});


document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{state.days=+b.dataset.days;state.selected=null;state.topic=null;state.feedLimit=9;state.rankLimit=12;firstFit=true;userMoved=false;document.querySelectorAll('[data-days]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});render();updateUrl();});
document.querySelectorAll('[data-relation]').forEach(b=>b.onclick=()=>{state.relation=b.dataset.relation;document.querySelectorAll('[data-relation]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});render();});
$('threshold').oninput=e=>{state.threshold=+e.target.value/100;$('threshold-value').textContent=state.threshold.toFixed(2).replace('.',',');render();};
let searchTimer;$('search').oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=e.target.value.trim();state.selected=null;firstFit=true;userMoved=false;render();},200);};
$('category').onchange=e=>{state.category=e.target.value;state.selected=null;firstFit=true;userMoved=false;render();};
$('reset').onclick=()=>{state.query='';state.category='';state.selected=null;$('search').value='';$('category').value='';userMoved=false;firstFit=true;graphKey='';render();updateUrl();};
$('close-profile').onclick=()=>selectProfile(null);$('more-profiles').onclick=()=>{state.rankLimit+=20;renderProfiles();};$('feed').onclick=e=>{const b=e.target.closest('[data-focus]');if(!b)return;const id=b.dataset.focus;if(!network.nodes.some(n=>n.id===id)){toast('@'+id+' non è nella mappa con i filtri attuali.');return;}selectProfile(id);document.querySelector('.network-panel').scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});};
$('more-posts').onclick=()=>{state.feedLimit+=12;renderFeed();};$('clear-topic').onclick=()=>{state.topic=null;renderTopics();renderFeed();};
for(const id of ['method-open','method-footer'])$(id).onclick=()=>$('method').showModal();
$('method').onclick=e=>{if(e.target===$('method')){const r=$('method').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('method').close();}};
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,5000);}
$('share').onclick=async()=>{const link=cfg.publicUrl?`${cfg.publicUrl}${location.search}`:location.href;try{await navigator.clipboard.writeText(link);toast('Link copiato. La selezione del periodo e del profilo è inclusa.');}catch{window.prompt('Copia questo link',link);}};
async function fetchJson(url){const sep=url.includes('?')?'&':'?';const r=await fetch(url+sep+'v='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('Dati non disponibili');return r.json();}
async function refresh(){
  if(requesting)return;requesting=true;
  try{
    const next=await fetchJson(cfg.snapshot);if(next.schema!==1||!Array.isArray(next.posts)||!Array.isArray(next.profiles))throw Error('Formato non disponibile');
    data=next;updateVisit();profiles=new Map(data.profiles.map(p=>[p.id,p]));postIndex=new Map(data.posts.map(p=>[p.id,p]));
    const categoryOptions=[...new Set(data.profiles.map(p=>p.category))].sort();
    $('category').innerHTML='<option value="">Tutte le categorie</option>'+categoryOptions.map(c=>`<option ${c===state.category?'selected':''}>${esc(c)}</option>`).join('');
    $('profiles').innerHTML=data.profiles.map(p=>`<option value="${esc(p.id)}">`).join('');
    showNotice('');
    if(!cfg.collaborationsOnly)try{const analysis=await fetchJson(cfg.semantic);if(analysis.schema===1&&analysis.periods){sem=analysis;semanticError=false;}else semanticError=true;}catch{semanticError=true;}
    render();
    if(cfg.release&&cfg.revision){try{const release=await fetchJson(cfg.release);if(release.revision&&release.revision!==cfg.revision&&sessionStorage.getItem('ecosystem-release')!==release.revision){sessionStorage.setItem('ecosystem-release',release.revision);const next=new URL(location.href);next.searchParams.set('_release',release.revision);location.replace(next.href);}}catch{/* Keep the last working view during deployment. */}}
  }catch{showNotice(data?'Connessione ai nuovi dati momentaneamente non disponibile. Restano visibili gli ultimi dati ricevuti.':'Non riesco a caricare i dati. Riproverò automaticamente.');$('fresh-title').textContent=data?'Ultimi dati ricevuti':'Dati non disponibili';$('status-dot').classList.add('stale');}
  finally{requesting=false;}
}
// Atlas: the public page as a full-screen map with floating panels, like ecosistemapolitico.it.
// Existing controls are moved, not duplicated, so every handler above keeps working.
let atlasTab='sintesi',atlasGroups=[];
function buildAtlas(){
  // The map fills the screen here: it is always visible.
  atlas=true;graphVisible=true;document.body.classList.add('atlas');
  const shell=document.createElement('div');shell.id='atlas';
  shell.innerHTML=`<header class="atlas-bar"><div class="atlas-title"><strong>Ecosistema · Collaborazioni</strong><span>La rete osservata su Instagram</span></div><div class="atlas-tools" id="atlas-tools"></div><div class="atlas-brand" id="atlas-brand"></div></header>
<aside class="atlas-left" id="atlas-left" aria-label="Vista">
  <div class="atlas-head"><span>Vista</span><button id="atlas-left-toggle" aria-expanded="true" aria-label="Riduci il pannello">–</button></div>
  <div class="atlas-body">
    <div class="atlas-section"><span class="atlas-label">Periodo</span><div id="atlas-period"></div></div>
    <div class="atlas-section"><span class="atlas-label">Profili</span><div id="atlas-scope"></div></div>
    <div class="atlas-section"><span class="atlas-label">Legami</span><div id="atlas-relation"></div></div>
    <div class="atlas-section atlas-switches"><span class="atlas-label">Mappa</span><button id="atlas-matrix-toggle" aria-pressed="false"><b>Matrice categorie</b><small>chi collabora con chi, per categoria</small></button><div id="atlas-display"></div></div>
    <div class="atlas-metrics" id="atlas-metrics"></div>
    <div class="atlas-section atlas-status" id="atlas-status"></div>
  </div>
</aside>
<aside class="atlas-right" id="atlas-right" aria-label="Analisi della rete">
  <nav class="atlas-tabs" role="tablist"><button role="tab" data-tab="sintesi">Sintesi</button><button role="tab" data-tab="gruppi">Gruppi</button><button role="tab" data-tab="ponti">Ponti</button><button role="tab" data-tab="classifica">Classifica</button><button role="tab" data-tab="post">Post</button></nav>
  <div class="atlas-pane" data-pane="sintesi"><p class="atlas-caption">In breve, fra i profili monitorati</p><div id="atlas-readings"></div><p class="atlas-caption">Categorie sulla mappa</p><div class="atlas-cats" id="atlas-cats"></div><p class="atlas-foot">Clicca una categoria per isolarla sulla mappa.</p></div>
  <div class="atlas-pane" data-pane="gruppi"><p class="atlas-caption" id="atlas-groups-note"></p><div class="atlas-list" id="atlas-groups"></div><p class="atlas-foot">Gruppi di profili collegati fra loro. Il nome è quello del profilo con più legami. Clic per ingrandire.</p></div>
  <div class="atlas-pane" data-pane="ponti"><p class="atlas-caption">Chi tiene insieme la rete</p><div class="atlas-list" id="atlas-bridges"></div><p class="atlas-foot">Stacca = profili che resterebbero isolati dal proprio gruppo senza di lui.</p></div>
  <div class="atlas-pane" data-pane="classifica"><p class="atlas-caption">Profili con più collegamenti diversi</p><div class="atlas-list" id="atlas-rank"></div></div>
  <div class="atlas-pane" data-pane="post"><p class="atlas-caption" id="atlas-feed-note"></p><div id="atlas-feed"></div></div>
  <div class="atlas-profile" id="atlas-profile"></div>
</aside>
<div class="atlas-matrix" id="atlas-matrix" hidden><button class="atlas-close" id="atlas-matrix-close" aria-label="Chiudi la matrice">×</button></div>`;
  document.body.prepend(shell);
  const move=(sel,to)=>{const el=typeof sel==='string'?document.querySelector(sel):sel;if(el)$(to).appendChild(el);};
  shell.appendChild(area);
  move('.searchbox','atlas-tools');move('#reset','atlas-tools');move('#share','atlas-tools');move('.brand','atlas-brand');
  move('.period-control','atlas-period');move('#scope','atlas-scope');move('#relations','atlas-relation');
  for(const id of ['graph-labels','graph-motion','graph-reorder'])move('#'+id,'atlas-display');
  // Short labels: the panel is narrow.
  $('scope').querySelector('[data-scope="ecosystem"]').textContent='Monitorati';$('scope').querySelector('[data-scope="all"]').textContent='Con esterni';
  $('relations').querySelector('[data-relation="direct"]').textContent='Autore → collab.';$('relations').querySelector('[data-relation="shared"]').textContent='Coautori';
  $('graph-labels').innerHTML='<b>Tutti i nomi</b><small>anche dei profili minori</small>';
  $('graph-motion').innerHTML='<b>Animazione</b><small>il flusso sui legami evidenziati</small>';
  $('graph-reorder').innerHTML='<b>Riordina</b><small>ricalcola la disposizione</small>';
  move('#metrics','atlas-metrics');move('.freshness','atlas-status');move('#updates-open','atlas-status');move('#method-open','atlas-status');
  move('#readings-list','atlas-readings');move('#feed','atlas-feed');move('#more-posts','atlas-feed');
  move('.profile-panel','atlas-profile');move('#matrix-section','atlas-matrix');
  for(const id of ['connection-dialog','updates-dialog'])document.body.appendChild($(id));
  shell.querySelector('.atlas-bar').after($('notice'));
  $('method-open').innerHTML='Come leggere la mappa ↗';
  // Tabs
  const tabs=shell.querySelector('.atlas-tabs');
  const showTab=t=>{atlasTab=t;tabs.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===t));});shell.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==t);try{localStorage.setItem('ecosystem-atlas-tab',t);}catch{}};
  try{const saved=localStorage.getItem('ecosystem-atlas-tab');if(saved&&tabs.querySelector(`[data-tab="${saved}"]`))atlasTab=saved;}catch{}
  tabs.onclick=e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab);};showTab(atlasTab);
  // Lists: profiles, categories and groups
  const right=$('atlas-right');
  right.addEventListener('click',e=>{
    const prof=e.target.closest('[data-pick]');if(prof){if(network.nodes.some(n=>n.id===prof.dataset.pick))selectProfile(prof.dataset.pick);return;}
    const cat=e.target.closest('[data-cat]');if(cat){state.category=state.category===cat.dataset.cat?'':cat.dataset.cat;$('category').value=state.category;state.selected=null;firstFit=true;userMoved=false;render();return;}
    const grp=e.target.closest('[data-group]');if(grp){const g=atlasGroups[+grp.dataset.group];if(g){userMoved=true;camera(g.ids.map(id=>positions.get(id)).filter(Boolean),true,1.8);}}
  });
  right.addEventListener('pointerover',e=>{const b=e.target.closest('[data-pick]');if(b&&hover!==b.dataset.pick){hover=b.dataset.pick;draw();scheduleFrame();}});
  right.addEventListener('pointerleave',()=>{if(hover){hover=null;draw();}});
  $('atlas-left-toggle').onclick=()=>{const open=$('atlas-left').classList.toggle('collapsed');$('atlas-left-toggle').setAttribute('aria-expanded',String(!open));$('atlas-left-toggle').textContent=open?'+':'–';};
  const matrix=v=>{$('atlas-matrix').hidden=!v;$('atlas-matrix-toggle').setAttribute('aria-pressed',String(v));};
  $('atlas-matrix-toggle').onclick=()=>matrix($('atlas-matrix').hidden);$('atlas-matrix-close').onclick=()=>matrix(false);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;if(!$('atlas-matrix').hidden)matrix(false);else if(state.selected)selectProfile(null);});
}
function renderAtlas(){
  if(!atlas)return;
  $('atlas-right').classList.toggle('selected',!!state.selected);
  const links=new Map();for(const e of network.edges)for(const[a,b]of[[e.source,e.target],[e.target,e.source]]){if(!links.has(a))links.set(a,new Set());links.get(a).add(b);}
  const deg=id=>links.get(id)?.size||0;
  // Categories present on the map
  const counts=new Map();for(const n of network.nodes){const c=catOf(n.id);counts.set(c,(counts.get(c)||0)+1);}
  $('atlas-cats').innerHTML=[...CATEGORY_ORDER,'Fuori elenco'].filter(c=>counts.has(c)||state.category===c).map(c=>`<button data-cat="${esc(c)}" aria-pressed="${state.category===c}"><i style="background:${COLORS[c]||COLORS.Altro}"></i><span>${esc(c)}</span><b>${num(counts.get(c)||0)}</b></button>`).join('');
  // Groups of three or more profiles
  const all=connectedGroups(network);atlasGroups=all.filter(g=>g.ids.length>2);
  const pairs=all.length-atlasGroups.length;
  $('atlas-groups-note').textContent=`${num(atlasGroups.length)} gruppi da almeno 3 profili · ${num(pairs)} ${pairs===1?'coppia isolata':'coppie isolate'}`;
  $('atlas-groups').innerHTML=atlasGroups.slice(0,60).map((g,i)=>{
    const hub=[...g.ids].sort((a,b)=>deg(b)-deg(a)||a.localeCompare(b))[0],mix=new Map();for(const id of g.ids)mix.set(catOf(id),(mix.get(catOf(id))||0)+1);
    const bar=[...CATEGORY_ORDER,'Fuori elenco'].filter(c=>mix.has(c)).map(c=>`<i style="width:${(mix.get(c)/g.ids.length*100).toFixed(1)}%;background:${COLORS[c]}" title="${esc(c)} ${mix.get(c)}"></i>`).join('');
    return`<button data-group="${i}"><span class="n">${i+1}</span><span class="name">@${esc(hub)}</span><b>${num(g.ids.length)}</b><span class="mix">${bar}</span></button>`;}).join('')||'<p class="atlas-empty">Nessun gruppo da almeno 3 profili in questo periodo.</p>';
  // Bridges: how many profiles would be cut off from their group without this one
  const cuts=[];
  for(const g of atlasGroups)for(const v of g.ids){
    if(deg(v)<2)continue;const seen=new Set([v]),pieces=[];
    for(const start of links.get(v)){if(seen.has(start))continue;let size=0;const queue=[start];seen.add(start);while(queue.length){const x=queue.pop();size++;for(const y of links.get(x)||[])if(!seen.has(y)){seen.add(y);queue.push(y);}}pieces.push(size);}
    const cut=pieces.reduce((a,b)=>a+b,0)-Math.max(...pieces);if(cut>0)cuts.push([v,cut]);
  }
  cuts.sort((a,b)=>b[1]-a[1]||deg(b[0])-deg(a[0])||a[0].localeCompare(b[0]));
  const maxCut=cuts[0]?.[1]||1;
  $('atlas-bridges').innerHTML=cuts.slice(0,30).map(([id,cut],i)=>`<button data-pick="${esc(id)}"><span class="n">${i+1}</span><span class="name">@${esc(id)}</span><span class="val">stacca <b>${num(cut)}</b></span><span class="meter"><i style="width:${(cut/maxCut*100).toFixed(1)}%;background:${color(id)}"></i></span></button>`).join('')||'<p class="atlas-empty">Nessun profilo regge da solo un collegamento in questo periodo.</p>';
  // Ranking by distinct collaborators
  const ranked=[...network.nodes].sort((a,b)=>deg(b.id)-deg(a.id)||b.count-a.count||a.id.localeCompare(b.id)).slice(0,40),maxDeg=deg(ranked[0]?.id)||1;
  $('atlas-rank').innerHTML=ranked.map((n,i)=>`<button data-pick="${esc(n.id)}"><span class="n">${i+1}</span><span class="name">@${esc(n.id)}</span><span class="val"><b>${num(deg(n.id))}</b> profili · ${num(n.count)} post</span><span class="meter"><i style="width:${(deg(n.id)/maxDeg*100).toFixed(1)}%;background:${color(n.id)}"></i></span></button>`).join('');
  $('atlas-feed-note').textContent=$('feed-title').textContent+' · '+$('feed-count').textContent;
}
if(cfg.collaborationsOnly)buildAtlas();

const params=new URLSearchParams(location.search);if(!cfg.collaborationsOnly&&['collab','semantic','topics'].includes(params.get('view')))state.view=params.get('view');if(['0','1','7','30'].includes(params.get('days')))state.days=+params.get('days');if(params.get('scope')==='all')state.scope='all';state.selected=params.get('profile');if(cfg.collaborationsOnly)updateUrl();
document.querySelectorAll('[data-days]').forEach(x=>{const active=+x.dataset.days===state.days;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});
refresh();setInterval(()=>{if(!document.hidden)refresh();},cfg.refreshMs);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
