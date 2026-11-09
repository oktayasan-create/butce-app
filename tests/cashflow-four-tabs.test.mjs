import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const html=fs.readFileSync("index.html","utf8");
const begin=html.indexOf("// ── INDEPENDENT CASH & CREDIT CARD SCENARIO");
const end=html.indexOf("// ── MODAL UTILS",begin);
assert(begin>0&&end>begin);
const model=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("cashflow-model.js","utf8")));
const p=model.emptyCashFlowPlan();
p.startMonth="2026-11";p.openingCash=40000;p.autoExtra=false;
p.cards=[
  {id:"g",name:"Garanti",openingDebt:10000,minPct:40,interestPct:4.25,interestMode:"auto",active:true},
  {id:"e",name:"Enpara - Damla",openingDebt:1500,minPct:20,interestPct:3.75,interestMode:"auto",active:true}
];
p.loans=[
 {id:"house",name:"Ev Kredisi",amount:12000,startMonth:"2026-11",endMonth:"2027-11",active:true},
 {id:"car",name:"Araba Kredisi",amount:6000,startMonth:"2026-11",endMonth:"2027-11",active:true}
];
p.installments=[
 {id:"g1",cardId:"g",name:"Ayakkabı",amount:700,startMonth:"2026-12",count:2,active:true,sourceKind:"statement"},
 {id:"g2",cardId:"g",name:"Market taksiti",amount:500,startMonth:"2026-12",count:3,active:true,sourceKind:"statement"},
 {id:"e1",cardId:"e",name:"Ev alışverişi",amount:250,startMonth:"2027-01",count:2,active:true}
];
p.months["2026-11"]={income:30000,fixedCash:1000,otherCash:2000,
 extraPayment:2000,cardSpends:{},minOverrides:{}};
const row=model.computeCashFlow(p,1)[0];
assert.equal(row.loanPayments,18000,"House+car full monthly payments mandatory");
assert.equal(row.loanDetails.length,2);
assert.equal(row.minimumTotal,4300);
assert.equal(row.extraTotal,2000);
assert(model.validCashFlowPlan(p));

