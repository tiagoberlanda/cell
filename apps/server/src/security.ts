import { createCipheriv,createDecipheriv,randomBytes,createHash,timingSafeEqual } from 'node:crypto';
import path from 'node:path';
export function key(){const k=Buffer.from(process.env.SECRET_KEY||'','hex');if(k.length!==32)throw new Error('SECRET_KEY deve conter 64 caracteres hexadecimais.');return k;}
export function encrypt(value:unknown){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
export function decrypt<T=any>(value:string):T {const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function contained(root:string,file:string){const target=path.resolve(root,file),rel=path.relative(path.resolve(root),target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Caminho fora do workspace.');return target;}
export function validateEndpoint(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('Endpoint HTTP(S) inválido.');return url.toString().replace(/\/$/,'');}
export function approvalFingerprint(tool:string,args:unknown,binding=''){return hash(JSON.stringify({tool,args,binding}));}
export function safeError(e:unknown){const raw=e instanceof Error?e.message:'Falha inesperada';return raw.replace(/Bearer\s+[^\s"']+/gi,'Bearer [protegido]').replace(/(?:sk-|eyJ)[A-Za-z0-9_.-]{12,}/g,'[protegido]').slice(0,500);}
// APP_ORIGIN accepts a comma-separated list so the app can be reached by several hosts (LAN IP, localhost).
export const appOrigins=()=>(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
export const allowedOrigin=(origin:string)=>appOrigins().includes(origin);
// Behind Caddy every request arrives from the proxy, so rate limits need the real client address.
// Caddy replaces X-Forwarded-For with its direct peer. Cloudflare's CF-Connecting-IP is trusted only when that peer is a
// private address (cloudflared on this host or LAN); internet clients reaching Caddy directly cannot spoof it.
const privateIp=(ip:string)=>/^(::ffff:)?(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)||ip==='::1'||/^f[cd]/i.test(ip);
export function clientIp(req:{headers:Record<string,any>;ip:string}){const peer=String(req.headers['x-forwarded-for']||'').split(',').pop()!.trim()||req.ip;const cf=String(req.headers['cf-connecting-ip']||'').trim();return cf&&privateIp(peer)?cf:peer;}
