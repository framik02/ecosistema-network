import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationNetwork,filterNetwork} from '../site/network.js';

test('direct edges preserve original owner and do not invent collaborator-to-collaborator links',()=>{
  const net=collaborationNetwork([{id:'p',owner:'alice',authors:['alice','bob','carol']}]);
  assert.equal(net.edges.length,2);assert(net.edges.every(e=>e.source==='alice'));assert.equal(net.nodes.find(n=>n.id==='alice').count,1);
});
test('coauthor view counts every pair exactly once per post',()=>{
  const net=collaborationNetwork([{id:'p',owner:'alice',authors:['alice','bob','carol']},{id:'q',owner:'bob',authors:['alice','bob']}],'shared');
  assert.equal(net.edges.length,3);assert.equal(net.edges.find(e=>e.source==='alice'&&e.target==='bob').weight,2);
});
test('unknown owner creates no invented direct links',()=>{
  assert.equal(collaborationNetwork([{id:'p',owner:null,authors:['alice','bob']}]).edges.length,0);
});
test('new coauthor on an existing post changes graph',()=>{
  const old=collaborationNetwork([{id:'p',owner:'alice',authors:['alice','bob']}]);
  const next=collaborationNetwork([{id:'p',owner:'alice',authors:['alice','bob','carol']}]);
  assert.equal(next.edges.length,old.edges.length+1);
});
test('category filter retains cross-category neighbours without unrelated edges',()=>{
  const graph={nodes:['a','b','c'].map(id=>({id})),edges:[{source:'a',target:'b'},{source:'b',target:'c'}]};
  const profiles=new Map([['a',{category:'Politico'}],['b',{category:'Media'}],['c',{category:'Media'}]]);
  const filtered=filterNetwork(graph,'Politico',profiles);
  assert.deepEqual(filtered.nodes.map(n=>n.id),['a','b']);assert.equal(filtered.edges.length,1);
});
