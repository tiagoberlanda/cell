import Swal from 'sweetalert2';
// All dialogs go through SweetAlert2 (never native alert/confirm/prompt), styled with the app's buttons and theme.
// An open modal (Radix) blocks clicks and focus outside itself, so the dialog renders inside the topmost one.
const topModal=()=>[...document.querySelectorAll<HTMLElement>('.modal[data-state="open"]')].at(-1);
// A dropdown that just closed may still mark the page aria-hidden while it unmounts; SweetAlert would save that as
// the page's own state and put it back on close, leaving the app hidden from screen readers. Wait for it to go.
async function menusClosed(){for(let i=0;i<20&&document.querySelector('[data-radix-popper-content-wrapper]');i++)await new Promise(r=>setTimeout(r,25));}
const base=()=>Swal.mixin({target:topModal()||'body',theme:document.documentElement.dataset.theme==='light'?'light':'dark',buttonsStyling:false,reverseButtons:true,customClass:{popup:'swal-cell',confirmButton:'primary',cancelButton:'secondary',denyButton:'danger'}});
export async function confirmDialog(title:string,text?:string,{confirm='Confirmar',danger=false}:{confirm?:string;danger?:boolean}={}){
 await menusClosed();const r=await base().fire({title,text,icon:danger?'warning':'question',showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',focusCancel:danger,customClass:{popup:'swal-cell',confirmButton:danger?'danger':'primary',cancelButton:'secondary'}});
 return r.isConfirmed;
}
export async function promptDialog(title:string,{value='',placeholder='',confirm='Salvar',text,required='Informe um nome.',type='text'}:{value?:string;placeholder?:string;confirm?:string;text?:string;required?:string;type?:'text'|'password'}={}){
 await menusClosed();const r=await base().fire({title,text,input:type,inputAttributes:type==='password'?{autocomplete:'current-password'}:{},inputValue:value,inputPlaceholder:placeholder,showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',inputValidator:v=>v.trim()?null:required});
 return r.isConfirmed?String(r.value).trim():null;
}
export async function selectDialog(title:string,{options,value='',confirm='Confirmar'}:{options:Record<string,string>;value?:string;confirm?:string}){
 await menusClosed();const r=await base().fire({title,input:'select',inputOptions:options,inputValue:value,showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar'});
 return r.isConfirmed?String(r.value):null;
}
export async function alertDialog(title:string,text?:string,icon:'success'|'error'|'info'|'warning'='info'){await menusClosed();return base().fire({title,text,icon,confirmButtonText:'Ok'});}
