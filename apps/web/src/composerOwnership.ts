// A visit is an identity, not just an ID: leaving and returning must invalidate work.
export type ChatVisit={selected:string|null;conversation:string|null};
export class ComposerOwnership {
 visit:ChatVisit;
 revision=0;
 private operation:object|null=null;
 constructor(selected:string|null,conversation:string|null){this.visit={selected,conversation};}
 select(selected:string|null,conversation:string|null){
  if(this.visit.selected===selected&&this.visit.conversation===conversation)return false;
  this.visit={selected,conversation};this.revision++;this.operation=null;return true;
 }
 owns(visit:ChatVisit){return this.visit===visit;}
 // A first send may create the conversation without invalidating its own work or newer typing.
 adopt(visit:ChatVisit,conversation:string){if(!this.owns(visit))return false;visit.conversation=conversation;return true;}
 edit(){this.revision++;}
 checkpoint(){return {visit:this.visit,revision:this.revision};}
 unchanged(point:{visit:ChatVisit;revision:number}){return this.owns(point.visit)&&this.revision===point.revision;}
 begin(){const token={};this.operation=token;return token;}
 finish(token:object){if(this.operation!==token)return false;this.operation=null;return true;}
 get busy(){return this.operation!==null;}
}
