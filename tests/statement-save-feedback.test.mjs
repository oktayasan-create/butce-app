import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const imported=await import("data:text/javascript;charset=utf-8,"+
 encodeURIComponent(fs.readFileSync("statement-import.js","utf8")));
const reader=await import("data:text/javascript;charset=utf-8,"+
 encodeURIComponent(fs.readFileSync("statement-file-reader.js","utf8")));

const part=(x,str)=>({x,str});
const r=(text,parts=[],page=3)=>({text,parts,page});
const ykbRows=[
 r("HESAP BİLGİLERİ"),r("Hesap Kesim Tarihi 08 Kasım 2026"),
 r("Son Ödeme Tarihi 18 Kasım 2026"),
 r("Dönem Borcu : 132.287,35 TL"),
 r("Ödenmesi Gereken Asgari Tutar/Oran : 52.019,28 TL / 40%"),
 r("Kalan Toplam Taksit Tutarı : 11.459,25 TL"),
 r("Kart Numarası: 0000 00** **** 9157"),
 r("İşlem Tarihi İşlemler Tutar(TL) Kalan Tutar/Taksit Puan"),
 r("02 Kasım 2026 TEST STORE TR",[
   part(40,"02"),part(52,"Kasım"),part(80,"2026"),part(120,"TEST STORE TR")
 ]),
 r("TOPLAM 132.287,35")
];
const out=reader.parseStatementPDFRows(ykbRows,"ykb.pdf","testabcdefgh");
assert.equal(out.statement.bank,"Yapı Kredi");
assert(out.warnings.some(w=>w.includes("1 işlem satırında tutar okunamadı")));
assert(out.warnings.some(w=>w.includes("sayfa 3")&&w.includes("2026-11-02")&&
  w.includes("TEST STORE TR")),"Warning must identify date, PDF page and omitted description");

let src=fs.readFileSync("statement-ui.js","utf8").split("\n")
  .filter(line=>!line.startsWith("import ")).join("\n")
  .replace("export function createStatementInboxUI(","function createStatementInboxUI(");
src+="\nthis.createStatementInboxUI=createStatementInboxUI;";
const el={innerHTML:""};
const statusNode={textContent:"",className:""};
const document={
 getElementById(id){return id==="cf-statement-panel"?el:
    id==="statement-save-status"?statusNode:null;}
};
const auth={currentUser:{uid:"testing"}};
let remote=null,failWrites=true,writes=0;
const fakeSnap=()=>({exists:()=>!!remote,data:()=>({inbox:remote})});
let instance;
const sandbox={document,auth,Intl,Date,Number,Array,Math,JSON,String,
 structuredClone,
 ...imported,
 parseStatementFile:async()=>{throw Error("not needed")},
 prepareStatementPlan:()=>{},statementDueMonth:()=>null,
 statementInstallmentSchedule:()=>[],calculateInstallmentTimeline:()=>[],
 Error,console};
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
instance=sandbox.createStatementInboxUI({
 auth,db:{},doc:(...args)=>args.join("/"),
 getDocFromServer:async()=>fakeSnap(),
 setDoc:async (_d,payload)=>{
   writes++;
   if(failWrites){const e=new Error("Missing or insufficient permissions");
     e.code="permission-denied";throw e;}
   remote=structuredClone(payload.inbox);
 },
 safeHtml:v=>String(v).replace(/[&<>"']/g,c=>({
   "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
 getPlan:()=>({categories:{expense:[{name:"Market"},{name:"Diğer"}]},cards:[]}),
 rerender:()=>instance.render(),
 notify:()=>{}
});
instance.render();
await new Promise(resolve=>setImmediate(resolve));
const bundle={format:"butceapp-statement-review-v1",statements:[{
  id:"ykb_review_20261108",bank:"Yapı Kredi",cardLabel:"YKB Test",
  statementDate:"2026-11-08",dueDate:"2026-11-18",periodLabel:"2026-11",
  balance:13300,minimum:5300,previousBalance:null,periodSpending:null,
  remainingInstallmentsTotal:null,transactions:[{
    id:"t1",date:"2026-10-22",description:"Test grocery",amount:200,
    type:"purchase",category:"Market",installmentCurrent:null,
    installmentTotal:null,remainingInstallments:null
  }]
}]};
await instance.selectFile({files:[{
 name:"sample.json",size:200,async text(){return JSON.stringify(bundle)}
}]});
instance.reviewAck(true);
await instance.saveDraft();
assert.equal(writes,1);
assert.equal(remote,null,"No unauthorized database mutation");
assert(el.innerHTML.includes("permission-denied"),
 "Firebase permission failure must remain visible in the panel");
assert(el.innerHTML.includes("Ekstre"),
 "User's draft must remain after permission denial");
failWrites=false;
await instance.saveDraft();
assert.equal(writes,2);
assert.equal(remote.statements.length,1);
assert(el.innerHTML.includes("Firebase arşivinde doğrulandı"),
 "Success must only display after server read-back");
assert(el.innerHTML.includes("Kaydedilmiş ekstreler (1)"));
assert.equal(remote.statements[0].balance,13300);
assert(src.slice(src.indexOf("async function saveDraft()"),src.indexOf("async function saveCategories()"))
  .includes("getDocFromServer"),"Save must verify server write");
assert(!src.slice(src.indexOf("async function saveDraft()"),src.indexOf("async function saveCategories()"))
  .includes("confirm("),"Do not depend on potentially blocked browser confirmation popup");
console.log("PASS: missing YKB row shows its PDF page/date/text; Firebase errors remain visible and successful saves verify server state");
