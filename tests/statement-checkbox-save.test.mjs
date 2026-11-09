/**
 * Simulate the actual checkbox onchange + button onclick HTML attributes,
 * rather than calling saveDraft() directly. This would have caught the
 * regression where the button remained disabled after user confirmation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const imported=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("statement-import.js","utf8")));
const appIndex=fs.readFileSync("index.html","utf8");
assert(appIndex.includes("window.statementSaveDraft=()=>statementUI.saveDraft()"),
  "HTML module must expose save handler on window");
assert(appIndex.includes("window.statementReviewAck=checked=>statementUI.reviewAck(checked)"),
  "HTML module must expose checkbox handler on window");

let src=fs.readFileSync("statement-ui.js","utf8").split("\n")
  .filter(line=>!line.startsWith("import ")).join("\n")
  .replace("export function createStatementInboxUI(","function createStatementInboxUI(");
src+="\nthis.createStatementInboxUI=createStatementInboxUI;";

const nodes=new Map();
let savedHtml="";
const root={};
Object.defineProperty(root,"innerHTML",{
  get(){return savedHtml;},
  set(value){
    savedHtml=value;
    for(const id of ["statement-review-ack","statement-save-draft","statement-save-status"]){
      const tag=value.match(new RegExp("<(?:input|button|div)\\s+[^>]*id=\\""+id+"\\"[^>]*>","i"))?.[0];
      if(tag){
        nodes.set(id,{disabled:/\sdisabled(?:\s|>)/.test(tag),
          checked:/\schecked(?:\s|>)/.test(tag),className:"",textContent:"",
          tag});
      }else nodes.delete(id);
    }
  }
});
const document={getElementById(id){
  if(id==="cf-statement-panel")return root;
  return nodes.get(id)||null;
}};
const auth={currentUser:{uid:"test-owner"}};
let remote=null,writeCount=0,failWrite=true;
const getDocFromServer=async()=>({
  exists:()=>remote!==null,
  data:()=>({inbox:remote})
});
let ui;
const context={document,auth,Intl,Date,Number,Array,Math,JSON,String,Error,console,
 structuredClone,
 ...imported,
 parseStatementFile:async()=>{throw Error("Only JSON fixture used")},
 prepareStatementPlan:()=>{},statementDueMonth:()=>null,
 statementInstallmentSchedule:()=>[],calculateInstallmentTimeline:()=>[]};
vm.createContext(context);
vm.runInContext(src,context);

ui=context.createStatementInboxUI({
 auth,db:{},doc:(...args)=>args.join("/"),
 getDocFromServer,
 setDoc:async (_doc,payload)=>{
   writeCount++;
   if(failWrite){const e=new Error("Missing permissions");e.code="permission-denied";throw e;}
   remote=structuredClone(payload.inbox);
 },
 safeHtml:v=>String(v).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
 getPlan:()=>({categories:{expense:[{name:"Market"},{name:"Diğer"}]},cards:[]}),
 onPlanChange:()=>{throw Error("Must not touch cashflow plan")},
 rerender:()=>ui.render(),
 notify:()=>{}
});
context.statementReviewAck=value=>ui.reviewAck(value);
context.statementSaveDraft=()=>ui.saveDraft();

ui.render();
await new Promise(resolve=>setImmediate(resolve));

const sample={format:"butceapp-statement-review-v1",statements:[{
 id:"save_ui_20261108",bank:"Yapı Kredi",cardLabel:"YKB Test Card",
 balance:13300,minimum:5300,statementDate:"2026-11-08",dueDate:"2026-11-18",
 periodLabel:"2026-11",previousBalance:null,periodSpending:null,
 remainingInstallmentsTotal:null,transactions:[{
  id:"tx001",date:"2026-11-01",description:"TEST MARKET",amount:200,
  type:"purchase",category:"Market",installmentCurrent:null,
  installmentTotal:null,remainingInstallments:null
 }]
}]};
await ui.selectFile({files:[{
 name:"sample.json",size:200,async text(){return JSON.stringify(sample)}
}]});

function readMarkup(id){
 const node=nodes.get(id);
 assert(node,"DOM must contain "+id);
 return node;
}
const button=readMarkup("statement-save-draft");
assert.equal(button.disabled,true,"Before review, Save button must be disabled");
const checkbox=readMarkup("statement-review-ack");
const change=checkbox.tag.match(/onchange="([^"]+)"/)?.[1];
assert.equal(change,"statementReviewAck(this.checked)");
const click=button.tag.match(/onclick="([^"]+)"/)?.[1];
assert.equal(click,"statementSaveDraft()");

async function simulateUserClick(){
 if(readMarkup("statement-save-draft").disabled)return false;
 await vm.runInContext(click,context);
 return true;
}
assert.equal(await simulateUserClick(),false,"Disabled button cannot trigger Firestore");
assert.equal(writeCount,0);

vm.runInContext(change.replace("this.checked","true"),context);
assert.equal(readMarkup("statement-save-draft").disabled,false,
 "Checkbox checked MUST enable real HTML button (original bug)");
assert(nodes.get("statement-save-status").textContent.includes("Kontrol onayı verildi"),
 "Checkbox should show visibly that Save is enabled");

assert.equal(await simulateUserClick(),true);
assert.equal(writeCount,1,"Click must reach a Firestore write");
assert.equal(remote,null,"Permission failure must not be mistaken for save");
assert(root.innerHTML.includes("permission-denied"),
 "Server permission error should remain visible after re-render");
assert.equal(readMarkup("statement-save-draft").disabled,false,
 "User can retry after failure without re-uploading the statement");

// Edit forces re-approval and re-disables button.
ui.editStatement("save_ui_20261108","minimum","5100");
assert.equal(readMarkup("statement-save-draft").disabled,true,
 "Editing the statement must re-disable Save until reviewed");
assert.equal(readMarkup("statement-review-ack").checked,false);

failWrite=false;
assert.equal(await simulateUserClick(),false,"Edits require fresh checkbox approval");
vm.runInContext(change.replace("this.checked","true"),context);
assert.equal(readMarkup("statement-save-draft").disabled,false);
assert.equal(await simulateUserClick(),true);
assert.equal(writeCount,2);
assert(remote?.statements?.length===1);
assert.equal(remote.statements[0].minimum,5100);
assert(root.innerHTML.includes("Firebase arşivinde doğrulandı"),
 "Only successful server read-back may show saved confirmation");
assert(root.innerHTML.includes("Kaydedilmiş ekstreler (1)"));

console.log("PASS: checkbox onchange enables button, actual onclick triggers save, permission error stays visible, edit requires re-approval, successful server read-back confirms");
