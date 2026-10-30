export type LinkAttachment={id:string;name:string};
export type ResolvedMessageLink={kind:'download'|'external';href:string}|{kind:'unavailable';notice:string};
// Only canonical file IDs, never paths or URL-normalized traversal, reach the download endpoint.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const fileId=new RegExp('^'+uuid+'$','i');
const download=new RegExp('^/api/files/('+uuid+')(?:\\?inline=1)?$','i');
export function resolveMessageLink(href:string|undefined,label:string,attachments:readonly LinkAttachment[]=[]):ResolvedMessageLink{
 const raw=href||'',match=download.exec(raw);
 if(match)return {kind:'download',href:'/api/files/'+match[1]};
 // Absolute web URLs are the only non-download destinations. No protocol-relative URLs,
 // credentials, backslashes or control characters (which browsers normalize unexpectedly).
 if(/^https?:\/\//i.test(raw)&&!/[\\\s\u0000-\u001f\u007f]/.test(raw)){
  try{const url=new URL(raw);if(url.hostname&&!url.username&&!url.password)return {kind:'external',href:url.href};}catch{/* unavailable */}
 }
 // Historical answers sometimes linked a host/sandbox path. Resolve the visible filename
 // only within this message's real attachments, and reject ambiguous duplicate names.
 const matches=attachments.filter(f=>f.name===label.trim()&&fileId.test(f.id));
 if(matches.length===1)return {kind:'download',href:'/api/files/'+matches[0].id};
 return {kind:'unavailable',notice:'Arquivo indisponível neste link. Use o download do anexo. Se o arquivo está apenas no computador ou sandbox, ele precisa ser importado e anexado ao Cell.'};
}
