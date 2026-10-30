import React from 'react';
import {Monitor} from 'lucide-react';
import {jobEventOf,jobEventTitle,jobEventNote} from '../../../packages/shared/src/index';

export function JobEvent({message}:{message:any}){
 const event=jobEventOf(message);if(!event)return null;
 return <article className="job-event" aria-label="Evento do sistema">
  <div className="job-event-meta"><Monitor size={14}/><span>Cell · Sistema</span><time>{new Date(message.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div>
  <p><strong>{jobEventTitle(event.status)}</strong> · {event.computerName}</p>
  {event.reason&&<p>{event.reason}</p>}
  {jobEventNote(event.status)&&<small>{jobEventNote(event.status)}</small>}
  <details><summary>Detalhes técnicos{event.exitCode!==null?` · saída ${event.exitCode}`:''}</summary><pre>{event.output||'Sem saída.'}</pre><small>Saída do computador, não validada. Caminhos locais não são anexos para download.</small></details>
 </article>;
}
