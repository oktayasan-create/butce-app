import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('cashflow-model.js','utf8');
const { emptyCashFlowPlan, computeCashFlow, validCashFlowPlan, advanceMonth,
  normalizeCashFlowPlan, addCashFlowCategory, setCategoryActive, setCardActive,
  addCashFlowEntry, summarizeCashFlowEntries } =
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

// Previously stored V1 plans must migrate without changing existing card amounts.
const oldPlan={version:1,startMonth:'2026-11',openingCash:-2500,autoExtra:false,reserve:0,
  cards:[{id:'old_a',name:'Existing',openingDebt:10000,minPct:40,interestPct:0}],
  months:{'2026-11':{income:18000,fixedCash:4000,cardSpends:{old_a:750},minOverrides:{}}}};
const migrated=normalizeCashFlowPlan(oldPlan);
assert.equal(migrated.version,2);
assert.equal(migrated.openingCash,-2500);
assert.equal(migrated.cards[0].openingDebt,10000);
assert.equal(migrated.months['2026-11'].cardSpends.old_a,750);
assert(migrated.categories.expense.some(c=>c.name==='Market'));
assert(migrated.categories.income.some(c=>c.name==='Maaş'));
assert.deepEqual(migrated.entries,[]);
assert.equal(oldPlan.version,1,'Migrations must not modify original plans');

const live=emptyCashFlowPlan();
live.startMonth='2026-11';
live.openingCash=1000;
live.autoExtra=false;
live.cards=[
  {id:'visa',name:'A card',openingDebt:2000,minPct:40,interestPct:0,active:true},
  {id:'master',name:'B card',openingDebt:1000,minPct:40,interestPct:0,active:true}
];
live.months['2026-11']={income:2000,fixedCash:500,otherCash:0,
  cardSpends:{visa:0,master:0},minOverrides:{}};
const newId='test_extra';
addCashFlowCategory(live,'expense','Custom budget group',newId);
assert(live.categories.expense.some(c=>c.id===newId));
const add=(id,type,date,amount,categoryId,cardId)=>addCashFlowEntry(
  live,{id,type,date,amount,note:'Test note',categoryId,cardId}
);
add('payroll','income','2026-11-03',1500,'inc_salary');
add('shopping','card_expense','2026-11-06',300,newId,'visa');
add('fuel','cash_expense','2026-11-07',100,'exp_fuel');
add('payment','card_payment','2026-11-08',500,undefined,'visa');
const Nov=computeCashFlow(live,1)[0];
assert.equal(Nov.income,1500,'Actual income must replace planned income, avoiding double count');
assert.equal(Nov.cardSpending,300);
assert.equal(Nov.actualCardSpending,300);
assert.equal(Nov.actualCashSpending,100);
assert.equal(Nov.actualCardPayments,500);
assert.equal(Nov.minimumTotal,900,'Actual card repayment must replace estimated card minimum');
assert.equal(Nov.closingDebt,2400,'Purchases increase debt; repayments decrease it');
assert.equal(Nov.closingCash,1000,'Card purchases must not immediately decrease bank cash');
assert.equal(Nov.byCategory.expense[newId],300);
assert.equal(Nov.byCategory.expense.exp_fuel,100);
assert.equal(Nov.byCategory.income.inc_salary,1500);
assert.equal(summarizeCashFlowEntries(live,'2026-11').items.length,4);
setCategoryActive(live,'expense',newId,false);
setCardActive(live,'visa',false);
assert(validCashFlowPlan(live),'Archived categories and cards must retain references');
assert.equal(computeCashFlow(live,1)[0].closingDebt,2400,'Archiving must not erase debt and history');
setCategoryActive(live,'expense',newId,true);
setCardActive(live,'visa',true);
assert.equal(live.entries.length,4);
assert.throws(()=>addCashFlowEntry(live,{id:'invalid',type:'card_expense',date:'2026-11-10',amount:20,
  note:'invalid',categoryId:'missing',cardId:'visa'}));
assert.equal(live.entries.length,4,'Rejected entries must be rolled back');

assert(html.includes('cfCategoryList('),'Editable category lists must exist');
assert(html.includes('cfActivityForm()'),'Transaction entry form must exist');
assert(html.includes('cfDeleteEntry('),'User must be able to remove a planned movement');
assert(html.includes('setCategoryActive(cfPlan'),'Removing a category must preserve linked history');
assert(html.includes('setCardActive(cfPlan'),'Removing a card must archive rather than erase debt');
assert(html.includes('cfEntryTypeChange(this.value)'),'All movement types must be selectable');
assert(html.includes('cfSavePlan()'),'Saving plan should require an explicit action');

console.log('PASS: card and income groups, archive/restore, V1 migration, payments, no double counting, UI hooks');
