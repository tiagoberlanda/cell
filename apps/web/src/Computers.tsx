import {useCallback,useEffect,useState} from 'react';
import {Monitor,RefreshCw,Plus,Trash2,Terminal,Settings2,Square} from 'lucide-react';
import {api} from './api';
import {confirmDialog} from './dialogs';

export type ComputerStatus={key:string;id:string;name:string;kind:'local'|'ssh';shell:'powershell'|'bash';host?:string;port?:number;username?:string;fingerprint?:string;online:boolean;error?:string;lastSeen?:string|null;info?:any};
export type ComputersData={enabled:boolean;hostInstalled:boolean;computers:ComputerStatus[]};
type Notice={notify:(m:string)=>void};

// Live status of the computers, refreshed every minute (and on demand) while the app is open.
export function useComputers(active:boolean){
 const [data,setData]=useState<ComputersData|null>(null);
 const load=useCallback(()=>api('/computers').then(setData).catch(()=>{}),[]);
 useEffect(()=>{if(!active)return;load();const t=setInterval(load,60000);return()=>clearInterval(t);},[active,load]);
 return {data,load};
}

// Header indicator: green when at least one computer is connected, gray otherwise.
export function ComputersIndicator({data,onOpen}:{data:ComputersData|null;onOpen:()=>void}){
 if(!data)return null;
 const online=data.computers.filter(c=>c.online).length,total=data.computers.length;
 const label=!total?'Computadores: nenhum configurado':online?`Computadores: ${online} de ${total} conectado${online>1?'s':''}`:`Computadores: nenhum conectado (${total})`;
 return <button className={`icon-btn pc-indicator ${online?'online':'offline'}`} aria-label={label} title={label} onClick={onOpen}><Monitor size={18}/><span className="pc-dot" aria-hidden="true"/></button>;
}

const kindLabel=(c:ComputerStatus)=>c.kind==='local'?'Windows · Cell Host':c.shell==='bash'?'Linux · SSH':'Windows · SSH';
const since=(iso?:string|null)=>iso?new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'nunca';
function ComputerCard({c,onRemove}:{c:ComputerStatus;onRemove?:()=>void}){
 const i=c.info;
 return <div className={`computer-card ${c.online?'online':'offline'}`}>
  <div className="computer-head"><span className="computer-icon">{c.kind==='local'?<Monitor size={18}/>:<Terminal size={18}/>}<i aria-hidden="true"/></span>
   <div className="computer-title"><strong>{c.name}</strong><small>{kindLabel(c)}{c.host?` · ${c.username}@${c.host}${c.port&&c.port!==22?':'+c.port:''}`:''}</small></div>
   <span className={`computer-state ${c.online?'on':'off'}`}>{c.online?'Conectado':'Desconectado'}</span>
   {onRemove&&<button className="icon-btn" aria-label={`Remover ${c.name}`} onClick={onRemove}><Trash2 size={15}/></button>}</div>
  {c.online&&i?<p className="computer-info">{i.user}@{i.computer} · {i.os} · ligado há {i.uptimeHours} h · {i.memory?.freeGb} de {i.memory?.totalGb} GB livres{i.cpus?` · ${i.cpus} núcleos`:''}</p>
   :<p className="computer-info error">{c.error||'Sem resposta.'}<small className="computer-seen">Visto pela última vez: {since(c.lastSeen)}.</small></p>}
 </div>;
}

