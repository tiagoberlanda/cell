import { z } from 'zod';
// Agent icons are cell types; the web draws each one in CellAvatar.
export const shapes = ['animal','vegetal','bacilo','coco','neuronio','hemacia','ameba','paramecio','euglena','diatomacea','levedura','leucocito'] as const;
export const states = ['queued','running','waiting_approval','waiting_agent','completed','failed','cancelled'] as const;
export type RunState = typeof states[number];
export const agentInput = z.object({ name:z.string().trim().min(1).max(60), role:z.string().max(120).default(''), description:z.string().max(1000).default(''), instructions:z.string().max(16000).default(''), color:z.string().regex(/^#[0-9a-fA-F]{6}$/), shape:z.enum(shapes), model:z.string().max(200).nullable().default(null), pinned:z.boolean().default(false), section:z.string().max(60).default('Equipe'), memory:z.string().max(20000).default(''), tools:z.array(z.string().max(180)).max(100).default([]), skills:z.array(z.string().uuid()).max(100).default([]) });
export type AgentInput = z.infer<typeof agentInput>;
export interface Agent extends AgentInput {id:string; archived:boolean; is_master:boolean; state:RunState|null; last_message?:string; unread?:boolean}
export const messageInput=z.object({content:z.string().trim().min(1).max(50000),files:z.array(z.string().uuid()).max(5).default([])});
export const settingsInput=z.object({baseUrl:z.string().url(),token:z.string().max(4000).optional(),defaultModel:z.string().max(200),imageModel:z.string().max(200).default(''),timezone:z.string().default('America/Sao_Paulo'),concurrency:z.number().int().min(1).max(10).default(3),maxSteps:z.number().int().min(1).max(100).default(20),maxDepth:z.number().int().min(0).max(5).default(3),maxTokens:z.number().int().min(256).max(65536).default(4096)});
export const skillInput=z.object({name:z.string().trim().min(1).max(100),body:z.string().min(1).max(50000)});
export const routineInput=z.object({agentId:z.string().uuid(),name:z.string().min(1).max(120),prompt:z.string().min(1).max(10000),kind:z.enum(['once','daily','weekly','cron']),schedule:z.string().min(1).max(100),timezone:z.string().default('America/Sao_Paulo'),enabled:z.boolean().default(false)});
// Reasoning models (DeepSeek R1, QwQ…) write their chain of thought inside <think>…</think> in the answer text.
// Only the final answer is shown. With streaming=true an unfinished tag at the end is held back ("<thi").
const thinkTags=['think','thinking','reasoning'];
export function stripThinking(raw:string,streaming=false){
 let out=raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi,'');
 // Some chat templates open the block in the prompt, so only the closing tag arrives: drop what precedes it.
 const close=/<\/(think|thinking|reasoning)>/i.exec(out);if(close)out=out.slice(close.index+close[0].length);
 // An opened block that has not closed yet is still reasoning.
 const open=/<(think|thinking|reasoning)>/i.exec(out);if(open)out=out.slice(0,open.index);
 if(streaming){const lt=out.lastIndexOf('<');if(lt>=0){const tail=out.slice(lt).toLowerCase();if(thinkTags.some(t=>`<${t}>`.startsWith(tail)||`</${t}>`.startsWith(tail)))out=out.slice(0,lt);}}
 return out.replace(/^\s+/,'');
}
