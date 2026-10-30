import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveMessageLink} from '../apps/web/src/markdown-links.js';
// The root TS project is server-only (no JSX); tsx loads the web component at runtime.
const {MessageMarkdown}=await import(new URL('../apps/web/src/MessageMarkdown.tsx',import.meta.url).href);
const id='c5e24b04-31c9-4e6a-90e4-7610b57473ad',url='/api/files/'+id;
const attachments=[{id,name:'gravação.mp3'}];
test('canonical UUID downloads do not navigate the SPA, including legacy inline links',()=>{
 for(const href of [url,url+'?inline=1'])assert.deepEqual(resolveMessageLink(href,'Download'),{kind:'download',href:url});
 for(const suffix of ['bad-id','../../etc/passwd','c5e24b04-31c9-4e6a-90e4-7610b57473az','00000000-0000-0000-0000-000000000000'])assert.equal(resolveMessageLink('/api/files/'+suffix,'x').kind,'unavailable');
 for(const href of [url+'/extra',url+'?next=/','/api/files/%2e%2e'])assert.equal(resolveMessageLink(href,'x').kind,'unavailable');
});
test('filesystem, empty and unsafe links are unavailable, never SPA destinations',()=>{
 for(const href of [undefined,'','audio.mp3','./audio.mp3','../audio.mp3','/tmp/audio.mp3','C:\\Users\\User\\audio.mp3','file:///C:/audio.mp3','sandbox:/mnt/data/audio.mp3','//example.com/a','#hash','javascript:alert(1)','data:text/html,x','https://user:pass@example.com/a','https://example.com\\evil'])assert.equal(resolveMessageLink(href,'Download').kind,'unavailable',href);
});
test('archived filename labels resolve against only actual message attachments',()=>{
 for(const href of ['gravação.mp3','sandbox:/mnt/data/gravação.mp3','',undefined])assert.deepEqual(resolveMessageLink(href,'gravação.mp3',attachments),{kind:'download',href:url});
 assert.equal(resolveMessageLink('/tmp/gravação.mp3','Download',attachments).kind,'unavailable');
 assert.equal(resolveMessageLink('/tmp/gravação.mp3','gravação.mp3').kind,'unavailable');
 assert.equal(resolveMessageLink('',attachments[0].name,[{id:'not-uuid',name:attachments[0].name}]).kind,'unavailable');
 assert.equal(resolveMessageLink('',attachments[0].name,[...attachments,...attachments]).kind,'unavailable');
});
test('external http(s) links use a safe new tab',()=>{
 for(const href of ['https://example.com/a?q=1','http://example.com/a']){
  assert.deepEqual(resolveMessageLink(href,'site'),{kind:'external',href});
  const html=renderToStaticMarkup(createElement(MessageMarkdown,{children:`[site](${href})`,notify:()=>{}}));
  assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);
 }
});
test('shared saved/streaming renderer never renders local href and repairs attached filename',()=>{
 const render=(children:string,files=attachments)=>renderToStaticMarkup(createElement(MessageMarkdown,{children,attachments:files,notify:()=>{}}));
 assert.match(render('[**gravação.mp3**](sandbox:/mnt/data/gravação.mp3)'),new RegExp('href="'+url+'" download=""'));
 for(const files of [attachments,[]]){
  const html=render('[Baixar](audio.mp3)',files);
  assert.doesNotMatch(html,/href=/);assert.match(html,/<button/);assert.match(html,/link indisponível/);
 }
 assert.match(render('[Baixar]('+url+')'),/download=""/);
});
