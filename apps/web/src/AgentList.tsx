import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {Pin,PinOff,Plus,MoreHorizontal,Pencil,Trash2} from 'lucide-react';
import type {Agent} from '../../../packages/shared/src/index';
import {CellAvatar} from './CellAvatar';
import {api} from './api';
import {confirmDialog,promptDialog} from './dialogs';
type Group={name:string;ids:string[]};
type Drag={kind:'agent'|'section';id:string;x:number;y:number;pointer:string;timer?:ReturnType<typeof setTimeout>;active:boolean};
const HOLD_MS=350;
const clone=(groups:Group[])=>groups.map(g=>({...g,ids:[...g.ids]}));
// Moves the dragged agent or section next to the element under the pointer; returns the same array when nothing changes.
function reorder(groups:Group[],d:Drag,kind:string,key:string,after:boolean):Group[]{
 const g=clone(groups);
 if(d.kind==='agent'){
  if(kind==='agent'&&key===d.id)return groups;
  for(const x of g)x.ids=x.ids.filter(i=>i!==d.id);
  if(kind==='agent'){const t=g.find(x=>x.ids.includes(key));if(!t)return groups;t.ids.splice(t.ids.indexOf(key)+(after?1:0),0,d.id);}
  else{const t=g.find(x=>x.name===key);if(!t)return groups;if(kind==='section-head')t.ids.unshift(d.id);else t.ids.push(d.id);}
 }else{
  if(key===d.id)return groups;
  const from=g.findIndex(x=>x.name===d.id),[moved]=g.splice(from,1);let to=g.findIndex(x=>x.name===key);if(to<0)return groups;if(after)to++;g.splice(to,0,moved);
 }
 return JSON.stringify(g)===JSON.stringify(groups)?groups:g;
}
export function AgentList({agents,sections,selected,onSelect,onTogglePin,onChanged,notify,describe}:{agents:Agent[];sections:string[];selected:string|null;onSelect:(id:string)=>void;onTogglePin:(a:Agent)=>void;onChanged:()=>Promise<any>;notify:(m:string)=>void;describe:(a:Agent)=>{title:string;subtitle:string}}){
 const names=[...sections];for(const a of agents)if(!a.archived&&!names.includes(a.section))names.push(a.section);
 const base:Group[]=names.map(name=>({name,ids:agents.filter(a=>!a.archived&&a.section===name).map(a=>a.id)}));
 const [layout,setLayout]=useState<Group[]|null>(null),[dragging,setDragging]=useState<string|null>(null);
 const view=layout||base,byId=new Map(agents.map(a=>[a.id,a]));
 const drag=useRef<Drag|null>(null),list=useRef<HTMLDivElement>(null),current=useRef(view),suppress=useRef(false),props=useRef({onChanged,notify});
 current.current=view;props.current={onChanged,notify};
 const activate=()=>{const d=drag.current;if(!d||d.active)return;d.active=true;setDragging(d.id);setLayout(clone(current.current));navigator.vibrate?.(12);};
 const press=(e:ReactPointerEvent,kind:Drag['kind'],id:string)=>{if(e.pointerType==='mouse'&&e.button!==0)return;drag.current={kind,id,x:e.clientX,y:e.clientY,pointer:e.pointerType,active:false,timer:setTimeout(activate,HOLD_MS)};};
 useEffect(()=>{
  let point={x:0,y:0},frame=0;
  const update=(x:number,y:number)=>{const d=drag.current;if(!d?.active)return;
   const hit=document.elementFromPoint(x,y);
   const el=d.kind==='section'?hit?.closest<HTMLElement>('[data-section-box]'):hit?.closest<HTMLElement>('[data-drop]');if(!el||!list.current?.contains(el))return;
   const r=el.getBoundingClientRect(),after=y>r.top+r.height/2;
   setLayout(prev=>prev&&(d.kind==='section'?reorder(prev,d,'section',el.dataset.sectionBox!,after):reorder(prev,d,el.dataset.drop!,el.dataset.key!,after)));};
  // While dragging near the top or bottom edge, scroll the list so off-screen sections can be reached.
  const autoScroll=()=>{const box=list.current;if(!drag.current?.active||!box){frame=0;return;}const r=box.getBoundingClientRect(),edge=40;
   const speed=point.y<r.top+edge?-Math.ceil((r.top+edge-point.y)/4):point.y>r.bottom-edge?Math.ceil((point.y-r.bottom+edge)/4):0;
   if(speed){box.scrollTop+=speed;update(point.x,Math.min(Math.max(point.y,r.top+2),r.bottom-2));}frame=requestAnimationFrame(autoScroll);};
  const move=(e:PointerEvent)=>{const d=drag.current;if(!d)return;
   if(!d.active){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>8){if(d.pointer==='mouse')activate();else{clearTimeout(d.timer);drag.current=null;}}if(!drag.current?.active)return;}
   point={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(autoScroll);update(e.clientX,e.clientY);};
  const end=()=>{cancelAnimationFrame(frame);frame=0;const d=drag.current;drag.current=null;if(!d)return;clearTimeout(d.timer);if(!d.active)return;
   suppress.current=true;setTimeout(()=>{suppress.current=false;},0);setDragging(null);const final=current.current;
   api('/layout','PUT',{sections:final.map(g=>g.name),agents:final.flatMap(g=>g.ids.map(id=>({id,section:g.name})))}).then(()=>props.current.onChanged()).catch(e=>props.current.notify(e.message)).finally(()=>setLayout(null));};
  // Once a hold starts a drag, touch scrolling must not steal the gesture.
  const block=(e:TouchEvent)=>{if(drag.current?.active)e.preventDefault();};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);document.addEventListener('touchmove',block,{passive:false});
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.removeEventListener('touchmove',block);};
 },[]);
 const run=async(fn:()=>Promise<any>)=>{try{await fn();await onChanged();}catch(e:any){notify(e.message);}};
 const createSection=async()=>{const name=await promptDialog('Nova seção',{placeholder:'Ex.: Criativos',confirm:'Criar'});if(name)run(()=>api('/sections','POST',{name}));};
 const renameSection=async(from:string)=>{const name=await promptDialog('Renomear seção',{value:from});if(name&&name!==from)run(()=>api('/sections/'+encodeURIComponent(from),'PUT',{name}));};
 const deleteSection=async(name:string)=>{if(await confirmDialog(`Excluir a seção ${name}?`,undefined,{confirm:'Excluir',danger:true}))run(()=>api('/sections/'+encodeURIComponent(name),'DELETE'));};
 return <div ref={list} className={`agent-list ${dragging?'is-dragging':''}`}>
  {view.map(g=><section key={g.name} data-drop="section" data-key={g.name} data-section-box={g.name} className={dragging===g.name?'dragging':''}>
   <div className="section-label" data-drop="section-head" data-key={g.name} onPointerDown={e=>press(e,'section',g.name)} onContextMenu={e=>e.preventDefault()} title="Segure e arraste para reordenar a seção"><span>{g.name}</span><span className="section-tools"><span>{g.ids.length}</span>
    <Dropdown.Root><Dropdown.Trigger asChild><button className="section-menu" aria-label={`Opções da seção ${g.name}`} onPointerDown={e=>e.stopPropagation()}><MoreHorizontal size={14}/></button></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown" align="end"><Dropdown.Item onSelect={()=>renameSection(g.name)}><Pencil size={15}/>Renomear seção</Dropdown.Item><Dropdown.Item onSelect={createSection}><Plus size={15}/>Nova seção</Dropdown.Item><Dropdown.Separator/><Dropdown.Item disabled={g.ids.length>0} onSelect={()=>deleteSection(g.name)}><Trash2 size={15}/>{g.ids.length?'Excluir (mova os agentes antes)':'Excluir seção'}</Dropdown.Item></Dropdown.Content></Dropdown.Portal></Dropdown.Root></span></div>
   {g.ids.map(id=>{const a=byId.get(id);if(!a)return null;const {title,subtitle}=describe(a);return <div key={id} className={`agent-row-wrap ${dragging===id?'dragging':''}`} data-drop="agent" data-key={id}>
    <button className={`agent-row ${id===selected?'selected':''}`} onPointerDown={e=>press(e,'agent',id)} onContextMenu={e=>e.preventDefault()} onClick={()=>{if(!suppress.current)onSelect(id);}} title={title}><CellAvatar shape={a.shape} color={a.color} state={a.state} size={40}/><span className="agent-copy"><strong>{a.name}</strong><small>{subtitle}</small></span>{a.unread&&<b className="unread"/>}</button>
    <button className={`pin-toggle ${a.pinned?'on':''}`} aria-label={a.pinned?`Desafixar ${a.name} do topo`:`Fixar ${a.name} no topo`} title={a.pinned?'Desafixar do topo':'Fixar no topo'} aria-pressed={a.pinned} onClick={()=>onTogglePin(a)}>{a.pinned?<PinOff size={15}/>:<Pin size={15}/>}</button></div>;})}
   {!g.ids.length&&<div className="section-empty">{dragging?'Solte aqui':'Seção vazia — arraste agentes para cá'}</div>}
  </section>)}
  <button className="new-section" onClick={createSection}><Plus size={14}/>Nova seção</button>
 </div>;
}
