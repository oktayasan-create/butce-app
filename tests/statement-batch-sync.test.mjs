import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const modelSource=fs.readFileSync("cashflow-model.js","utf8");
const modelUrl="data:text/javascript;charset=utf-8,"+encodeURIComponent(modelSource);
const model=await import(modelUrl);
const planSource=fs.readFileSync("statement-plan.js","utf8")
  .replace("./cashflow-model.js",modelUrl);
const planBridge=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(planSource));
const statementImport=await import("data:text/javascript;charset=utf-8,"+
 encodeURIComponent(fs.readFileSync("statement-import.js","utf8")));
let uiSource=fs.readFileSync("statement-ui.js","utf8").split("\n")
  .filter(x=>!x.startsWith("import ")).join("\n")
  .replace("export function createStatementInboxUI(","function createStatementInboxUI(");
uiSource+="\nthis.createStatementInboxUI=createStatementInboxUI;";

const p=model.emptyCashFlowPlan();
p.startMonth="2026-11";p.openingCash=80000;p.autoExtra=false;
p.cards=[
 {id:"g",name:"Garanti",active:true,openingDebt:0,minPct:40,interestPct:4.25,interestMode:"auto"},
 {id:"y",name:"YKB",active:true,openingDebt:0,minPct:40,interestPct:4.25,interestMode:"auto"},
 {id:"e",name:"Enpara Kişisel",active:true,openingDebt:0,minPct:20,interestPct:3.75,interestMode:"auto"}
];
p.loans=[{id:"loan_house",name:"Ev kredisi",amount:13000,
 startMonth:"2026-11",endMonth:"2027-12",active:true}];
p.months["2026-11"]={income:30000,fixedCash:1000,otherCash:0,
 extraPayment:0,cardSpends:{},minOverrides:{}};
const make=(id,bank,balance,minimum,transactions,remainingInstallmentsTotal=null)=>({
 id,bank,cardLabel:bank+" Test Kart",statementDate:"2026-10-30",
 dueDate:"2026-11-09",periodLabel:"2026-10",
 balance,minimum,transactions,previousBalance:null,periodSpending:null,
 remainingInstallmentsTotal
});
const purchase=(id,amt,remaining)=>({
 id,date:"2026-10-15",description:"Dummy purchase "+id,amount:amt,
 category:"Market",type:"purchase",installmentCurrent:1,
 installmentTotal:remaining+1,remainingInstallments:remaining
});
const archive={version:1,statements:[
 make("archive_g","Garanti BBVA",10000,4000,[purchase("ga",300,2)]),
 make("archive_y","Yapı Kredi",18000,7200,[purchase("yb",800,3)],2400),
 make("archive_e","Enpara",2000,400,[])
]};
const root={innerHTML:""};
let plan=p,loaded=null,callbacks=0,saves=0;
const auth={currentUser:{uid:"test-owner"}};
const context={
 auth,document:{getElementById:id=>id==="cf-statement-panel"?root:null},
 ...model,...statementImport,...planBridge,
 parseStatementFile:()=>{},JSON,Date,Math,String,Array,Intl,Number,Error,
 structuredClone,confirm:()=>true,console
};
vm.createContext(context);
vm.runInContext(uiSource,context);
let ui;
ui=context.createStatementInboxUI({
 auth,db:{},doc:(...args)=>args.join("/"),
 getDocFromServer:async()=>({exists:()=>true,data:()=>({inbox:archive})}),
 setDoc:async()=>{saves++;throw Error("Preview must NOT save Firestore")},
 safeHtml:x=>String(x||"").replace(/[&<>"]/g,""),
 getPlan:()=>plan,
 onPlanChange:newPlan=>{plan=newPlan;callbacks++;},
 rerender:()=>ui.render(),notify:()=>{}
});
ui.render();
await new Promise(resolve=>setImmediate(resolve));
const overview=ui.getOverview();
assert.equal(overview.count,3);
assert.equal(overview.pendingCount,3,"Three archived statements should be identified as not in cashflow");
const batch=ui.previewAllToPlan();
assert.equal(batch.applied.length,3);
assert.equal(batch.skipped.length,0);
assert.equal(batch.warnings.length,0);
assert.equal(batch.plan.statementSnapshots.length,3);
assert.equal(batch.plan.loans[0].amount,13000);
assert.equal(batch.plan.installments.length,2);
assert.equal(batch.plan.installments[0].startMonth,"2026-12");
assert.equal(model.computeCashFlow(batch.plan,1)[0].minimumTotal,11600);
assert.equal(model.computeCashFlow(batch.plan,2)[1].installmentTotal,1100);
assert.equal(model.computeCashFlow(batch.plan,1)[0].loanPayments,13000);

ui.applyAllToPlan();
assert.equal(callbacks,1,"One-click transfer stages the plan");
assert.equal(saves,0,"No Firebase write without separate explicit Plan Save");
assert.equal(plan.statementSnapshots.length,3);
assert.equal(ui.getOverview().pendingCount,0);
assert.equal(ui.previewAllToPlan().applied.length,0,"Re-apply must not double count");
assert.equal(model.computeCashFlow(plan,2)[1].installmentTotal,1100);

const ambiguous=model.emptyCashFlowPlan();
ambiguous.startMonth="2026-11";
ambiguous.cards=[
 {id:"e1",name:"Enpara Kişisel",openingDebt:0,minPct:20,interestPct:0,interestMode:"auto",active:true},
 {id:"e2",name:"Enpara İkinci Kart",openingDebt:0,minPct:20,interestPct:0,interestMode:"auto",active:true}
];
plan=ambiguous;
const preview=ui.previewAllToPlan();
assert(preview.skipped.some(s=>s.includes("Enpara")),
 "Multiple Enpara cards without last four matching require manual selection");
assert.equal(preview.applied.length,0);
console.log("PASS: three archived bank statements sync into cashflow with due-month card debts, next-month installments and preserved full loans");
