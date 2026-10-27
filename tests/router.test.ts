import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {completion,type RouterConfig} from '../apps/server/src/router.js';
import {stripThinking} from '../packages/shared/src/index.js';
const chunk=(delta:any,finish:string|null=null,extra:any={})=>`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:finish}],...extra})}\n\n`;
async function stream(body:string,onVisible:(t:string)=>Promise<void>=async()=>{}){
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(body);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const c:RouterConfig={baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,token:'t',defaultModel:'m',timezone:'UTC',concurrency:1,maxSteps:1,maxDepth:0};
 try{return await completion(c,'m',[{role:'user',content:'oi'}],[],onVisible);}finally{server.close();}
}
test('streaming conclui com [DONE]',async()=>{assert.equal((await stream(chunk({content:'Olá'})+chunk({},'stop')+'data: [DONE]\n\n')).text,'Olá');});
test('streaming conclui com finish_reason sem [DONE] (9router)',async()=>{const r=await stream(chunk({role:'assistant'})+chunk({content:'Oi!'})+chunk({},'stop',{usage:{prompt_tokens:3,completion_tokens:2}}));assert.equal(r.text,'Oi!');assert.equal(r.usage.completion_tokens,2);});
test('streaming cortado sem sinal de fim falha',async()=>{await assert.rejects(stream(chunk({content:'Oi'})),/Streaming interrompido/);});
test('raciocínio <think> nunca aparece, nem no meio do stream',async()=>{
 const seen:string[]=[];const parts=['<thi','nk>\nPreciso pensar','… ainda pensando</th','ink>\n\nOlá','! Tudo bem?'];
 const r=await stream(parts.map(p=>chunk({content:p})).join('')+chunk({},'stop'),async t=>{seen.push(t);});
 assert.equal(r.text,'Olá! Tudo bem?');assert.ok(seen.length>0);for(const t of seen)assert.doesNotMatch(t,/think|pensa/i,`parcial vazou: ${t}`);
});
test('resposta cortada só com raciocínio fica vazia e informa o motivo',async()=>{const r=await stream(chunk({content:'<think>pensando sem fim'})+chunk({},'length'));assert.equal(r.text,'');assert.equal(r.finish,'length');});
test('filtro de raciocínio cobre variações de modelos',()=>{
 assert.equal(stripThinking('<think>a</think>\n\nResposta'),'Resposta');
 assert.equal(stripThinking('raciocínio sem abertura</think>Resposta'),'Resposta');
 assert.equal(stripThinking('<thinking>x</thinking>Oi <think>y'),'Oi ');
 assert.equal(stripThinking('Use a tag <b>negrito</b>'),'Use a tag <b>negrito</b>');
 assert.equal(stripThinking('Resposta parcial <thi',true),'Resposta parcial ');
 assert.equal(stripThinking('a < b',true),'a < b');
});
