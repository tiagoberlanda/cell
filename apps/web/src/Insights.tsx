import {useCallback,useEffect,useState} from 'react';
import {ChevronLeft,RefreshCw,Square,Check,X,FileText,Paperclip,AlertTriangle,Activity,Database,Cpu,Zap,Plug,Shield,ArrowUpRight,RotateCcw} from 'lucide-react';
import type {Agent} from '../../../packages/shared/src/index';
import {CellAvatar} from './CellAvatar';
import {api} from './api';
import {confirmDialog} from './dialogs';
type Notice={notify:(m:string)=>void};
export const runStateNames:Record<string,string>={queued:'Na fila',running:'Trabalhando',waiting_approval:'Aguardando aprovação',waiting_agent:'Aguardando especialista',failed:'Falhou',completed:'Concluído',cancelled:'Cancelado'};
const callStatus:Record<string,string>={done:'Concluída',denied:'Negada',error:'Erro',uncertain:'Resultado incerto',waiting_child:'Delegada',executing:'Executando',pending:'Pendente'};
const docStatus:Record<string,string>={included:'Incluído',truncated:'Incluído em parte',omitted:'Omitido',unavailable:'Indisponível'};
const filters:[string,string][]=[['all','Todas'],['active','Em andamento'],['waiting_approval','Aprovações'],['queued','Na fila'],['failed','Falhas'],['completed','Concluídas']];
const fmt=(d?:string|null)=>d?new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
export function duration(run:any){const start=run.started_at||run.created_at,end=run.finished_at||(['completed','failed','cancelled'].includes(run.state)?run.updated_at:null);if(!start)return '—';const s=Math.max(0,Math.round(((end?new Date(end):new Date()).getTime()-new Date(start).getTime())/1000));return s<60?`${s} s`:s<3600?`${Math.floor(s/60)} min ${s%60} s`:`${Math.floor(s/3600)} h ${Math.floor(s%3600/60)} min`;}
const tokens=(u:any)=>u&&(u.prompt_tokens||u.completion_tokens)?`${(u.prompt_tokens||0).toLocaleString('pt-BR')} entrada · ${(u.completion_tokens||0).toLocaleString('pt-BR')} saída`:'—';
const bytes=(n:number)=>n>1e9?`${(n/1e9).toFixed(1)} GB`:n>1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1e3)} KB`;
function StateBadge({state,stalled}:{state:string;stalled?:boolean}){return <span className={`run-state ${stalled?'stalled':state}`}>{stalled?'Parada':runStateNames[state]||state}</span>;}

// Activity center: every run across agents, with filters, details and the same approve/cancel actions as the chat.
export function ActivityCenter({agents,pulse,notify,onOpenConversation}:{agents:Agent[];pulse:number;onOpenConversation:(agentId:string,conversationId:string)=>void}&Notice){
 const [state,setState]=useState('all'),[agentId,setAgentId]=useState(''),[items,setItems]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[summary,setSummary]=useState<any>(null),[openId,setOpenId]=useState<string|null>(null),[loading,setLoading]=useState(false);
 const load=useCallback(async(more?:string|null)=>{setLoading(true);try{const qs=new URLSearchParams({state,limit:'25',...(agentId?{agentId}:{}),...(more?{before:more}:{})});const [page,s]=await Promise.all([api('/activity?'+qs),more?Promise.resolve(null):api('/activity/summary')]);setItems(prev=>more?[...prev,...page.items]:page.items);setNext(page.next);if(s)setSummary(s);}catch(e:any){notify(e.message);}finally{setLoading(false);}},[state,agentId,notify]);
 useEffect(()=>{load();},[load,pulse]);
 if(openId)return <RunDetail id={openId} pulse={pulse} notify={notify} onBack={()=>{setOpenId(null);load();}} onOpen={setOpenId} onOpenConversation={onOpenConversation}/>;
 const chips:[string,string,number|undefined][]=[['running','Trabalhando',summary?.running],['waiting_approval','Aprovações',summary?.approvals],['queued','Na fila',summary?.queued],['failed','Falhas em 24 h',summary?.failed24h]];
 return <div className="activity">
  <div className="activity-summary">{chips.map(([k,label,n])=><button key={k} className={`summary-chip ${k} ${state===k?'active':''}`} onClick={()=>setState(state===k?'all':k)}><strong>{n??'–'}</strong><span>{label}</span></button>)}{summary?.stalled>0&&<span className="summary-chip stalled"><strong>{summary.stalled}</strong><span>Paradas</span></span>}</div>
  <div className="activity-filters"><div className="segmented" role="tablist" aria-label="Filtrar por estado">{filters.map(([k,label])=><button key={k} role="tab" aria-selected={state===k} className={state===k?'active':''} onClick={()=>setState(k)}>{label}</button>)}</div>
   <select aria-label="Filtrar por agente" value={agentId} onChange={e=>setAgentId(e.target.value)}><option value="">Todos os agentes</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
   <button className="icon-btn" aria-label="Atualizar" title="Atualizar" onClick={()=>load()}><RefreshCw size={17}/></button></div>
  <div className="activity-list">{items.map(r=><button key={r.id} className="activity-item" onClick={()=>setOpenId(r.id)}>
   <CellAvatar shape={r.shape} color={r.color} state={r.stalled?'failed':r.state} size={34}/>
   <span className="activity-main"><span className="activity-line"><strong>{r.agent_name}</strong><StateBadge state={r.state} stalled={r.stalled}/>{r.mode==='plan'&&<span className="mode-badge">Plano</span>}{r.parent_id&&<span className="mode-badge">Delegada</span>}{r.pending_approvals>0&&<span className="mode-badge warn">{r.pending_approvals} aprovação</span>}</span>
    <small>{r.conversation_title} · {fmt(r.created_at)} · {duration(r)}{r.tool_count?` · ${r.tool_count} ferramenta(s)`:''}</small>
    {r.state==='failed'&&r.error?<small className="activity-error">{r.error}</small>:r.preview?<small className="activity-preview">{r.preview}</small>:null}</span></button>)}
   {!items.length&&!loading&&<p className="empty-state">Nenhuma execução com estes filtros.</p>}
   {next&&<button className="secondary full" disabled={loading} onClick={()=>load(next)}>{loading?'Carregando…':'Carregar mais'}</button>}</div>
 </div>;
}
function RunDetail({id,pulse,notify,onBack,onOpen,onOpenConversation}:{id:string;pulse:number;onBack:()=>void;onOpen:(id:string)=>void;onOpenConversation:(agentId:string,conversationId:string)=>void}&Notice){
 const [d,setD]=useState<any>(null),[busy,setBusy]=useState(false);
 const load=useCallback(()=>api('/runs/'+id).then(setD).catch((e:any)=>notify(e.message)),[id,notify]);
 useEffect(()=>{load();},[load,pulse]);
 const act=async(fn:()=>Promise<any>)=>{setBusy(true);try{await fn();await load();}catch(e:any){notify(e.message);}finally{setBusy(false);}};
 if(!d)return <div className="activity"><button className="text-button" onClick={onBack}><ChevronLeft size={16}/>Voltar</button><p className="hint">Carregando…</p></div>;
 const r=d.run,activeRun=['queued','running','waiting_approval','waiting_agent'].includes(r.state);
 return <div className="activity run-detail">
  <button className="text-button" onClick={onBack}><ChevronLeft size={16}/>Voltar à atividade</button>
  <div className="run-head"><CellAvatar shape={r.shape} color={r.color} state={r.stalled?'failed':r.state} size={48}/><div><h3>{r.agent_name}</h3><div className="activity-line"><StateBadge state={r.state} stalled={r.stalled}/>{r.mode==='plan'&&<span className="mode-badge">Modo plano</span>}{r.parent_id&&<span className="mode-badge">Delegada</span>}</div></div></div>
  <div className="run-actions"><button className="secondary" onClick={()=>onOpenConversation(r.agent_id,r.conversation_id)}><ArrowUpRight size={15}/>Abrir conversa</button>{activeRun&&<button className="danger" disabled={busy} onClick={async()=>{if(await confirmDialog('Cancelar esta execução?','Delegações em andamento também serão canceladas.',{confirm:'Cancelar execução',danger:true}))act(()=>api('/runs/'+r.id+'/cancel','POST'));}}><Square size={14}/>Cancelar</button>}</div>
  {r.stalled&&<div className="error-card"><AlertTriangle size={15}/> Sem sinal da execução há mais de 2 minutos (último: {fmt(r.heartbeat_at||r.started_at)}). Ela pode ter travado; cancele e envie de novo se não avançar.</div>}
  {r.error&&<div className="error-card">{r.error}</div>}
  <div className="metric-grid">{[['Modelo',r.model],['Duração',duration(r)],['Tokens',tokens(r.usage)],['Etapas',String(r.steps)],['Criada',fmt(r.created_at)],['Iniciada',fmt(r.started_at)],['Finalizada',fmt(r.finished_at)],['Conversa',r.conversation_title]].map(([k,v])=><div className="detail-box" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
  {r.input&&<><div className="detail-label">PEDIDO</div><p className="run-input">{r.input}</p></>}
  {d.tree.length>1&&<><div className="detail-label">DELEGAÇÕES</div><div className="run-tree">{d.tree.map((n:any)=><button key={n.id} className={`tree-node ${n.id===r.id?'current':''}`} style={{paddingLeft:12+n.level*18}} disabled={n.id===r.id} onClick={()=>onOpen(n.id)}><CellAvatar shape={n.shape} color={n.color} state={n.state} size={22}/><span>{n.agent_name}</span><StateBadge state={n.state}/></button>)}</div></>}
  <div className="detail-label">FERRAMENTAS ({d.calls.length})</div>
  {d.calls.length?<div className="run-calls">{d.calls.map((c:any)=><details key={c.id} className="run-call"><summary><strong>{c.tool}</strong>{c.external_write&&<span className="mode-badge warn">Escrita externa</span>}<span className={`call-status ${c.status}`}>{callStatus[c.status]||c.status}</span></summary>
   {c.target&&<small>{c.target}</small>}<pre>{JSON.stringify(c.args,null,2)}</pre>{c.result&&<pre className="call-result">{c.result}</pre>}
   {c.approval_status==='pending'&&<div className="row"><button className="primary" disabled={busy} onClick={()=>act(()=>api('/approvals/'+c.approval_id,'POST',{decision:'approved'}))}><Check size={15}/>Aprovar</button><button className="secondary" disabled={busy} onClick={()=>act(()=>api('/approvals/'+c.approval_id,'POST',{decision:'denied'}))}><X size={15}/>Negar</button></div>}</details>)}</div>:<p className="hint">Nenhuma ferramenta usada.</p>}
  <div className="detail-label">DOCUMENTOS USADOS ({r.documents?.length||0})</div>
  {r.documents?.length?<ul className="doc-list">{r.documents.map((doc:any,i:number)=><li key={doc.id||i}><FileText size={14}/><span>{doc.name||doc.id}</span><span className={`doc-status ${doc.status}`}>{docStatus[doc.status]||doc.status}</span>{doc.reason&&<small>{doc.reason}</small>}</li>)}</ul>:<p className="hint">Nenhum anexo entrou no contexto.</p>}
  {d.files.length>0&&<><div className="detail-label">ARQUIVOS</div><div className="attachment-list">{d.files.map((f:any)=><a key={f.id} href={'/api/files/'+f.id}><Paperclip size={14}/>{f.name}</a>)}</div></>}
 </div>;
}

// Health of every moving part, without secrets: worker, database, queue, runs, 9router, MCP and proxy trust.
export function DiagnosticsPanel({notify}:Notice){
 const [d,setD]=useState<any>(null),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{setBusy(true);try{setD(await api('/diagnostics'));}catch(e:any){notify(e.message);}finally{setBusy(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 if(!d)return <p className="hint">Verificando…</p>;
 const card=(title:string,Icon:any,c:any,body:any)=><div className={`diag-card ${c.ok?'ok':'bad'}`}><div className="diag-head"><Icon size={17}/><strong>{title}</strong><span className={`diag-led ${c.ok?'ok':'bad'}`}>{c.ok?'OK':'Falha'}</span></div>{c.ok?body:<p className="diag-error">{c.error}</p>}</div>;
 return <div className="stack diagnostics">
  <div className="row wrap"><h3 style={{margin:0}}>Diagnóstico</h3><span className="hint">Cell v{d.version} · verificado {fmt(d.checkedAt)}</span><button className="secondary" disabled={busy} onClick={load}><RefreshCw size={15}/>{busy?'Verificando…':'Verificar de novo'}</button></div>
  <div className="diag-grid">
   {card('Worker',Cpu,d.worker,<p>Último sinal há {d.worker.ageSeconds} s</p>)}
   {card('Banco de dados',Database,d.database,<p>PostgreSQL {d.database.version} · {bytes(d.database.bytes)} · {d.database.latencyMs} ms<br/>{d.database.migrations} migrações (última: {d.database.lastMigration})</p>)}
   {card('Fila de execução',Activity,d.queue,<p>{Object.entries(d.queue.jobs||{}).map(([k,v])=>`${k}: ${v}`).join(' · ')||'Sem tarefas na fila'}</p>)}
   {card('Execuções',Activity,{ok:d.runs.ok&&!d.runs.stalled?.length,error:d.runs.error||`${d.runs.stalled?.length} execução(ões) sem sinal há mais de 2 min: ${d.runs.stalled?.map((s:any)=>s.agent_name).join(', ')}`},<p>{Object.entries(d.runs.byState||{}).map(([k,v])=>`${runStateNames[k]||k}: ${v}`).join(' · ')}</p>)}
   {card('9router',Zap,d.router,<p>{d.router.origin} · {d.router.models} modelos · {d.router.latencyMs} ms<br/>Token {d.router.hasToken?'configurado':'ausente'} · padrão: {d.router.defaultModel||'nenhum'}</p>)}
   {card('Conexões MCP',Plug,d.mcp,<div>{d.mcp.connections?.length?d.mcp.connections.map((c:any)=><p key={c.id}><strong>{c.name}</strong> · {c.url} · {c.status==='connected'?`${c.tools} ferramentas`:c.status}</p>):<p>Nenhuma conexão.</p>}</div>)}
   {card('Proxy e IP real',Shield,{ok:true},<p>{d.proxy.mode==='secret'?'CF-Connecting-IP aceito só com o segredo do túnel (recomendado).':d.proxy.mode==='proxies'?`CF-Connecting-IP aceito só de: ${d.proxy.proxies.join(', ')}.`:'CF-Connecting-IP aceito de qualquer rede privada. Defina CELL_PROXY_SECRET (veja o README) para que só o túnel informe o IP real.'}</p>)}
  </div>
  <p className="hint">Backups: rode <code>.\scripts\backup.ps1</code> e depois <code>npm run backup:verify -- backups\&lt;pasta&gt;</code>, que restaura o backup num banco temporário isolado e confere o conteúdo.</p>
 </div>;
}

// Agent memory and conversation summary, editable, with the revision history and where each version came from.
export function MemoryEditor({agent,conversationId,notify,onSaved}:{agent:Agent;conversationId:string|null;onSaved:()=>void}&Notice){
 const [tab,setTab]=useState<'memory'|'summary'>('memory'),[data,setData]=useState<any>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false);
 const url=tab==='memory'?`/agents/${agent.id}/memory`:`/conversations/${conversationId}/summary`;
 useEffect(()=>{if(tab==='summary'&&!conversationId){setData({revisions:[]});setText('');return;}setData(null);api(url).then(r=>{setData(r);setText(tab==='memory'?r.memory:r.summary||'');}).catch((e:any)=>notify(e.message));},[url,tab,conversationId,notify]);
 const save=async()=>{setBusy(true);try{await api(url,'PUT',tab==='memory'?{memory:text}:{summary:text});const r=await api(url);setData(r);notify(tab==='memory'?'Memória salva.':'Resumo salvo.');onSaved();}catch(e:any){notify(e.message);}finally{setBusy(false);}};
 return <div className="stack memory-editor">
  <div className="tabs">{([['memory','Memória do agente'],['summary','Resumo da conversa']] as const).map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
  <p className="hint">{tab==='memory'?'Preferências e fatos que este agente deve lembrar em todas as conversas.':'Resumo usado para manter o contexto desta conversa quando ela fica longa. É atualizado automaticamente, preservando as decisões anteriores.'}</p>
  {tab==='summary'&&!conversationId?<p className="empty-state">Abra uma conversa para ver o resumo.</p>:<>
   <textarea rows={8} value={text} disabled={!data} onChange={e=>setText(e.target.value)} placeholder={tab==='memory'?'Ex.: Prefere respostas em tópicos.':'Ainda não há resumo para esta conversa.'}/>
   <div className="form-footer"><button className="primary" disabled={busy||!data} onClick={save}>{busy?'Salvando…':'Salvar'}</button></div>
   <div className="detail-label">HISTÓRICO E ORIGEM</div>
   {data?.revisions?.length?<ul className="revision-list">{data.revisions.map((r:any)=><li key={r.id}><div><strong>{r.source}</strong><small>{fmt(r.created_at)}{r.source_run_id?' · gerado por uma execução':''}</small></div><p>{r.body||<em>(vazio)</em>}</p><button className="text-button" onClick={()=>setText(r.body)}><RotateCcw size={14}/>Usar esta versão</button></li>)}</ul>:<p className="hint">Sem versões registradas.</p>}
  </>}
 </div>;
}
