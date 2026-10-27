import {useCallback,useEffect,useState} from 'react';
import {Bell,BellOff,Send,Trash2,Smartphone} from 'lucide-react';
import {api} from './api';
type Notice={notify:(m:string)=>void};
const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const keyBytes=(base64:string)=>{const pad='='.repeat((4-base64.length%4)%4),raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
function deviceLabel(){const ua=navigator.userAgent;const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Windows':/Mac OS/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux':'Aparelho';const app=matchMedia('(display-mode: standalone)').matches?'app instalado':/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'navegador';return `${os} · ${app}`;}
async function currentSubscription(){const reg=await navigator.serviceWorker.getRegistration();return reg?await reg.pushManager.getSubscription():null;}
// Called on logout: this device stops receiving notifications for the account.
export async function forgetThisDevice(){try{if(!supported())return;const s=await currentSubscription();if(!s)return;await api('/push/unsubscribe','POST',{endpoint:s.endpoint}).catch(()=>{});await s.unsubscribe();}catch{/* best effort */}}

export function NotificationsPanel({notify}:Notice){
 const [permission,setPermission]=useState<string>(supported()?Notification.permission:'unsupported'),[subscribed,setSubscribed]=useState(false),[devices,setDevices]=useState<any[]>([]),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const d=await api('/push');setDevices(d.devices);setPublicKey(d.publicKey);if(supported()){const s=await currentSubscription();setSubscribed(!!s&&d.devices.length>0);}}catch(e:any){notify(e.message);}},[notify]);
 useEffect(()=>{load();},[load]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();await load();}catch(e:any){notify(e.message||'Não foi possível concluir.');}finally{setBusy(false);}};
 const enable=()=>run(async()=>{
  const p=await Notification.requestPermission();setPermission(p);if(p!=='granted')throw new Error('Permissão de notificação negada. Libere nas configurações do navegador para este site.');
  const reg=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('O app ainda não terminou de instalar o service worker. Recarregue a página e tente de novo.')),8000))]);
  let s=await reg.pushManager.getSubscription();
  // A subscription made with another server key cannot be reused.
  if(s&&s.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(s.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==publicKey){await s.unsubscribe();s=null;}
  if(!s)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
  await api('/push/subscribe','POST',{...s.toJSON(),label:deviceLabel()});notify('Notificações ativadas neste aparelho.');});
 const disable=()=>run(async()=>{await forgetThisDevice();notify('Notificações desativadas neste aparelho.');});
 const test=()=>run(async()=>{const r=await api('/push/test','POST');notify(r.failed?`Teste enviado para ${r.sent} aparelho(s); ${r.failed} falharam.`:`Teste enviado para ${r.sent} aparelho(s).`);});
 const secure=window.isSecureContext;
 return <div className="stack notifications">
  <h3>Notificações</h3>
  <p className="hint">Receba um aviso no celular ou no computador quando um agente ou uma rotina enviar mensagem, ou quando uma ação precisar da sua aprovação. Se a conversa estiver aberta em algum aparelho, o aviso não é enviado.</p>
  {!supported()?<div className="setting-card"><BellOff size={20}/><p>Este navegador não suporta notificações push. No Android, use o Chrome; no iPhone, instale o Cell na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p></div>
  :!secure?<div className="setting-card"><BellOff size={20}/><p>Notificações exigem HTTPS confiável. Abra pelo domínio público (https://cell.tiagoberlanda.com.br) ou instale o certificado local.</p></div>
  :<div className="setting-card"><Bell size={20}/><div className="stack" style={{gap:10}}>
    <p>{permission==='denied'?'As notificações estão bloqueadas para este site. Libere em Configurações do navegador → Configurações do site → Notificações.':subscribed?'Este aparelho recebe notificações.':'Este aparelho ainda não recebe notificações.'}</p>
    <div className="row wrap">{subscribed?<button className="secondary" disabled={busy} onClick={disable}><BellOff size={15}/>Desativar neste aparelho</button>:<button className="primary" disabled={busy||permission==='denied'||!publicKey} onClick={enable}><Bell size={15}/>Ativar notificações neste aparelho</button>}
     <button className="secondary" disabled={busy||!devices.length} onClick={test}><Send size={15}/>Enviar teste</button></div></div></div>}
  <div className="detail-label">APARELHOS INSCRITOS ({devices.length})</div>
  {devices.length?<ul className="revision-list">{devices.map(d=><li key={d.id}><div><Smartphone size={14}/><strong>{d.label||'Aparelho'}</strong><small>desde {new Date(d.created_at).toLocaleDateString('pt-BR')}{d.last_success_at?` · último aviso ${new Date(d.last_success_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''}{d.failures?` · ${d.failures} falha(s)`:''}</small></div><button className="text-button" disabled={busy} onClick={()=>run(async()=>{await api('/push/devices/'+d.id,'DELETE');notify('Aparelho removido.');})}><Trash2 size={14}/>Remover</button></li>)}</ul>:<p className="hint">Nenhum aparelho inscrito.</p>}
 </div>;
}
