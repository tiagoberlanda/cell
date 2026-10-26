import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
const paths:Record<string,string>={
 circular:'M50 8C74 8 92 25 92 50S74 92 50 92S8 74 8 50S26 8 50 8Z',
 oval:'M20 24C38 10 74 6 88 28S87 71 64 83S20 92 11 70S3 39 20 24Z',
 capsula:'M31 14H69C86 14 94 29 94 50S86 86 69 86H31C14 86 6 71 6 50S14 14 31 14Z',
 gota:'M36 8C49 9 88 34 91 57C94 80 74 94 49 92C22 90 9 72 12 50C15 28 21 5 36 8Z',
 triangular:'M25 10C37 3 81 37 90 51C101 68 77 80 56 88C33 97 11 96 10 78C9 60 11 19 25 10Z',
 hexagonal:'M27 10Q30 7 38 8L75 18Q83 20 86 28L96 58Q98 67 91 73L63 94Q57 98 49 94L15 76Q8 72 8 64L9 38Q9 31 15 24Z',
 nuvem:'M22 28C22 9 48 3 60 17C80 6 98 28 87 43C107 62 88 85 73 80C64 100 37 96 30 83C9 88 1 66 12 51C-1 39 8 23 22 28Z',
 ameba:'M32 9C47 1 59 20 72 18C94 14 95 40 87 54C81 67 95 82 73 91C54 99 48 82 31 88C9 97 3 75 11 58C18 43 5 23 32 9Z'
};
const labels:Record<string,string>={running:'Trabalhando',queued:'Na fila',waiting_agent:'Aguardando agente',waiting_approval:'Aguardando aprovação',completed:'Concluído',failed:'Falhou',cancelled:'Cancelado'};
export function CellAvatar({shape='ameba',color='#b3efbc',state,size=44}:{shape?:string;color?:string;state?:string|null;size?:number}){
 const ref=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(true),[celebrate,setCelebrate]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(state==='completed'){setCelebrate(true);const timer=setTimeout(()=>setCelebrate(false),900);return()=>clearTimeout(timer);}setCelebrate(false);},[state]);
 return <span ref={ref} className={`cell-avatar ${state==='running'?'is-running':''} ${celebrate?'is-complete':''} ${!visible?'offscreen':''}`} style={{width:size,height:size,'--cell-color':color} as CSSProperties} role="img" aria-label={`Célula ${shape} — ${labels[state||'']||'Ocioso'}`}><svg viewBox="0 0 100 100" aria-hidden="true"><g className="cell-body"><path d={paths[shape]||paths.ameba} fill="currentColor"/><g className="cell-eyes" transform="rotate(-22 50 40)"><rect x="40" y="26" width="8" height="21" rx="4" fill="#101313"/><rect x="59" y="26" width="8" height="21" rx="4" fill="#101313"/></g></g></svg>{['failed','waiting_approval','queued','waiting_agent'].includes(state||'')&&<i className={`state-dot ${state}`}/>}</span>;
}
