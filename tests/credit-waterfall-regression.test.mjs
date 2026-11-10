import test from "node:test";
import assert from "node:assert/strict";
import {emptyCashFlowPlan,computeCashPositionTable,validCashFlowPlan} from "../cashflow-model.js";

// All figures are synthetic; no personal Firestore records are accessed.
const round = n=>Math.round((n+Number.EPSILON)*100)/100;
function makePlan(startMonth, cards, kmh=0, limit=100000) {
  const plan=emptyCashFlowPlan();
  plan.startMonth=startMonth;
  plan.cards=cards.map(({id,debt=0,min=40,interest=3.25})=>({
    id,name:id,active:true,openingDebt:0,minPct:min,interestPct:interest,interestMode:"manual"
  }));
  plan.recurringExpenses=[];
  plan.overdraft.openingDebt=0;
  plan.overdraft.actualSnapshot={month:startMonth,debt:kmh};
  plan.overdraft.limit=limit;
  return plan;
}
function mkRow(month,income,loans,cashExpenses,cards){
  return {month,income,loanPayments:loans,otherCash:cashExpenses,fixedCash:0,
    openingCash:0,openingOverdraft:0,cards:cards.map(c=>({
      id:c.id,name:c.id,newSpending:c.newSpending||0,closing:c.closing||0
    }))};
}

test("January example pays KMH, all mandatory bills and then the credit card before saving",()=>{
  const plan=makePlan("2027-01",[{id:"a"}],42917.39);
  plan.statementSnapshots=[{
    id:"bank_feb",cardId:"a",dueMonth:"2027-02",
    statementDate:"2027-01-28",balance:186408.79,minimum:69384.83
  }];
  const rows=[mkRow("2027-01",257000,76636,5730,[{id:"a",closing:186408.79}])];
  assert.equal(validCashFlowPlan(plan),true);
  const [jan]=computeCashPositionTable(plan,rows);
  assert.equal(jan.card.statementTotal,186408.79);
  assert.equal(jan.minimum,69384.83);
  assert.equal(jan.overdraftRepaid,42917.39);
  assert.equal(jan.cardPayments,131716.61);
  assert.equal(jan.closingCardDebt,54692.18);
  assert.equal(jan.cardExtraPayments,62331.78);
  assert.equal(jan.closingOverdraft,0);
  assert.equal(jan.closingSavings,0);
  assert.equal(jan.monthlyNet,0);
  assert.equal(jan.totalRequired,311692.18);
  assert.equal(jan.unfundedMandatory,0);
  // Scenario data must never write/erase the user's original forecast records.
  assert.equal(plan.overdraft.actualSnapshot.debt,42917.39);
});

test("unpaid card debt rolls forward and attracts interest, without phantom savings",()=>{
  const plan=makePlan("2027-01",[{id:"a",interest:3.25}],42917.39);
  plan.statementSnapshots=[{
    id:"bank_feb",cardId:"a",dueMonth:"2027-02",
    statementDate:"2027-01-28",balance:186408.79,minimum:69384.83
  }];
  const rows=[
    mkRow("2027-01",257000,76636,5730,[{id:"a",closing:186408.79}]),
    mkRow("2027-02",0,0,0,[{id:"a",closing:0,newSpending:5000}])
  ];
  const [jan,feb]=computeCashPositionTable(plan,rows);
  assert.equal(feb.card.carryover,
    round(jan.closingCardDebt+
      round(jan.closingCardDebt*3.25/100*1.30)));
  assert.equal(feb.card.purchases,5000);
  assert.equal(feb.openingOverdraft,0);
  assert.equal(feb.closingSavings,0);
  assert.ok(feb.closingCardDebt>jan.closingCardDebt);
  assert.ok(feb.overdraftDraw>=feb.minimumPaid);
});

test("KMH funds only mandatory shortfall within limit; unpaid essential bills carry forward",()=>{
  const plan=makePlan("2027-01",[],0,10000);
  const rows=[mkRow("2027-01",0,25000,0,[]),
    mkRow("2027-02",30000,0,0,[])];
  const [jan,feb]=computeCashPositionTable(plan,rows);
  assert.equal(jan.overdraftDraw,10000);
  assert.equal(jan.unfundedMandatory,15000);
  assert.equal(jan.unpaidEssentials,15000);
  assert.equal(jan.totalExpenses,10000);
  assert.equal(jan.closingOverdraft,10000);
  assert.equal(jan.closingSavings,0);
  assert.equal(feb.priorUnfundedEssentials,15000);
  assert.ok(feb.essentialsPaid>=15000);
  assert.equal(feb.unfundedMandatory,0);
});

test("after KMH repayment, extra cash targets higher-interest card first",()=>{
  const plan=makePlan("2027-01",[
    {id:"low",interest:1,min:40},{id:"high",interest:8,min:40}
  ],0);
  const rows=[mkRow("2027-01",26000,0,0,[
    {id:"low",closing:20000},{id:"high",closing:20000}
  ])];
  const [month]=computeCashPositionTable(plan,rows);
  assert.equal(month.minimum,16000);
  assert.equal(month.cardPayments,26000);
  const low=month.card.cards.find(c=>c.id==="low");
  const high=month.card.cards.find(c=>c.id==="high");
  assert.equal(low.cardPayment,8000);
  assert.equal(high.cardPayment,18000);
  assert.equal(month.closingCardDebt,14000);
  assert.equal(month.closingSavings,0);
});

test("savings emerge only after zero KMH and zero card balance",()=>{
  const plan=makePlan("2027-01",[{id:"a"}],5000);
  const rows=[mkRow("2027-01",60000,10000,0,[{id:"a",closing:30000}])];
  const [month]=computeCashPositionTable(plan,rows);
  assert.equal(month.overdraftRepaid,5000);
  assert.equal(month.cardPayments,30000);
  assert.equal(month.closingCardDebt,0);
  assert.equal(month.closingOverdraft,0);
  assert.equal(month.closingSavings,15000);
  assert.equal(month.monthlyNet,15000);
});
