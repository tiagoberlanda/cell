import { createCipheriv,createDecipheriv,randomBytes,createHash,timingSafeEqual } from 'node:crypto';
import path from 'node:path';
export function key(){const k=Buffer.from(process.env.SECRET_KEY||'','hex');if(k.length!==32)throw new Error('SECRET_KEY deve conter 64 caracteres hexadecimais.');return k;}
export function encrypt(value:unknown){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
export function decrypt<T=any>(value:string):T {const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function contained(root:string,file:string){const target=path.resolve(root,file),rel=path.relative(path.resolve(root),target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Caminho fora do workspace.');return target;}
export function validateEndpoint(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('Endpoint HTTP(S) inválido.');return url.toString().replace(/\/$/,'');}
// Keys sorted at every level: the arguments are stored as jsonb, which reorders keys, and the hash must match when
// recomputed from the stored copy.
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v as object).sort().map(k=>[k,canonical((v as any)[k])])):v;
export function approvalFingerprint(tool:string,args:unknown,binding=''){return hash(JSON.stringify(canonical({tool,args,binding})));}
export function safeError(e:unknown){const raw=e instanceof Error?e.message:'Falha inesperada';return raw.replace(/Bearer\s+[^\s"']+/gi,'Bearer [protegido]').replace(/(?:sk-|eyJ)[A-Za-z0-9_.-]{12,}/g,'[protegido]').slice(0,500);}
// APP_ORIGIN accepts a comma-separated list so the app can be reached by several hosts (LAN IP, localhost).
export const appOrigins=()=>(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
export const allowedOrigin=(origin:string)=>appOrigins().includes(origin);
// First HTTPS origin reached by domain name (not an IP or localhost): the address with a publicly trusted certificate.
export const publicOrigin=()=>appOrigins().find(o=>{try{const u=new URL(o);return u.protocol==='https:'&&!/^(localhost|[\d.]+|\[.*\])$/i.test(u.hostname)&&!u.hostname.endsWith('.localhost');}catch{return false;}})||null;
// Behind Caddy every request arrives from the proxy, so rate limits need the real client address.
// Caddy replaces X-Forwarded-For with its direct peer. Cloudflare's CF-Connecting-IP is trusted only from the authorized proxy:
// with CELL_PROXY_SECRET set, the request must carry X-Cell-Proxy-Secret (added by a Cloudflare transform rule), which a LAN
// client cannot forge; otherwise the peer must match TRUSTED_PROXIES (CIDRs; default: private networks, where cloudflared runs).
const v4=(ip:string)=>{const m=/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);return m?((+m[1]<<24)>>>0)+(+m[2]<<16)+(+m[3]<<8)+ +m[4]:null;};
export function inCidr(ip:string,cidr:string){const [base,bits]=cidr.trim().split('/');const a=v4(ip),b=v4(base);if(a===null||b===null)return ip===base;const n=bits===undefined?32:Number(bits);const mask=n===0?0:(~0<<(32-n))>>>0;return ((a&mask)>>>0)===((b&mask)>>>0);}
const defaultProxies='127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1';
export function proxyTrust(){const secret=process.env.CELL_PROXY_SECRET||'';const proxies=(process.env.TRUSTED_PROXIES||defaultProxies).split(',').map(x=>x.trim()).filter(Boolean);return {mode:secret?'secret':process.env.TRUSTED_PROXIES?'proxies':'private-networks',secret,proxies};}
export function clientIp(req:{headers:Record<string,any>;ip:string}){const peer=String(req.headers['x-forwarded-for']||'').split(',').pop()!.trim()||req.ip;const cf=String(req.headers['cf-connecting-ip']||'').trim();if(!cf)return peer;
 const t=proxyTrust();const trusted=t.secret?safeEqual(String(req.headers['x-cell-proxy-secret']||''),t.secret):t.proxies.some(c=>inCidr(peer,c));return trusted?cf:peer;}
