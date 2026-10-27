import {useEffect,useRef,useState} from 'react';
import {Volume2,Square} from 'lucide-react';
import {ttsVoices} from '../../../packages/shared/src/index';
const MAX_SECONDS=300;
// Formats the server accepts, in order of preference (Chrome/Android record WebM/Opus; Safari records MP4/AAC).
const formats:[string,string][]=[['audio/webm;codecs=opus','webm'],['audio/webm','webm'],['audio/mp4','m4a'],['audio/ogg;codecs=opus','ogg']];
// Best supported recording format as [mimeType, file extension] (empty mimeType: the browser's default).
export const recordingFormat=():[string,string]=>formats.find(([m])=>MediaRecorder.isTypeSupported(m))||['','webm'];
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
  const [mimeType,ext]=recordingFormat();
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
 const chosen=deviceVoiceName(),all=synth.getVoices();
 const voice=(chosen&&all.find(v=>v.name===chosen))||all.find(v=>v.lang==='pt-BR')||all.find(v=>v.lang.startsWith('pt'));if(voice)u.voice=voice;
 u.onend=()=>onEnd?.();u.onerror=()=>onEnd?.();synth.speak(u);return true;
}
// The device voice is chosen per device (voices differ between phone and computer), so it lives in this browser only.
const DEVICE_VOICE='cell.deviceVoice';
export const deviceVoiceName=()=>{try{return localStorage.getItem(DEVICE_VOICE)||'';}catch{return '';}};
function useDeviceVoices(){
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 useEffect(()=>{if(!canSpeak())return;const synth=window.speechSynthesis,load=()=>setVoices(synth.getVoices());load();synth.addEventListener('voiceschanged',load);return()=>synth.removeEventListener('voiceschanged',load);},[]);
 return voices;
}
export function DeviceVoicePicker(){
 const voices=useDeviceVoices(),[name,setName]=useState(deviceVoiceName());
 if(!canSpeak())return null;
 const sorted=[...voices].sort((a,b)=>Number(b.lang.startsWith('pt'))-Number(a.lang.startsWith('pt'))||a.name.localeCompare(b.name));
 return <div className="stack voice-device"><label>Voz do aparelho (quando não há modelo de voz)<select aria-label="Voz do aparelho" value={name} onChange={e=>{setName(e.target.value);try{localStorage.setItem(DEVICE_VOICE,e.target.value);}catch{}}}><option value="">Automática (português)</option>{sorted.map(v=><option key={v.voiceURI} value={v.name}>{v.name} · {v.lang}</option>)}</select></label><div className="row wrap"><button type="button" className="secondary" onClick={()=>speak('Olá! Esta é a voz deste aparelho.')}>Ouvir voz do aparelho</button><span className="hint">Vale só para este aparelho.</span></div></div>;
}
// Voice for a text-to-speech model: known voices for the model family, the model's default, or a name typed by hand.
export function VoicePicker({label,model,value,onChange}:{label:string;model:string;value:string;onChange:(v:string)=>void}){
 const voices=ttsVoices(model),[custom,setCustom]=useState(!!value&&!voices.some(v=>v.id===value));
 return <label>{label}<select aria-label={label} value={custom?'__custom':value} disabled={!model} onChange={e=>{if(e.target.value==='__custom'){setCustom(true);onChange('');}else{setCustom(false);onChange(e.target.value);}}}><option value="">{model?'Padrão do modelo':'Escolha um modelo de voz'}</option>{voices.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}<option value="__custom">Outra (digitar)…</option></select>{custom&&<input aria-label={label+': nome da voz'} value={value} placeholder="Nome ou ID da voz" onChange={e=>onChange(e.target.value.trim())}/>}</label>;
}
export const stopSpeaking=()=>{if(canSpeak())window.speechSynthesis.cancel();};
export function SpeakButton({text}:{text:string}){
 const [on,setOn]=useState(false);
 useEffect(()=>()=>{if(on)stopSpeaking();},[on]);
 if(!canSpeak())return null;
 return <button className="speak-button" onClick={()=>{if(on){stopSpeaking();setOn(false);}else if(speak(text,()=>setOn(false)))setOn(true);}}>{on?<Square size={13} fill="currentColor"/>:<Volume2 size={15}/>}{on?'Parar':'Ouvir resposta'}</button>;
}
