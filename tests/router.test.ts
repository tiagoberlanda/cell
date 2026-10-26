import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {completion,type RouterConfig} from '../apps/server/src/router.js';
const chunk=(delta:any,finish:string|null=null,extra:any={})=>`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:finish}],...extra})}\n\n`;
async function stream(body:string){
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(body);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const c:RouterConfig={baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,token:'t',defaultModel:'m',timezone:'UTC',concurrency:1,maxSteps:1,maxDepth:0};
 try{return await completion(c,'m',[{role:'user',content:'oi'}],[],async()=>{});}finally{server.close();}
}
test('streaming conclui com [DONE]',async()=>{assert.equal((await stream(chunk({content:'Olá'})+chunk({},'stop')+'data: [DONE]\n\n')).text,'Olá');});
test('streaming conclui com finish_reason sem [DONE] (9router)',async()=>{const r=await stream(chunk({role:'assistant'})+chunk({content:'Oi!'})+chunk({},'stop',{usage:{prompt_tokens:3,completion_tokens:2}}));assert.equal(r.text,'Oi!');assert.equal(r.usage.completion_tokens,2);});
test('streaming cortado sem sinal de fim falha',async()=>{await assert.rejects(stream(chunk({content:'Oi'})),/Streaming interrompido/);});
