import { one } from './db.js';

// Best-effort detection of common deletion syntax, not a sandbox: computed commands, custom aliases,
// encoded scripts and remote code can hide deletions. False positives only ask the owner to confirm.
const destructive=/\b(Remove-Item|Clear-Content|Clear-RecycleBin|Format-Volume|diskpart|ri|clc|rm|rmdir|rd|del|erase|shred|unlink|mkfs|truncate)\b|\bdrop\s+(table|database|schema|view|index|sequence|function|procedure|trigger)\b|\bdelete\s+(?:from\b|[\w.\[\]`"]+\s+from\b)|\.(unlink|rmtree|remove|delete)\s*\(|\[\s*(?:System\.)?IO\.(?:File|Directory)\s*\]\s*::\s*Delete\s*\(/i;
const deletingTool=/delete|remove|trash|destroy|erase|purge|wipe/i;

// True when the call deletes something: pc_delete, a destructive command or recipe, or an app tool named like a deletion.
export async function isDeletion(call:{tool:string;args:any;target?:string|null}){
 if(call.tool==='pc_delete')return true;
 if(call.tool==='pc_run')return destructive.test(String(call.args?.command||''));
 if(call.tool==='pc_recipe'){const r=await one('SELECT command FROM command_recipes WHERE lower(name)=lower($1)',[String(call.args?.name||'')]);return !r||destructive.test(r.command);}
 return deletingTool.test(call.tool);
}

export const SAFE_AUTO_APPROVE_TOOLS=new Set<string>([
 'write_shared_memory',
 'gtasks_create_task',
 'gtasks_complete_task',
]);

// Whether a pending approval can be granted without the owner: a tool marked "Aprovar sempre", or the agent's mode.
export async function autoApproval(agentId:string,call:{tool:string;args:any;target?:string|null}):Promise<'always'|'mode'|null>{
 const a=await one('SELECT approval_mode,auto_approve FROM agents WHERE id=$1',[agentId]);if(!a)return null;
 if((a.auto_approve||[]).some((r:any)=>r.tool===call.tool))return 'always';
 if(a.approval_mode==='yolo')return 'mode';
 if(a.approval_mode==='safe'){
  if(call.tool==='pc_run'||call.tool==='pc_recipe'||call.tool==='pc_request_access')return null;
  if(call.target?.toLowerCase().includes('computador'))return null;
  if(SAFE_AUTO_APPROVE_TOOLS.has(call.tool)&&!await isDeletion(call))return 'mode';
 }
 return null;
}
