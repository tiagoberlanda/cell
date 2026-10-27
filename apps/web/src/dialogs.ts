import Swal from 'sweetalert2';
// All dialogs go through SweetAlert2 (never native alert/confirm/prompt), styled with the app's buttons and theme.
const base=()=>Swal.mixin({theme:document.documentElement.dataset.theme==='light'?'light':'dark',buttonsStyling:false,reverseButtons:true,customClass:{popup:'swal-cell',confirmButton:'primary',cancelButton:'secondary',denyButton:'danger'}});
export async function confirmDialog(title:string,text?:string,{confirm='Confirmar',danger=false}:{confirm?:string;danger?:boolean}={}){
 const r=await base().fire({title,text,icon:danger?'warning':'question',showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',focusCancel:danger,customClass:{popup:'swal-cell',confirmButton:danger?'danger':'primary',cancelButton:'secondary'}});
 return r.isConfirmed;
}
export async function promptDialog(title:string,{value='',placeholder='',confirm='Salvar'}:{value?:string;placeholder?:string;confirm?:string}={}){
 const r=await base().fire({title,input:'text',inputValue:value,inputPlaceholder:placeholder,showCancelButton:true,confirmButtonText:confirm,cancelButtonText:'Cancelar',inputValidator:v=>v.trim()?null:'Informe um nome.'});
 return r.isConfirmed?String(r.value).trim():null;
}
export function alertDialog(title:string,text?:string,icon:'success'|'error'|'info'|'warning'='info'){return base().fire({title,text,icon,confirmButtonText:'Ok'});}
