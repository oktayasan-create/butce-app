import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const modelUrl="data:text/javascript;charset=utf-8,"+
 encodeURIComponent(fs.readFileSync("cashflow-model.js","utf8"));
const model=await import(modelUrl);
const bridgeUrl="data:text/javascript;charset=utf-8,"+
 encodeURIComponent(fs.readFileSync("budget-bridge.js","utf8")
  .replace("./cashflow-model.js",modelUrl));
const bridge=await import(bridgeUrl);
const html=fs.readFileSync("index.html","utf8");
const start=html.indexOf("// ── INDEPENDENT CASH & CREDIT CARD SCENARIO");
const end=html.indexOf("// ── MODAL UTILS",start);
assert(start>0&&end>start);

const p=model.emptyCashFlowPlan();
p.startMonth="2026-11";p.autoExtra=false;p.openingCash=8000;
p.cards=[
 {id:"g",name:"Garanti",openingDebt:10000,minPct:40,interestPct:0,interestMode:"manual",active:true},
 {id:"e",name:"Enpara",openingDebt:1000,minPct:20,interestPct:0,interestMode:"manual",active:true}
];
p.loans=[{id:"ev",name:"Ev Kredisi",amount:2000,
 startMonth:"2026-11",endMonth:"2027-12",active:true}];
