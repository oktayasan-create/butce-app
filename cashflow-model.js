/**
 * Personal budget / cashflow scenario engine (V2).
 * This document is private Firestore plan data, separated from legacy transactions.
 * Categorized income and expense entries are entered only here until explicitly integrated.
 * Card purchase is an expense and a liability; card repayment is NOT a second expense.
 * Forecast interest and minimums are illustrative, not credit card statements.
 */
const r2 = value => Math.round((Number(value)+Number.EPSILON)*100)/100;
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const positive = value => Math.max(0,r2(num(value)));
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const identifierPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const defaultCategories = {
  expense:[
    ['exp_market','Market'], ['exp_travel','Seyahat'], ['exp_food','Yeme / İçme'],
    ['exp_fuel','Akaryakıt'], ['exp_health','Sağlık / Bakım'],
    ['exp_clothes','Giyim / Aksesuar'], ['exp_home','Ev / Dekorasyon'],
    ['exp_ecommerce','E-Ticaret'], ['exp_entertainment','Eğlence / Hobi'],
    ['exp_tax','Vergi'], ['exp_insurance','Emeklilik / Sigorta'], ['exp_other','Diğer']
  ].map(([id,name])=>({id,name,active:true})),
  income:[
    ['inc_salary','Maaş'], ['inc_extra','Ek Gelir'], ['inc_other','Diğer Gelir']
  ].map(([id,name])=>({id,name,active:true}))
};
export function isoMonth(date = new Date()) {
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
}
export function advanceMonth(month,offset) {
  const [year,m] = String(month).split("-").map(Number);
  const d=new Date(Date.UTC(year||2026,(m||1)-1+offset,1));
  return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
}
export function emptyCashFlowPlan() {
  return {version:2,startMonth:isoMonth(),openingCash:0,autoExtra:true,reserve:0,
    cards:[],categories:structuredClone(defaultCategories),entries:[],months:{}};
}
export function normalizeCashFlowPlan(raw) {
  if(raw == null)return emptyCashFlowPlan();
  if(typeof raw!=="object" || ![1,2].includes(raw.version))throw new Error("Unsupported plan version");
  const p=structuredClone(raw);
  if(p.version===1){
    p.version=2;p.categories=structuredClone(defaultCategories);p.entries=[];
    p.cards=p.cards.map(c=>({...c,active:true}));
  }
  if(!validCashFlowPlan(p))throw new Error("Corrupt plan; cannot safely replace saved data");
  return p;
}
export function validCashFlowPlan(p) {
  if(!p || p.version!==2 || !monthPattern.test(String(p.startMonth)))return false;
  if(!Number.isFinite(p.openingCash)||!Number.isFinite(p.reserve)||p.reserve<0||typeof p.autoExtra!=="boolean")return false;
  if(!Array.isArray(p.cards)||p.cards.length>24||!p.months||typeof p.months!=="object" ||
     !p.categories||!Array.isArray(p.entries)||p.entries.length>2500)return false;
  const cardIds=new Set();
  for(const c of p.cards){
    if(!c||!identifierPattern.test(c.id)||cardIds.has(c.id)||
       typeof c.name!=="string"||!c.name.trim()||c.name.length>90||
       !Number.isFinite(c.openingDebt)||c.openingDebt<0||
       !Number.isFinite(c.minPct)||c.minPct<0||c.minPct>100||
       !Number.isFinite(c.interestPct)||c.interestPct<0||c.interestPct>25||
       (c.active!==undefined && typeof c.active!=="boolean"))return false;
    cardIds.add(c.id);
  }
  const categoryIds={expense:new Set(),income:new Set()};
  for(const kind of ["expense","income"]){
    const arr=p.categories[kind];
    if(!Array.isArray(arr)||arr.length>80)return false;
    for(const c of arr){
      if(!c||!identifierPattern.test(c.id)||categoryIds[kind].has(c.id)||
         typeof c.name!=="string"||!c.name.trim()||c.name.length>90||
         typeof c.active!=="boolean")return false;
      categoryIds[kind].add(c.id);
    }
  }
  const entryIds=new Set();
  for(const e of p.entries){
    if(!e || !identifierPattern.test(e.id)||entryIds.has(e.id)||
       !["income","card_expense","cash_expense","card_payment"].includes(e.type)||
       !datePattern.test(e.date) || !Number.isFinite(e.amount)||e.amount<=0 ||
       typeof e.note!=="string" || e.note.length>240)return false;
    entryIds.add(e.id);
    if(e.type==="income" && !categoryIds.income.has(e.categoryId))return false;
    if(["card_expense","cash_expense"].includes(e.type) && !categoryIds.expense.has(e.categoryId))return false;
    if(["card_expense","card_payment"].includes(e.type)&&!cardIds.has(e.cardId))return false;
  }
  for(const [month,m] of Object.entries(p.months)){
    if(!monthPattern.test(month)||!m||typeof m!=="object")return false;
    for(const field of ["income","fixedCash","otherCash","extraPayment"]){
      if(m[field]!==undefined && (!Number.isFinite(m[field])||m[field]<0))return false;
    }
    for(const field of ["cardSpends","minOverrides"]){
      if(m[field]!=null && (typeof m[field]!=="object"||Array.isArray(m[field])))return false;
      for(const [id,v] of Object.entries(m[field]||{})){
        if(!cardIds.has(id) || (v!==null && (!Number.isFinite(v)||v<0)))return false;
      }
    }
  }
  return true;
}
export function addCashFlowCategory(p,kind,name,id) {
  if(!["income","expense"].includes(kind)||!identifierPattern.test(id)||!name?.trim())throw new Error("Invalid category");
  const n=name.trim().slice(0,90);
  if(p.categories[kind].some(c=>c.id===id))throw new Error("Duplicate category");
  p.categories[kind].push({id,name:n,active:true});
}
export function setCategoryActive(p,kind,id,active){
  if(!["income","expense"].includes(kind))throw new Error("Invalid type");
  const c=p.categories[kind].find(c=>c.id===id);if(!c)throw new Error("Unknown category");
  c.active=Boolean(active);
}
export function setCardActive(p,id,active){
  const card=p.cards.find(c=>c.id===id);if(!card)throw new Error("Unknown card");
  card.active=Boolean(active);
}
export function addCashFlowEntry(p,e) {
  const candidate={...e,amount:r2(Number(e.amount)),note:String(e.note||"").slice(0,240)};
  if(!identifierPattern.test(candidate.id)||p.entries.some(t=>t.id===candidate.id))throw new Error("Invalid movement ID");
  p.entries.push(candidate);
  if(!validCashFlowPlan(p)){p.entries.pop();throw new Error("Invalid movement");}
}
export function summarizeCashFlowEntries(p,month) {
  const items=p.entries.filter(e=>e.date.slice(0,7)===month);
  const byCategory={income:{},expense:{}},byCard={},payments={};
  let income=0,cashExpenses=0,cardExpenses=0,paymentTotal=0;
  for(const e of items){
    const amt=r2(e.amount);
    if(e.type==="income"){
      income=r2(income+amt);
      byCategory.income[e.categoryId]=r2((byCategory.income[e.categoryId]||0)+amt);
    }else if(e.type==="cash_expense"){
      cashExpenses=r2(cashExpenses+amt);
      byCategory.expense[e.categoryId]=r2((byCategory.expense[e.categoryId]||0)+amt);
    }else if(e.type==="card_expense"){
      cardExpenses=r2(cardExpenses+amt);
      byCategory.expense[e.categoryId]=r2((byCategory.expense[e.categoryId]||0)+amt);
      byCard[e.cardId]=r2((byCard[e.cardId]||0)+amt);
    }else if(e.type==="card_payment"){
      paymentTotal=r2(paymentTotal+amt);
      payments[e.cardId]=r2((payments[e.cardId]||0)+amt);
    }
  }
  return {income,cashExpenses,cardExpenses,paymentTotal,byCategory,byCard,payments,items};
}
export function computeCashFlow(p,periods=12){
  if(!validCashFlowPlan(p))throw new Error("Invalid plan");
  const debt=Object.fromEntries(p.cards.map(c=>[c.id,r2(c.openingDebt)]));
  let cash=r2(p.openingCash);
  const rows=[];
  for(let i=0;i<periods;i++){
    const key=advanceMonth(p.startMonth,i),m=p.months[key]||{};
    const live=summarizeCashFlowEntries(p,key);
    const openingCash=cash,openingDebt=r2(Object.values(debt).reduce((sum,val)=>sum+val,0));
    // Actual categorized incomes replace the monthly estimate if any recorded,
    // never blindly add a salary entered twice.
    const income=live.income>0?live.income:positive(m.income);
    const fixedCash=positive(m.fixedCash);
    const otherCash=r2(positive(m.otherCash)+live.cashExpenses);
    cash=r2(cash+income-fixedCash-otherCash);
    const state=p.cards.map(c=>{
      const opening=debt[c.id],estimate=r2(opening*c.minPct/100);
      const override=m.minOverrides?.[c.id];
      const paid=positive(live.payments[c.id]);
      const hasActualPayment=paid>0;
      const minimum=hasActualPayment?Math.min(opening,paid):
        Math.min(opening,(override===""||override==null)?estimate:positive(override));
      return {id:c.id,name:c.name,active:c.active!==false,opening,
        minimum:r2(minimum),estimatedMinimum:estimate,actualPayment:hasActualPayment,
        extra:0,newSpending:r2(positive(m.cardSpends?.[c.id])+positive(live.byCard[c.id])),
        interest:0,closing:0,interestPct:c.interestPct};
    });
    const minimumTotal=r2(state.reduce((sum,c)=>sum+c.minimum,0));
    cash=r2(cash-minimumTotal);
    let capacity=p.autoExtra?Math.max(0,r2(cash-positive(p.reserve))):positive(m.extraPayment);
    // Do not auto-pay a card a second time if a real payment was entered.
    const priority=state.filter(c=>!c.actualPayment).sort((a,b)=>b.interestPct-a.interestPct||b.opening-a.opening);
    for(const c of priority){
      const extra=r2(Math.min(capacity,Math.max(0,c.opening-c.minimum)));
      c.extra=extra;capacity=r2(capacity-extra);cash=r2(cash-extra);
    }
    for(const c of state){
      const unpaid=Math.max(0,r2(c.opening-c.minimum-c.extra));
      c.interest=r2(unpaid*c.interestPct/100);
      c.closing=r2(unpaid+c.interest+c.newSpending);
      debt[c.id]=c.closing;
    }
    rows.push({month:key,openingCash,income,fixedCash,otherCash,
      minimumTotal,extraTotal:r2(state.reduce((sum,c)=>sum+c.extra,0)),
      cardSpending:r2(state.reduce((sum,c)=>sum+c.newSpending,0)),
      actualCardSpending:live.cardExpenses,actualCashSpending:live.cashExpenses,
      actualIncome:live.income,actualCardPayments:live.paymentTotal,
      interest:r2(state.reduce((sum,c)=>sum+c.interest,0)),openingDebt,
      closingDebt:r2(state.reduce((sum,c)=>sum+c.closing,0)),closingCash:cash,
      netPosition:r2(cash-state.reduce((sum,c)=>sum+c.closing,0)),
      fundingGap:cash<0?Math.abs(cash):0,cards:state,
      byCategory:live.byCategory,entries:live.items});
  }
  return rows;
}
