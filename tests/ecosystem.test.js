import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationNetwork,ecosystemNetwork,categoryPairs} from '../site/network.js';

const posts=[
  {id:'p',owner:'party',authors:['party','mp','fan1','fan2']},
  {id:'q',owner:'mp',authors:['mp','party']},
  {id:'r',owner:'hub',authors:['hub','x1','x2','x3']},
];
const monitored=new Set(['party','mp','hub','lonely']);

test('ecosystem keeps only links between two monitored profiles',()=>{
  const eco=ecosystemNetwork(collaborationNetwork(posts),id=>monitored.has(id));
  assert.deepEqual(eco.nodes.map(n=>n.id).sort(),['mp','party']);
  assert.equal(eco.edges.length,2);
  assert(eco.edges.every(e=>monitored.has(e.source)&&monitored.has(e.target)));
});
test('external collaborators become a count, and profiles with only external links are reported',()=>{
  const eco=ecosystemNetwork(collaborationNetwork(posts),id=>monitored.has(id));
  assert.equal(eco.nodes.find(n=>n.id==='party').external,2);
  assert.equal(eco.nodes.find(n=>n.id==='mp').external,0);
  assert.equal(eco.outsideOnly,1);
});
test('category pairs count each pair of profiles once, regardless of direction',()=>{
  const eco=ecosystemNetwork(collaborationNetwork(posts),id=>monitored.has(id));
  const cat={party:'Partito Politico',mp:'Politico'};
  assert.deepEqual([...categoryPairs(eco,id=>cat[id])],[['Partito Politico|Politico',1]]);
});