const legacy={
 income:[{id:"salary",name:"Maaş"},{id:"spouse",name:"Damla Maaş"}],
 expense:[{id:"market",name:"Market"},{id:"aidat",name:"Apartman aidatı"}]
};
const budget={
 "salary_2026":{10:8000,11:9000},
 "spouse_2026":{10:7000,11:8000},
 "salary_2027":{0:10000},
 "spouse_2027":{0:10000},
 "market_2026":{10:1000,11:1200},
 "market_2027":{0:1500},
 "aidat_2026":{10:300,11:300},
 "aidat_2027":{0:400}
};
const getBudget=(id,month,year)=>budget[id+"_"+year]?.[month]||0;
const inputs={
 "cf-paid-card":{value:"g"},
 "cf-paid-kind":{value:"minimum"},
 "cf-paid-date":{value:"2026-11-09"},
 "cf-paid-amount":{value:""}
};
const root={innerHTML:""};
const messages=[],writes=[];
const sandbox={
 window:{},auth:{currentUser:{uid:"owner"}},authRevision:0,
 db:{},doc:(...args)=>args.join("/"),
 getDocFromServer:async()=>({exists:()=>false,data:()=>({})}),
 setDoc:async(...args)=>writes.push(args),
 document:{getElementById(id){return id==="tab-cashflow"?root:inputs[id]||null;}},
 cats:legacy,getBudget,...model,...bridge,Date,Intl,Math,Number,String,
 Array,Object,JSON,structuredClone,
 showToast:x=>messages.push(x),setSyncStatus:()=>{},confirm:()=>true,
 safeHtml:x=>String(x||"").replace(/[&<>"']/g,k=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k])),
 createStatementInboxUI:()=>({render(){},reset(){},getOverview(){
  return {count:0,loading:false,error:"",debt:0,minimum:0,statements:[]};
 }})
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start,end),sandbox);
vm.runInContext("cfPlan=thePlan;cfSelectedMonth='2026-11';",Object.assign(sandbox,{thePlan:p}));
await sandbox.window.renderCashflow();
assert(root.innerHTML.includes("Bütçe giderleri için kredi kartı seçilmeli"),
 "Never silently route card budget to wrong bank");
sandbox.window.cfSetView("plan");
assert(root.innerHTML.includes("Genel Bütçe ile otomatik bağlantı"));
assert(root.innerHTML.includes("Maaş"));
assert(root.innerHTML.includes("Damla Maaş"));
assert(root.innerHTML.includes("Apartman aidatı"));
assert(root.innerHTML.includes("Kart ödemelerini kaydet"));
sandbox.window.cfBudgetCategorySetting("market","cardId","g");
assert.equal(p.budgetLink.categories.market.cardId,"g");
assert(!root.innerHTML.includes("Bütçe giderleri için kredi kartı seçilmeli"));
assert(root.innerHTML.includes("Asgari ödeme"));
assert(root.innerHTML.includes("Kısmi ödeme"));
assert(root.innerHTML.includes("Borcun tamamı"));

sandbox.window.cfPaymentPreset();
assert.equal(inputs["cf-paid-amount"].value,"4000");
sandbox.window.cfSavePaidCard();
assert.equal(p.entries.length,1);
assert.equal(p.entries[0].type,"card_payment");
assert.equal(p.entries[0].paymentKind,"minimum");
assert.equal(p.entries[0].amount,4000);
assert(root.innerHTML.includes("Asgari ödendi"));
assert(root.innerHTML.includes("Yapılan ödemeyi kaydet"));
let row=model.computeCashFlow(bridge.projectBudgetToCashFlow(p,legacy,getBudget).plan,1)[0];
assert.equal(row.income,15000);
assert.equal(row.actualCardPayments,4000);
assert.equal(row.minimumTotal,4200);
assert.equal(row.minimumRemainingTotal,200);
assert.equal(row.cardCashOutflow,4200);
assert.equal(row.loanPayments,2000);
assert.equal(row.otherCash,300);
assert.equal(row.cardPurchases,1000);

inputs["cf-paid-card"].value="e";
inputs["cf-paid-kind"].value="partial";
inputs["cf-paid-amount"].value="100";
sandbox.window.cfSavePaidCard();
assert.equal(p.entries.length,2);
row=model.computeCashFlow(bridge.projectBudgetToCashFlow(p,legacy,getBudget).plan,1)[0];
assert.equal(row.cards[1].paymentStatus,"Kısmi ödendi");
assert.equal(row.cards[1].minimumRemaining,100);
assert.equal(row.cardCashOutflow,4200);

inputs["cf-paid-kind"].value="full";
sandbox.window.cfPaymentPreset();
assert.equal(inputs["cf-paid-amount"].value,"900");
sandbox.window.cfSavePaidCard();
assert.equal(p.entries.length,3);
row=model.computeCashFlow(bridge.projectBudgetToCashFlow(p,legacy,getBudget).plan,1)[0];
assert.equal(row.cards[1].paymentStatus,"Tamamı ödendi");
assert.equal(row.cards[1].minimumRemaining,0);
assert.equal(row.cardCashOutflow,5000);
assert.equal(row.cards[1].closing,0,"Enpara statement fully settled");

sandbox.window.cfSetView("summary");
assert(root.innerHTML.includes("Gerçekte ödenen"));
assert(root.innerHTML.includes("Kalan asgari"));
assert(root.innerHTML.includes("Ödenen kart"));
assert(root.innerHTML.includes("Devreden kart borcu"));
await sandbox.window.cfSavePlan();
assert.equal(writes.length,1,"Only explicit Plan Save writes Firebase");
assert.equal(writes[0][1].plan.entries.length,3);
assert.equal(writes[0][1].plan.budgetLink.categories.market.cardId,"g");
assert.equal(writes[0][1].plan.loans[0].amount,2000);

const novIncome=row.income;
budget.salary_2026[10]=8200;
sandbox.window.cfSetView("plan");
row=model.computeCashFlow(bridge.projectBudgetToCashFlow(p,legacy,getBudget).plan,1)[0];
assert.equal(row.income,novIncome+200,"Editing source Budget changes cashflow immediately without re-entry");
sandbox.window.cfBudgetLinkEnabled(false);
assert.equal(p.budgetLink.enabled,false);
assert.equal(model.computeCashFlow(bridge.projectBudgetToCashFlow(p,legacy,getBudget).plan,1)[0].income,0,
 "Disabling bridge returns to saved independent plan assumptions");
assert(messages.some(x=>x.includes("Kaydet")));
console.log("PASS: actual UI Budget category bank assignment, monthly salary mirror, minimum/partial/full entry, cash debt, saved plan and re-linking");
