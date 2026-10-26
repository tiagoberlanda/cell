import {useEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
// Each cell type: display name, eye anchor [x,y,scale] and artwork drawn in the agent color.
// Classes c-* derive organelle tones from currentColor (see styles.css).
type Cell={name:string;eyes:[number,number,number];art:ReactNode};
const ring=(n:number,r1:number,r2:number,cx=50,cy=50)=>Array.from({length:n},(_,i)=>{const a=i*2*Math.PI/n,c=Math.cos(a),s=Math.sin(a);return <line key={i} x1={cx+r1*c} y1={cy+r1*s} x2={cx+r2*c} y2={cy+r2*s}/>;});
const cells:Record<string,Cell>={
 animal:{name:'Animal',eyes:[55,40,1],art:<>
  <circle cx="50" cy="50" r="42" fill="currentColor"/><circle cx="50" cy="50" r="36.5" className="c-in"/>
  <circle cx="34" cy="62" r="13" className="c-md"/><circle cx="31" cy="60" r="5" className="c-dk"/>
  <g transform="rotate(-35 72 66)"><ellipse cx="72" cy="66" rx="10" ry="5.5" className="c-dk"/><path d="M65 66q2-3 4 0t4 0t4 0" className="c-ln thin light"/></g>
  <circle cx="70" cy="24" r="3" className="c-md"/><circle cx="25" cy="36" r="2.5" className="c-md"/><circle cx="54" cy="78" r="2.5" className="c-md"/>
 </>},
 vegetal:{name:'Vegetal',eyes:[56,49,1],art:<>
  <path d="M32 7H68Q72 7 75 10L90 25Q93 28 93 32V68Q93 72 90 75L75 90Q72 93 68 93H32Q28 93 25 90L10 75Q7 72 7 68V32Q7 28 10 25L25 10Q28 7 32 7Z" fill="currentColor"/>
  <path d="M35 15H65L85 35V65L65 85H35L15 65V35Z" className="c-in rounded"/>
  <rect x="35" y="29" width="42" height="42" rx="17" className="c-lt"/>
  <circle cx="26" cy="31" r="7" className="c-md"/>
  <ellipse cx="22" cy="58" rx="6.5" ry="3.8" transform="rotate(70 22 58)" className="c-dk"/><ellipse cx="44" cy="80" rx="6.5" ry="3.8" className="c-dk"/><ellipse cx="78" cy="78" rx="6.5" ry="3.8" transform="rotate(-45 78 78)" className="c-dk"/><ellipse cx="58" cy="21" rx="6.5" ry="3.8" className="c-dk"/>
 </>},
 bacilo:{name:'Bacilo',eyes:[50,50,.82],art:<g transform="rotate(-32 50 50)">
  <path d="M86 50C91 42 95 58 100 50" className="c-ol"/>
  <g className="c-ol thin">{[28,50,72].flatMap(x=>[<line key={'t'+x} x1={x} y1="32" x2={x-2} y2="24"/>,<line key={'b'+x} x1={x} y1="68" x2={x+2} y2="76"/>])}</g>
  <rect x="12" y="31" width="76" height="38" rx="19" fill="currentColor"/><rect x="17.5" y="36.5" width="65" height="27" rx="13.5" className="c-in"/>
  <path d="M68 44q2.5 4 5 0t5 0M68 56q2.5 4 5 0t5 0" className="c-ln thin"/><circle cx="25" cy="44" r="2.3" className="c-dk"/><circle cx="27" cy="56" r="2.3" className="c-dk"/>
 </g>},
 coco:{name:'Coco',eyes:[50,47,.92],art:<>
  <g className="c-ol thin">{ring(16,33,44)}</g>
  <circle cx="50" cy="50" r="35" fill="currentColor"/><circle cx="50" cy="50" r="29.5" className="c-in"/>
  <path d="M64 66c3-6 11-3 9 2s-10 5-9-2" className="c-ln thin"/><circle cx="31" cy="44" r="2.3" className="c-dk"/><circle cx="70" cy="58" r="2.3" className="c-dk"/><circle cx="66" cy="30" r="2.3" className="c-dk"/>
 </>},
 neuronio:{name:'Neurônio',eyes:[46,44,.9],art:<>
  <g className="c-ol thick"><path d="M36 30L20 12M27 21L12 20M26 46L7 46M15 46L8 36M34 64L20 82M26 74L12 74M60 26L70 8M64 18L78 16"/><path d="M64 62L88 86M88 86l8 0M88 86l0 8M88 86l6-6"/></g>
  <g className="c-dk"><rect x="66" y="64" width="9" height="6" rx="3" transform="rotate(45 70.5 67)"/><rect x="76" y="74" width="9" height="6" rx="3" transform="rotate(45 80.5 77)"/></g>
  <circle cx="47" cy="46" r="25" fill="currentColor"/><circle cx="47" cy="46" r="20" className="c-in"/><circle cx="34" cy="56" r="6" className="c-md"/>
 </>},
 hemacia:{name:'Hemácia',eyes:[50,50,.95],art:<g transform="rotate(-18 50 50)">
  <ellipse cx="50" cy="50" rx="44" ry="31" fill="currentColor"/><ellipse cx="50" cy="50" rx="34" ry="22" className="c-md"/><ellipse cx="50" cy="51" rx="28" ry="16" className="c-in"/>
  <path d="M18 38q10-12 26-14" className="c-ol light thin"/>
 </g>},
 ameba:{name:'Ameba',eyes:[50,40,1],art:<>
  <path d="M32 9C47 1 59 20 72 18C94 14 95 40 87 54C81 67 95 82 73 91C54 99 48 82 31 88C9 97 3 75 11 58C18 43 5 23 32 9Z" fill="currentColor"/>
  <path d="M32 9C47 1 59 20 72 18C94 14 95 40 87 54C81 67 95 82 73 91C54 99 48 82 31 88C9 97 3 75 11 58C18 43 5 23 32 9Z" transform="translate(50 52) scale(.84) translate(-50 -50)" className="c-in"/>
  <circle cx="64" cy="68" r="10" className="c-md"/><circle cx="62" cy="66" r="3.5" className="c-dk"/><circle cx="29" cy="66" r="6" className="c-lt"/><circle cx="28" cy="34" r="4" className="c-lt"/><circle cx="78" cy="38" r="3" className="c-lt"/>
 </>},
 paramecio:{name:'Paramécio',eyes:[50,40,.92],art:<g transform="rotate(-20 50 50)">
  <path d="M50 6C74 6 84 30 82 52C80 76 66 94 48 94C30 94 22 80 24 66C25 58 32 54 30 44C27 30 28 6 50 6Z" className="c-cilia"/>
  <path d="M50 6C74 6 84 30 82 52C80 76 66 94 48 94C30 94 22 80 24 66C25 58 32 54 30 44C27 30 28 6 50 6Z" fill="currentColor"/>
  <path d="M50 12C68 12 77 32 75.5 52C74 72 63 88 48 88C34 88 29 78 30.5 67C31.5 59 37 55 35.5 45C33.5 32 34 12 50 12Z" className="c-in"/>
  <ellipse cx="65" cy="72" rx="6.5" ry="10" transform="rotate(20 65 72)" className="c-md"/><circle cx="62" cy="22" r="4" className="c-lt"/><circle cx="56" cy="84" r="3.5" className="c-lt"/>
 </g>},
 euglena:{name:'Euglena',eyes:[48,52,.92],art:<>
  <path d="M82 22C88 10 80 6 92 2" className="c-ol thin"/>
  <path d="M18 76C6 58 26 22 58 14C76 10 92 18 86 38C80 60 44 92 18 76Z" fill="currentColor"/>
  <path d="M22 72C13 58 30 28 58 20C72 17 84 22 80 37C75 55 44 84 22 72Z" className="c-in"/>
  <ellipse cx="34" cy="66" rx="5.5" ry="3" transform="rotate(-30 34 66)" className="c-dk"/><ellipse cx="62" cy="64" rx="5.5" ry="3" transform="rotate(-40 62 64)" className="c-dk"/><ellipse cx="30" cy="44" rx="5.5" ry="3" transform="rotate(-60 30 44)" className="c-dk"/>
  <circle cx="74" cy="28" r="4" className="c-eyespot"/>
 </>},
 diatomacea:{name:'Diatomácea',eyes:[50,50,.82],art:<>
  <circle cx="50" cy="50" r="43" fill="currentColor"/><circle cx="50" cy="50" r="37" className="c-in"/>
  <g className="c-ln thin">{ring(18,17,35)}</g><circle cx="50" cy="50" r="17" className="c-lt"/><circle cx="50" cy="50" r="37" className="c-ln thin"/>
 </>},
 levedura:{name:'Levedura',eyes:[44,55,1],art:<>
  <ellipse cx="80" cy="22" rx="14" ry="13" fill="currentColor"/><ellipse cx="80" cy="22" rx="9.5" ry="8.5" className="c-in"/>
  <ellipse cx="44" cy="56" rx="36" ry="38" fill="currentColor"/><ellipse cx="44" cy="56" rx="30.5" ry="32.5" className="c-in"/>
  <circle cx="58" cy="76" r="8" className="c-lt"/><circle cx="26" cy="72" r="6" className="c-md"/><path d="M22 34a5 5 0 0 1 8-4" className="c-ln"/>
 </>},
 leucocito:{name:'Leucócito',eyes:[52,36,.9],art:<>
  <circle cx="50" cy="50" r="40" className="c-bumps"/><circle cx="50" cy="50" r="40" fill="currentColor"/><circle cx="50" cy="50" r="34.5" className="c-in"/>
  <g className="c-md"><circle cx="32" cy="62" r="9"/><circle cx="48" cy="70" r="9"/><circle cx="65" cy="63" r="9"/><rect x="34" y="62" width="30" height="8" rx="4"/></g>
  <g className="c-dk"><circle cx="27" cy="40" r="2"/><circle cx="74" cy="44" r="2"/><circle cx="68" cy="24" r="2"/><circle cx="36" cy="22" r="2"/><circle cx="78" cy="58" r="2"/></g>
 </>},
};
export const cellNames:Record<string,string>=Object.fromEntries(Object.entries(cells).map(([k,v])=>[k,v.name]));
const labels:Record<string,string>={running:'Trabalhando',queued:'Na fila',waiting_agent:'Aguardando agente',waiting_approval:'Aguardando aprovação',completed:'Concluído',failed:'Falhou',cancelled:'Cancelado'};
export function CellAvatar({shape='ameba',color='#b3efbc',state,size=44}:{shape?:string;color?:string;state?:string|null;size?:number}){
 const ref=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(true),[celebrate,setCelebrate]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(state==='completed'){setCelebrate(true);const timer=setTimeout(()=>setCelebrate(false),900);return()=>clearTimeout(timer);}setCelebrate(false);},[state]);
 const cell=cells[shape]||cells.ameba,[ex,ey,es]=cell.eyes;
 return <span ref={ref} className={`cell-avatar ${state==='running'?'is-running':''} ${celebrate?'is-complete':''} ${!visible?'offscreen':''}`} style={{width:size,height:size,'--cell-color':color} as CSSProperties} role="img" aria-label={`Célula ${cell.name} — ${labels[state||'']||'Ocioso'}`}><svg viewBox="0 0 100 100" aria-hidden="true"><g className="cell-body">{cell.art}<g transform={`translate(${ex} ${ey}) scale(${es})`}><g className="cell-eyes" transform="rotate(-22)"><rect x="-13.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/><rect x="5.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/></g></g></g></svg>{['failed','waiting_approval','queued','waiting_agent'].includes(state||'')&&<i className={`state-dot ${state}`}/>}</span>;
}
