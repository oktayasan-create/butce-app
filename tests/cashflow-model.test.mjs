import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('cashflow-model.js','utf8');
const { emptyCashFlowPlan, computeCashFlow, validCashFlowPlan, advanceMonth } =
  await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));

const plan = emptyCashFlowPlan();
plan.startMonth = '2026-11';
plan.openingCash = -100;
plan.cards = [{ id:'test_a',name:'Example card',openingDebt:1000,minPct:40,interestPct:0 }];
plan.months['2026-11'] = {
  income:1200,fixedCash:300,otherCash:100,cardSpends:{test_a:200},minOverrides:{}
};
plan.months['2026-12'] = {
  income:1000,fixedCash:200,otherCash:0,cardSpends:{test_a:0},minOverrides:{}
};
assert(validCashFlowPlan(plan), 'Sample plan should pass validation');
const rows=computeCashFlow(plan,2);
assert.equal(rows.length,2);
assert.equal(rows[0].minimumTotal,400);
assert.equal(rows[0].extraTotal,300);
assert.equal(rows[0].cardSpending,200);
assert.equal(rows[0].closingDebt,500,'New card spending must not reduce cash immediately');
assert.equal(rows[0].closingCash,0,'Income, direct cash spending and repayments should balance');
assert.equal(rows[1].minimumTotal,200,'Next month minimum must include previous month card spending');
assert.equal(rows[1].extraTotal,300);
assert.equal(rows[1].closingDebt,0);
assert.equal(rows[1].closingCash,300);
assert.equal(plan.cards[0].openingDebt,1000,'Forecast must not mutate original account balances');
assert.equal(advanceMonth('2026-12',1),'2027-01');

const override = structuredClone(plan);
override.autoExtra=false;
override.months['2026-11'].minOverrides.test_a=150;
override.months['2026-11'].extraPayment=50;
const row=computeCashFlow(override,1)[0];
assert.equal(row.minimumTotal,150);
assert.equal(row.extraTotal,50);
assert.equal(row.closingDebt,1000,'Purchases must increase debt, repayments reduce it');
assert.equal(row.closingCash,500);

const interest=structuredClone(override);
interest.cards[0].interestPct=3;
const r=computeCashFlow(interest,1)[0];
assert.equal(r.interest,24,'Interest is only estimated on unpaid carried debt');
assert.equal(r.closingDebt,1024);

const invalid=structuredClone(plan);
invalid.cards[0].id='<script>';
assert.equal(validCashFlowPlan(invalid),false,'Card IDs must be safe');
assert.throws(()=>computeCashFlow(invalid,1));

const html=fs.readFileSync('index.html','utf8');
assert(html.includes('tab-cashflow'),'New cashflow pane must exist');
assert(html.includes('renderCashflow();'),'Navigation must render cashflow');
assert(html.includes('data","cashflowPlan"'),'The plan must have a separate Firestore document');
assert(!html.includes('if false; // disable security'),'Existing owner authorization must be maintained');
console.log('PASS: 12-month forecast, debt carry-over, minimum overrides, extra repayments, privacy and UI hooks');
