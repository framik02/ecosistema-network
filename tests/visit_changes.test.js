import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationCheckpoint,collaborationChanges,validCheckpoint} from '../site/network.js';
const seen='2026-10-12T10:00:00Z',now='2026-10-12T12:00:00Z';
const old={id:'old',owner:'a',authors:['a','b'],published:'2026-10-10T10:00:00Z',caption:'PRIVATE'};
test('first visit establishes a baseline without marking the whole archive new',()=>{
  const changes=collaborationChanges([old],null,seen);
  assert.equal(changes.firstVisit,true);assert.deepEqual(changes.posts,[]);
  assert.equal(JSON.stringify(changes.current).includes('PRIVATE'),false);
  assert.equal(validCheckpoint(changes.current),true);
});
test('distinguishes newly published from newly collected history and unknown dates',()=>{
  const base=collaborationCheckpoint([old],seen);
  const changes=collaborationChanges([old,{...old,id:'recent',published:'2026-10-12T11:00:00Z'},{...old,id:'history'},{...old,id:'unknown',published:null}],base,now);
  assert.deepEqual(changes.published.map(p=>p.id),['recent']);
  assert.deepEqual(changes.earlier.map(p=>p.id),['history']);
  assert.deepEqual(changes.undated.map(p=>p.id),['unknown']);
  assert.equal(changes.posts.length,3);assert.equal(changes.links.length,0);
});
test('coauthor edits reveal new profiles and links without counting the same post twice',()=>{
  const base=collaborationCheckpoint([old],seen);
  const edited={...old,authors:['a','b','c']};
  const changes=collaborationChanges([edited],base,now);
  assert.deepEqual(changes.profiles,['c']);assert.deepEqual(changes.links,[['a','c']]);assert.equal(changes.posts.length,0);
  assert.equal(collaborationChanges([],base,now).links.length,0);
  assert.equal(collaborationChanges([edited],changes.current,now).profiles.length,0);
});
test('rejects malformed storage and ignores solo content',()=>{
  assert.equal(validCheckpoint({version:1,seenAt:seen,posts:[],profiles:[],links:['not json']}),false);
  assert.equal(collaborationChanges([old],{posts:[]},now).firstVisit,true);
  assert.deepEqual(collaborationCheckpoint([{...old,authors:['a']}],now).posts,[]);
});