// Background jobs with live output while running (polled every 3 s while any is running) and Cancel.
const jobStates:Record<string,string>={running:'Rodando',done:'Concluída',failed:'Terminou com erro',cancelled:'Cancelada',lost:'Perdida'};
export function JobsList({notify}:Notice){
 const [jobs,setJobs]=useState<any[]|null>(null);
 const load=useCallback(()=>api('/computer-jobs').then(setJobs).catch(()=>{}),[]);
 useEffect(()=>{load();},[load]);
 const running=!!jobs?.some(j=>j.status==='running');
 useEffect(()=>{if(!running)return;const t=setInterval(load,3000);return()=>clearInterval(t);},[running,load]);
 const cancel=async(j:any)=>{if(!await confirmDialog('Cancelar a tarefa?',j.reason||j.command.slice(0,200),{confirm:'Cancelar tarefa',danger:true}))return;try{await api('/computer-jobs/'+j.id+'/cancel','POST');notify('Cancelamento enviado.');await load();}catch(e:any){notify(e.message);}};
 if(!jobs?.length)return null;
 return <div className="stack jobs-list"><div className="detail-label">TAREFAS EM SEGUNDO PLANO</div>
  {jobs.map(j=><div className={`job-card ${j.status}`} key={j.id}>
   <div className="job-head"><div><strong>{j.reason||j.command.slice(0,80)}</strong><small>{j.computer_name}{j.agent_name?` · ${j.agent_name}`:''} · {new Date(j.started_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div>
    <span className={`job-state ${j.status}`}>{j.status==='running'&&j.finishing?'Finalizando…':jobStates[j.status]||j.status}{j.status==='failed'&&j.exit_code!=null?` (${j.exit_code})`:''}</span>
    {j.status==='running'&&<button className="icon-btn" aria-label="Cancelar tarefa" title="Cancelar" onClick={()=>cancel(j)}><Square size={13} fill="currentColor"/></button>}</div>
   {j.unreachable&&<small className="app-error">{j.unreachable}</small>}
   {j.output?<pre className="job-output">{String(j.output).slice(-2500)}</pre>:<small className="hint">{j.status==='running'?'Aguardando saída…':'Sem saída.'}</small>}
  </div>)}
 </div>;
}

// Modal content: every computer with its live status.
export function ComputersPanel({data,reload,onManage,notify}:{data:ComputersData|null;reload:()=>Promise<any>;onManage:()=>void}&Notice){
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{setBusy(true);try{await reload();}finally{setBusy(false);}};
 if(!data)return <p className="hint">Verificando os computadores…</p>;
 return <div className="stack computers-panel">
  {!data.enabled&&<p className="app-error">Os comandos estão desativados em Configurações → Computador. Os agentes não usam nenhum computador.</p>}
  {data.computers.length?data.computers.map(c=><ComputerCard key={c.key} c={c}/>)
   :<p className="empty-state">Nenhum computador configurado.<br/>Instale o Cell Host neste PC ou adicione um computador por SSH.</p>}
  <JobsList notify={notify}/>
  <div className="row wrap"><button className="secondary" disabled={busy} onClick={refresh}><RefreshCw size={15}/>{busy?'Verificando…':'Verificar agora'}</button><button className="secondary" onClick={onManage}><Settings2 size={15}/>Gerenciar computadores</button></div>
 </div>;
}

// Settings: SSH computers with add (test, confirm the fingerprint, save) and remove.
export function SshComputers({notify,onChanged}:Notice&{onChanged?:()=>void}){
 const {data,load}=useComputers(true);
 const empty={name:'',host:'',port:22,username:'',password:'',privateKey:'',passphrase:'',shell:'bash' as 'bash'|'powershell',auth:'password' as 'password'|'key'};
 const [form,setForm]=useState<typeof empty|null>(null),[busy,setBusy]=useState(false);
 const payload=(f:typeof empty,fingerprint?:string)=>({name:f.name,host:f.host,port:Number(f.port)||22,username:f.username,shell:f.shell,...(f.auth==='password'?{password:f.password}:{privateKey:f.privateKey,...(f.passphrase?{passphrase:f.passphrase}:{})}),...(fingerprint?{fingerprint}:{})});
 const save=async()=>{if(!form)return;setBusy(true);try{
   const test=await api('/computers/test','POST',payload(form));
   if(!await confirmDialog('Confirmar o servidor',`Conectado a ${test.info.computer} (${test.info.os}). Impressão digital da chave do servidor: ${test.fingerprint}. Confira se é a do seu servidor (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub). O Cell vai recusar conexões se ela mudar.`,{confirm:'Confirmar e salvar'}))return;
   await api('/computers','POST',payload(form,test.fingerprint));notify(`${form.name} adicionado.`);setForm(null);await load();onChanged?.();
  }catch(e:any){notify(e.message);}finally{setBusy(false);}};
 const remove=async(c:ComputerStatus)=>{if(!await confirmDialog(`Remover ${c.name}?`,'Os agentes deixam de usar este computador. A senha ou a chave salva é apagada.',{confirm:'Remover',danger:true}))return;try{await api('/computers/'+c.id,'DELETE');notify(`${c.name} removido.`);await load();onChanged?.();}catch(e:any){notify(e.message);}};
 const set=(k:string,v:any)=>setForm(f=>f&&({...f,[k]:v}));
 return <div className="stack ssh-computers"><h3>Computadores conectados</h3>
  <p className="hint">Além deste computador, os agentes podem usar outras máquinas por SSH: Linux (bash) ou Windows com OpenSSH (PowerShell). Cada comando continua pedindo sua aprovação e mostra em qual computador vai rodar.</p>
  {data?data.computers.map(c=><ComputerCard key={c.key} c={c} onRemove={c.kind==='ssh'?()=>remove(c):undefined}/>):<p className="hint">Verificando…</p>}
  {!form?<button className="secondary full" onClick={()=>setForm(empty)}><Plus size={16}/>Adicionar computador por SSH</button>
  :<div className="setting-card ssh-form stack">
   <label>Nome<input value={form.name} placeholder="Ex.: Servidor de casa" onChange={e=>set('name',e.target.value)}/></label>
   <div className="form-grid"><label>Endereço<input value={form.host} placeholder="192.168.0.50 ou servidor.local" onChange={e=>set('host',e.target.value.trim())}/></label><label>Porta<input type="number" min={1} max={65535} value={form.port} onChange={e=>set('port',e.target.value)}/></label></div>
   <div className="form-grid"><label>Usuário<input value={form.username} autoComplete="off" onChange={e=>set('username',e.target.value.trim())}/></label><label>Sistema<select value={form.shell} onChange={e=>set('shell',e.target.value)}><option value="bash">Linux (bash)</option><option value="powershell">Windows (PowerShell)</option></select></label></div>
   <label>Autenticação<select value={form.auth} onChange={e=>set('auth',e.target.value)}><option value="password">Senha</option><option value="key">Chave privada</option></select></label>
   {form.auth==='password'?<label>Senha<input type="password" autoComplete="new-password" value={form.password} onChange={e=>set('password',e.target.value)}/></label>
    :<><label>Chave privada (OpenSSH)<textarea rows={5} spellCheck={false} value={form.privateKey} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" onChange={e=>set('privateKey',e.target.value)}/></label><label>Senha da chave (se tiver)<input type="password" autoComplete="new-password" value={form.passphrase} onChange={e=>set('passphrase',e.target.value)}/></label></>}
   <p className="hint">A senha ou a chave fica guardada cifrada. Prefira um usuário sem permissão de administrador e uma chave criada só para o Cell.</p>
   <div className="form-footer"><button className="text-button" onClick={()=>setForm(null)}>Cancelar</button><button className="primary" disabled={busy||!form.name||!form.host||!form.username||!(form.auth==='password'?form.password:form.privateKey)} onClick={save}>{busy?'Conectando…':'Testar e adicionar'}</button></div>
  </div>}
 </div>;
}
