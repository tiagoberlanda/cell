import {transaction,event} from './db.js';
import {createRun} from './runtime.js';
import {nextOccurrence} from './schedule.js';
import {safeError} from './security.js';

// Claim, create and advance together. A crash rolls back all three, including the user message.
export async function dispatchRoutine(id:string):Promise<string|undefined>{
 let created:string|undefined;
 try{await transaction(async tx=>{
  const r=(await tx.query('SELECT * FROM routines WHERE id=$1 AND enabled AND next_at<=now() FOR UPDATE',[id])).rows[0];if(!r)return;
  const at=new Date(r.next_at);
  let h=(await tx.query('SELECT * FROM routine_history WHERE routine_id=$1 AND scheduled_at=$2 FOR UPDATE',[id,at])).rows[0];
  const recovering=!!h&&h.status==='dispatching';
  if(!h)h=(await tx.query('INSERT INTO routine_history(routine_id,status,scheduled_at) VALUES($1,$2,$3) RETURNING *',[id,Date.now()-at.getTime()>120000?'missed':'dispatching',at])).rows[0];
  if(h.status==='dispatching'){
   // Also recovers pre-v0.11 dispatch records. A recorded run is never created again.
   const previous=h.run_id||(await tx.query('SELECT id FROM runs WHERE routine_history_id=$1',[h.id])).rows[0]?.id;
   let runId=previous;
   if(!runId){
    // Older versions could create a run but crash before linking it. Require review in that ambiguous case.
    const legacy=recovering&&(await tx.query("SELECT r.id FROM runs r JOIN conversations c ON c.id=r.conversation_id WHERE r.agent_id=$1 AND c.title=$2 AND r.created_at>=$3 AND r.routine_history_id IS NULL LIMIT 1",[r.agent_id,`Rotina: ${r.name}`,h.created_at])).rows[0];
    if(legacy){await tx.query("UPDATE routine_history SET status='review_required' WHERE id=$1",[h.id]);await tx.query('UPDATE routines SET enabled=false WHERE id=$1',[id]);return;}
    const cv=(await tx.query('INSERT INTO conversations(agent_id,title) VALUES($1,$2) RETURNING id',[r.agent_id,`Rotina: ${r.name}`])).rows[0];
    const run=await createRun(r.agent_id,cv.id,r.prompt,[],undefined,undefined,undefined,{client:tx,routineHistoryId:h.id});runId=created=run.id;
   }
   await tx.query("UPDATE routine_history SET status='started',run_id=$2 WHERE id=$1",[h.id,runId]);
  }
  const next=nextOccurrence(r.kind,r.schedule,r.timezone);
  await tx.query('UPDATE routines SET last_at=$2,next_at=$3,enabled=$4 WHERE id=$1',[id,at,next,!!next]);
 });}catch(e){
  // The dispatch rolled back. Record the failure and pause the routine so it is not retried every tick.
  created=undefined;console.error('Falha ao despachar rotina',id,safeError(e));
  await transaction(async tx=>{const r=(await tx.query('SELECT next_at FROM routines WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r?.next_at)return;
   await tx.query("INSERT INTO routine_history(routine_id,status,scheduled_at) VALUES($1,'failed',$2) ON CONFLICT(routine_id,scheduled_at) DO UPDATE SET status='failed'",[id,r.next_at]);
   await tx.query('UPDATE routines SET enabled=false WHERE id=$1',[id]);}).catch(()=>{});
 }
 await event('routine',{id});return created;
}
