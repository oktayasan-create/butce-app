import test from "node:test";
import assert from "node:assert/strict";
import {emptyCashFlowPlan,validCashFlowPlan,computeCashPositionTable} from "../cashflow-model.js";

function sample(month,income){
  return {
    month,openingCash:0,openingOverdraft:99000,
    income,loanPayments:30000,fixedCash:0,otherCash:5000,
    cards:[{id:"card_demo",name:"Test",closing:50000,newSpending:0}]
  };
}
test("Excel K=C+H+I and L/M include prior actual KMH balance",()=>{
  const p=emptyCashFlowPlan();
  p.startMonth="2026-11";
  p.cards=[{id:"card_demo",name:"Test card",active:true,openingDebt:0,
    minPct:40,interestPct:0,interestMode:"manual"}];
  p.overdraft.actualSnapshot={month:"2026-11",debt:12000};
  assert.equal(validCashFlowPlan(p),true);
  const result=computeCashPositionTable(p,[sample("2026-11",50000),sample("2026-12",100000)]);
  assert.equal(result[0].snapshotUsed,true);
  assert.equal(result[0].netOpening,-12000); // NOT historical forecast -99000
  assert.equal(result[0].minimum,20000);
  assert.equal(result[0].totalExpenses,55000);
  assert.equal(result[0].netClosing,-17000); // -12000 + 50000 - 55000
  assert.equal(result[0].closingOverdraft,17000);
  assert.equal(result[0].closingSavings,0);
  assert.equal(result[1].netOpening,-17000);
  assert.equal(result[1].totalExpenses,55000);
  assert.equal(result[1].closingOverdraft,0);
  assert.equal(result[1].closingSavings,28000);
  assert.equal(p.overdraft.openingDebt,0); // historical source untouched
});
test("Snapshot is optional for old saved cashflow plans",()=>{
  const p=emptyCashFlowPlan();
  p.startMonth="2026-11";
  p.cards=[{id:"card_demo",name:"Test",active:true,
    openingDebt:0,minPct:40,interestPct:0,interestMode:"manual"}];
  delete p.overdraft.actualSnapshot;
  assert.equal(validCashFlowPlan(p),true);
  const result=computeCashPositionTable(p,[sample("2026-11",50000)]);
  assert.equal(result[0].snapshotMissing,true);
  assert.equal(result[0].netOpening,-99000);
});
test("Bad actual balance snapshots reject persistence",()=>{
  const p=emptyCashFlowPlan();
  p.overdraft.actualSnapshot={month:"2026-13",debt:10};
  assert.equal(validCashFlowPlan(p),false);
  p.overdraft.actualSnapshot={month:"2026-11",debt:-10};
  assert.equal(validCashFlowPlan(p),false);
});
