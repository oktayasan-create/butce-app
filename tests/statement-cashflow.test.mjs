import assert from "node:assert/strict";
import fs from "node:fs";
async function moduleFile(file){
  return import("data:text/javascript;charset=utf-8,"+encodeURIComponent(fs.readFileSync(file,"utf8")
    .replace('./cashflow-model.js','data:text/javascript;charset=utf-8,'+
      encodeURIComponent(fs.readFileSync("cashflow-model.js","utf8")))));
}
const cf=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("cashflow-model.js","utf8")));
const bridge=await moduleFile("statement-plan.js");
const file=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("statement-file-reader.js","utf8")));
const {emptyCashFlowPlan,computeCashFlow,validCashFlowPlan}=cf;
const {prepareStatementPlan,statementInstallmentSchedule,calculateInstallmentTimeline}=bridge;

const p=emptyCashFlowPlan();
p.startMonth="2026-11";p.openingCash=18000;p.autoExtra=false;
const st={id:"garanti_20261030_5030",bank:"Garanti BBVA",cardLabel:"Garanti •••• 5030",
 statementDate:"2026-10-30",dueDate:"2026-11-09",balance:10000,minimum:4000,
 remainingInstallmentsTotal:null,transactions:[
  {id:"t1",date:"2026-10-15",description:"SHOP A",type:"purchase",amount:300,
    installmentCurrent:1,installmentTotal:3,remainingInstallments:2},
  {id:"t2",date:"2026-10-18",description:"SHOP REFUND",type:"refund",amount:100,
    installmentCurrent:1,installmentTotal:3,remainingInstallments:2},
  {id:"t3",date:"2026-10-19",description:"SINGLE",type:"purchase",amount:1000,
    installmentCurrent:null,installmentTotal:null,remainingInstallments:null}
 ]};
const prepared=prepareStatementPlan(p,st,{cardId:"__new",newCardName:"Garanti Kişisel"});
assert.equal(p.cards.length,0,"Preparation must not mutate existing user plan");
assert.equal(prepared.plan.cards.length,1);
assert.equal(prepared.dueMonth,"2026-11");
assert.equal(prepared.installmentsAdded,1);
assert.equal(prepared.remainingSum,600);
assert.equal(prepared.timeline[0].month,"2026-12",
 "Garanti 30 October statement is due in NOV, next installment is paid in DEC");
assert.deepEqual(prepared.timeline.map(x=>x.amount),[300,300]);
assert.equal(prepared.plan.statementSnapshots[0].balance,10000);
assert.equal(prepared.plan.months["2026-11"].minOverrides[prepared.cardId],4000);
assert(validCashFlowPlan(prepared.plan));
const rows=computeCashFlow(prepared.plan,3);
assert.equal(rows[0].minimumTotal,4000);
assert.equal(rows[0].openingDebt,0,"Manual opening remains unchanged");
assert.equal(rows[0].cards[0].statementDebt,10000,"Use bank statement for due month");
assert.equal(rows[0].installmentTotal,0,"Do not bill the second installment a month too early");
assert.equal(rows[1].installmentTotal,300);
assert.equal(rows[2].installmentTotal,300);
assert.equal(rows[0].cardSpending,0,"Never import the same billed purchases as new purchases");

// Idempotent same statement import and category data safety.
const again=prepareStatementPlan(prepared.plan,st,{cardId:prepared.cardId});
assert.equal(again.plan.installments.length,1);
assert.equal(again.plan.statementSnapshots.length,1);
assert.equal(again.plan.statementSnapshots[0].minimum,4000);
assert.equal(again.replacedInstallments,1);

// An updated statement supersedes the previous automatic schedule.
const next={...st,id:"garanti_20261129_5030",statementDate:"2026-11-29",
  dueDate:"2026-12-09",balance:6800,minimum:2720,
  transactions:[{...st.transactions[0],id:"t1new",installmentCurrent:2,
     installmentTotal:3,remainingInstallments:1}]};
const updated=prepareStatementPlan(prepared.plan,next,{cardId:prepared.cardId});
assert.equal(updated.plan.installments.length,1);
assert.equal(updated.plan.installments[0].startMonth,"2027-01");
const rr=computeCashFlow(updated.plan,3);
assert.equal(rr[1].cards[0].statementDebt,6800,
 "New bank statement overrides simulated balance and already-billed installments");
assert.equal(rr[1].cards[0].minimum,2720);
assert.equal(rr[1].cardSpending,0,"Upcoming installment included in verified statement must not double count");
assert.equal(rr[2].installmentTotal,300);

// A separate Enpara card for spouse is not conflated with personal Enpara.
const enp1={...st,id:"enpara_20261102_0079",bank:"Enpara",
  cardLabel:"Enpara •••• 0079",statementDate:"2026-11-02",
  dueDate:"2026-11-12",balance:2300,minimum:460,transactions:[]};
