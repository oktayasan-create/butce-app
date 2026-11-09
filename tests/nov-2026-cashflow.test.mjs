import test from "node:test";
import assert from "node:assert/strict";
import {emptyCashFlowPlan,validCashFlowPlan,computeCashFlow} from "../cashflow-model.js";
import {statementDueMonth} from "../statement-plan.js";

// Mock values only — not the account owner's financial records.
test("October salary and spending carry into November payment without duplication",()=>{
  const p=emptyCashFlowPlan();
  p.startMonth="2026-10";
  p.openingCash=0;
  p.recurringIncome=[];
  p.recurringExpenses=[];
  p.cards=[{id:"card_demo",name:"Test kartı",active:true,
    openingDebt:0,minPct:40,interestPct:3.25,interestMode:"manual"}];
  p.entries=[
    {id:"salary_oct",type:"income",date:"2026-10-01",
      amount:50000,categoryId:"inc_salary",note:"October salary"},
    {id:"spend_oct",type:"card_expense",date:"2026-10-15",
      amount:10000,categoryId:"exp_market",cardId:"card_demo",note:"October expense"},
    {id:"pay_nov",type:"card_payment",date:"2026-11-03",
      amount:10000,cardId:"card_demo",note:"November payment",paymentKind:"full"},
    {id:"spend_nov",type:"card_expense",date:"2026-11-10",
      amount:2000,categoryId:"exp_market",cardId:"card_demo",note:"November expense"}
  ];
  p.statementSnapshots=[{id:"snapshot_nov",cardId:"card_demo",
    dueMonth:"2026-11",statementDate:"2026-10-28",balance:10000,minimum:4000}];
  assert.equal(validCashFlowPlan(p),true);
  const rows=computeCashFlow(p,14);
  const october=rows.find(r=>r.month==="2026-10");
  const november=rows.find(r=>r.month==="2026-11");
  const december=rows.find(r=>r.month==="2026-12");
  assert.equal(october.income,50000);
  assert.equal(november.income,0);
  assert.equal(november.cards[0].statementDebt,10000);
  assert.equal(november.cardCashOutflow,10000);
  assert.equal(november.cardPurchases,2000);
  assert.equal(november.closingDebt,2000);
  assert.equal(december.cards[0].statementDebt,2000);
  assert.equal(rows.filter(row=>row.month>="2026-11").length,13);
});
test("statement is grouped by due month, not purchase/statement month",()=>{
  assert.equal(statementDueMonth({
    statementDate:"2026-10-28",dueDate:"2026-11-05"
  }),"2026-11");
  assert.equal(statementDueMonth({
    statementDate:"2026-10-28",dueDate:""
  }),null);
});
