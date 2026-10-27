import Swal from 'sweetalert2';
// All dialogs go through SweetAlert2 (never native alert/confirm/prompt), styled with the app's buttons and theme.
// An open modal (Radix) blocks clicks and focus outside itself, so the dialog renders inside the topmost one.
const topModal=()=>[...document.querySelectorAll<HTMLElement>('.modal[data-state="open"]')].at(-1);
const base=()=>Swal.mixin({target:topModal()||'body',theme:document.documentElement.dataset.theme==='light'?'light':'dark',buttonsStyling:false,reverseButtons:true,customClass:{popup:'swal-cell',confirmButton:'primary',cancelButton:'secondary',denyButton:'danger'}});
export async function confirmDialog(title:string,text?:string,{confirm='Confirmar',danger=false}:{confirm?:string;danger?:boolean}={}){
 const r=await base().fire({title,text,icon:danger?'warning':'question',showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',focusCancel:danger,customClass:{popup:'swal-cell',confirmButton:danger?'danger':'primary',cancelButton:'secondary'}});
 return r.isConfirmed;
}
export async function promptDialog(title:string,{value='',placeholder='',confirm='Salvar',text,required='Informe um nome.'}:{value?:string;placeholder?:string;confirm?:string;text?:string;required?:string}={}){
 const r=await base().fire({title,text,input:'text',inputValue:value,inputPlaceholder:placeholder,showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',inputValidator:v=>v.trim()?null:required});
 return r.isConfirmed?String(r.value).trim():null;
}
export function alertDialog(title:string,text?:string,icon:'success'|'error'|'info'|'warning'='info'){return base().fire({title,text,icon,confirmButtonText:'Ok'});}
