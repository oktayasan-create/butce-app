import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const imported=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("statement-import.js","utf8")));
let source=fs.readFileSync("statement-ui.js","utf8").split("\n")
  .filter(line=>!line.startsWith("import ")).join("\n")
  .replace("export function createStatementInboxUI(","function createStatementInboxUI(");
source+="\nthis.createStatementInboxUI=createStatementInboxUI;";
const st=(id,bank,balance,minimum,installment=0)=>({
 id,bank,cardLabel:bank+" Kredi Kartı",statementDate:"2026-11-08",dueDate:"2026-11-18",
 balance,minimum,periodLabel:"2026-11",previousBalance:null,periodSpending:null,
 remainingInstallmentsTotal:installment,transactions:[{
 id:id+"_tx",date:"2026-10-22",description:"Synthetic transaction",amount:100,
 type:"purchase",category:"Market",installmentCurrent:1,installmentTotal:2,
 remainingInstallments:1
 }]
});
const mock={version:1,statements:[
 st("garanti_01","Garanti",9000,3500,100),
 st("ykb_01","Yapı Kredi",4000,1500,250), // deliberately mismatched
 st("enpara_01","Enpara",1500,250,100)
]};
const root={innerHTML:""};
const auth={currentUser:{uid:"test-user"}};
const sandbox={auth,document:{getElementById(id){return id==="cf-statement-panel"?root:null;}},
 JSON,Date,Math,Number,String,Array,Intl,Error,console,
 ...imported,
 structuredClone,
 parseStatementFile:()=>{},prepareStatementPlan:()=>{},
 statementDueMonth:()=>null,statementInstallmentSchedule:()=>[],
 calculateInstallmentTimeline:()=>[]};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
let ui,rerenders=0;
const plan={cards:[{id:"garanti-card",name:"Garanti"}],
 statementSnapshots:[{sourceStatementId:"garanti_01"}],
 categories:{expense:[{name:"Market"},{name:"Diğer"}]}};
ui=sandbox.createStatementInboxUI({
 auth,db:{},doc:()=>({}),getDocFromServer:async()=>({
   exists:()=>true,data:()=>({inbox:mock})
 }),
 setDoc:async()=>{throw Error("Viewing must never write")},
 safeHtml:v=>String(v??"").replace(/[&<>"']/g,k=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k])),
 getPlan:()=>plan,
 onPlanChange:()=>{throw Error("Viewing must never mutate cashflow")},
 rerender:()=>{rerenders++;ui.render()},
 notify:()=>{}
});
ui.render();
await new Promise(resolve=>setImmediate(resolve));
const overview=ui.getOverview();
assert.equal(overview.count,3);
assert.equal(overview.debt,14500);
assert.equal(overview.minimum,5250);
assert.equal(overview.statements[0].planned,true);
assert.equal(overview.statements[1].mismatch,true);
assert.equal(overview.statements[2].installmentCount,1);
assert(root.innerHTML.includes("Kaydedilmiş ekstreler (3)"));
assert(root.innerHTML.includes("cf-statement-accordion"));
assert(root.innerHTML.includes("Taksit farkı"));
const first='class="cf-statement-card cf-statement-accordion" ';
assert(root.innerHTML.includes(first), "Card should be closed by default");
ui.selectExpanded("saved","garanti_01",true);
ui.render();
assert(root.innerHTML.includes('class="cf-statement-card cf-statement-accordion" open'),
 "Opening a saved statement should survive re-render");
ui.selectPlanCard("garanti_01","garanti-card");
assert(root.innerHTML.includes('class="cf-statement-card cf-statement-accordion" open'),
 "Selecting its card should not collapse open accordion");
ui.selectExpanded("saved","garanti_01",false);
ui.render();
assert(!root.innerHTML.includes('class="cf-statement-card cf-statement-accordion" open'),
 "Closed statement must remain closed");
ui.reset();
assert.equal(ui.getOverview().count,0,"Changing users clears statement cache");
assert(rerenders>=1);
console.log("PASS: saved statement count/totals, collapsed bank rows, mismatch flags and persistent accordion open state");