const enp2={...enp1,id:"enpara_20261102_2222",cardLabel:"Enpara •••• 2222",
  balance:1500,minimum:300};
const first=prepareStatementPlan(p,enp1,{cardId:"__new",newCardName:"Enpara - Ben"});
const second=prepareStatementPlan(first.plan,enp2,{cardId:"__new",newCardName:"Enpara - Damla"});
assert.equal(second.plan.cards.length,2);
assert.notEqual(second.plan.cards[0].id,second.plan.cards[1].id);
assert.equal(second.plan.statementSnapshots.length,2);
assert.equal(computeCashFlow(second.plan,1)[0].minimumTotal,760);

const manual=emptyCashFlowPlan();
manual.startMonth="2026-11";manual.cards=[{
  id:"manual_card",name:"YKB",openingDebt:0,minPct:40,interestPct:3.75,
  interestMode:"auto",active:true
}];
manual.installments=[{id:"manual_inst",name:"Manual obligation",cardId:"manual_card",
  amount:400,startMonth:"2026-12",count:4,active:true}];
const ykb={...st,id:"ykb_20261108_9440",bank:"Yapı Kredi",
 statementDate:"2026-11-08",dueDate:"2026-11-18",balance:13300,minimum:5300,
 remainingInstallmentsTotal:600,transactions:[{
   id:"ykb_t1",date:"2026-10-20",description:"SHOP",amount:300,
   type:"purchase",installmentCurrent:5,installmentTotal:7,remainingInstallments:2
 }]};
const ykbOut=prepareStatementPlan(manual,ykb,{cardId:"manual_card"});
assert.equal(ykbOut.plan.installments.length,2,
 "Never wipe out user-entered manual installment");
assert.equal(ykbOut.plan.installments[0].id,"manual_inst");
assert.equal(ykbOut.remainingSum,600);
assert.equal(ykbOut.diff,0);
assert.equal(ykbOut.plan.statementSnapshots[0].minimum,5300);
assert(validCashFlowPlan(ykbOut.plan));
assert.throws(()=>prepareStatementPlan(ykbOut.plan,st,{cardId:"manual_card"}),
 "Cannot apply a different older statement over a newer one on the same card");

// Actual columns in the source PDFs; values are synthetic and deliberately
// contain no card numbers, owner identities or transaction records.
const part=(x,str)=>({x,str});
const row=(text,parts=[])=>({text,parts});
const fixture=[
 row("Bonus Gold Troy Bilgileriniz"),
 row("Hesap Kesim Tarihi 30 Ekim 2026"),
 row("Son Ödeme Tarihi 09 Kasım 2026"),
 row("Dönem Borcunuz 10.000,00 TL"),
 row("Min. Ödeme Tutarı 4.000,00 TL"),
 row("Kart Numarası ** **** 5030"),
 row("İşlem Tarihi Dönem İçi İşlemler Kalan Borç / Taksit Bonus (TL) Tutar (TL)"),
 row("15 Ekim 2026 SHOP A 300,00x3=900,00 1.Taksit 1,00 300,00",
  [part(105,"15"),part(115,"Ekim"),part(132,"2026"),
   part(170,"SHOP A"),part(303,"300,00x3=900,00"),part(371,"1.Taksit"),
   part(430,"1,00"),part(525,"300,00")]),
 row("15 Ekim 2026 BONUS MARKET KAMPANYASI 500,00",
  [part(105,"15"),part(115,"Ekim"),part(132,"2026"),part(170,"BONUS MARKET KAMPANYASI"),
   part(424,"500,00")]),
 row("TOPLAM 10.000,00")
];
const parsed=file.parseStatementPDFRows(fixture,"garanti.pdf","hash9876");
assert.equal(parsed.statement.bank,"Garanti BBVA");
assert.equal(parsed.statement.balance,10000);
assert.equal(parsed.statement.minimum,4000);
assert.equal(parsed.statement.dueDate,"2026-11-09");
assert.equal(parsed.statement.transactions.length,1,"Do not treat bank reward points as purchases");
assert.equal(parsed.statement.transactions[0].amount,300);
assert.equal(parsed.statement.transactions[0].remainingInstallments,2);
const forecastInstallments=statementInstallmentSchedule(parsed.statement,"goodcard");
assert.equal(forecastInstallments[0].startMonth,"2026-12");
assert.deepEqual(calculateInstallmentTimeline(forecastInstallments).map(x=>x.month),["2026-12","2027-01"]);
console.log("PASS: bank snapshots, no double-counting, future installment dates, duplicate-proof replanning, Enpara spouse card and actual PDF column fixture");
