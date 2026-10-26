import { z } from 'zod';
// Agent icons are cell types; the web draws each one in CellAvatar.
export const shapes = ['animal','vegetal','bacilo','coco','neuronio','hemacia','ameba','paramecio','euglena','diatomacea','levedura','leucocito'] as const;
export const states = ['queued','running','waiting_approval','waiting_agent','completed','failed','cancelled'] as const;
export type RunState = typeof states[number];
export const agentInput = z.object({ name:z.string().trim().min(1).max(60), role:z.string().max(120).default(''), description:z.string().max(1000).default(''), instructions:z.string().max(16000).default(''), color:z.string().regex(/^#[0-9a-fA-F]{6}$/), shape:z.enum(shapes), model:z.string().max(200).nullable().default(null), pinned:z.boolean().default(false), section:z.string().max(60).default('Equipe'), memory:z.string().max(20000).default(''), tools:z.array(z.string().max(180)).max(100).default([]), skills:z.array(z.string().uuid()).max(100).default([]) });
export type AgentInput = z.infer<typeof agentInput>;
export interface Agent extends AgentInput {id:string; archived:boolean; is_master:boolean; state:RunState|null; last_message?:string; unread?:boolean}
export const messageInput=z.object({content:z.string().trim().min(1).max(50000),files:z.array(z.string().uuid()).max(5).default([])});
export const settingsInput=z.object({baseUrl:z.string().url(),token:z.string().max(4000).optional(),defaultModel:z.string().max(200),timezone:z.string().default('America/Sao_Paulo'),concurrency:z.number().int().min(1).max(10).default(3),maxSteps:z.number().int().min(1).max(100).default(20),maxDepth:z.number().int().min(0).max(5).default(3)});
export const skillInput=z.object({name:z.string().trim().min(1).max(100),body:z.string().min(1).max(50000)});
export const routineInput=z.object({agentId:z.string().uuid(),name:z.string().min(1).max(120),prompt:z.string().min(1).max(10000),kind:z.enum(['once','daily','weekly','cron']),schedule:z.string().min(1).max(100),timezone:z.string().default('America/Sao_Paulo'),enabled:z.boolean().default(false)});
