import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { decrypt,encrypt,validateEndpoint,appOrigins } from './security.js';
import { query,one } from './db.js';
import { randomBytes } from 'node:crypto';
// Connections created from the catalog use one fixed callback (Google requires the exact URL to be registered); the state
// carries the connection id. Older connections keep their per-connection callback.
export const fixedCallback=()=>`${appOrigins()[0]}/api/connections/oauth/callback`;
// Some servers (Canva) only accept loopback return addresses from unlisted apps. Nothing listens there: the browser shows an
// unreachable page and the owner pastes its address into Cell, which completes the exchange.
export const loopbackCallback='http://127.0.0.1:53682/cell/oauth/callback';
const callbackFor=(connection:any,oauth:any)=>oauth.loopback?loopbackCallback:oauth.fixedRedirect?fixedCallback():`${appOrigins()[0]}/api/connections/${connection.id}/oauth/callback`;
export const newState=(connectionId:string)=>`${connectionId}.${randomBytes(24).toString('hex')}`;
// OAuth provider for the MCP SDK. Dynamic registration when the server allows it; a pre-registered client (oauth.client)
// otherwise. Google needs offline access and a consent prompt to issue refresh tokens.
function oauthProvider(connection:any,oauth:any,save:()=>Promise<void>){
 return {
  get redirectUrl(){return callbackFor(connection,oauth);},
  get clientMetadata(){return {redirect_uris:[callbackFor(connection,oauth)],client_name:'Cell',grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:oauth.client?.client_secret?'client_secret_post':'none',...(oauth.scope?{scope:oauth.scope}:{})};},
  clientInformation:()=>oauth.client,saveClientInformation:async(v:any)=>{oauth.client=v;await save();},
  tokens:()=>oauth.tokens,saveTokens:async(v:any)=>{oauth.tokens=v;delete oauth.authorizationUrl;await save();},
  redirectToAuthorization:async(url:URL)=>{if(url.hostname==='accounts.google.com'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');}if(oauth.scope&&!url.searchParams.get('scope'))url.searchParams.set('scope',oauth.scope);oauth.authorizationUrl=url.toString();await save();},
  saveCodeVerifier:async(v:string)=>{oauth.verifier=v;await save();},codeVerifier:()=>oauth.verifier,
  state:()=>oauth.state,invalidateCredentials:async(scope:string)=>{if(scope==='all'||scope==='tokens')delete oauth.tokens;if(scope==='all'&&!oauth.staticClient)delete oauth.client;await save();}
 } as any;
}
export async function mcpClient(connection:any){
 const headers=connection.auth?decrypt<Record<string,string>>(connection.auth):{};
 const oauth=connection.oauth?decrypt<any>(connection.oauth):{};
 const save=()=>query('UPDATE connections SET oauth=$1 WHERE id=$2 AND url=$3',[encrypt(oauth),connection.id,connection.url]).then(()=>{});
 if(!oauth.state){oauth.state=oauth.fixedRedirect?newState(connection.id):randomBytes(32).toString('hex');oauth.state_expires_at=Date.now()+15*60*1000;await save();}
 const transport=new StreamableHTTPClientTransport(new URL(validateEndpoint(connection.url)),{requestInit:{headers},authProvider:oauthProvider(connection,oauth,save)});
 const client=new Client({name:'cell',version:'0.1.0'},{capabilities:{}});
 try{await client.connect(transport);return {client,transport};}catch(e){await client.close().catch(()=>{});throw e;}
}
// Read-only tools run without approval: the MCP readOnlyHint annotation decides; without it, read-like names do.
export const readOnlyTools=(tools:any[])=>tools.filter(t=>t.annotations?.readOnlyHint===true||(t.annotations?.readOnlyHint===undefined&&/^(get|list|search|fetch|read|find|query|retrieve|lookup|describe)[_-]?/i.test(String(t.name)))).map(t=>t.name);
export async function discover(connection:any){const {client}=await mcpClient(connection);try{let cursor:string|undefined;const tools:any[]=[];do{const page=await client.listTools({cursor});tools.push(...page.tools);cursor=page.nextCursor;if(tools.length>300)throw new Error('Limite de 300 ferramentas por conexão.');}while(cursor);
 // Catalog connections classify read tools automatically; custom connections keep the owner's choice.
 if(connection.catalog_key)await query("UPDATE connections SET tools=$1,status='connected',read_tools=$3 WHERE id=$2 AND url=$4",[JSON.stringify(tools),connection.id,JSON.stringify(readOnlyTools(tools)),connection.url]);
 else await query("UPDATE connections SET tools=$1,status='connected' WHERE id=$2 AND url=$3",[JSON.stringify(tools),connection.id,connection.url]);
 return tools;}finally{await client.close();}}
// The MCP server reported a tool failure (isError): the call completed and the action did not happen.
export class McpToolError extends Error {}
export async function mcpCall(connectionId:string,name:string,args:any){const connection=await one('SELECT * FROM connections WHERE id=$1',[connectionId]);if(!connection)throw new Error('Conexão removida.');const {client}=await mcpClient(connection);try{const result=await client.callTool({name,arguments:args},undefined,{timeout:60000});if(result.isError){const content=Array.isArray(result.content)?result.content:[];const text=content.map((c:any)=>c.type==='text'?c.text:`[${c.type}]`).join('\n')||'sem detalhes';throw new McpToolError('A ferramenta MCP retornou erro: '+text.slice(0,1000));}return JSON.stringify(result).slice(0,30000);}finally{await client.close();}}
// Starts OAuth before talking to the server. Some servers (Google) list tools without a token, so waiting for a 401 would mark
// a connection as connected while every call fails. Returns the authorization URL, or null when tokens are already valid.
export async function startAuthorization(connection:any):Promise<string|null>{
 const oauth=connection.oauth?decrypt<any>(connection.oauth):{};
 const save=()=>query('UPDATE connections SET oauth=$1 WHERE id=$2 AND url=$3',[encrypt(oauth),connection.id,connection.url]).then(()=>{});
 const result=await auth(oauthProvider(connection,oauth,save),{serverUrl:new URL(validateEndpoint(connection.url)),...(oauth.scope?{scope:oauth.scope}:{})});
 return result==='REDIRECT'?oauth.authorizationUrl:null;
}
export async function finishOAuth(connection:any,code:string){
 const headers=connection.auth?decrypt<Record<string,string>>(connection.auth):{},oauth=connection.oauth?decrypt<any>(connection.oauth):{};
 const save=()=>query('UPDATE connections SET oauth=$1 WHERE id=$2 AND url=$3',[encrypt(oauth),connection.id,connection.url]).then(()=>{});
 const transport=new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers},authProvider:oauthProvider(connection,oauth,save)});
 await transport.finishAuth(code);await transport.close();
}
