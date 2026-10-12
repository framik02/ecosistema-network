import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationNetwork,connectedGroups,focusNetwork,connectionPostIds} from '../site/network.js';

const posts=[
  {id:'ab1',owner:'alice',authors:['alice','bob']},
  {id:'ba1',owner:'bob',authors:['alice','bob']},
  {id:'bc1',owner:'bob',authors:['bob','carol']},
  {id:'cd1',owner:'carol',authors:['carol','david']},
  {id:'xy1',owner:'x',authors:['x','y']}
];
test('groups preserve disconnected networks and are independent of input ordering',()=>{
  const graph=collaborationNetwork(posts);
  assert.deepEqual(connectedGroups(graph).map(g=>g.ids),[['alice','bob','carol','david'],['x','y']]);
  assert.deepEqual(connectedGroups({...graph,nodes:[...graph.nodes].reverse(),edges:[...graph.edges].reverse()}),connectedGroups(graph));
});
test('focus limits to one or two observed hops and invents no links',()=>{
  const graph=collaborationNetwork(posts);
  const first=focusNetwork(graph,'alice');
  assert.deepEqual(first.nodes.map(n=>n.id).sort(),['alice','bob']);
  assert.equal(first.edges.length,2);
  const second=focusNetwork(graph,'alice',2);
  assert.deepEqual(second.nodes.map(n=>n.id).sort(),['alice','bob','carol']);
  assert.equal(second.levels.get('carol'),2);
  assert.ok(second.edges.every(e=>graph.edges.includes(e)));
  assert.equal(focusNetwork(graph,'missing').nodes.length,0);
});
test('connection evidence preserves author direction and deduplicates combined posts',()=>{
  const direct=collaborationNetwork(posts);
  assert.deepEqual(connectionPostIds(direct,'alice','bob'),['ab1']);
  assert.deepEqual(connectionPostIds(direct,'bob','alice'),['ba1']);
  assert.deepEqual(connectionPostIds(direct,'alice','bob',false).sort(),['ab1','ba1']);
  assert.deepEqual(connectionPostIds(direct,'alice','carol',false),[]);
  const shared=collaborationNetwork([{id:'group',owner:'a',authors:['a','b','c']}],'shared');
  assert.deepEqual(connectionPostIds(shared,'b','c',false),['group']);
});
