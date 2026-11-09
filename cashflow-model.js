/**
 * Personal budget / cashflow scenario engine (V3).
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
    ['exp_tax','Vergi'], ['exp_insurance','Emeklilik / Sigorta'], ['exp_other','Diğer'],
    ['exp_electricity','Elektrik'],['exp_water_bill','Su'],['exp_naturalgas','Doğalgaz'],
    ['exp_subscription','Üyelik'],['exp_building_fee','Apartman Aidatı'],
    ['exp_drinkingwater','İçme Suyu'],['exp_hairdresser','Kuaför'],['exp_food_cafe','Yemek & Kafe']
  ].map(([id,name])=>({id,name,active:true})),
  income:[
    ['inc_salary','Maaş'], ['inc_extra','Ek Gelir'], ['inc_other','Diğer Gelir']
  ].map(([id,name])=>({id,name,active:true}))
};
const recurringExpenseDefaults=[
  ["market","Market","card","exp_market"],
  ["electricity","Elektrik","card","exp_electricity"],
  ["water_bill","Su","card","exp_water_bill"],
  ["naturalgas","Doğalgaz","card","exp_naturalgas"],
  ["subscriptions","Üyelik","card","exp_subscription"],
  ["building_fee","Apartman aidatı","cash","exp_building_fee"],
  ["drinking_water","İçme suyu","card","exp_drinkingwater"],
  ["hairdresser","Kuaför","cash","exp_hairdresser"],
  ["food_cafe","Yemek & Kafe","card","exp_food_cafe"]
];
function defaultRecurringExpenses(startMonth){
  return recurringExpenseDefaults.map(([slug,name,payment,categoryId])=>({
    id:"regular_"+slug,name,payment,categoryId,
    amount:0,startMonth,endMonth:"2099-12",
    cardId:null,active:true
  }));
}
function appliesRecurring(rule,month){
  return rule.active!==false && rule.startMonth<=month && month<=rule.endMonth && rule.amount>0;
}
export function isoMonth(date = new Date()) {
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
}
export function advanceMonth(month,offset) {
  const [year,m] = String(month).split("-").map(Number);
  const d=new Date(Date.UTC(year||2026,(m||1)-1+offset,1));
  return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
}
export function emptyCashFlowPlan() {
  return {version:3,startMonth:isoMonth(),openingCash:0,autoExtra:false,reserve:0,
    cards:[],categories:structuredClone(defaultCategories),entries:[],months:{},
    loans:[],installments:[],statementSnapshots:[],
    recurringIncome:[],recurringExpenses:defaultRecurringExpenses(isoMonth()),
    budgetLink:{enabled:true,categories:{}},
    overdraft:{name:"Enpara Ekpara",openingDebt:0,limit:0,interestPct:4.25},
    tax:{kkdfPct:15,bsmvPct:15}};
}
export function normalizeCashFlowPlan(raw) {
  if(raw == null)return emptyCashFlowPlan();
  if(typeof raw!=="object" || ![1,2,3].includes(raw.version))throw new Error("Unsupported plan version");
  const p=structuredClone(raw);
  if(p.version===1){
    p.categories=structuredClone(defaultCategories);p.entries=[];
    p.cards=p.cards.map(c=>({...c,active:true}));
  }
  if(p.version!==3){
    p.version=3;
    p.loans=[];
    p.installments=[];
    p.statementSnapshots=[];
    p.overdraft={name:"Enpara Ekpara",openingDebt:0,limit:0,interestPct:4.25};
    p.tax={kkdfPct:15,bsmvPct:15};
    // Preserve all original card interest choices as user-entered manual values.
    p.cards=p.cards.map(c=>({...c,interestMode:"manual",active:c.active!==false}));
  }
  if(!Array.isArray(p.statementSnapshots))p.statementSnapshots=[];
  if(!p.budgetLink||typeof p.budgetLink!=="object")
    p.budgetLink={enabled:true,categories:{}};
  if(!p.budgetLink.categories||typeof p.budgetLink.categories!=="object")
    p.budgetLink.categories={};
  if(typeof p.budgetLink.enabled!=="boolean")p.budgetLink.enabled=true;
  if(!Array.isArray(p.recurringIncome))p.recurringIncome=[];
  if(!Array.isArray(p.recurringExpenses))p.recurringExpenses=defaultRecurringExpenses(p.startMonth);
  // Upgrade previously saved plans without mutating their historical entries.
  // Add only new named categories and zero-value presets; never duplicate a rule.
  for(const category of defaultCategories.expense){
    if(!p.categories.expense.some(c=>c.id===category.id))
      p.categories.expense.push(structuredClone(category));
  }
  p.cards=p.cards.map(c=>({interestMode:"manual",...c}));
  if(!validCashFlowPlan(p))throw new Error("Corrupt plan; cannot safely replace saved data");
  return p;
}
export function monthlyCardRate(statementDebt,card){
  if(card?.interestMode!=="auto") return Number(card?.interestPct||0);
  // Official maximum rates are based on statement balance, not credit limit.
  if(statementDebt<30000)return 3.25;
  if(statementDebt<=180000)return 3.75;
  return 4.25;
}
export function monthlyCardLateRate(statementDebt){
  if(statementDebt<30000)return 3.55;
  if(statementDebt<=180000)return 4.05;
  return 4.55;
}
export function activeLoanPayment(loan,month) {
  return loan.startMonth<=month && month<=loan.endMonth?positive(loan.amount):0;
}
export function activeInstallment(inst,month){
  if(month<inst.startMonth || month>=advanceMonth(inst.startMonth,inst.count))return 0;
  return positive(inst.amount);
}
export function validCashFlowPlan(p) {
  if(!p || p.version!==3 || !monthPattern.test(String(p.startMonth)))return false;
  if(!Number.isFinite(p.openingCash)||!Number.isFinite(p.reserve)||p.reserve<0||typeof p.autoExtra!=="boolean")return false;
  if(!Array.isArray(p.cards)||p.cards.length>24||!p.months||typeof p.months!=="object" ||
     !p.categories||!Array.isArray(p.entries)||p.entries.length>2500||
      !Array.isArray(p.loans)||p.loans.length>50||!Array.isArray(p.installments)||p.installments.length>250||
      !Array.isArray(p.statementSnapshots)||p.statementSnapshots.length>160||
      !Array.isArray(p.recurringIncome)||p.recurringIncome.length>100||
      !Array.isArray(p.recurringExpenses)||p.recurringExpenses.length>100||
      !p.overdraft||!p.tax)return false;
  if(p.budgetLink!==undefined){
    if(typeof p.budgetLink!=="object"||typeof p.budgetLink.enabled!=="boolean"||
      !p.budgetLink.categories||typeof p.budgetLink.categories!=="object"||
      Array.isArray(p.budgetLink.categories)||
      Object.keys(p.budgetLink.categories).length>120)return false;
    for(const [id,config] of Object.entries(p.budgetLink.categories)){
      if(!identifierPattern.test(id)||!config||typeof config!=="object"||
         (config.payment!==undefined&&!["cash","card"].includes(config.payment))||
         (config.excluded!==undefined&&typeof config.excluded!=="boolean")||
         (config.cardId!==undefined&&config.cardId!==null&&
          !p.cards.some(card=>card.id===config.cardId)))return false;
    }
  }
  const cardIds=new Set();
  for(const c of p.cards){
    if(!c||!identifierPattern.test(c.id)||cardIds.has(c.id)||
       typeof c.name!=="string"||!c.name.trim()||c.name.length>90||
       !Number.isFinite(c.openingDebt)||c.openingDebt<0||
       !Number.isFinite(c.minPct)||c.minPct<0||c.minPct>100||
       !Number.isFinite(c.interestPct)||c.interestPct<0||c.interestPct>25||
       (c.active!==undefined && typeof c.active!=="boolean")||
       !["manual","auto"].includes(c.interestMode))return false;
    cardIds.add(c.id);
  }
  const loanIds=new Set();
  for(const l of p.loans){
    if(!l||!identifierPattern.test(l.id)||loanIds.has(l.id)||typeof l.name!=="string"||!l.name.trim()||
       l.name.length>90||!Number.isFinite(l.amount)||l.amount<0||
       !monthPattern.test(l.startMonth)||!monthPattern.test(l.endMonth)||l.endMonth<l.startMonth ||
       (l.active!==undefined&&typeof l.active!=="boolean"))return false;
    loanIds.add(l.id);
  }
  const instIds=new Set();
  for(const inst of p.installments){
    if(!inst||!identifierPattern.test(inst.id)||instIds.has(inst.id)||
       typeof inst.name!=="string"||!inst.name.trim()||inst.name.length>100||
       !cardIds.has(inst.cardId)||!monthPattern.test(inst.startMonth)||
       !Number.isFinite(inst.amount)||inst.amount<0||
       !Number.isInteger(inst.count)||inst.count<1||inst.count>120 ||
       (inst.active!==undefined&&typeof inst.active!=="boolean"))return false;
    instIds.add(inst.id);
  }
  const od=p.overdraft,tax=p.tax;
  if(typeof od.name!=="string"||od.name.length>90||
     !Number.isFinite(od.openingDebt)||od.openingDebt<0||
     !Number.isFinite(od.limit)||od.limit<0||
     !Number.isFinite(od.interestPct)||od.interestPct<0||od.interestPct>25||
     !Number.isFinite(tax.kkdfPct)||tax.kkdfPct<0||tax.kkdfPct>100||
     !Number.isFinite(tax.bsmvPct)||tax.bsmvPct<0||tax.bsmvPct>100)return false;
  const snapshotKeys=new Set();
  for(const snap of p.statementSnapshots){
    if(!snap||!identifierPattern.test(snap.id)||!cardIds.has(snap.cardId)||
       !monthPattern.test(snap.dueMonth)||!Number.isFinite(snap.balance)||
       !Number.isFinite(snap.minimum)||snap.balance<0||snap.minimum<0||
       snap.minimum>snap.balance+0.01 ||
       (snap.statementDate!==null && snap.statementDate!==undefined&&!datePattern.test(snap.statementDate)))return false;
    const key=snap.cardId+"|"+snap.dueMonth;
    if(snapshotKeys.has(key))return false;
    snapshotKeys.add(key);
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
  const recurringIds=new Set();
  for(const rule of p.recurringIncome){
    if(!rule||!identifierPattern.test(rule.id)||recurringIds.has(rule.id)||
       typeof rule.name!=="string"||!rule.name.trim()||rule.name.length>90||
       typeof rule.owner!=="string"||!rule.owner.trim()||rule.owner.length>50||
       !["salary","extra","other"].includes(rule.kind)||
       !Number.isFinite(rule.amount)||rule.amount<0||
       !monthPattern.test(rule.startMonth)||!monthPattern.test(rule.endMonth)||
       rule.endMonth<rule.startMonth||
       (rule.active!==undefined&&typeof rule.active!=="boolean"))return false;
    recurringIds.add(rule.id);
  }
  for(const rule of p.recurringExpenses){
    if(!rule||!identifierPattern.test(rule.id)||recurringIds.has(rule.id)||
       typeof rule.name!=="string"||!rule.name.trim()||rule.name.length>90||
       !categoryIds.expense.has(rule.categoryId)||
       !["cash","card"].includes(rule.payment)||
       !Number.isFinite(rule.amount)||rule.amount<0||
       !monthPattern.test(rule.startMonth)||!monthPattern.test(rule.endMonth)||
       rule.endMonth<rule.startMonth||
       (rule.active!==undefined&&typeof rule.active!=="boolean")||
       (rule.cardId!==null&&rule.cardId!==undefined&&!cardIds.has(rule.cardId))||
       (rule.payment==="card"&&rule.amount>0&&!cardIds.has(rule.cardId))
    )return false;
    recurringIds.add(rule.id);
  }
  const entryIds=new Set();
  for(const e of p.entries){
    if(!e || !identifierPattern.test(e.id)||entryIds.has(e.id)||
       !["income","card_expense","cash_expense","card_payment"].includes(e.type)||
       !datePattern.test(e.date) || !Number.isFinite(e.amount)||e.amount<=0 ||
       typeof e.note!=="string" || e.note.length>240)return false;
    entryIds.add(e.id);
    if(e.owner!==undefined&&(e.type!=="income"||
       !["Ben","Eşim","Diğer"].includes(e.owner)))return false;
    if(e.paymentKind!==undefined&&(e.type!=="card_payment"||
       !["minimum","partial","full"].includes(e.paymentKind)))return false;
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
  const candidate={id:e.id,type:e.type,date:e.date,amount:r2(Number(e.amount)),note:String(e.note||"").slice(0,240)};
  if(e.type==="income"||e.type==="card_expense"||e.type==="cash_expense") candidate.categoryId=e.categoryId;
  if(e.type==="income"&&e.owner!==undefined)candidate.owner=e.owner;
  if(e.type==="card_payment"&&e.paymentKind!==undefined)candidate.paymentKind=e.paymentKind;
  if(e.type==="card_expense"||e.type==="card_payment") candidate.cardId=e.cardId;
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
  if(!Number.isInteger(periods)||periods<1||periods>36)throw new Error("Invalid period count");
  const cardDebt=Object.fromEntries(p.cards.map(c=>[c.id,r2(c.openingDebt)]));
  let cash=Math.max(0,r2(p.openingCash));
  // A negative bank account opening is equivalent to already using overdraft.
  let overdraftDebt=r2(p.overdraft.openingDebt+Math.max(0,-p.openingCash));
  let dueOverdraftCost=0;
  const rows=[],taxMultiplier=1+(p.tax.kkdfPct+p.tax.bsmvPct)/100;
  for(let i=0;i<periods;i++){
    const key=advanceMonth(p.startMonth,i),m=p.months[key]||{};
    const live=summarizeCashFlowEntries(p,key);
    const openingCash=cash,openingOverdraft=overdraftDebt;
    const openingDebt=r2(Object.values(cardDebt).reduce((sum,value)=>sum+value,0));
    // The "salary" schedule is tagged by earning month, but cash arrives
    // in the following month. Other recurring income follows its own month.
    const overlappingIncomeRules=p.recurringIncome.filter(rule=>
      appliesRecurring(rule,rule.kind==="salary"?advanceMonth(key,-1):key));
    // New-year salary revision supersedes an older overlapping salary interval
    // for the same owner; other/additional income types are additive.
    const latestSalaryByOwner=new Map();
    for(const rule of overlappingIncomeRules.filter(x=>x.kind==="salary")){
      const older=latestSalaryByOwner.get(rule.owner);
      if(!older || rule.startMonth>older.startMonth)latestSalaryByOwner.set(rule.owner,rule);
    }
    const scheduledIncomeRules=[
      ...overlappingIncomeRules.filter(rule=>rule.kind!=="salary"),
      ...latestSalaryByOwner.values()
    ];
    const linkedBudget=p.budgetProjection?.months?.[key]||null;
    const scheduledIncome=r2(scheduledIncomeRules.reduce((sum,rule)=>sum+rule.amount,0));
    // The Budget tab is authoritative for ALL income categories when linked.
    // Manual cashflow income entries remain in history but are NOT added to
    // the same salary/category a second time. Enter one-off income in Budget.
    const income=linkedBudget?
      positive(linkedBudget.income):
      (scheduledIncomeRules.length?r2(scheduledIncome+live.income):
       (live.income>0?live.income:positive(m.income)));
    const recurringCash=[],recurringCard=[],recurringCardById={};
    const sources=linkedBudget?linkedBudget.expenses:p.recurringExpenses.filter(rule=>appliesRecurring(rule,key));
    for(const rule of sources){
      if(!linkedBudget&&!appliesRecurring(rule,key))continue;
      const actualType=rule.payment==="card"?"card_expense":"cash_expense";
      // A real entry in the same category and payment channel replaces its
      // forecast estimate; otherwise the same bill would be counted twice.
      const hasActual=rule.categoryId!=="exp_other"&&live.items.some(e=>
        e.type===actualType&&e.categoryId===rule.categoryId&&
        (actualType!=="card_expense"||e.cardId===rule.cardId));
      if(hasActual)continue;
      if(rule.payment==="cash")recurringCash.push(rule);
      else{
        recurringCard.push(rule);
        recurringCardById[rule.cardId]=r2((recurringCardById[rule.cardId]||0)+rule.amount);
      }
    }
    const recurringCashTotal=r2(recurringCash.reduce((sum,rule)=>sum+rule.amount,0));
    const recurringCardTotal=r2(recurringCard.reduce((sum,rule)=>sum+rule.amount,0));
    const loanDetails=p.loans.filter(l=>l.active!==false)
      .map(l=>({id:l.id,name:l.name,amount:activeLoanPayment(l,key)})).filter(l=>l.amount>0);
    const loanPayments=r2(loanDetails.reduce((sum,l)=>sum+l.amount,0));
    const fixedCash=linkedBudget?0:positive(m.fixedCash);
    const otherCash=r2((linkedBudget?0:positive(m.otherCash))+live.cashExpenses+recurringCashTotal);
    const chargedOverdraftCost=dueOverdraftCost;
    dueOverdraftCost=0;
    const monthlyInstallments=p.installments.filter(v=>v.active!==false)
      .map(inst=>({id:inst.id,cardId:inst.cardId,name:inst.name,amount:activeInstallment(inst,key)}))
      .filter(v=>v.amount>0);
    const installmentTotal=r2(monthlyInstallments.reduce((sum,v)=>sum+v.amount,0));
    const installmentsByCard={};
    for(const inst of monthlyInstallments){
      installmentsByCard[inst.cardId]=r2((installmentsByCard[inst.cardId]||0)+inst.amount);
    }
    const state=p.cards.map(c=>{
      const statementSnapshot=p.statementSnapshots.find(sn=>sn.cardId===c.id&&sn.dueMonth===key);
      const opening=r2(statementSnapshot?statementSnapshot.balance:cardDebt[c.id]);
      const dueInstallments=positive(installmentsByCard[c.id]);
      // A bank statement balance already includes every installment billed in
      // this month. Do not add them to the bank-reported balance again.
      const statementDebt=r2(opening+(statementSnapshot?0:dueInstallments));
      const estimatedMinimum=r2(statementSnapshot?statementSnapshot.minimum:statementDebt*c.minPct/100);
      const override=m.minOverrides?.[c.id];
      const minimum=r2(Math.min(statementDebt,
        override===null||override===""||override===undefined?estimatedMinimum:positive(override)));
      const actualPaid=positive(live.payments[c.id]);
      // A payment already made consumes cash and reduces the debt, never
      // becomes a second "minimum" on top of the same paid amount.
      const minimumRemaining=r2(Math.min(Math.max(0,statementDebt-actualPaid),
        Math.max(0,minimum-actualPaid)));
      const paymentApplied=r2(Math.min(statementDebt,actualPaid+minimumRemaining));
      const paidExtra=Math.max(0,r2(actualPaid-minimum));
      const paymentStatus=actualPaid<=0?"Ödenmedi":
        actualPaid+0.01>=statementDebt?"Tamamı ödendi":
        actualPaid+0.01>=minimum?"Asgari ödendi":"Kısmi ödendi";
      const interestPct=monthlyCardRate(statementDebt,c);
      return {id:c.id,name:c.name,active:c.active!==false,opening,statementDebt,
        dueInstallments,statementVerified:!!statementSnapshot,estimatedMinimum,minimum,
        actualPaid,minimumRemaining,paymentApplied,paidExtra,paymentStatus,
        missedMinimum:0,actualPayment:actualPaid>0,
        extra:0,newSpending:r2((linkedBudget?0:positive(m.cardSpends?.[c.id]))+
          positive(live.byCard[c.id])+positive(recurringCardById[c.id])),
        interestPct,interest:0,interestBase:0,interestTax:0,closing:0,paidOff:false,
        lateInterest:0};
    });
    const minimumTotal=r2(state.reduce((sum,c)=>sum+c.minimum,0));
    const actualCardPayments=r2(state.reduce((sum,c)=>sum+c.actualPaid,0));
    const minimumRemainingTotal=r2(state.reduce((sum,c)=>sum+c.minimumRemaining,0));
    const cardCashOutflow=r2(actualCardPayments+minimumRemainingTotal);
    // Cash includes BOTH already paid card amounts and the remainder of
    // required minimums; no amount is deducted twice.
    const mandatoryTotal=r2(fixedCash+otherCash+loanPayments+cardCashOutflow+chargedOverdraftCost);
    cash=r2(cash+income-mandatoryTotal);
    let overdraftDraw=0,overdraftRepaid=0;
    if(cash<0){
      overdraftDraw=r2(-cash);
      overdraftDebt=r2(overdraftDebt+overdraftDraw);
      cash=0;
    }else if(cash>0 && overdraftDebt>0){
      overdraftRepaid=r2(Math.min(cash,overdraftDebt));
      overdraftDebt=r2(overdraftDebt-overdraftRepaid);
      cash=r2(cash-overdraftRepaid);
    }
    const afterMandatoryCash=r2(cash);
    const availableForExtra=Math.max(0,r2(cash-positive(p.reserve)));
    // Manual extra is an intended TOTAL extra for this month. If a past
    // payment already exceeded the minimum, count that first.
    const paidExtra=state.reduce((sum,c)=>sum+c.paidExtra,0);
    const desiredExtra=p.autoExtra?availableForExtra:
      Math.max(0,r2(positive(m.extraPayment)-paidExtra));
    let capacity=Math.min(availableForExtra,desiredExtra);
    const unmetExtra=Math.max(0,r2(desiredExtra-capacity));
    // Any voluntarily planned extra payment is separate from a real payment entry.
    // If an actual payment already includes the extra, leave the manual extra input at zero.
    const priority=state.filter(c=>c.statementDebt>c.paymentApplied)
      .sort((a,b)=>b.interestPct-a.interestPct||b.statementDebt-a.statementDebt);
    for(const c of priority){
      const extra=r2(Math.min(capacity,Math.max(0,c.statementDebt-c.paymentApplied)));
      c.extra=extra;capacity=r2(capacity-extra);cash=r2(cash-extra);
    }
    for(const c of state){
      const unpaid=Math.max(0,r2(c.statementDebt-c.paymentApplied-c.extra));
      c.interestBase=unpaid;
      const basicInterest=r2(unpaid*c.interestPct/100);
      // If an actual entered payment is below the minimum, estimate extra late-rate delta.
      // Remaining minimum is planned before month-end, so do not assume
      // statutory late interest just because the user hasn't paid it YET.
      c.lateInterest=0;
      c.interest=r2(basicInterest+c.lateInterest);
      c.interestTax=r2(c.interest*(taxMultiplier-1));
      c.closing=r2(unpaid+c.interest+c.interestTax+c.newSpending);
      const futureInstallment=p.installments.some(inst=>inst.active!==false&&inst.cardId===c.id&&
        inst.startMonth<=advanceMonth(key,1)&&
        advanceMonth(inst.startMonth,inst.count)>advanceMonth(key,1));
      c.paidOff=c.statementDebt>0&&c.closing===0&&!futureInstallment;
      cardDebt[c.id]=c.closing;
    }
    // Overdraft is charged on an average monthly utilized balance as an approximation.
    // Enpara calculates actual interest daily; this estimate is posted next month.
    const overdraftInterest=r2(((openingOverdraft+overdraftDebt)/2)*p.overdraft.interestPct/100);
    const overdraftTax=r2(overdraftInterest*(taxMultiplier-1));
    const overdraftCost=r2(overdraftInterest+overdraftTax);
    dueOverdraftCost=overdraftCost;
    const finalDebt=r2(state.reduce((sum,c)=>sum+c.closing,0));
    const cardInterest=r2(state.reduce((sum,c)=>sum+c.interest,0));
    const cardTax=r2(state.reduce((sum,c)=>sum+c.interestTax,0));
    const closingCash=r2(cash);
    rows.push({
      month:key,openingCash,openingOverdraft,
      income,fixedCash,otherCash,loanPayments,loanDetails,mandatoryTotal,chargedOverdraftCost,
      budgetLinked:!!linkedBudget,budgetIncomeCategories:linkedBudget?.incomes||[],
      actualCardPayments,minimumRemainingTotal,cardCashOutflow,
      scheduledIncome,scheduledIncomeRules:scheduledIncomeRules.map(rule=>({
        id:rule.id,name:rule.name,owner:rule.owner,kind:rule.kind,amount:rule.amount})),
      recurringCashTotal,recurringCardTotal,
      recurringExpenses:[...recurringCash.map(rule=>({
        id:rule.id,name:rule.name,payment:rule.payment,amount:rule.amount})),
        ...recurringCard.map(rule=>({
        id:rule.id,name:rule.name,payment:rule.payment,amount:rule.amount,cardId:rule.cardId}))],
      minimumTotal,afterMandatoryCash,extraTotal:r2(state.reduce((sum,c)=>sum+c.extra,0)),
      requestedExtra:desiredExtra,unmetExtra,
      cardSpending:r2(state.reduce((sum,c)=>sum+c.newSpending+(c.statementVerified?0:c.dueInstallments),0)),
      cardPurchases:r2(state.reduce((sum,c)=>sum+c.newSpending,0)),
      installmentTotal,installments:monthlyInstallments,
      actualCardSpending:live.cardExpenses,actualCashSpending:live.cashExpenses,
      actualIncome:live.income,actualCardPayments:live.paymentTotal,
      interest:cardInterest,cardInterest,cardTax,
      overdraftDraw,overdraftRepaid,overdraftInterest,overdraftTax,overdraftCost,
      closingOverdraft:r2(overdraftDebt),
      overdraftLimit:p.overdraft.limit,
      overdraftLimitExceeded:p.overdraft.limit>0&&overdraftDebt>p.overdraft.limit,
      openingDebt,closingDebt:finalDebt,closingCash,
      savings:closingCash,
      netPosition:r2(closingCash-overdraftDebt-finalDebt),
      fundingGap:p.overdraft.limit>0?Math.max(0,r2(overdraftDebt-p.overdraft.limit)):0,
      needsOverdraft:overdraftDraw>0,
      cardsPaidOff:state.filter(c=>c.paidOff).map(c=>c.name),
      cards:state,byCategory:live.byCategory,entries:live.items
    });
  }
  return rows;
}

/**
 * What a card holder is expected to owe for purchases made THROUGH month end.
 * The statement is payable in the FOLLOWING month. A finalized bank snapshot
 * for that following due month, if available, replaces the estimate.
 *
 * Components before any bank adjustment:
 * carried unpaid balance (including interest/taxes already in the forecast)
 * + this month's new purchases + installments due next month.
 * Current-month bank statement snapshots are NOT themselves "new purchases".
 */
