/* Pure derivations. Missing observations stay null; coverage is explicit. */
const DAY=86400000;
export const shiftDate=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const sum=rows=>rows.reduce((v,t)=>v+t.amount,0);
export function report(s,days=7){
 const dated=s.transactions.filter(t=>Number.isFinite(t.amount)&&/^\d{4}-\d{2}-\d{2}$/.test(t.date));
 const end=s.reporting?.as_of||dated.map(t=>t.date).sort().at(-1)||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
 const start=shiftDate(end,1-days),previousEnd=shiftDate(start,-1),previousStart=shiftDate(start,-days);
 const sources=new Set(s.sources.map(x=>x.id));
 const coverage=(s.reporting?.coverage||[]).filter(c=>c.complete===true&&sources.has(c.source));
 const covered=d=>coverage.some(c=>c.start<=d&&c.end>=d);
 const segment=(from,to)=>{
  const rows=dated.filter(t=>t.date>=from&&t.date<=to),daily=[];
  for(let day=from;day<=to;day=shiftDate(day,1)){const items=rows.filter(t=>t.date===day);daily.push({date:day,value:items.length?sum(items):covered(day)?0:null,rows:items,complete:covered(day)})}
  const complete=daily.every(d=>d.complete),value=rows.length?sum(rows):complete?0:null;
  const known=rows.filter(t=>['new','returning'].includes(t.customer_type)),returning=known.filter(t=>t.customer_type==='returning');
  return {from,to,rows,daily,complete,value,count:value===null?null:rows.length,aov:rows.length?value/rows.length:null,known:known.length,returning:returning.length,repeat:known.length?returning.length/known.length:null};
 };
 const current=segment(start,end),previous=segment(previousStart,previousEnd);
 const channels=[...new Set([...current.rows,...previous.rows].map(t=>t.channel||'未分類'))].map(name=>({name,current:sum(current.rows.filter(t=>(t.channel||'未分類')===name)),previous:sum(previous.rows.filter(t=>(t.channel||'未分類')===name))})).sort((a,b)=>b.current-a.current);
 const compare=(key)=>current.complete&&previous.complete&&current[key]!==null&&previous[key]!==null?{difference:current[key]-previous[key],percent:previous[key]!==0?(current[key]-previous[key])/Math.abs(previous[key]):null}:null;
 return {days,current,previous,channels,coverage,delta:compare('value'),countDelta:compare('count'),aovDelta:compare('aov')};
}
export function transition(a,b){
 if(!a||!b||a.value==null||b.value==null)return {rate:null,loss:null,label:'還沒法算'};
 if(a.basis!=='record'||b.basis!=='record')return {rate:null,loss:null,label:'回憶待核對'};
 if(['unit','cohort','start','end'].some(k=>!a[k]||a[k]!==b[k]))return {rate:null,loss:null,label:'不同口徑'};
 if(b.value>a.value)return {rate:null,loss:null,label:'需核對前後數字'};
 return {rate:a.value>0?b.value/a.value:null,loss:a.value-b.value,label:a.value>0?'已往下一步':'本批尚無對象'};
}
export function flowSummary(flow){
 const steps=flow.steps||[],measured=steps.filter(s=>s.metric);let edges=[];
 for(let i=1;i<measured.length;i++)edges.push({from:measured[i-1],to:measured[i],...transition(measured[i-1].metric,measured[i].metric)});
 const comparable=edges.filter(e=>e.loss!==null&&e.loss>0);
 return {steps,edges,largest:comparable.sort((a,b)=>b.loss-a.loss)[0]||null,done:steps.filter(s=>s.status==='done').length};
}
