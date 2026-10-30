import { one } from './db.js';

// Commands that delete or wipe data. A false positive only means the owner is asked, so the list leans wide.
const destructive=/\b(Remove-Item|Clear-Content|Clear-RecycleBin|Format-Volume|diskpart|rm|rmdir|rd|del|erase|shred|unlink|mkfs|truncate)\b|\bdrop\s+(table|database|schema)\b|\bdelete\s+from\b|\.(unlink|rmtree|remove)\(/i;
const deletingTool=/delete|remove|trash|destroy|erase|purge|wipe/i;

// True when the call deletes something: pc_delete, a destructive command or recipe, or an app tool named like a deletion.
export async function isDeletion(call:{tool:string;args:any;target?:string|null}){
 if(call.tool==='pc_delete')return true;
 if(call.tool==='pc_run')return destructive.test(String(call.args?.command||''));
 if(call.tool==='pc_recipe'){const r=await one('SELECT command FROM command_recipes WHERE lower(name)=lower($1)',[String(call.args?.name||'')]);return !r||destructive.test(r.command);}
 return deletingTool.test(call.tool);
}

// Whether a pending approval can be granted without the owner: a tool marked "Aprovar sempre", or the agent's mode.
export async function autoApproval(agentId:string,call:{tool:string;args:any;target?:string|null}):Promise<'always'|'mode'|null>{
 const a=await one('SELECT approval_mode,auto_approve FROM agents WHERE id=$1',[agentId]);if(!a)return null;
 if((a.auto_approve||[]).some((r:any)=>r.tool===call.tool))return 'always';
 if(a.approval_mode==='yolo')return 'mode';
 // Arbitrary shell code cannot be classified safely with a deletion blacklist (aliases, .NET, interpreters,
 // downloads, etc.). Saved untrusted recipes are shell code too. Explicit always/full rules above still win.
 if(a.approval_mode==='safe'&&!['pc_run','pc_recipe'].includes(call.tool)&&!await isDeletion(call))return 'mode';
 return null;
}
