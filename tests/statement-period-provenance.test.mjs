import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {emptyCashFlowPlan,computeCashFlow,advanceMonth} from "../cashflow-model.js";
import {statementBilledInstallments,statementInstallmentSchedule} from "../statement-plan.js";
import {createCashflowForecastUI} from "../cashflow-forecast-ui.js";
import {FORECAST_FIELDS,INSTALLMENT_FIELDS,sourceForForecastColumn,sourceForInstallmentColumn,
  sourceForOverviewColumn,summarySource} from "../finance-source-map.js";
const folder=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=x=>readFileSync(join(folder,x),"utf8");

test("Bank November bill includes billed installment; only future unpaid installments start December",()=>{
 const st={
  id:"bank_bill_nov",statementDate:"2026-11-02",dueDate:"2026-11-12",
  balance:10000,minimum:4000,
  transactions:[
   {id:"a",type:"purchase",amount:1500,description:"Test taksidi 2/4",
     installmentCurrent:2,installmentTotal:4,remainingInstallments:2},
   {id:"b",type:"purchase",amount:400,description:"Normal harcama",
     installmentCurrent:null,installmentTotal:null,remainingInstallments:null}
  ]
 };
 const billed=statementBilledInstallments(st);
 assert.equal(billed.dueMonth,"2026-11");
 assert.equal(billed.amount,1500);
 assert.equal(billed.count,1);
 const future=statementInstallmentSchedule(st,"demo");
 assert.equal(future.length,1);
 assert.equal(future[0].startMonth,"2026-12");
 assert.equal(future[0].count,2);
 const plan=emptyCashFlowPlan();
 plan.startMonth="2026-11";
 plan.recurringExpenses=[];
 plan.cards=[{id:"demo",name:"Demo",active:true,openingDebt:0,minPct:40,
   interestPct:3.25,interestMode:"manual"}];
 plan.installments=future;
 plan.statementSnapshots=[{id:"snapshot",cardId:"demo",dueMonth:"2026-11",
   statementDate:st.statementDate,balance:10000,minimum:4000}];
 const [nov,dec]=computeCashFlow(plan,2);
 assert.equal(nov.cards[0].statementDebt,10000);
 assert.equal(nov.installmentTotal,0); // future-only plan metric
 assert.equal(dec.installmentTotal,1500);
 assert.equal(billed.amount+nov.cards[0].statementDebt,11500); // MUST NOT be used as owed
});

test("Missing due date never silently shifts installments to a guessed month",()=>{
 const st={
  id:"undated",statementDate:"2026-10-31",dueDate:null,
  transactions:[{id:"a",type:"purchase",amount:600,
    installmentCurrent:1,installmentTotal:3,remainingInstallments:2}]
 };
 assert.equal(statementBilledInstallments(st).dueMonth,null);
 assert.equal(statementBilledInstallments(st).amount,600);
 assert.throws(()=>statementInstallmentSchedule(st,"demo"),/son ödeme tarihi/);
});

test("36-month forecasting can select an independent future chart interval",()=>{
 const p=emptyCashFlowPlan();
 p.startMonth="2026-11";
 p.recurringExpenses=[];
 const rows=computeCashFlow(p,36);
 assert.equal(rows.length,36);
 assert.equal(rows[0].month,"2026-11");
 assert.equal(rows[35].month,advanceMonth("2026-11",35));
 const ui=createCashflowForecastUI({money:x=>String(x),monthLabel:x=>x});
 const initial=ui.render(rows.slice(0,12),p,rows);
 assert.match(initial,/data-cf-range="start"/);
 assert.match(initial,/data-cf-range="end"/);
 assert.match(initial,/2029-10/);
 ui.setRange("start","2028-03");
 ui.setRange("end","2028-08");
 const selected=ui.render(rows.slice(0,12),p,rows);
 assert.match(selected,/value="2028-03" selected/);
 assert.match(selected,/value="2028-08" selected/);
 // The financial table is still a 12-month summary while chart is selected future months.
 assert.match(selected,/2026-11/);
 assert.ok(selected.indexOf("<svg")>0);
 ui.setRange("start","2029-10");
 const corrected=ui.render(rows.slice(0,12),p,rows);
 assert.match(corrected,/value="2029-10" selected/);
 assert.match(corrected,/cf-forecast-sources/);
});

test("Source mappings are stable for all forecast and archive installments",()=>{
 assert.equal(FORECAST_FIELDS.length,17);
 assert.equal(INSTALLMENT_FIELDS.length,4);
 assert.equal(sourceForForecastColumn(1),"budget");
 assert.equal(sourceForForecastColumn(6),"statements");
 assert.equal(sourceForForecastColumn(7),"statements");
 assert.equal(sourceForForecastColumn(5),"installments");
 assert.equal(sourceForInstallmentColumn(1),"statements");
 assert.equal(sourceForInstallmentColumn(2),"installments");
 assert.equal(sourceForOverviewColumn(2),"actual");
 assert.equal(summarySource("Gerçekleşen gelir"),"actual");
});

test("Read-only UI navigates to sources, puts minimum after target, and removes KMH file importer",()=>{
 const index=read("index.html"),forecast=read("cashflow-forecast-ui.js");
 assert.ok(index.indexOf('id="dnav-overview"')<index.indexOf('id="dnav-cashflow"'));
 assert.ok(index.indexOf('id="mnav-overview"')<index.indexOf('id="mnav-cashflow"'));
 assert.match(index,/let curTab="overview"/);
 assert.match(index,/Ekstreye yansımış taksitler/);
 assert.match(index,/cfBilledMonthBreakdown/);
 assert.match(index,/window.cfOpenDataSource/);
 assert.match(index,/document\.addEventListener\("dblclick"/);
 assert.doesNotMatch(index,/cfImportSnapshotExcel/);
 assert.doesNotMatch(index,/Mevcut Durum Excel dosyasından/);
 assert.match(forecast,/<th>Kart ödeme hedefi<\/th><th>Gelecek ay asgari<\/th>/);
 assert.match(forecast,/cf-chart-range/);
 assert.match(read("sw.js"),/butceapp-shell-v20/);
 assert.match(read("sw.js"),/finance-source-map\.js\?v=20/);
});
