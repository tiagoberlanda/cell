import {test} from 'node:test';
import assert from 'node:assert/strict';
import {skillTools} from '../apps/server/src/skill-tools.js';

const tools=skillTools(),tool=(name:string)=>tools.find(t=>t.name===name)!;
test('habilidades: leituras livres e toda mutação pede aprovação com destino',()=>{
 assert.deepEqual(tools.filter(t=>!t.write).map(t=>t.name),['list_skills','read_skill']);
 for(const name of ['create_skill','update_skill','delete_skill','assign_skill','unassign_skill']){assert.equal(tool(name).write,true);assert.ok(tool(name).target);}
});
test('habilidades: validação rejeita parâmetros inválidos antes de acessar o banco',async()=>{
 const uuid='2ea52a65-9e8c-4057-abf9-3889ff43b61b';
 for(const [name,args] of [
  ['list_skills',{unexpected:true}],['read_skill',{id:'invalid'}],['create_skill',{name:' ',body:'texto'}],
  ['create_skill',{name:'Teste',body:'x'.repeat(50001)}],['update_skill',{id:uuid,name:'Teste'}],
  ['delete_skill',{}],['assign_skill',{id:uuid,agentId:uuid}],['unassign_skill',{id:'invalid'}]
 ] as const)await assert.rejects(tool(name).execute(args,{agent_id:uuid},{}),/./);
});
