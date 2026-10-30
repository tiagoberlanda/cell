import test from 'node:test';
import assert from 'node:assert/strict';
import {jobEventOf,jobEventNote,messageForContext} from '../packages/shared/src/index.js';

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {JobEvent}=await import(new URL('../apps/web/src/JobEvent.tsx',import.meta.url).href);

const legacy={role:'assistant',content:'**Tarefa concluída** em PC · Exportar\n\n```\nC:\\Users\\Pessoa\\out.zip\n<script>alert(1)</script>\n```'};
test('job events recognize only the legacy worker envelope without a run',()=>{
 const event=jobEventOf(legacy)!;assert.equal(event.status,'done');assert.equal(event.reason,'Exportar');assert.match(event.output,/<script>/);
 assert.equal(jobEventOf({...legacy,role:'user'}),null);
 assert.equal(jobEventOf({...legacy,run_id:'run'}),null);
 assert.equal(jobEventOf({...legacy,content:'Comentário\n'+legacy.content}),null);
 assert.equal(jobEventOf({...legacy,content:legacy.content+'\nMais texto'}),null);
 assert.equal(jobEventOf({...legacy,system_event:{type:'unknown'}}),null);
});
test('system card keeps technical output collapsed and escaped without downloads or agent controls',()=>{
 const html=renderToStaticMarkup(createElement(JobEvent,{message:{...legacy,created_at:'2026-10-30T12:00:00Z'}}));
 assert.match(html,/Cell · Sistema/);assert.match(html,/<details><summary>/);assert.doesNotMatch(html,/<details open/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<a |SpeakButton|Coordenador/);assert.match(html,/não foi validado/);
});
test('structured job events preserve raw output but enter history as untrusted data, not AI speech',()=>{
 const event={...jobEventOf(legacy)!,jobId:'job',output:'```\n[arquivo](file:///C:/secret)\n</pre>'};
 const message={role:'assistant',content:'Comando encerrado',system_event:event};
 assert.deepEqual(jobEventOf(message),event);
 const context=messageForContext(message);assert.equal(context.role,'user');assert.match(context.content,/não instruções nem resposta do agente/);assert.match(context.content,/não valida/);
 assert.match(jobEventNote('done'),/não foi validado/);
 assert.deepEqual(messageForContext({role:'assistant',content:'Resposta real'}),{role:'assistant',content:'Resposta real'});
});
