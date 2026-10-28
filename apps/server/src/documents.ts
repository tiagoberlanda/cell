import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import { Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType,PageBreak,AlignmentType } from 'docx';
import { z } from 'zod';
import { saveFile,fileData } from './files.js';
import type { Tool } from './tools.js';

// Office-style files produced by agents: spreadsheets (xlsx/csv), PDF and Word from Markdown, PowerPoint decks.
// Every file lands in the Cell library and is attached to the agent's answer.
// pptxgenjs is CommonJS: under ESM the class may arrive as the default export or inside it.
const Pptx:any=(PptxGenJS as any).default??PptxGenJS;

// File name without path or extension, safe on Windows and phones.
const baseName=(name:string)=>name.replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'arquivo';

// --- Markdown subset shared by PDF and Word: #/##/### headings, paragraphs, - and 1. lists, | tables, --- page break,
// **bold**, *italic* and `code` inline.
type Inline={text:string;bold?:boolean;italic?:boolean;code?:boolean};
type Block={type:'h1'|'h2'|'h3'|'p'|'ul'|'ol'|'table'|'break';inlines?:Inline[];items?:Inline[][];rows?:string[][]};
export function inlines(text:string):Inline[]{
 const out:Inline[]=[];
 for(const part of text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/)){
  if(!part)continue;
  if(/^\*\*[^*]+\*\*$/.test(part))out.push({text:part.slice(2,-2),bold:true});
  else if(/^\*[^*]+\*$/.test(part))out.push({text:part.slice(1,-1),italic:true});
  else if(/^`[^`]+`$/.test(part))out.push({text:part.slice(1,-1),code:true});
  else out.push({text:part});
 }
 return out.length?out:[{text:''}];
}
const cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
export function parseMarkdown(md:string):Block[]{
 const lines=md.replace(/\r/g,'').split('\n'),blocks:Block[]=[];let para:string[]=[];
 const flush=()=>{if(para.length){blocks.push({type:'p',inlines:inlines(para.join(' '))});para=[];}};
 for(let i=0;i<lines.length;i++){
  const line=lines[i],t=line.trim();
  if(!t){flush();continue;}
  const h=/^(#{1,3})\s+(.*)$/.exec(t);
  if(h){flush();blocks.push({type:(['h1','h2','h3'] as const)[h[1].length-1],inlines:inlines(h[2])});continue;}
  if(/^(-{3,}|\*{3,})$/.test(t)){flush();blocks.push({type:'break'});continue;}
  if(t.startsWith('|')&&/^\|?\s*:?-{2,}/.test(lines[i+1]?.trim()||'')){
   flush();const rows=[cells(t)];i+=2;while(i<lines.length&&lines[i].trim().startsWith('|')){rows.push(cells(lines[i]));i++;}i--;
   blocks.push({type:'table',rows});continue;
  }
  const ul=/^[-*•]\s+(.*)$/.exec(t),ol=/^\d+[.)]\s+(.*)$/.exec(t);
  if(ul||ol){flush();const type=ul?'ul':'ol',last=blocks.at(-1),item=inlines((ul||ol)![1]);if(last?.type===type)last.items!.push(item);else blocks.push({type,items:[item]});continue;}
  para.push(t);
 }
 flush();return blocks;
}

// --- PDF (A4, page numbers). The standard fonts cover Portuguese accents; emoji are dropped.
export async function markdownToPdf(title:string|undefined,md:string):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margins:{top:56,bottom:64,left:56,right:56},bufferPages:true,info:{Title:title||'Documento',Creator:'Cell'}});
 const chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));const done=new Promise<Buffer>(r=>doc.on('end',()=>r(Buffer.concat(chunks))));
 const clean=(s:string)=>s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'');
 const width=doc.page.width-112,accent='#147d6a';
 const runs=(items:Inline[],opts:any={})=>{items.forEach((it,i)=>{doc.font(it.code?'Courier':it.bold&&it.italic?'Helvetica-BoldOblique':it.bold?'Helvetica-Bold':it.italic?'Helvetica-Oblique':'Helvetica');doc.text(clean(it.text),{...opts,continued:i<items.length-1});});};
 if(title){doc.font('Helvetica-Bold').fontSize(22).fillColor('#111').text(clean(title));doc.moveDown(0.2);doc.moveTo(56,doc.y).lineTo(56+width,doc.y).lineWidth(2).strokeColor(accent).stroke();doc.moveDown(0.8);}
 for(const b of parseMarkdown(md)){
  doc.fillColor('#222');
  if(b.type==='break'){doc.addPage();continue;}
  if(b.type==='h1'||b.type==='h2'||b.type==='h3'){const size={h1:18,h2:15,h3:12.5}[b.type];if(doc.y>doc.page.height-140)doc.addPage();doc.moveDown(0.4);doc.fontSize(size).fillColor(b.type==='h1'?accent:'#111');runs(b.inlines!.map(i=>({...i,bold:true})));doc.moveDown(0.35);continue;}
  if(b.type==='p'){doc.fontSize(11);runs(b.inlines!,{align:'justify',lineGap:2});doc.moveDown(0.6);continue;}
  if(b.type==='ul'||b.type==='ol'){doc.fontSize(11);b.items!.forEach((item,n)=>{const y=doc.y;doc.font('Helvetica').text(b.type==='ul'?'•':`${n+1}.`,56+6,y,{width:18});doc.text('',56+24,y);runs(item,{width:width-24,lineGap:2});doc.moveDown(0.25);});doc.x=56;doc.moveDown(0.4);continue;}
  if(b.type==='table'){
   const rows=b.rows!,cols=Math.max(...rows.map(r=>r.length)),w=width/cols;doc.fontSize(9.5);
   const height=(r:string[],bold:boolean)=>Math.max(...Array.from({length:cols},(_,c)=>{doc.font(bold?'Helvetica-Bold':'Helvetica');return doc.heightOfString(clean(r[c]||''),{width:w-10});}))+10;
   rows.forEach((r,ri)=>{const head=ri===0,h=height(r,head);if(doc.y+h>doc.page.height-64){doc.addPage();}
    const y=doc.y;if(head)doc.rect(56,y,width,h).fill('#e6f4f1');else if(ri%2===0)doc.rect(56,y,width,h).fill('#f7f7f5');
    for(let c=0;c<cols;c++){doc.rect(56+c*w,y,w,h).lineWidth(0.5).strokeColor('#c9cfcc').stroke();doc.fillColor('#222').font(head?'Helvetica-Bold':'Helvetica').text(clean(r[c]||''),56+c*w+5,y+5,{width:w-10});}
    doc.x=56;doc.y=y+h;});
   doc.moveDown(0.8);continue;
  }
 }
 const range=doc.bufferedPageRange();
 // Footer sits below the bottom margin: lift the margin while writing it, or pdfkit opens a new page per number.
 for(let i=0;i<range.count;i++){doc.switchToPage(range.start+i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(8.5).fillColor('#888').text(`${i+1} / ${range.count}`,56,doc.page.height-40,{width,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;}
 doc.end();return done;
}

// --- Word (docx) from the same Markdown.
export async function markdownToDocx(title:string|undefined,md:string):Promise<Buffer>{
 const run=(i:Inline,extra:any={})=>new TextRun({text:i.text,bold:i.bold||extra.bold,italics:i.italic,font:i.code?'Consolas':undefined,...(extra.size?{size:extra.size}:{})});
 const children:any[]=[];
 const push=(p:any)=>{children.push(p);};
 if(title)push(new Paragraph({heading:HeadingLevel.TITLE,children:[new TextRun({text:title})]}));
 for(const b of parseMarkdown(md)){
  if(b.type==='break'){push(new Paragraph({children:[new PageBreak()]}));continue;}
  if(b.type==='h1'||b.type==='h2'||b.type==='h3'){push(new Paragraph({heading:{h1:HeadingLevel.HEADING_1,h2:HeadingLevel.HEADING_2,h3:HeadingLevel.HEADING_3}[b.type],children:b.inlines!.map(i=>run(i))}));continue;}
  if(b.type==='p'){push(new Paragraph({alignment:AlignmentType.JUSTIFIED,spacing:{after:160},children:b.inlines!.map(i=>run(i))}));continue;}
  if(b.type==='ul'){for(const item of b.items!)push(new Paragraph({bullet:{level:0},children:item.map(i=>run(i))}));continue;}
  if(b.type==='ol'){for(const item of b.items!)push(new Paragraph({numbering:{reference:'numbers',level:0},children:item.map(i=>run(i))}));continue;}
  if(b.type==='table'){const cols=Math.max(...b.rows!.map(r=>r.length));
   push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:b.rows!.map((r,ri)=>new TableRow({tableHeader:ri===0,children:Array.from({length:cols},(_,c)=>new TableCell({shading:ri===0?{fill:'E6F4F1'}:undefined,children:[new Paragraph({children:inlines(r[c]||'').map(i=>run(i,{bold:ri===0}))})]}))}))}));
   push(new Paragraph({text:''}));continue;}
 }
 const doc=new Document({creator:'Cell',title:title||'Documento',numbering:{config:[{reference:'numbers',levels:[{level:0,format:'decimal' as any,text:'%1.',alignment:AlignmentType.START}]}]},sections:[{children}]});
 return Buffer.from(await Packer.toBuffer(doc));
}

// --- Spreadsheets. Strings starting with "=" become formulas; numbers stay numbers.
type Sheet={name:string;columns:string[];rows:(string|number|boolean|null)[][]};
export async function sheetsToXlsx(sheets:Sheet[]):Promise<Buffer>{
 const wb=new ExcelJS.Workbook();wb.creator='Cell';wb.created=new Date();
 const used=new Set<string>();
 for(const s of sheets){
  let name=(s.name||'Planilha').replace(/[\\/?*[\]:]/g,' ').trim().slice(0,31)||'Planilha';while(used.has(name.toLowerCase()))name=name.slice(0,28)+' '+(used.size+1);used.add(name.toLowerCase());
  const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  ws.addRow(s.columns);
  for(const r of s.rows)ws.addRow(r.map(v=>typeof v==='string'&&v.startsWith('=')&&v.length>1?{formula:v.slice(1)}:v));
  const header=ws.getRow(1);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF147D6A'}};header.alignment={vertical:'middle'};
  ws.columns.forEach((col,i)=>{const lens=[s.columns[i],...s.rows.map(r=>r[i])].map(v=>String(v??'').length);col.width=Math.min(60,Math.max(10,...lens)+2);});
  if(s.columns.length)ws.autoFilter={from:{row:1,column:1},to:{row:1,column:s.columns.length}};
 }
 return Buffer.from(await wb.xlsx.writeBuffer());
}
// CSV with a UTF-8 BOM so Excel keeps accents; ";" opens directly in Excel set to Portuguese.
export function sheetToCsv(s:Sheet,delimiter:','|';'){
 const cell=(v:unknown)=>{const t=String(v??'');return /["\n\r,;]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
 return Buffer.from('﻿'+[s.columns,...s.rows].map(r=>r.map(cell).join(delimiter)).join('\r\n')+'\r\n','utf8');
}

// --- PowerPoint (16:9). Title slide, then one slide per item: bullets (two levels), optional table, image from the
// library (e.g. made with generate_image) and speaker notes.
type Slide={title:string;bullets?:string[];table?:{columns:string[];rows:string[][]};imageId?:string;notes?:string};
export async function slidesToPptx(deck:{title:string;subtitle?:string;color?:string;slides:Slide[]}):Promise<Buffer>{
 const pres=new Pptx();pres.layout='LAYOUT_WIDE';pres.title=deck.title;pres.company='Cell';
 const accent=(deck.color||'#147d6a').replace('#','').toUpperCase(),W=13.33;
 const cover=pres.addSlide();cover.background={color:accent};
 cover.addText(deck.title,{x:0.8,y:2.4,w:W-1.6,h:1.4,fontSize:40,bold:true,color:'FFFFFF',fontFace:'Calibri'});
 if(deck.subtitle)cover.addText(deck.subtitle,{x:0.8,y:3.9,w:W-1.6,h:0.9,fontSize:20,color:'FFFFFF',fontFace:'Calibri'});
 for(const [n,s] of deck.slides.entries()){
  const slide=pres.addSlide();slide.background={color:'FFFFFF'};
  slide.addShape('rect' as any,{x:0,y:0,w:W,h:0.12,fill:{color:accent},line:{color:accent}});
  slide.addText(s.title,{x:0.6,y:0.35,w:W-1.2,h:0.9,fontSize:28,bold:true,color:'1F2421',fontFace:'Calibri'});
  slide.addText(String(n+2),{x:W-1.1,y:7.0,w:0.6,h:0.3,fontSize:10,color:'8A918D',align:'right'});
  let image:{data:string}|null=null;
  if(s.imageId){try{const f=await fileData(s.imageId);if(String(f.mime).startsWith('image/'))image={data:`data:${f.mime};base64,${f.data.toString('base64')}`};}catch{}}
  const textW=image?W*0.52:W-1.2;
  if(s.table?.columns?.length){
   const rows=[s.table.columns.map(c=>({text:c,options:{bold:true,color:'FFFFFF',fill:{color:accent}}})),...s.table.rows.map(r=>r.map(c=>({text:String(c??'')})))];
   slide.addTable(rows as any,{x:0.6,y:s.bullets?.length?3.6:1.5,w:textW,fontSize:12,border:{type:'solid',pt:0.5,color:'C9CFCC'},autoPage:true});
  }
  if(s.bullets?.length){
   const items=s.bullets.map(b=>{const sub=/^\s{2,}|^\t/.test(b)||/^\s*-\s/.test(b);return {text:b.replace(/^\s*[-•]\s*/,'').trim(),options:{bullet:true,indentLevel:sub?1:0,fontSize:sub?16:20,color:'333A36',paraSpaceAfter:6}};});
   slide.addText(items as any,{x:0.6,y:1.4,w:textW,h:s.table?.columns?.length?2.1:5.4,valign:'top',fontFace:'Calibri'});
  }
  if(image)slide.addImage({data:image.data,x:W*0.58,y:1.4,w:W*0.37,h:5.2,sizing:{type:'contain',w:W*0.37,h:5.2}});
  if(s.notes)slide.addNotes(s.notes);
 }
 return Buffer.from(await pres.write({outputType:'nodebuffer'}) as any);
}

const object=(properties:any,required:string[])=>({type:'object',properties,required,additionalProperties:false});
const str={type:'string'};
const cellValue={type:['string','number','boolean','null']};
export const documentToolNames=['create_spreadsheet','create_pdf','create_docx','create_presentation'];
export function documentTools():Tool[]{
 const sheetSchema=object({name:str,columns:{type:'array',items:str},rows:{type:'array',items:{type:'array',items:cellValue}}},['name','columns','rows']);
 const sheet=z.object({name:z.string().max(100),columns:z.array(z.string().max(200)).min(1).max(100),rows:z.array(z.array(z.union([z.string().max(5000),z.number(),z.boolean(),z.null()])).max(100)).max(20000)});
 return [
  {name:'create_spreadsheet',description:'Cria uma planilha na biblioteca: Excel (.xlsx, com várias abas, cabeçalho destacado, filtros e fórmulas começando com "=") ou CSV (só a primeira aba). Use números como números, não como texto.',parameters:object({name:str,format:{type:'string',enum:['xlsx','csv']},sheets:{type:'array',items:sheetSchema},delimiter:{type:'string',enum:[',',';'],description:'Só para CSV. Padrão ";" (abre direto no Excel em português)'}},['name','sheets']),write:false,
   execute:async(a,r)=>{const x=z.object({name:z.string().min(1).max(150),format:z.enum(['xlsx','csv']).default('xlsx'),sheets:z.array(sheet).min(1).max(20),delimiter:z.enum([',',';']).default(';')}).parse(a);
    const name=baseName(x.name)+'.'+x.format,data=x.format==='csv'?sheetToCsv(x.sheets[0],x.delimiter):await sheetsToXlsx(x.sheets);
    return JSON.stringify({...await saveFile(name,data,r.agent_id,r.callId),sheets:x.sheets.length,rows:x.sheets.reduce((n,s)=>n+s.rows.length,0)});}},
  {name:'create_pdf',description:'Cria um PDF (A4, com numeração de páginas) a partir de Markdown: # ## ### títulos, parágrafos, listas com - ou 1., tabelas com |, **negrito**, *itálico*, e --- para nova página.',parameters:object({name:str,title:str,markdown:str},['name','markdown']),write:false,
   execute:async(a,r)=>{const x=z.object({name:z.string().min(1).max(150),title:z.string().max(200).optional(),markdown:z.string().min(1).max(200000)}).parse(a);
    return JSON.stringify(await saveFile(baseName(x.name)+'.pdf',await markdownToPdf(x.title,x.markdown),r.agent_id,r.callId));}},
  {name:'create_docx',description:'Cria um documento Word (.docx) a partir de Markdown, com os mesmos recursos do create_pdf (títulos, listas, tabelas, negrito, --- para nova página). Bom quando o usuário vai editar o texto.',parameters:object({name:str,title:str,markdown:str},['name','markdown']),write:false,
   execute:async(a,r)=>{const x=z.object({name:z.string().min(1).max(150),title:z.string().max(200).optional(),markdown:z.string().min(1).max(200000)}).parse(a);
    return JSON.stringify(await saveFile(baseName(x.name)+'.docx',await markdownToDocx(x.title,x.markdown),r.agent_id,r.callId));}},
  {name:'create_presentation',description:'Cria uma apresentação PowerPoint (.pptx, 16:9): capa com título e subtítulo e um slide por item, com tópicos (até dois níveis: comece o subtópico com "  - "), tabela, imagem da biblioteca (imageId, por exemplo de generate_image) e anotações do apresentador. color é a cor de destaque (#rrggbb).',
   parameters:object({name:str,title:str,subtitle:str,color:str,slides:{type:'array',items:object({title:str,bullets:{type:'array',items:str},table:object({columns:{type:'array',items:str},rows:{type:'array',items:{type:'array',items:str}}},['columns','rows']),imageId:str,notes:str},['title'])}},['name','title','slides']),write:false,
   execute:async(a,r)=>{const x=z.object({name:z.string().min(1).max(150),title:z.string().min(1).max(200),subtitle:z.string().max(300).optional(),color:z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
     slides:z.array(z.object({title:z.string().min(1).max(200),bullets:z.array(z.string().max(500)).max(12).optional(),table:z.object({columns:z.array(z.string().max(100)).min(1).max(8),rows:z.array(z.array(z.string().max(300)).max(8)).max(30)}).optional(),imageId:z.string().uuid().optional(),notes:z.string().max(4000).optional()})).min(1).max(60)}).parse(a);
    return JSON.stringify({...await saveFile(baseName(x.name)+'.pptx',await slidesToPptx(x),r.agent_id,r.callId),slides:x.slides.length+1});}},
 ];
}
