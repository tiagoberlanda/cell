import React,{Children,isValidElement,type ReactNode} from 'react';
import Markdown,{defaultUrlTransform} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {resolveMessageLink,type LinkAttachment} from './markdown-links';
function linkText(children:ReactNode):string{
 return Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<{children?:ReactNode}>(child)?linkText(child.props.children):'').join('');
}
// Shared by saved answers and partial streaming output. Raw hrefs are inspected here,
// never passed through to the DOM unless the resolver explicitly allows them.
export function MessageMarkdown({children,attachments=[],notify}:{children:string;attachments?:readonly LinkAttachment[];notify:(message:string)=>void}){
 return <Markdown remarkPlugins={[remarkGfm]} urlTransform={(url,key)=>key==='href'?url:defaultUrlTransform(url)} components={{a:({href,children})=>{
  const link=resolveMessageLink(href,linkText(children),attachments);
  if(link.kind==='unavailable')return <button type="button" className="text-button" title={link.notice} onClick={()=>notify(link.notice)}>{children} (link indisponível)</button>;
  return link.kind==='download'?<a href={link.href} download>{children}</a>:<a href={link.href} target="_blank" rel="noopener noreferrer">{children}</a>;
 }}}>{children}</Markdown>;
}
