import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ComposerOwnership} from '../apps/web/src/composerOwnership.js';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};

test('failed send restores only an untouched cleared composer in the same visit',async()=>{
 for(const change of ['none','typing','attachment','away-and-back'] as const){
  const owner=new ComposerOwnership('agent','a'),request=deferred();
  let draft='submitted',files=['old'];const submitted={draft,files};
  draft='';files=[];owner.edit();const point=owner.checkpoint();
  const failed=request.promise.then(()=>{if(owner.unchanged(point)){draft=submitted.draft;files=submitted.files;}});
  if(change==='typing'){draft='new';owner.edit();}
  if(change==='attachment'){files=['new'];owner.edit();}
  if(change==='away-and-back'){owner.select('agent','b');owner.select('agent','a');}
  request.resolve();await failed;
  assert.equal(draft,change==='none'?'submitted':change==='typing'?'new':'');
  assert.deepEqual(files,change==='none'?['old']:change==='attachment'?['new']:[]);
 }
});

test('deferred text, audio, call refresh and uploads cannot write into a different visit',async()=>{
 for(const kind of ['text','audio','call','upload']){
  const owner=new ComposerOwnership('agent','a'),visit=owner.visit,request=deferred();let writes=0;
  const pending=request.promise.then(()=>{if(owner.owns(visit))writes++;});
  owner.select('other','b');owner.select('agent','a');request.resolve();await pending;
  assert.equal(writes,0,kind);
 }
});

test('first conversation adoption retains newer typing but never hijacks another selection',async()=>{
 const owner=new ComposerOwnership('agent',null),visit=owner.visit,point=owner.checkpoint();
 owner.edit();assert.equal(owner.adopt(visit,'created'),true);
 assert.equal(owner.visit.conversation,'created');assert.equal(owner.unchanged(point),false);
 owner.select('agent','other');assert.equal(owner.adopt(visit,'late'),false);
 assert.equal(owner.visit.conversation,'other');
});

test('old operation finally cannot unlock a newer send or upload',async()=>{
 const owner=new ComposerOwnership('agent','a'),old=owner.begin(),request=deferred();
 const pending=request.promise.then(()=>owner.finish(old));
 owner.select('agent','b');const current=owner.begin();request.resolve();
 assert.equal(await pending,false);assert.equal(owner.busy,true);
 assert.equal(owner.finish(current),true);assert.equal(owner.busy,false);
});

test('unmodified failure checkpoint survives first-conversation adoption',()=>{
 const owner=new ComposerOwnership('agent',null),point=owner.checkpoint();
 owner.adopt(point.visit,'created');assert.equal(owner.unchanged(point),true);
});
