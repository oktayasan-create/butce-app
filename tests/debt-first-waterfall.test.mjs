import test from "node:test";
import assert from "node:assert/strict";
import {emptyCashFlowPlan,computeCashPositionTable,validCashFlowPlan} from "../cashflow-model.js";

const money=(n)=>Math.round(n*100)/100;
function setup({card=186408.79,minimumRate=40,kmh=42917.39,limit=100000,interest=3.75,kmhInterest=0}={}){
  const p=emptyCashFlowPlan();
  p.startMonth="2027-01";
  p.recurringExpenses=[];
  p.overdraft.actualSnapshot={month:"2027-01",debt:kmh};
  p.overdraft.limit=limit;
  p.overdraft.interestPct=kmhInterest;
  p.cards=[{id:"card_test",name:"Test kartı",active:true,openingDebt:0,minPct:minimumRate,
    interestPct:interest,interestMode:"manual"}];
  const first=(income=257000,loans=76636,cashExpenses=5730)=>({
    month:"2027-01",openingCash:0,openingOverdraft:0,income,loanPayments:loans,
    fixedCash:0,otherCash:cashExpenses,cards:[{id:"card_test",name:"Test kartı",
      closing:card,newSpending:0}]
  });
  return {p,first};
}

test("January 2027: mandatory payments, KMH payoff then cards; 54,692.18 TL card carry, no savings",()=>{
  const {p,first}=setup();
  const [r]=computeCashPositionTable(p,[first()]);
  assert.equal(r.totalRequired,311692.18);
  assert.equal(r.card.statementTotal,186408.79);
  assert.equal(r.overdraftRepaid,42917.39);
  assert.equal(r.cardPayments,131716.61);
  assert.equal(r.closingCardDebt,54692.18);
  assert.equal(r.closingOverdraft,0);
  assert.equal(r.closingSavings,0);
  assert.equal(r.monthlyNet,0);
  assert.equal(r.totalExpenses,257000);
  assert.equal(r.cardPayments+r.closingCardDebt,r.card.statementTotal);
  assert.equal(p.overdraft.actualSnapshot.debt,42917.39);
});

test("Revolving card debt goes to next month with interest and tax, never phantom savings",()=>{
  const {p,first}=setup();
  const next={...first(120000,76636,5730),month:"2027-02",
    cards:[{id:"card_test",name:"Test kartı",closing:999999,newSpending:5000}]};
  const [jan,feb]=computeCashPositionTable(p,[first(),next]);
  assert.equal(jan.closingCardDebt,54692.18);
  const taxMultiplier=1+(p.tax.kkdfPct+p.tax.bsmvPct)/100;
  const interest=money(jan.closingCardDebt*3.75/100*taxMultiplier);
  assert.equal(feb.card.carryover,money(jan.closingCardDebt+interest));
  assert.equal(feb.card.purchases,5000);
  // The second month's incorrect legacy engine card closing must not be reused.
  assert.notEqual(feb.card.statementTotal,999999);
  assert.equal(feb.closingSavings,0);
});

test("If income covers all debts, leftover is true savings only after both KMH and cards are zero",()=>{
  const {p,first}=setup();
  const [r]=computeCashPositionTable(p,[first(400000)]);
  assert.equal(r.closingCardDebt,0);
  assert.equal(r.closingOverdraft,0);
  assert.equal(r.closingSavings,money(400000-r.totalRequired));
  assert.equal(r.monthlyNet,money(400000-r.totalExpenses));
});

test("When mandatory payments exceed income, KMH is drawn only up to its limit",()=>{
  const {p,first}=setup({card:100000,kmh:20000,limit:100000});
  const [r]=computeCashPositionTable(p,[first(10000,30000,5000)]);
  assert.equal(r.closingSavings,0);
  assert.ok(r.overdraftDraw>0);
  assert.ok(r.cardPayments>=r.minimum);
  assert.equal(r.cardExtraPayments,0);
  assert.ok(r.closingOverdraft>r.openingOverdraft);
});

test("If limit is insufficient, unmet mandatory is flagged and card minimum is NOT falsely paid",()=>{
  const {p,first}=setup({card:100000,kmh:99000,limit:100000});
  const [r]=computeCashPositionTable(p,[first(10000,30000,5000)]);
  assert.equal(r.overdraftDraw,1000);
  assert.ok(r.unfundedMandatory>0);
  assert.equal(r.overdraftLimitExceeded,true);
  assert.equal(r.closingOverdraft,100000);
  assert.ok(r.minimumPaid<r.minimum);
  assert.equal(r.closingSavings,0);
});

test("Interest-priority card payment allocates surplus to highest rate first",()=>{
  const {p,first}=setup({card:0,kmh:0});
  p.cards=[
    {id:"card_high",name:"High",active:true,openingDebt:0,minPct:20,interestPct:4,interestMode:"manual"},
    {id:"card_low",name:"Low",active:true,openingDebt:0,minPct:20,interestPct:2,interestMode:"manual"}
  ];
  const row={...first(90000,0,0),cards:[
    {id:"card_high",name:"High",closing:70000,newSpending:0},
    {id:"card_low",name:"Low",closing:70000,newSpending:0}
  ]};
  const [r]=computeCashPositionTable(p,[row]);
  const hi=r.card.cards.find(c=>c.id==="card_high"),low=r.card.cards.find(c=>c.id==="card_low");
  assert.ok(hi.paidExtra>low.paidExtra);
  assert.equal(r.cardPayments,90000);
  assert.equal(r.closingCardDebt,50000);
  assert.equal(r.closingSavings,0);
});

test("Snapshot and original plan are preserved and no recurring income is written",()=>{
  const {p,first}=setup();
  const source=structuredClone(p);
  assert.equal(validCashFlowPlan(p),true);
  const r=computeCashPositionTable(p,[first()]);
  assert.equal(r.length,1);
  assert.deepEqual(p,source);
});
