import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyCashFlowPlan,validCashFlowPlan,computeCashFlow,estimateMonthEndCardStatement
} from "../cashflow-model.js";
import {projectBudgetToCashFlow} from "../budget-bridge.js";

test("Income categories stay in their own budget month, card debt flows to next due month",()=>{
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
  assert.equal(nov.income,40700); // November salary plus current-month extra
  assert.equal(dec.income,45000);
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

test("Oktay and Damla's November budget sum and January increase stay in matching months",()=>{
  const plan=emptyCashFlowPlan();
  plan.startMonth="2026-10";
  plan.recurringExpenses=[];
  plan.overdraft.openingDebt=26000;
  plan.overdraft.limit=100000;
  const categories={income:[
    {id:"oktay_salary",name:"Oktay Maaş"},
    {id:"damla_salary",name:"Damla Maaş"},
    {id:"damla_lessons",name:"Damla Ek Ders"}
  ],expense:[]};
  const source={
    "2026-11":{oktay_salary:125000,damla_salary:45000,damla_lessons:0},
    "2026-12":{oktay_salary:125000,damla_salary:45000},
    "2027-01":{oktay_salary:200000,damla_salary:57000}
  };
  const getBudget=(id,monthIndex,year)=>
    source[year+"-"+String(monthIndex+1).padStart(2,"0")]?.[id]||0;
  const projected=projectBudgetToCashFlow(plan,categories,getBudget,16);
  const rows=computeCashFlow(projected.plan,16);
  const nov=rows.find(row=>row.month==="2026-11");
  const dec=rows.find(row=>row.month==="2026-12");
  const jan=rows.find(row=>row.month==="2027-01");
  assert.equal(nov.income,170000);
  assert.equal(dec.income,170000);
  assert.equal(jan.income,257000);
  assert.equal(rows[0].openingOverdraft,26000);
  assert.equal(typeof nov.closingOverdraft,"number");
  assert.equal(plan.overdraft.openingDebt,26000);
});

test("Card carryover includes interest/tax but is not added twice",()=>{
  const p=emptyCashFlowPlan();
  p.startMonth="2026-11";
  p.recurringExpenses=[];
  p.cards=[{id:"card_demo",name:"Test card",active:true,openingDebt:10000,
    minPct:40,interestPct:3.25,interestMode:"manual"}];
  p.entries=[{id:"pay_nov",type:"card_payment",date:"2026-11-03",
    amount:4000,cardId:"card_demo",note:"Minimum payment",paymentKind:"minimum"},
    {id:"purchase_nov",type:"card_expense",date:"2026-11-09",
    amount:2500,categoryId:"exp_market",cardId:"card_demo",note:"New purchase"}];
  p.installments=[{id:"installment_dec",name:"Next due installment",cardId:"card_demo",
    amount:1500,count:2,startMonth:"2026-12",active:true}];
  const forecast=computeCashFlow(p,13)[0];
  const closing=estimateMonthEndCardStatement(p,forecast);
  assert.equal(closing.carryover,6253.50); // 6,000 unpaid + 195 interest + 58.50 tax
  assert.equal(closing.purchases,2500);
  assert.equal(closing.installments,1500);
  assert.equal(closing.statementTotal,10253.50);
  assert.equal(closing.dueMonth,"2026-12");
});
