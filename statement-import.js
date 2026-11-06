/**
 * Client-side, explicit-review credit-card statement inbox.
 * Never sends data to third parties, never changes legacy transactions.
 * Only supported sanitized JSON generated from reviewed PDF/XLSX statements.
 */
const idPattern=/^[a-zA-Z0-9_-]{1,64}$/;
const monthPattern=/^20\d{2}-(0[1-9]|1[0-2])$/;
const datePattern=/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const validMoney=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1e12;
const cleanText=(x,max)=>typeof x==="string"?x.replace(/[\u0000-\u001f]/g," ").trim().slice(0,max):"";
const goodDate=(x)=>x===null || (typeof x==="string"&&datePattern.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z")));
export const statementTypes=["purchase","refund","payment","interest","tax","transfer"];
export function normalizeStatementBundle(raw){
  if(!raw||raw.format!=="butceapp-statement-review-v1"||!Array.isArray(raw.statements)||raw.statements.length<1||raw.statements.length>20)throw Error("Desteklenmeyen ekstre paketi");
  const ids=new Set(),statements=raw.statements.map(s=>{
    if(!s||typeof s.id!=="string"||!idPattern.test(s.id)||ids.has(s.id)||
       !Array.isArray(s.transactions)||s.transactions.length>1600||
       !validMoney(s.balance)||!validMoney(s.minimum)||
       (s.minimum>s.balance+0.02)||!goodDate(s.statementDate??null)||
       !goodDate(s.dueDate??null)||
       (s.periodLabel!=null&&!monthPattern.test(s.periodLabel)))throw Error("Ekstre özetinde hata: "+(s?.id||"bilinmiyor"));
    ids.add(s.id);
    const txIds=new Set();
    const transactions=s.transactions.map(t=>{
      if(!t||typeof t.id!=="string"||!idPattern.test(t.id)||txIds.has(t.id)||
         !datePattern.test(t.date)||!validMoney(t.amount)||
         !statementTypes.includes(t.type)||typeof t.description!=="string")throw Error("Geçersiz ekstre işlemi");
      txIds.add(t.id);
      const current=t.installmentCurrent==null?null:Number(t.installmentCurrent);
      const total=t.installmentTotal==null?null:Number(t.installmentTotal);
      const remaining=t.remainingInstallments==null?null:Number(t.remainingInstallments);
      if([current,total,remaining].some(v=>v!=null&&(!Number.isInteger(v)||v<0||v>120))||
         (current!=null&&total!=null&&current>total))throw Error("Geçersiz taksit detayı");
      return {id:t.id,date:t.date,description:cleanText(t.description,160),
        amount:Math.round(t.amount*100)/100,type:t.type,
        category:["purchase","refund"].includes(t.type)?cleanText(t.category||"Diğer",90):null,
        installmentCurrent:current,installmentTotal:total,remainingInstallments:remaining};
    });
    const value=(v)=>v==null?null:(validMoney(v)?Math.round(v*100)/100:(()=>{throw Error("Geçersiz ekstre tutarı")})());
    return {id:s.id,bank:cleanText(s.bank,65),cardLabel:cleanText(s.cardLabel,100),
      statementDate:s.statementDate||null,periodLabel:s.periodLabel||null,
      dueDate:s.dueDate||null,balance:value(s.balance),minimum:value(s.minimum),
      previousBalance:value(s.previousBalance),periodSpending:value(s.periodSpending),
      remainingInstallmentsTotal:value(s.remainingInstallmentsTotal),transactions};
  });
  return {version:1,statements};
}
export function mergeStatementInbox(existing,incoming){
  const current=existing?.version===1&&Array.isArray(existing.statements)?existing.statements:[];
  const used=new Set(current.map(s=>s.id)),added=[],skipped=[];
  const result=current.map(s=>structuredClone(s));
  for(const st of incoming.statements){
    if(used.has(st.id)){skipped.push(st.id);continue;}
    result.push(structuredClone(st));used.add(st.id);added.push(st.id);
  }
  if(result.length>80)throw Error("Ekstre arşivi sınırı aşıldı");
  return {inbox:{version:1,statements:result},added,skipped};
}
export function reconcileStatement(st){
  const sums={purchase:0,refund:0,payment:0,interest:0,tax:0,transfer:0};
  for(const tx of st.transactions)sums[tx.type]+=tx.amount;
  for(const key of Object.keys(sums))sums[key]=Math.round(sums[key]*100)/100;
  const periodCalculated=Math.round((sums.purchase-sums.refund+sums.interest+sums.tax+sums.transfer)*100)/100;
  const gap=st.periodSpending==null?null:Math.round((periodCalculated-st.periodSpending)*100)/100;
  return {counts:st.transactions.length,sums,periodCalculated,gap,reconciled:gap!==null&&Math.abs(gap)<=0.01};
}
function nextMonth(month){
  const [y,m]=month.split("-").map(Number);
  const d=new Date(Date.UTC(y,m,1));
  return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
}
export function statementPlanMonth(st){
  if(st.dueDate)return st.dueDate.slice(0,7);
  const closing=st.statementDate?.slice(0,7)||st.periodLabel;
  return closing?nextMonth(closing):null;
}
export function suggestStatementInstallments(st,cardId,existing=[]){
  if(!idPattern.test(cardId))throw Error("Geçersiz kart");
  const closing=st.statementDate?.slice(0,7)||st.periodLabel;
  if(!closing)return [];
  const startMonth=nextMonth(closing);
  const known=new Set(existing.map(v=>v.id));
  return st.transactions.filter(t=>t.type==="purchase"&&t.remainingInstallments>0)
    .map(t=>({id:"inst_"+t.id,name:t.description.slice(0,100),cardId,amount:t.amount,
      startMonth,count:t.remainingInstallments,active:true}))
    .filter(item=>!known.has(item.id));
}