export function estimateMonthEndCardStatement(plan,row){
  if(!validCashFlowPlan(plan)||!row||!monthPattern.test(row.month)||
     !Array.isArray(row.cards))throw Error("Invalid month-end statement request");
  const dueMonth=advanceMonth(row.month,1);
  const active=plan.installments.filter(inst=>inst.active!==false);
  const cards=row.cards.map(c=>{
    const cfg=plan.cards.find(card=>card.id===c.id);
    if(!cfg)throw Error("Unknown card");
    const nextInstallments=r2(active.filter(inst=>inst.cardId===c.id)
      .reduce((sum,inst)=>sum+activeInstallment(inst,dueMonth),0));
    const carryover=Math.max(0,r2(c.closing-c.newSpending));
    const purchases=positive(c.newSpending);
    const estimated=r2(carryover+purchases+nextInstallments);
    const verified=plan.statementSnapshots.find(snapshot=>
      snapshot.cardId===c.id&&snapshot.dueMonth===dueMonth);
    const statementTotal=verified?positive(verified.balance):estimated;
    const adjustment=r2(statementTotal-estimated);
    const minimum=verified?positive(verified.minimum):
      r2(Math.min(statementTotal,statementTotal*cfg.minPct/100));
    return {id:c.id,name:c.name,carryover,purchases,nextInstallments,
      estimated,statementTotal,minimum,adjustment,verified:!!verified};
  });
  const total=field=>r2(cards.reduce((sum,c)=>sum+c[field],0));
  return {month:row.month,dueMonth,cards,
    carryover:total("carryover"),purchases:total("purchases"),
    installments:total("nextInstallments"),adjustment:total("adjustment"),
    statementTotal:total("statementTotal"),minimum:total("minimum"),
    hasVerified:cards.some(c=>c.verified)};
}
