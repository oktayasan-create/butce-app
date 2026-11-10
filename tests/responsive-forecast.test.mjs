import test from "node:test";
import assert from "node:assert/strict";
import {emptyCashFlowPlan,computeCashPositionTable} from "../cashflow-model.js";
import {createCashflowForecastUI} from "../cashflow-forecast-ui.js";

// Synthetic values. This test never reads Firestore or personal bank records.
function fixture(){
  const p=emptyCashFlowPlan();
  p.startMonth="2026-11";
  p.recurringExpenses=[];
  p.cards=[{id:"card_demo",name:"Test card",active:true,openingDebt:0,
    minPct:40,interestPct:0,interestMode:"manual"}];
  p.overdraft.actualSnapshot={month:"2026-11",debt:28528};
  const rows=[
    {month:"2026-11",openingCash:0,openingOverdraft:26000,
      income:170000,loanPayments:76636,fixedCash:0,otherCash:2800,
      cards:[{id:"card_demo",name:"Test card",closing:10000,newSpending:2500}]},
    {month:"2026-12",openingCash:0,openingOverdraft:26000,
      income:125000,loanPayments:76636,fixedCash:0,otherCash:2800,
      cards:[{id:"card_demo",name:"Test card",closing:15000,newSpending:3000}]}
  ];
  return {p,rows};
}

test("monthly net equals income minus expenses and cumulative savings carries opening deficit",()=>{
  const {p,rows}=fixture();
  const r=computeCashPositionTable(p,rows);
  assert.equal(r[0].totalExpenses,117964);
  assert.equal(r[0].monthlyNet,52036);
  assert.equal(r[0].netClosing,52036);
  assert.equal(r[0].closingSavings,52036);
  assert.equal(r[1].netOpening,52036);
  assert.equal(r[1].monthlyNet,r[1].income-r[1].totalExpenses);
  assert.equal(r[1].closingSavings,r[0].closingSavings+r[1].monthlyNet);
  assert.equal(p.overdraft.actualSnapshot.debt,28528);
});

test("responsive forecast renders mobile cards, compact table, full-screen action, and chart controls",()=>{
  const {p,rows}=fixture();
  const ui=createCashflowForecastUI({
    money:x=>Number(x).toFixed(2)+" TL",monthLabel:x=>x
  });
  const html=ui.render(rows,p);
  assert.match(html,/Aylık net \(Gelir − Harcama\)/);
  assert.match(html,/Toplam birikim/);
  assert.match(html,/52036\.00 TL/);
  assert.match(html,/52036\.00 TL/);
  assert.match(html,/cf-mobile-month/);
  assert.match(html,/cfForecastFullscreen\(\)/);
  assert.match(html,/12 aylık finansal görünüm/);
  assert.match(html,/Grafikte görünmesini istediğin verileri seç/);
  assert.match(html,/cfChartToggle\('closingCardDebt'/);
  assert.match(html,/Hepsini seç/);
  assert.match(html,/Tümünü kaldır/);
  assert.match(html,/<svg role="img"/);
  ui.toggle("monthlyNet",false);
  assert.doesNotMatch(ui.render(rows,p),/data-cf-chart-key="monthlyNet" checked/);
  ui.preset("all");
  assert.match(ui.render(rows,p),/data-cf-chart-key="monthlyNet" checked/);
  ui.preset("none");
  assert.doesNotMatch(ui.render(rows,p),/data-cf-chart-key="monthlyNet" checked/);
  ui.preset("default");
  assert.match(ui.render(rows,p),/data-cf-chart-key="closingCardDebt" checked/);
});
