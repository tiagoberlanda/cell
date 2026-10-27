import {useCallback,useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {PhoneOff,Mic,MicOff,Send,Square} from 'lucide-react';
import {stripThinking,type Agent} from '../../../packages/shared/src/index';
import {CellAvatar} from './CellAvatar';
import {speak,stopSpeaking,clock,recordingFormat} from './Voice';

export type CallTurn={run:string;transcript:string;baseline:Set<string>};
type Phase='connecting'|'listening'|'hearing'|'sending'|'thinking'|'speaking';
const phaseLabels:Record<Phase,string>={connecting:'Conectando…',listening:'Ouvindo',hearing:'Ouvindo você…',sending:'Enviando…',thinking:'Pensando…',speaking:'Falando'};
// Voice activity: speech starts above the (adaptive) noise floor and ends after this much silence.
const SILENCE_MS=1300,MAX_TURN_MS=60000,IDLE_RESTART_MS=30000;
const preview=(text:string)=>{const t=stripThinking(text).replace(/```[\s\S]*?```/g,' ').replace(/[*_#>`|~]+/g,'').replace(/\s+/g,' ').trim();return t.length>220?t.slice(0,220)+'…':t;};

// Hands-free conversation: listens, sends each spoken turn when you pause, shows the agent thinking and plays the reply
// (voice model audio, or the device voice), then listens again. Half duplex, so the agent never hears itself.
export function VoiceCall({agent,messages,runs,send,onClose}:{agent:Agent;messages:any[];runs:any[];send:(blob:Blob,ext:string)=>Promise<CallTurn>;onClose:()=>void}){
 const [phase,setPhase]=useState<Phase>('connecting'),[muted,setMuted]=useState(false),[level,setLevel]=useState(0),[heard,setHeard]=useState(''),[said,setSaid]=useState(''),[error,setError]=useState(''),[seconds,setSeconds]=useState(0);
 const live=useRef({phase:'connecting' as Phase,muted:false,closed:false,spoke:false,lastVoice:0,startedAt:0,floor:0.01,chunks:[] as Blob[],ext:'webm',mime:'',
  stream:null as MediaStream|null,ctx:null as AudioContext|null,analyser:null as AnalyserNode|null,recorder:null as MediaRecorder|null,audio:null as HTMLAudioElement|null,wait:null as CallTurn|null,wake:null as any,timer:0,clock:0});
 const sendRef=useRef(send);sendRef.current=send;
 const go=(p:Phase)=>{live.current.phase=p;setPhase(p);};

 const stopRecorder=()=>{const r=live.current.recorder;live.current.recorder=null;if(r&&r.state!=='inactive'){r.onstop=null;r.stop();}};
 const listen=useCallback(()=>{
  const s=live.current;if(s.closed||!s.stream)return;stopRecorder();
  s.chunks=[];s.spoke=false;s.startedAt=Date.now();go('listening');if(s.muted)return;
  const recorder=new MediaRecorder(s.stream,s.mime?{mimeType:s.mime}:undefined);
  recorder.ondataavailable=e=>{if(e.data.size)s.chunks.push(e.data);};recorder.start(250);s.recorder=recorder;
 },[]);
 // Ends the current turn: sends what was said (or, with nothing said, just keeps listening).
 const finishTurn=useCallback((force=false)=>{
  const s=live.current,recorder=s.recorder;if(!recorder||!['listening','hearing'].includes(s.phase))return;
  if(!s.spoke&&!force){listen();return;}
  s.recorder=null;go('sending');
  recorder.onstop=async()=>{
   const blob=new Blob(s.chunks,{type:(recorder.mimeType||'audio/webm').split(';')[0]});
   if(s.closed)return;if(blob.size<2000){setError('Não ouvi nada. Pode falar de novo.');listen();return;}
   try{const turn=await sendRef.current(blob,s.ext);if(s.closed)return;setError('');setHeard(turn.transcript);setSaid('');s.wait=turn;go('thinking');}
   catch(e:any){if(s.closed)return;setError(e.message||'Não foi possível enviar o áudio.');listen();}
  };
  recorder.stop();
 },[listen]);

 const playReply=useCallback((reply:any)=>{
  const s=live.current;s.wait=null;setSaid(preview(reply.content||''));go('speaking');
  const done=()=>{if(!s.closed&&s.phase==='speaking')listen();};
  const file=(reply.attachments||[]).find((f:any)=>String(f.mime).startsWith('audio/'));
  if(file){const audio=new Audio('/api/files/'+file.id+'?inline=1');s.audio=audio;audio.onended=done;audio.play().catch(()=>{if(!speak(reply.content||'',done))done();});return;}
  if(!speak(stripThinking(reply.content||''),done))setTimeout(done,1500);
 },[listen]);
 const interrupt=()=>{const s=live.current;s.audio?.pause();s.audio=null;stopSpeaking();listen();};

 const hangUp=useCallback((notify=true)=>{
  const s=live.current;if(s.closed)return;s.closed=true;
  clearInterval(s.timer);clearInterval(s.clock);stopRecorder();s.audio?.pause();stopSpeaking();
  s.stream?.getTracks().forEach(t=>t.stop());s.ctx?.close().catch(()=>{});s.wake?.release?.().catch?.(()=>{});
  if(notify)onClose();
 },[onClose]);

 useEffect(()=>{
  // Per-run flag: React's development double mount must not leave the call closed or keep a stale microphone.
  const s=live.current;let cancelled=false;s.closed=false;
  (async()=>{
   try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}
    const [mime,ext]=recordingFormat();s.stream=stream;s.mime=mime;s.ext=ext;
    const ctx=new AudioContext(),analyser=ctx.createAnalyser();analyser.fftSize=1024;ctx.createMediaStreamSource(stream).connect(analyser);s.ctx=ctx;s.analyser=analyser;
    try{s.wake=await (navigator as any).wakeLock?.request('screen');}catch{}
    const buf=new Float32Array(analyser.fftSize);let smooth=0;
    s.timer=window.setInterval(()=>{
     analyser.getFloatTimeDomainData(buf);let sum=0;for(const v of buf)sum+=v*v;const rms=Math.sqrt(sum/buf.length);
     smooth=smooth*0.6+rms*0.4;setLevel(Math.min(1,smooth*12));
     if(s.muted||!['listening','hearing'].includes(s.phase))return;
     const now=Date.now(),threshold=Math.max(0.02,s.floor*3);
     if(rms>threshold){s.lastVoice=now;if(!s.spoke){s.spoke=true;go('hearing');}}
     else s.floor=s.floor*0.95+rms*0.05;
     if(s.spoke&&(now-s.lastVoice>SILENCE_MS||now-s.startedAt>MAX_TURN_MS))finishTurn();
     else if(!s.spoke&&now-s.startedAt>IDLE_RESTART_MS)listen();
    },60);
    s.clock=window.setInterval(()=>setSeconds(v=>v+1),1000);
    listen();
   }catch(e:any){if(!cancelled)setError(e?.name==='NotAllowedError'?'Permissão do microfone negada. Libere o microfone para este site.':'Não foi possível acessar o microfone.');}
  })();
  return()=>{cancelled=true;hangUp(false);};
 },[]);// eslint-disable-line react-hooks/exhaustive-deps

 // The reply is the first new assistant message after the turn was sent; a failed run ends the wait.
 useEffect(()=>{
  const s=live.current,wait=s.wait;if(!wait||s.phase!=='thinking')return;
  const reply=messages.find((m:any)=>m.role==='assistant'&&!wait.baseline.has(m.id));
  if(reply){playReply(reply);return;}
  const run=runs.find((r:any)=>r.id===wait.run);
  if(run&&['failed','cancelled'].includes(run.state)){s.wait=null;setError(run.error||'O agente não conseguiu responder.');listen();}
 },[messages,runs,playReply,listen]);

 const toggleMute=()=>{const s=live.current;s.muted=!s.muted;setMuted(s.muted);if(['listening','hearing'].includes(s.phase))listen();};
 const waitingApproval=phase==='thinking'&&runs.some((r:any)=>r.id===live.current.wait?.run&&r.state==='waiting_approval');
 const status=muted&&['listening','hearing'].includes(phase)?'Microfone desligado':waitingApproval?'Aguardando sua aprovação na conversa':phaseLabels[phase];
 return <div className="call-screen" role="dialog" aria-modal="true" aria-label={'Chamada com '+agent.name} data-phase={phase} style={{'--call-color':agent.color,'--level':muted?0:level} as CSSProperties}>
  <header className="call-top"><strong>{agent.name}</strong><span>{clock(seconds)}</span></header>
  <div className="call-stage">
   <div className="call-rings" aria-hidden="true"><span/><span/><span/></div>
   <CellAvatar shape={agent.shape} color={agent.color} state={phase==='thinking'||phase==='sending'?'running':null} size={156}/>
   {phase==='thinking'&&<div className="call-dots" aria-hidden="true"><span/><span/><span/></div>}
   {phase==='speaking'&&<div className="call-wave" aria-hidden="true">{Array.from({length:7},(_,i)=><span key={i} style={{animationDelay:`${i*0.11}s`}}/>)}</div>}
  </div>
  <p className="call-status" aria-live="polite">{status}</p>
  <div className="call-captions" aria-live="polite">{heard&&<p className="you"><span>Você</span>{heard}</p>}{said&&<p className="agent"><span>{agent.name}</span>{said}</p>}{error&&<p className="call-error">{error}</p>}</div>
  <div className="call-controls">
   <button className="call-btn" aria-pressed={muted} aria-label={muted?'Ligar microfone':'Desligar microfone'} onClick={toggleMute} disabled={phase==='connecting'}>{muted?<MicOff size={24}/>:<Mic size={24}/>}</button>
   {phase==='speaking'?<button className="call-btn" aria-label="Interromper" onClick={interrupt}><Square size={22} fill="currentColor"/></button>
    :<button className="call-btn" aria-label="Enviar agora" onClick={()=>finishTurn(true)} disabled={muted||!['listening','hearing'].includes(phase)}><Send size={22}/></button>}
   <button className="call-btn call-end" aria-label="Encerrar chamada" onClick={()=>hangUp()}><PhoneOff size={26}/></button>
  </div>
 </div>;
}
