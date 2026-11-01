import {useCallback,useEffect,useState} from 'react';
import {Bell,BellOff,Send,Trash2,Smartphone,CheckCheck,ShieldAlert,X,Settings} from 'lucide-react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {CellAvatar} from './CellAvatar';
import {api} from './api';
type Notice={notify:(m:string)=>void};
const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const keyBytes=(base64:string)=>{const pad='='.repeat((4-base64.length%4)%4),raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
function deviceLabel(){const ua=navigator.userAgent;const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Windows':/Mac OS/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux':'Aparelho';const app=matchMedia('(display-mode: standalone)').matches?'app instalado':/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'navegador';return `${os} · ${app}`;}
async function currentSubscription(){const reg=await navigator.serviceWorker.getRegistration();return reg?await reg.pushManager.getSubscription():null;}
// Called on logout: this device stops receiving notifications for the account.
export async function forgetThisDevice(){try{if(!supported())return;const s=await currentSubscription();if(!s)return;await api('/push/unsubscribe','POST',{endpoint:s.endpoint}).catch(()=>{});await s.unsubscribe();}catch{/* best effort */}}

// Asks permission, subscribes this browser with the server's VAPID key and registers it. Returns the permission state.
export async function enablePush(publicKey?:string){
 if(!supported())throw new Error('Este navegador não suporta notificações push.');
 const key=publicKey||(await api('/push')).publicKey;
 const p=await Notification.requestPermission();if(p!=='granted')throw new Error('Permissão de notificação negada. Libere nas configurações do navegador para este site.');
 const reg=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('O app ainda não terminou de instalar o service worker. Recarregue a página e tente de novo.')),8000))]);
 let s=await reg.pushManager.getSubscription();
 // A subscription made with another server key cannot be reused.
 if(s&&s.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(s.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==key){await s.unsubscribe();s=null;}
 if(!s)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
 await api('/push/subscribe','POST',{...s.toJSON(),label:deviceLabel()});return p;
}
// True when this device could receive push but was never asked (used to offer activation once).
export async function shouldOfferPush(){try{if(!supported()||!window.isSecureContext||Notification.permission!=='default')return false;return !(await currentSubscription());}catch{return false;}}
export function NotificationsPanel({notify}:Notice){
 const [permission,setPermission]=useState<string>(supported()?Notification.permission:'unsupported'),[subscribed,setSubscribed]=useState(false),[devices,setDevices]=useState<any[]>([]),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const d=await api('/push');setDevices(d.devices);setPublicKey(d.publicKey);if(supported()){const s=await currentSubscription();setSubscribed(!!s&&d.devices.length>0);}}catch(e:any){notify(e.message);}},[notify]);
 useEffect(()=>{load();},[load]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();await load();}catch(e:any){notify(e.message||'Não foi possível concluir.');}finally{setBusy(false);}};
 const enable=()=>run(async()=>{const p=await enablePush(publicKey);setPermission(p);notify('Notificações ativadas neste aparelho.');});
 const disable=()=>run(async()=>{await forgetThisDevice();notify('Notificações desativadas neste aparelho.');});
 const test=()=>run(async()=>{const r=await api('/push/test','POST');notify(r.failed?`Teste enviado para ${r.sent} aparelho(s); ${r.failed} falharam.`:`Teste enviado para ${r.sent} aparelho(s).`);});
 const secure=window.isSecureContext;
 return <div className="stack notifications">
  <h3>Notificações</h3>
  <p className="hint">Receba um aviso no celular ou no computador quando um agente ou uma rotina enviar mensagem, ou quando uma ação precisar da sua aprovação. Se a conversa estiver aberta em algum aparelho, o aviso não é enviado.</p>
  {!supported()?<div className="setting-card"><BellOff size={20}/><p>Este navegador não suporta notificações push. No Android, use o Chrome; no iPhone, instale o Cell na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p></div>
  :!secure?<div className="setting-card"><BellOff size={20}/><p>Notificações exigem HTTPS confiável. Abra pelo domínio público configurado (Cloudflare Tunnel) ou instale o certificado local.</p></div>
  :<div className="setting-card"><Bell size={20}/><div className="stack" style={{gap:10}}>
    <p>{permission==='denied'?'As notificações estão bloqueadas para este site. Libere em Configurações do navegador → Configurações do site → Notificações.':subscribed?'Este aparelho recebe notificações.':'Este aparelho ainda não recebe notificações.'}</p>
    <div className="row wrap">{subscribed?<button className="secondary" disabled={busy} onClick={disable}><BellOff size={15}/>Desativar neste aparelho</button>:<button className="primary" disabled={busy||permission==='denied'||!publicKey} onClick={enable}><Bell size={15}/>Ativar notificações neste aparelho</button>}
     <button className="secondary" disabled={busy||!devices.length} onClick={test}><Send size={15}/>Enviar teste</button></div></div></div>}
  <div className="detail-label">APARELHOS INSCRITOS ({devices.length})</div>
  {devices.length?<ul className="revision-list">{devices.map(d=><li key={d.id}><div><Smartphone size={14}/><strong>{d.label||'Aparelho'}</strong><small>desde {new Date(d.created_at).toLocaleDateString('pt-BR')}{d.last_success_at?` · último aviso ${new Date(d.last_success_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}{d.failures?` · ${d.failures} falha(s)`:''}</small></div><button className="text-button" disabled={busy} onClick={()=>run(async()=>{await api('/push/devices/'+d.id,'DELETE');notify('Aparelho removido.');})}><Trash2 size={14}/>Remover</button></li>)}</ul>:<p className="hint">Nenhum aparelho inscrito.</p>}
 </div>;
}

export type NotificationItem={kind:'message'|'approval';id:string;text:string;at:string;conversation_id:string;title:string;agent_id:string;agent_name:string;color:string;shape:string;routine:string|null};
const ago=(d:string)=>{const s=Math.max(0,Math.round((Date.now()-new Date(d).getTime())/1000));return s<60?'agora':s<3600?`${Math.floor(s/60)} min`:s<86400?`${Math.floor(s/3600)} h`:new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
// Header bell: unread agent messages and pending approvals; opening one goes to its conversation.
export function NotificationBell({items,onOpen,onReadAll,onSettings}:{items:NotificationItem[];onOpen:(n:NotificationItem)=>void;onReadAll:()=>void;onSettings:()=>void}){
 const count=items.length;
 return <Dropdown.Root><Dropdown.Trigger asChild><button className="icon-btn bell" aria-label={count?`Notificações (${count} não lidas)`:'Notificações'} title="Notificações"><Bell size={19}/>{count>0&&<b className="bell-count">{count>9?'9+':count}</b>}</button></Dropdown.Trigger>
  <Dropdown.Portal><Dropdown.Content className="dropdown notification-list" align="end" sideOffset={6}>
   <div className="notification-head"><strong>Notificações</strong>{count>0&&<button className="text-button" onClick={onReadAll}><CheckCheck size={14}/>Marcar como lidas</button>}</div>
   {count?items.map(n=><Dropdown.Item key={n.kind+n.id} className="notification-item" onSelect={()=>onOpen(n)}><CellAvatar shape={n.shape} color={n.color} size={30}/><span><span className="notification-line"><strong>{n.agent_name}</strong>{n.kind==='approval'?<em className="warn"><ShieldAlert size={11}/>Aprovação</em>:n.routine?<em>Rotina · {n.routine}</em>:null}<small>{ago(n.at)}</small></span><span className="notification-text">{n.text||'Nova mensagem'}</span></span></Dropdown.Item>)
    :<p className="empty-state">Nada novo por aqui.</p>}
   <Dropdown.Separator/><Dropdown.Item onSelect={onSettings}><Settings size={15}/>Configurar notificações</Dropdown.Item>
  </Dropdown.Content></Dropdown.Portal></Dropdown.Root>;
}
// Short-lived cards for messages that arrive while you look at another conversation.
export function InAppAlerts({alerts,onOpen,onClose}:{alerts:NotificationItem[];onOpen:(n:NotificationItem)=>void;onClose:(id:string)=>void}){
 if(!alerts.length)return null;
 return <div className="inapp-alerts" role="status" aria-live="polite">{alerts.map(n=><div key={n.id} className="inapp-alert"><CellAvatar shape={n.shape} color={n.color} size={34}/><div><strong>{n.agent_name}{n.kind==='approval'?' precisa da sua aprovação':''}</strong><p>{n.text||'Nova mensagem'}</p><div className="row"><button className="primary" onClick={()=>onOpen(n)}>Abrir</button><button className="secondary" onClick={()=>onClose(n.id)}>Dispensar</button></div></div><button className="icon-btn" aria-label="Fechar aviso" onClick={()=>onClose(n.id)}><X size={15}/></button></div>)}</div>;
}
