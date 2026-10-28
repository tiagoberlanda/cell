import {useState} from 'react';
import {Download,Upload,ShieldCheck,AlertTriangle} from 'lucide-react';
import {api,apiBlob} from './api';
import {confirmDialog,promptDialog,alertDialog} from './dialogs';
type Notice={notify:(m:string)=>void};

const labels:Record<string,string>={agents:'Agentes',conversations:'Conversas',messages:'Mensagens',runs:'Execuções',files:'Arquivos',routines:'Rotinas',skills:'Habilidades',connections:'Conexões',computers:'Computadores SSH',command_recipes:'Receitas'};
const fmt=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

// Settings → Backup: download a full encrypted backup, or upload one, check what is inside and restore it.
export function BackupPanel({notify}:Notice){
 const [busy,setBusy]=useState<'backup'|'inspect'|'restore'|null>(null),[file,setFile]=useState<File|null>(null),[backupPassword,setBackupPassword]=useState(''),[info,setInfo]=useState<any>(null);
 const download=async()=>{
  const password=await promptDialog('Fazer backup',{text:'Digite a senha da conta. Ela confirma o pedido e protege o arquivo: guarde-a, porque sem ela o backup não abre.',type:'password',confirm:'Fazer backup',required:'Digite a senha.'});
  if(!password)return;setBusy('backup');
  try{const blob=await apiBlob('/backup','POST',{password});const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=`cell-${new Date().toISOString().slice(0,10)}.cellbackup`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   notify(`Backup baixado (${(blob.size/1e6).toFixed(1)} MB). Guarde o arquivo e a senha em lugar seguro.`);}
  catch(e:any){notify(e.message);}finally{setBusy(null);}
 };
 const inspect=async()=>{
  if(!file||!backupPassword)return;setBusy('inspect');setInfo(null);
  try{const form=new FormData();form.append('password',backupPassword);form.append('backup',file,file.name);setInfo(await api('/backup/inspect','POST',form));}
  catch(e:any){notify(e.message);}finally{setBusy(null);}
 };
 const restore=async()=>{
  if(!info)return;
  if(!await confirmDialog('Substituir tudo por este backup?','Agentes, conversas, arquivos, rotinas, conexões e configurações atuais serão trocados pelos do backup. Faça um backup do estado atual antes, se quiser guardá-lo.',{confirm:'Restaurar',danger:true}))return;
  const password=await promptDialog('Senha atual da conta',{text:'Para confirmar a restauração.',type:'password',confirm:'Restaurar agora',required:'Digite a senha.'});if(!password)return;
  setBusy('restore');
  try{const r=await api('/backup/restore','POST',{uploadId:info.uploadId,password,backupPassword});
   await alertDialog('Backup restaurado',`Backup de ${fmt(r.meta.createdAt)} restaurado, com ${r.files} arquivos.${r.rekeyed?' As conexões e tokens foram adaptados a esta instalação.':''} Entre de novo com a senha da conta da época do backup.`,'success');
   location.reload();}
  catch(e:any){notify(e.message);setBusy(null);}
 };
 const c=info?.meta?.counts||{};
 return <div className="stack backup-panel">
  <h3>Fazer backup</h3>
  <p className="hint">Um arquivo com tudo: agentes, conversas, mensagens, arquivos, rotinas, habilidades, conexões, computadores e configurações. Ele sai cifrado com a senha da conta e permite recriar o Cell completo, aqui ou em outra instalação.</p>
  <button className="primary" disabled={busy!==null} onClick={download}><Download size={16}/>{busy==='backup'?'Gerando backup…':'Fazer backup e baixar'}</button>
  <h3>Restaurar backup</h3>
  <p className="hint">Escolha um arquivo <code>.cellbackup</code> e digite a senha usada quando ele foi feito. O Cell mostra o conteúdo antes de trocar qualquer coisa. Pelo domínio público (Cloudflare), envios passam de no máximo 100 MB; para backups maiores, use o endereço da rede local.</p>
  <label>Arquivo do backup<input type="file" accept=".cellbackup" onChange={e=>{setFile(e.target.files?.[0]||null);setInfo(null);}}/></label>
  <label>Senha do backup<input type="password" autoComplete="off" value={backupPassword} onChange={e=>{setBackupPassword(e.target.value);setInfo(null);}}/></label>
  <button className="secondary" disabled={!file||!backupPassword||busy!==null} onClick={inspect}><Upload size={16}/>{busy==='inspect'?'Verificando…':'Enviar e verificar'}</button>
  {info&&<div className={`setting-card backup-summary ${info.compatible?'':'bad'}`}>
   <div className="backup-head">{info.compatible?<ShieldCheck size={18}/>:<AlertTriangle size={18}/>}<strong>{info.compatible?'Backup válido':'Backup de uma versão mais nova'}</strong></div>
   <p>Feito em {fmt(info.meta.createdAt)} · Cell {info.meta.version}</p>
   <ul>{Object.keys(labels).filter(k=>k==='files'?true:c[k]!==undefined).map(k=><li key={k}><span>{labels[k]}</span><b>{k==='files'?info.meta.files:c[k]}</b></li>)}</ul>
   {!info.sameKey&&<p className="hint">Veio de outra instalação: as senhas e tokens salvos serão adaptados a esta.</p>}
   {info.compatible?<button className="danger" disabled={busy!==null} onClick={restore}>{busy==='restore'?'Restaurando…':'Restaurar este backup'}</button>
    :<p className="app-error">Atualize o Cell para a versão {info.meta.version} ou mais nova antes de restaurar.</p>}
  </div>}
 </div>;
}