const root={innerHTML:""};
let statementRenderCount=0;
const stOverview={count:3,loading:false,error:"",debt:30000,minimum:12000,statements:[
 {id:"s1",cardLabel:"Garanti",balance:10000,minimum:4000,dueDate:"2026-11-09",
  planned:true,installmentCount:2,mismatch:false},
 {id:"s2",cardLabel:"YKB",balance:18500,minimum:7500,dueDate:"2026-11-18",
  planned:false,installmentCount:2,mismatch:true},
 {id:"s3",cardLabel:"Enpara Damla",balance:1500,minimum:500,dueDate:"2026-11-12",
  planned:false,installmentCount:0,mismatch:false}
]};
const messages=[],saved=[];
const uiStub=()=>({
 render(){statementRenderCount++;},reset(){},getOverview(){return stOverview;},
 selectExpanded(){},selectFile(){},saveDraft(){},saveCategories(){},categoryEdit(){}
});
const sandbox={
 window:{},auth:{currentUser:{uid:"owner"}},authRevision:0,
 db:{},doc:(...v)=>v.join("/"),setDoc:async(...args)=>saved.push(args),
 getDocFromServer:async()=>({exists:()=>false,data:()=>({})}),
 document:{getElementById(id){return id==="tab-cashflow"?root:null}},
 safeHtml:v=>String(v??"").replace(/[&<>"']/g,k=>({
   "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k])),
 showToast:v=>messages.push(v),setSyncStatus:()=>{},confirm:()=>true,
 createStatementInboxUI:uiStub,
 Date,Intl,Math,Number,String,Array,Object,JSON,structuredClone,...model
};
vm.createContext(sandbox);
vm.runInContext(html.slice(begin,end),sandbox,{filename:"cashflow-four-tabs.js"});
vm.runInContext("cfPlan=undefined;",sandbox);
vm.runInContext("cfPlan=initial;cfSelectedMonth='2026-11';",Object.assign(sandbox,{initial:p}));
await sandbox.window.renderCashflow();

assert(root.innerHTML.includes('role="tablist"'));
for(const label of ["Özet","Ekstreler","Taksitler","Nakit Planı"])
 assert(root.innerHTML.includes(label));
assert(root.innerHTML.includes("Ev Kredisi"));
assert(root.innerHTML.includes("Araba Kredisi"));
assert(root.innerHTML.includes("18.000"),"Total full loan payments shown in primary dashboard");
assert(root.innerHTML.includes("Kredi taksitleri kartların asgarisinden bağımsız"));
assert(root.innerHTML.includes("Taksit kontrolü"),"Bank mismatch status visible");
assert(root.innerHTML.includes("Enpara Damla"));
assert(root.innerHTML.includes("12 ay"));

const before=JSON.stringify(p);
sandbox.window.cfSetView("statements");
assert(root.innerHTML.includes('id="cf-statement-panel"'));
assert.equal(statementRenderCount,1);
assert(!root.innerHTML.includes('cf-edit-row'),"Statements view should not display loan/installment forms");
sandbox.window.cfSetView("installments");
assert(root.innerHTML.includes("Gelecek kart taksitleri"));
assert(root.innerHTML.includes("Garanti"));
assert(root.innerHTML.includes("Enpara - Damla"));
assert(root.innerHTML.includes("2 taksit"));
assert(root.innerHTML.includes("Ayakkabı"));
assert(!root.innerHTML.includes("cf-inline-editor"),
 "Collapsed list must hide the big installment editing fields");
sandbox.window.cfSetInstallmentGroup("g",true);
sandbox.window.cfEditInstallment("g1");
assert(root.innerHTML.includes("cf-inline-editor"),"Edit one installment at a time");
assert(root.innerHTML.includes("Kalan ay sayısı"));
sandbox.window.cfInstallment(0,"amount","720");
assert.equal(p.installments[0].amount,720);
assert(root.innerHTML.includes("cf-inline-editor"),
 "Edited installment should stay in edit mode after re-render");
assert(root.innerHTML.includes('open '),"Group should stay open after onchange");
sandbox.window.cfEditInstallment("g1");
assert(!root.innerHTML.includes("cf-inline-editor"),"Close editing form");

sandbox.window.cfSetView("plan");
assert(root.innerHTML.includes("Tam kredi ödemesi"));
assert(root.innerHTML.includes("Ev Kredisi"));
assert(root.innerHTML.includes("Araba Kredisi"));
assert(root.innerHTML.includes("Senin seçtiğin ek kart ödemesi"));
assert(root.innerHTML.includes("cfLoan("),"Loan editing controls available on demand");
assert(root.innerHTML.includes("cfCategoryActive"),"Category management remains available");
assert(root.innerHTML.includes("cfActivityForm")===false);
assert(root.innerHTML.includes("Hareket geçmişi ve kategori özeti"));
assert(root.innerHTML.includes("Enpara Ekpara / KMH ayarları"));
assert(root.innerHTML.includes("Planı Kaydet"));
assert.equal(p.loans.length,2);
assert.equal(p.loans[0].amount,12000);
assert.equal(p.loans[1].amount,6000);
assert.equal(model.computeCashFlow(p,1)[0].loanPayments,18000,
 "UI navigation and installment editing may not remove full mandatory loans");
assert.notEqual(JSON.stringify(p),before,"Only intentional edits change data");

await sandbox.window.cfSavePlan();
assert.equal(saved.length,1,"Explicit Plan Save persists user plan");
assert(saved[0][0].endsWith("/data/cashflowPlan"),"Save must target cashflowPlan document");
assert.equal(saved[0][1].plan.loans[0].amount,12000);
assert.equal(saved[0][1].plan.loans[1].amount,6000);
assert.equal(saved[0][1].plan.cards.length,2);
assert.equal(saved[0][1].plan.installments[0].amount,720);
assert(messages.some(msg=>msg.includes("kaydedildi")));

const statementUI=fs.readFileSync("statement-ui.js","utf8");
assert(statementUI.includes("cf-statement-accordion"),
 "Saved statements use expandable accordion");
assert(statementUI.includes("getOverview"),"Summary view derives figures from saved statements");
assert(statementUI.includes("selectExpanded"),"Open bank statement state retained across rerenders");
assert(!statementUI.includes("allow read, write: if true"),"No public rules inside UI");
console.log("PASS: four tabs, compact bank statement and installment views, full house/car mandatory payments, save preservation");
