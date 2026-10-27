let csrf='';
export const setCsrf=(value:string)=>{csrf=value;};
export async function api<T=any>(url:string,method='GET',body?:unknown):Promise<T>{
 const form=body instanceof FormData;
 const response=await fetch('/api'+url,{method,credentials:'include',headers:{...(body&&!form?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},body:body?(form?body:JSON.stringify(body)):undefined});
 const data=await response.json().catch(()=>({}));if(!response.ok){const err:any=new Error(data.error||(response.status===429?'Muitas requisições. Aguarde um instante.':'Não foi possível concluir.'));err.status=response.status;throw err;}return data;
}
export function downloadText(name:string,body:string){const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
