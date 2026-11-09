import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyCashFlowPlan,validCashFlowPlan,computeCashFlow,estimateMonthEndCardStatement
} from "../cashflow-model.js";
import {projectBudgetToCashFlow} from "../budget-bridge.js";

test("October payroll is received in November; November payroll in December",()=>{
  const plan=emptyCashFlowPlan();
  plan.startMonth="2026-10";
  plan.cards=[{id:"card_demo",name:"Test kart",openingDebt:0,active:true,
    minPct:40,interestPct:0,interestMode:"manual"}];
  plan.recurringExpenses=[];
  plan.statementSnapshots=[{id:"oct_bill",cardId:"card_demo",dueMonth:"2026-11",
    statementDate:"2026-10-28",balance:10000,minimum:4000}];
  plan.entries=[{id:"nov_pay",type:"card_payment",date:"2026-11-03",amount:4000,
    cardId:"card_demo",note:"October statement paid in November",paymentKind:"minimum"}];
  plan.installments=[{id:"dec_inst",name:"Future installment",cardId:"card_demo",
    startMonth:"2026-12",count:2,amount:1500,active:true}];
  plan.budgetLink={enabled:true,categories:{
    market:{payment:"card",cardId:"card_demo"},
    aidat:{payment:"cash"}
  }};
  const categories={
    income:[{id:"salary",name:"Maaş"},{id:"other",name:"Ek Gelir"}],
    expense:[{id:"market",name:"Market"},{id:"aidat",name:"Aidat"}]
  };
  const values={
    "2026-10":{salary:30000},
    "2026-11":{salary:40000,other:700,market:2500,aidat:600},
    "2026-12":{salary:45000}
  };
  const getBudget=(id,m,y)=>values[y+"-"+String(m+1).padStart(2,"0")]?.[id]||0;
  assert.equal(validCashFlowPlan(plan),true);
  const projected=projectBudgetToCashFlow(plan,categories,getBudget,15);
  const rows=computeCashFlow(projected.plan,15);
  const nov=rows.find(r=>r.month==="2026-11");
  const dec=rows.find(r=>r.month==="2026-12");
  assert.equal(nov.income,30700); // October salary + current month extra
  assert.equal(dec.income,40000);
  assert.equal(nov.cards[0].statementDebt,10000); // October's finalized statement
  assert.equal(nov.actualCardPayments,4000);
  assert.equal(nov.cardPurchases,2500); // November purchases
  const monthEnd=estimateMonthEndCardStatement(plan,nov);
  assert.equal(monthEnd.carryover,6000);
  assert.equal(monthEnd.purchases,2500);
  assert.equal(monthEnd.installments,1500); // December installment
  assert.equal(monthEnd.statementTotal,10000); // payable in December
  assert.equal(monthEnd.minimum,4000);
  assert.equal(monthEnd.dueMonth,"2026-12");
  assert.equal(monthEnd.carryover+monthEnd.purchases+monthEnd.installments+monthEnd.adjustment,
    monthEnd.statementTotal);
  assert.equal(monthEnd.statementTotal,dec.cards[0].statementDebt);
  assert.equal(plan.entries.length,1); // no saved data written over
});
test("bank's next due month statement overrides estimate without losing the difference",()=>{
  const plan=emptyCashFlowPlan();
  plan.startMonth="2026-11";
  plan.cards=[{id:"card_demo",name:"Test kart",openingDebt:0,active:true,
    minPct:40,interestPct:0,interestMode:"manual"}];
  plan.recurringExpenses=[];
  plan.statementSnapshots=[{id:"dec_bill",cardId:"card_demo",dueMonth:"2026-12",
    statementDate:"2026-11-28",balance:12500,minimum:5000}];
  const rows=computeCashFlow(plan,13);
  const end=estimateMonthEndCardStatement(plan,rows[0]);
  assert.equal(end.hasVerified,true);
  assert.equal(end.statementTotal,12500);
  assert.equal(end.minimum,5000);
  assert.equal(end.adjustment,12500);
});
