import {useCallback,useEffect,useState} from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {Check,Copy,MoreHorizontal,RefreshCw,Settings2,Unplug,ChevronDown,AlertTriangle} from 'lucide-react';
import {api} from './api';
import {confirmDialog} from './dialogs';
import {brandIcons} from './brandIcons';
type Notice={notify:(m:string)=>void};
type Connector={key:string;name:string;description:string;category:string;color:string;auth:'oauth'|'google'|'google-native';preview:boolean;connectionId:string|null;status:string;tools:number};
const initials=(name:string)=>name.split(/\s+/).filter(w=>/^[A-Za-zÀ-ú]/.test(w)&&!['e','de'].includes(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const dark=(hex:string)=>{const n=parseInt(hex.slice(1),16);return ((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000<150;};
// Brand glyph on a white tile when Simple Icons has it; otherwise a colored initial.
function Logo({c}:{c:Connector}){const icon=brandIcons[c.key];if(icon)return <span className="app-logo brand" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path d={icon.path} fill={icon.hex}/></svg></span>;return <span className="app-logo" style={{background:c.color,color:dark(c.color)?'#fff':'#111'}} aria-hidden="true">{initials(c.name)}</span>;}
function CopyField({value,notify}:{value:string}&Notice){return <div className="copy-field"><code>{value}</code><button type="button" className="icon-btn" aria-label="Copiar" onClick={()=>navigator.clipboard.writeText(value).then(()=>notify('Copiado.')).catch(()=>notify('Não foi possível copiar.'))}><Copy size={15}/></button></div>;}

// One-click app catalog: OAuth connectors connect directly; Google services after a one-time OAuth client setup.
export function AppsCatalog({notify,onManage}:{onManage:(connectionId:string)=>void}&Notice){
 const [data,setData]=useState<{connectors:Connector[];googleConfigured:boolean;googleClientId:string;redirectUri:string}|null>(null),[busy,setBusy]=useState<string|null>(null),[googleOpen,setGoogleOpen]=useState(false),[google,setGoogle]=useState({clientId:'',clientSecret:''});
 const load=useCallback(()=>api('/connectors').then(setData).catch((e:any)=>notify(e.message)),[notify]);
 useEffect(()=>{load();const onVisible=()=>{if(document.visibilityState==='visible')load();};document.addEventListener('visibilitychange',onVisible);return()=>document.removeEventListener('visibilitychange',onVisible);},[load]);
 const connect=async(c:Connector)=>{setBusy(c.key);try{const r=await api(`/connectors/${c.key}/connect`,'POST');if(r.authorizationUrl){window.location.assign(r.authorizationUrl);return;}notify(`${c.name} conectado: ${r.tools} ferramentas.`);await load();}catch(e:any){notify(e.message);await load();}finally{setBusy(null);}};
 const disconnect=async(c:Connector)=>{if(!await confirmDialog(`Desconectar ${c.name}?`,'Os agentes deixam de usar as ferramentas deste aplicativo.',{confirm:'Desconectar',danger:true}))return;try{await api('/connectors/'+c.key,'DELETE');notify(`${c.name} desconectado.`);await load();}catch(e:any){notify(e.message);}};
 const saveGoogle=async()=>{try{await api('/connectors/google','PUT',{clientId:google.clientId,...(google.clientSecret?{clientSecret:google.clientSecret}:{})});setGoogle({clientId:'',clientSecret:''});setGoogleOpen(false);notify('Google configurado. Agora conecte os serviços com um clique.');await load();}catch(e:any){notify(e.message);}};
 if(!data)return <p className="hint">Carregando aplicativos…</p>;
 const card=(c:Connector)=>{const needsGoogle=c.auth!=='oauth'&&!data.googleConfigured,connected=c.status==='connected';
  return <div className={`app-card ${connected?'connected':''}`} key={c.key}><Logo c={c}/><div className="app-info"><strong>{c.name}{c.preview&&<em className="mode-badge">Prévia do Google</em>}</strong><small>{c.description}</small>
   {connected?<small className="connected"><Check size={12}/>Conectado · {c.tools} ferramentas</small>:c.status==='error'?<small className="app-error"><AlertTriangle size={12}/>Falhou. Tente de novo.</small>:c.status==='connecting'?<small className="hint">Aguardando autorização…</small>:null}</div>
   {connected?<Dropdown.Root><Dropdown.Trigger asChild><button className="icon-btn" aria-label={`Opções de ${c.name}`}><MoreHorizontal size={18}/></button></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" align="end">
     {c.connectionId&&c.auth!=='google-native'&&<Dropdown.Item onSelect={()=>onManage(c.connectionId!)}><Settings2 size={15}/>Ferramentas e permissões</Dropdown.Item>}
     <Dropdown.Item onSelect={()=>connect(c)}><RefreshCw size={15}/>Reconectar</Dropdown.Item><Dropdown.Separator/><Dropdown.Item onSelect={()=>disconnect(c)}><Unplug size={15}/>Desconectar</Dropdown.Item></Dropdown.Content></Dropdown.Portal></Dropdown.Root>
   :<button className={needsGoogle?'secondary':'primary'} disabled={busy===c.key} onClick={()=>needsGoogle?setGoogleOpen(true):connect(c)}>{busy===c.key?'Abrindo…':needsGoogle?'Configurar':'Conectar'}</button>}
  </div>;};
 const others=data.connectors.filter(c=>c.category!=='Google'),googleApps=data.connectors.filter(c=>c.category==='Google');
 return <div className="stack apps-catalog">
  <div><h3>Aplicativos</h3><p className="hint">Conecte com um clique e autorize no próprio serviço. As ferramentas ficam disponíveis para todos os agentes; ações de escrita sempre pedem sua aprovação.</p></div>
  <div className="app-grid">{others.map(card)}</div>
  <div className="row wrap app-section"><h3>Google</h3><span className="hint">{data.googleConfigured?`Configurado · ${data.googleClientId.slice(0,22)}…`:'Requer uma configuração única no Google Cloud.'}</span><button className="text-button" onClick={()=>setGoogleOpen(!googleOpen)}><ChevronDown size={14}/>{data.googleConfigured?'Alterar configuração':'Como configurar'}</button></div>
  {googleOpen&&<div className="google-setup stack">
   <p className="hint">O Google não permite conexão automática de apps independentes: crie uma vez um cliente OAuth no seu projeto do Google Cloud. Depois, cada serviço conecta com um clique.</p>
   <ol>
    <li>Em <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a>, crie um projeto e ative as APIs (no Cloud Shell):<CopyField notify={notify} value="gcloud services enable gmail.googleapis.com drive.googleapis.com calendar-json.googleapis.com tasks.googleapis.com gmailmcp.googleapis.com drivemcp.googleapis.com calendarmcp.googleapis.com"/></li>
    <li>Em <strong>APIs e serviços → Tela de consentimento OAuth</strong>, escolha "Externo" e adicione seu e-mail como usuário de teste.</li>
    <li>Em <strong>Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web</strong>, adicione este URI de redirecionamento autorizado:<CopyField notify={notify} value={data.redirectUri}/></li>
    <li>Cole o Client ID e o Client Secret gerados:</li>
   </ol>
   <label>Client ID<input value={google.clientId} placeholder={data.googleClientId||'123….apps.googleusercontent.com'} onChange={e=>setGoogle({...google,clientId:e.target.value.trim()})}/></label>
   <label>Client Secret<input type="password" autoComplete="new-password" value={google.clientSecret} placeholder={data.googleConfigured?'Deixe vazio para manter o atual':''} onChange={e=>setGoogle({...google,clientSecret:e.target.value.trim()})}/></label>
   <div className="form-footer">{data.googleConfigured&&<button className="text-button" onClick={async()=>{if(await confirmDialog('Remover a configuração do Google?','As conexões do Google param de renovar o acesso.',{confirm:'Remover',danger:true})){await api('/connectors/google','DELETE');await load();}}}>Remover configuração</button>}<button className="primary" disabled={!google.clientId} onClick={saveGoogle}>Salvar</button></div>
   <p className="hint">Gmail, Drive e Agenda usam os servidores MCP oficiais do Google, ainda em prévia; o Google Tarefas é integrado diretamente pelo Cell.</p>
  </div>}
  <div className="app-grid">{googleApps.map(card)}</div>
 </div>;
}
