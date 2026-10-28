import {useCallback,useEffect,useState} from 'react';
import {Monitor,RefreshCw,Plus,Trash2,Terminal,Settings2,Square,Power,Play,AlertTriangle,Network,ShieldCheck} from 'lucide-react';
import {api} from './api';
import {confirmDialog,promptDialog,alertDialog} from './dialogs';

export type ComputerStatus={key:string;id:string;name:string;kind:'local'|'ssh';shell:'powershell'|'bash';host?:string;port?:number;username?:string;fingerprint?:string;online:boolean;error?:string;lastSeen?:string|null;info?:any;mac?:string|null;broadcast?:string|null};
export type ComputersData={enabled:boolean;hostInstalled:boolean;computers:ComputerStatus[];alerts?:any[]};
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
 const alerts=data.alerts?.length||0,full=alerts?`${label} · ${alerts} alerta${alerts>1?'s':''}`:label;
 return <button className={`icon-btn pc-indicator ${online?'online':'offline'}${alerts?' alert':''}`} aria-label={full} title={full} onClick={onOpen}><Monitor size={18}/><span className="pc-dot" aria-hidden="true"/></button>;
}

const kindLabel=(c:ComputerStatus)=>c.kind==='local'?'Windows · Cell Host':c.shell==='bash'?'Linux · SSH':'Windows · SSH';
const since=(iso?:string|null)=>iso?new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'nunca';
const diskLine=(i:any)=>(i?.disks||[]).map((d:any)=>`${d.drive} ${d.totalGb?Math.round(100*(1-d.freeGb/d.totalGb)):0}%`).join(' · ');
function ComputerCard({c,onRemove,onWake,onMac}:{c:ComputerStatus;onRemove?:()=>void;onWake?:()=>void;onMac?:()=>void}){
 const i=c.info;
 return <div className={`computer-card ${c.online?'online':'offline'}`}>
  <div className="computer-head"><span className="computer-icon">{c.kind==='local'?<Monitor size={18}/>:<Terminal size={18}/>}<i aria-hidden="true"/></span>
   <div className="computer-title"><strong>{c.kind==='local'&&i?.computer||c.name}</strong><small>{kindLabel(c)}{c.host?` · ${c.username}@${c.host}${c.port&&c.port!==22?':'+c.port:''}`:''}</small></div>
   <span className={`computer-state ${c.online?'on':'off'}`}>{c.online?'Conectado':'Desconectado'}</span>
   {onMac&&<button className="icon-btn" aria-label={`Ligar à distância: ${c.name}`} title="Endereço MAC para ligar à distância" onClick={onMac}><Network size={15}/></button>}
   {onRemove&&<button className="icon-btn" aria-label={`Remover ${c.name}`} onClick={onRemove}><Trash2 size={15}/></button>}</div>
  {c.online&&i?<p className="computer-info">{i.user}@{i.computer} · {i.os} · ligado há {i.uptimeHours} h · {i.memory?.freeGb} de {i.memory?.totalGb} GB livres{i.cpus?` · ${i.cpus} núcleos`:''}{typeof i.cpuPct==='number'?` · CPU ${i.cpuPct}%`:''}{i.disks?.length?<><br/>Discos usados: {diskLine(i)}</>:null}</p>
   :<><p className="computer-info error">{c.error||'Sem resposta.'}<small className="computer-seen">Visto pela última vez: {since(c.lastSeen)}.</small></p>{c.mac&&onWake&&<button className="secondary" onClick={onWake}><Power size={15}/>Ligar</button>}</>}
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
  {!!data.alerts?.length&&<div className="stack alerts-list">{data.alerts.map(a=><div className="alert-card" key={a.id}><AlertTriangle size={16}/><div><strong>{a.kind==='offline'?`${a.computer_name} está fora do ar`:a.kind==='cpu'?`CPU alta em ${a.computer_name}`:`Disco quase cheio em ${a.computer_name}`}</strong><small>{a.detail} · desde {since(a.since)}</small></div></div>)}</div>}
  {data.computers.length?data.computers.map(c=><ComputerCard key={c.key} c={c} onWake={()=>wakeComputer(c,notify,reload)}/>)
   :<p className="empty-state">Nenhum computador configurado.<br/>Instale o Cell Host neste PC ou adicione um computador por SSH.</p>}
  <RecipesQuick notify={notify} enabled={data.enabled}/>
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
 const editMac=async(c:ComputerStatus)=>{const mac=await promptDialog(`Ligar ${c.name} à distância`,{value:c.mac||'',placeholder:'Endereço MAC, ex.: AA:BB:CC:DD:EE:FF (vazio desativa)',confirm:'Salvar',required:''});if(mac===null)return;
  try{await api('/computers/'+c.id,'PATCH',{mac:mac.trim()});notify(mac.trim()?`${c.name} pode ser ligado à distância. Ative o Wake-on-LAN na BIOS e na placa de rede dele.`:'Ligar à distância desativado.');await load();}catch(e:any){notify(e.message);}};
 return <div className="stack ssh-computers"><h3>Computadores conectados</h3>
  <p className="hint">Além do computador com o Cell Host, os agentes podem usar outras máquinas por SSH: Linux (bash) ou Windows com OpenSSH (PowerShell). Cada comando continua pedindo sua aprovação e mostra em qual computador vai rodar.</p>
  {data?data.computers.map(c=><ComputerCard key={c.key} c={c} onRemove={c.kind==='ssh'?()=>remove(c):undefined} onMac={c.kind==='ssh'?()=>editMac(c):undefined} onWake={()=>wakeComputer(c,notify,load)}/>):<p className="hint">Verificando…</p>}
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

// Wake-on-LAN from the app.
async function wakeComputer(c:ComputerStatus,notify:(m:string)=>void,reload:()=>Promise<any>){
 try{const r=await api('/computers/'+c.id+'/wake','POST');notify(`Sinal para ligar ${c.name} enviado (pelo ${r.via}). Ele costuma responder em 1 a 2 minutos.`);setTimeout(()=>reload(),90000);}catch(e:any){notify(e.message);}
}
// Recipes in the computers panel: one tap to run (the owner's own action, after a confirmation).
export function RecipesQuick({notify,enabled}:Notice&{enabled:boolean}){
 const [recipes,setRecipes]=useState<any[]|null>(null),[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{api('/recipes').then(setRecipes).catch(()=>{});},[]);
 if(!recipes?.length)return null;
 const run=async(r:any)=>{if(!await confirmDialog(`Rodar “${r.name}”?`,`${r.computer_key}: ${r.command.slice(0,300)}`,{confirm:'Rodar'}))return;setBusy(r.id);
  try{const out=await api('/recipes/'+r.id+'/run','POST');if(out.background)notify(`“${r.name}” rodando em segundo plano. Acompanhe abaixo.`);else await alertDialog(out.ok?`“${r.name}” concluída`:`“${r.name}” terminou com erro (${out.exitCode})`,String(out.stdout||out.stderr||'Sem saída.').slice(-1500),out.ok?'success':'error');}
  catch(e:any){notify(e.message);}finally{setBusy(null);}};
 return <div className="stack recipes-quick"><div className="detail-label">RECEITAS</div><div className="recipe-chips">{recipes.map(r=><button key={r.id} className="secondary" disabled={!enabled||busy===r.id} onClick={()=>run(r)} title={r.command}><Play size={13}/>{busy===r.id?'Rodando…':r.name}{r.trusted&&<ShieldCheck size={13} aria-label="Liberada para os agentes"/>}</button>)}</div></div>;
}
// Settings: recipes (trust, delete) and saving a past command as a recipe.
export function RecipesManager({notify}:Notice){
 const [recipes,setRecipes]=useState<any[]>([]);
 const load=useCallback(()=>api('/recipes').then(setRecipes).catch((e:any)=>notify(e.message)),[notify]);
 useEffect(()=>{load();const on=()=>load();window.addEventListener('cell-recipes',on);return()=>window.removeEventListener('cell-recipes',on);},[load]);
 const toggle=async(r:any)=>{if(!r.trusted&&!await confirmDialog('Liberar sem aprovação?',`Os agentes vão poder rodar “${r.name}” sem pedir sua aprovação: ${r.command.slice(0,300)}`,{confirm:'Liberar'}))return;try{await api('/recipes/'+r.id,'PATCH',{trusted:!r.trusted});await load();}catch(e:any){notify(e.message);}};
 const remove=async(r:any)=>{if(!await confirmDialog(`Excluir a receita “${r.name}”?`,undefined,{confirm:'Excluir',danger:true}))return;try{await api('/recipes/'+r.id,'DELETE');await load();}catch(e:any){notify(e.message);}};
 return <div className="stack recipes-manager"><h3>Receitas de comandos</h3>
  <p className="hint">Comandos salvos para rodar com um toque (no ícone de computadores do topo) ou pelos agentes. Salve um comando a partir dos últimos comandos abaixo. Por padrão os agentes pedem aprovação para usar uma receita; marque “Liberada” só para comandos que você confia rodar a qualquer momento.</p>
  {recipes.length?recipes.map(r=><div className="setting-card grant-card" key={r.id}><div><strong>{r.name}</strong><small><code>{r.computer_key}</code> · {r.command.slice(0,160)}{r.background?' · segundo plano':''}</small></div>
   <label className="check-label recipe-trust"><input type="checkbox" checked={r.trusted} onChange={()=>toggle(r)}/>Liberada</label>
   <button className="icon-btn" aria-label={`Excluir a receita ${r.name}`} onClick={()=>remove(r)}><Trash2 size={15}/></button></div>)
  :<p className="empty-state">Nenhuma receita ainda.</p>}
 </div>;
}
export async function saveRecipeFrom(cmd:{command:string;computer?:string|null;cwd?:string|null;background?:boolean|null},notify:(m:string)=>void){
 const name=await promptDialog('Nome da receita',{placeholder:'Ex.: Espaço em disco',confirm:'Salvar receita',required:'Informe um nome.'});if(!name)return;
 try{await api('/recipes','POST',{name,computer_key:cmd.computer||'este-pc',command:cmd.command,cwd:cmd.cwd||null,background:!!cmd.background});notify(`Receita “${name}” salva.`);window.dispatchEvent(new Event('cell-recipes'));}catch(e:any){notify(e.message);}
}
// Settings: alert thresholds.
export function AlertsSettings({notify}:Notice){
 const [form,setForm]=useState<any>(null);
 useEffect(()=>{api('/computer-alerts/settings').then(setForm).catch((e:any)=>notify(e.message));},[notify]);
 if(!form)return null;
 const save=async()=>{try{setForm(await api('/computer-alerts/settings','PUT',form));notify('Alertas salvos.');}catch(e:any){notify(e.message);}};
 const num=(k:string,label:string,min:number,max:number,suffix:string)=><label>{label}<span className="inline-input"><input type="number" min={min} max={max} value={form[k]} onChange={e=>setForm({...form,[k]:Number(e.target.value)})}/>{suffix}</span></label>;
 return <div className="stack alerts-settings"><h3>Alertas dos computadores</h3>
  <label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Avisar no celular quando algo precisar de atenção (verificado a cada minuto)</label>
  <div className="form-grid">{num('diskPct','Disco quase cheio a partir de',50,99,'% usado')}{num('offlineMinutes','Fora do ar por mais de',1,1440,'min')}</div>
  <div className="form-grid">{num('cpuPct','CPU alta a partir de',50,100,'%')}{num('cpuMinutes','por mais de',1,240,'min')}</div>
  <div className="form-footer"><button className="primary" onClick={save}>Salvar alertas</button></div>
 </div>;
}
