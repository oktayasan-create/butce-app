/**
 * Safe, explicit statement-to-cashflow bridge.
 * A statement is a verified snapshot for its PAYMENT (due) month. Purchased
 * installments that are still outstanding start in the NEXT PAYMENT month.
 * It never imports purchases as new monthly cardSpends (avoids double counting).
 */
import {advanceMonth,validCashFlowPlan,monthlyCardRate} from "./cashflow-model.js";

function fingerprint(str){
  let hash=2166136261;
  for(let i=0;i<str.length;i++){
    hash=Math.imul(hash^str.charCodeAt(i),16777619)>>>0;
  }
  return hash.toString(36);
}
function nonnegativeNumber(value){return typeof value==="number"&&Number.isFinite(value)&&value>=0;}
const monthPattern=/^20\d{2}-(0[1-9]|1[0-2])$/;
export function statementDueMonth(st){
  if(st?.dueDate&&monthPattern.test(st.dueDate.slice(0,7)))return st.dueDate.slice(0,7);
  if(st?.statementDate&&monthPattern.test(st.statementDate.slice(0,7))){
    // If a due date is not in the PDF, do not silently assume the due month.
    return null;
  }
  return null;
}
export function statementInstallmentSchedule(st,cardId){
  const dueMonth=statementDueMonth(st);
  if(!dueMonth)throw Error("Ekstre son ödeme tarihi eksik. Önce onu düzelt.");
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(cardId))throw Error("Geçersiz kart eşlemesi");
  const begin=advanceMonth(dueMonth,1);
  const rows=[];
  for(const tx of st.transactions||[]){
    if(tx.type!=="purchase" || !(tx.remainingInstallments>0)||!(tx.amount>0))continue;
    if(!Number.isInteger(tx.remainingInstallments)||tx.remainingInstallments>120)continue;
    rows.push({
      id:"stmt_"+fingerprint(st.id+"|"+tx.id+"|"+cardId),
      name:tx.description.slice(0,100),cardId,amount:Math.round(tx.amount*100)/100,
      startMonth:begin,count:tx.remainingInstallments,active:true,
      sourceKind:"statement",sourceStatementId:st.id,sourceStatementDate:st.statementDate,
      sourceTxId:tx.id
    });
  }
  return rows;
}
export function calculateInstallmentTimeline(items){
  const months={};
  for(const row of items){
    for(let k=0;k<row.count;k++){
      const month=advanceMonth(row.startMonth,k);
      months[month]=Math.round(((months[month]||0)+row.amount)*100)/100;
    }
  }
  return Object.entries(months).sort(([a],[b])=>a.localeCompare(b)).map(([month,amount])=>({month,amount}));
}
export function prepareStatementPlan(sourcePlan,st,options={}){
  const p=structuredClone(sourcePlan);
  if(!validCashFlowPlan(p))throw Error("Mevcut nakit planında geçersiz alan var.");
  if(!st||!nonnegativeNumber(st.balance)||!nonnegativeNumber(st.minimum)||
    st.minimum>st.balance+0.01||!Array.isArray(st.transactions))throw Error("Ekstre tutarları hatalı.");
  const dueMonth=statementDueMonth(st);
  if(!dueMonth)throw Error("Ekstre son ödeme tarihi gerekiyor. İnceleme ekranına tarih gir.");
  let cardId=options.cardId;
  const creating=cardId==="__new";
  let card=p.cards.find(c=>c.id===cardId);
  if(creating){
    const label=String(options.newCardName||st.cardLabel||"").trim();
    if(!label||label.length>90)throw Error("Yeni kart adını gir.");
    if(p.cards.length>=24)throw Error("Kart sınırına ulaşıldı.");
    cardId="card_"+fingerprint(st.id+"|"+label);
    card=p.cards.find(c=>c.id===cardId);
    if(!card){
      const approximatePct=st.balance>0?(st.minimum/st.balance)*100:40;
      card={
        id:cardId,name:label,active:true,openingDebt:0,
        minPct:approximatePct>=30?40:20,interestPct:monthlyCardRate(st.balance,{interestMode:"auto"}),
        interestMode:"auto"
      };
      p.cards.push(card);
    }
  }
  if(!card)throw Error("Ekstreyi bağlayacağın kartı seç.");
  if(!card.active)card.active=true;
  if(p.statementSnapshots.some(x=>x.id===st.id&&x.cardId!==cardId))
    throw Error("Bu ekstre başka bir karta bağlanmış.");
  const newer=p.statementSnapshots.filter(x=>x.cardId===cardId && x.dueMonth>dueMonth);
  if(newer.length)throw Error("Bu kart için daha yeni bir ekstre zaten uygulandı. Daha eski ekstreyle tahmini değiştirme.");
  // Remove only older generated future items for this card, never manually
  // created installments or a second card's obligations.
  const pruned=p.installments.filter(i=>
    i.cardId===cardId&&i.sourceKind==="statement" &&
    (!i.sourceStatementDate || i.sourceStatementDate<=st.statementDate));
  p.installments=p.installments.filter(i=>!pruned.includes(i));
  const scheduled=statementInstallmentSchedule(st,cardId);
  if(p.installments.length+scheduled.length>250)throw Error("Taksit sınırına ulaşıldı.");
  p.installments.push(...scheduled.filter(i=>!p.installments.some(x=>x.id===i.id)));
  p.statementSnapshots=p.statementSnapshots.filter(x=>!(x.cardId===cardId&&x.dueMonth===dueMonth));
  p.statementSnapshots.push({
    id:"snapshot_"+fingerprint(st.id+"|"+cardId),
    cardId,dueMonth,statementDate:st.statementDate||null,
    balance:Math.round(st.balance*100)/100,minimum:Math.round(st.minimum*100)/100,
    sourceStatementId:st.id
  });
  // A previous user-defined minimum override must not obscure the bank's
  // verified minimum. Override with it, while preserving all other months.
  if(!p.months[dueMonth])p.months[dueMonth]={income:0,fixedCash:0,otherCash:0,cardSpends:{},minOverrides:{}};
  if(!p.months[dueMonth].minOverrides)p.months[dueMonth].minOverrides={};
  const oldMinimum=p.months[dueMonth].minOverrides[cardId];
  p.months[dueMonth].minOverrides[cardId]=Math.round(st.minimum*100)/100;
  if(!validCashFlowPlan(p))throw Error("Ekstre aktarımı sonrası plan doğrulanamadı.");
  const timeline=calculateInstallmentTimeline(scheduled);
  const remainingSum=Math.round(scheduled.reduce((sum,i)=>sum+i.amount*i.count,0)*100)/100;
  const reference=nonnegativeNumber(st.remainingInstallmentsTotal)?st.remainingInstallmentsTotal:null;
  const diff=reference===null?null:Math.round((remainingSum-reference)*100)/100;
  const warnings=[];
  if(dueMonth<p.startMonth||dueMonth>advanceMonth(p.startMonth,11))
    warnings.push("Ekstre ödeme ayı mevcut 12 aylık plan penceresinin dışında; plan başlangıcını kontrol et.");
  if(diff!==null&&Math.abs(diff)>1)
    warnings.push("Ekstredeki kalan taksit toplamı ile hesaplanan tutar uyuşmuyor; taksit satırlarını kontrol et.");
  if(p.installments.some(i=>i.cardId===cardId&&!i.sourceKind&&scheduled.some(n=>i.name===n.name&&
    i.startMonth===n.startMonth&&Math.abs(i.amount-n.amount)<0.02)))
    warnings.push("Elle eklediğin bir taksit, ekstredeki taksitle aynı görünüyor. İkinci kez sayılmadığından emin ol.");
  return {plan:p,cardId,cardName:card.name,dueMonth,
    statementBalance:st.balance,statementMinimum:st.minimum,
    existingMinimum:oldMinimum??null,createdCard:creating,
    installmentsAdded:scheduled.length,
    replacedInstallments:pruned.length,
    remainingSum,reference,diff,timeline,warnings};
}
