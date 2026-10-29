import { z } from 'zod';
import { skillInput } from '../../../packages/shared/src/index.js';
import { query,one,transaction } from './db.js';

const skillId=z.string().uuid();
const missing=()=>Object.assign(new Error('Habilidade não encontrada.'),{statusCode:404});
export async function listSkills(){return query('SELECT * FROM skills ORDER BY name');}
export async function readSkill(id:unknown){const found=await one('SELECT * FROM skills WHERE id=$1',[skillId.parse(id)]);if(!found)throw missing();return found;}
export async function createSkill(input:unknown){const d=skillInput.parse(input);return one('INSERT INTO skills(name,body) VALUES($1,$2) RETURNING *',[d.name,d.body]);}
export async function updateSkill(id:unknown,input:unknown){const key=skillId.parse(id),d=skillInput.parse(input);const found=await one('UPDATE skills SET name=$2,body=$3 WHERE id=$1 RETURNING *',[key,d.name,d.body]);if(!found)throw missing();return found;}
export async function deleteSkill(id:unknown){
 const key=skillId.parse(id);
 await transaction(async c=>{
  const deleted=await c.query('DELETE FROM skills WHERE id=$1 RETURNING id',[key]);if(!deleted.rowCount)throw missing();
  await c.query('UPDATE agents SET skills=skills - $1::text WHERE skills @> $2::jsonb',[key,JSON.stringify([key])]);
 });
 return {ok:true};
}
// Lock the skill before touching the agent: deletion cannot leave a dangling assignment,
// including when an assignment races with deletion. JSONB updates also avoid lost agent edits.
export async function setSkillAssignment(id:unknown,agentId:unknown,assigned:boolean){
 const key=skillId.parse(id),agent=z.string().uuid().parse(agentId);
 return transaction(async c=>{
  if(!(await c.query('SELECT id FROM skills WHERE id=$1 FOR UPDATE',[key])).rowCount)throw missing();
  const result=await c.query(assigned
   ? 'UPDATE agents SET skills=CASE WHEN skills @> $2::jsonb THEN skills ELSE skills || $2::jsonb END WHERE id=$1 RETURNING id,skills'
   : 'UPDATE agents SET skills=skills - $2::text WHERE id=$1 RETURNING id,skills',assigned?[agent,JSON.stringify([key])]:[agent,key]);
  if(!result.rowCount)throw Object.assign(new Error('Agente não encontrado.'),{statusCode:404});
  return result.rows[0];
 });
}
