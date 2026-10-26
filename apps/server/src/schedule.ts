import { CronExpressionParser } from 'cron-parser';
export function nextOccurrence(kind:string,schedule:string,timezone:string,after=new Date()):Date|null{
 new Intl.DateTimeFormat('pt-BR',{timeZone:timezone}).format();
 if(kind==='once'){const d=new Date(schedule);if(!Number.isFinite(d.getTime()))throw new Error('Data inválida.');return d>after?d:null;}
 let expression=schedule;
 if(kind==='daily'){if(!/^\d{2}:\d{2}$/.test(schedule))throw new Error('Use HH:mm.');const [h,m]=schedule.split(':').map(Number);expression=`${m} ${h} * * *`;}
 if(kind==='weekly'){if(!/^[0-6] \d{2}:\d{2}$/.test(schedule))throw new Error('Use dia HH:mm (domingo=0).');const [day,time]=schedule.split(' '),[h,m]=time.split(':').map(Number);expression=`${m} ${h} * * ${day}`;}
 return CronExpressionParser.parse(expression,{currentDate:after,tz:timezone,strict:false}).next().toDate();
}
