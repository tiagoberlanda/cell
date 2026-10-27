import {useEffect,useRef,useState} from 'react';
import {Volume2,Square} from 'lucide-react';
const MAX_SECONDS=300;
// Formats the server accepts, in order of preference (Chrome/Android record WebM/Opus; Safari records MP4/AAC).
const formats:[string,string][]=[['audio/webm;codecs=opus','webm'],['audio/webm','webm'],['audio/mp4','m4a'],['audio/ogg;codecs=opus','ogg']];
export const canRecord=()=>typeof window!=='undefined'&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined';
export type Recording={blob:Blob;ext:string};
// Microphone recorder: start, then stop (returns the audio) or cancel. Stops by itself after 5 minutes.
export function useRecorder(onAutoStop:(r:Recording)=>void){
 const [seconds,setSeconds]=useState(0),[recording,setRecording]=useState(false);
 const rec=useRef<{recorder:MediaRecorder;stream:MediaStream;chunks:Blob[];ext:string;timer:ReturnType<typeof setInterval>;done?:(r:Recording|null)=>void}|null>(null);
 const finish=(keep:boolean)=>new Promise<Recording|null>(resolve=>{const r=rec.current;if(!r)return resolve(null);r.done=resolve;clearInterval(r.timer);r.recorder.onstop=()=>{r.stream.getTracks().forEach(t=>t.stop());const out=keep&&r.chunks.length?{blob:new Blob(r.chunks,{type:r.recorder.mimeType.split(';')[0]}),ext:r.ext}:null;rec.current=null;setRecording(false);setSeconds(0);resolve(out);};if(r.recorder.state!=='inactive')r.recorder.stop();else r.recorder.onstop?.(new Event('stop'));});
 const start=async()=>{
  if(!canRecord())throw new Error('Este navegador não permite gravar áudio.');
  if(!window.isSecureContext)throw new Error('Gravar áudio exige HTTPS confiável. Use o domínio público.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).catch((e:any)=>{throw new Error(e?.name==='NotAllowedError'?'Permissão do microfone negada. Libere o microfone para este site.':'Não foi possível acessar o microfone.');});
  const [mimeType,ext]=formats.find(([m])=>MediaRecorder.isTypeSupported(m))||['','webm'];
  const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined),chunks:Blob[]=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(1000);
  let s=0;const timer=setInterval(()=>{s++;setSeconds(s);if(s>=MAX_SECONDS)finish(true).then(r=>{if(r)onAutoStop(r);});},1000);
  rec.current={recorder,stream,chunks,ext,timer};setSeconds(0);setRecording(true);
 };
 useEffect(()=>()=>{if(rec.current){clearInterval(rec.current.timer);rec.current.stream.getTracks().forEach(t=>t.stop());}},[]);
 return {recording,seconds,start,stop:()=>finish(true),cancel:()=>finish(false).then(()=>undefined)};
}
export const clock=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

// Browser speech for audio replies when the server has no working voice model.
const plain=(t:string)=>t.replace(/```[\s\S]*?```/g,' ').replace(/[*_#>`|~]+/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
export const canSpeak=()=>typeof window!=='undefined'&&'speechSynthesis' in window;
export function speak(text:string,onEnd?:()=>void){
 if(!canSpeak())return false;const synth=window.speechSynthesis;synth.cancel();
 const u=new SpeechSynthesisUtterance(plain(text).slice(0,4000));u.lang='pt-BR';
 const voice=synth.getVoices().find(v=>v.lang==='pt-BR')||synth.getVoices().find(v=>v.lang.startsWith('pt'));if(voice)u.voice=voice;
 u.onend=()=>onEnd?.();u.onerror=()=>onEnd?.();synth.speak(u);return true;
}
export const stopSpeaking=()=>{if(canSpeak())window.speechSynthesis.cancel();};
export function SpeakButton({text}:{text:string}){
 const [on,setOn]=useState(false);
 useEffect(()=>()=>{if(on)stopSpeaking();},[on]);
 if(!canSpeak())return null;
 return <button className="speak-button" onClick={()=>{if(on){stopSpeaking();setOn(false);}else if(speak(text,()=>setOn(false)))setOn(true);}}>{on?<Square size={13} fill="currentColor"/>:<Volume2 size={15}/>}{on?'Parar':'Ouvir resposta'}</button>;
}
