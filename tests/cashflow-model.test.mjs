import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('cashflow-model.js','utf8');
const m=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const {emptyCashFlowPlan,normalizeCashFlowPlan,validCashFlowPlan,computeCashFlow,
  monthlyCardRate,monthlyCardLateRate,advanceMonth,addCashFlowCategory,
  setCategoryActive,setCardActive,addCashFlowEntry}=m;
const approx=(actual,expected,epsilon=.01)=>assert(Math.abs(actual-expected)<=epsilon,
  'Expected '+expected+' got '+actual);

const migrationV1={version:1,startMonth:'2026-11',openingCash:-80,autoExtra:false,reserve:0,
  cards:[{id:'first',name:'Existing card',openingDebt:10000,minPct:40,interestPct:0}],
  months:{'2026-11':{income:1200,fixedCash:100,cardSpends:{first:250},minOverrides:{}}}};
const p1=normalizeCashFlowPlan(migrationV1);
assert.equal(p1.version,3);
assert.equal(p1.cards[0].openingDebt,10000);
assert.equal(p1.cards[0].interestMode,'manual');
assert.equal(p1.months['2026-11'].cardSpends.first,250);
assert.equal(p1.overdraft.interestPct,4.25);
assert.equal(p1.tax.kkdfPct,15);
assert.equal(migrationV1.version,1,'Migration must not overwrite original data');

const migrationV2={version:2,startMonth:'2026-11',openingCash:0,autoExtra:false,reserve:0,
  cards:[{id:'master',name:'Existing card',openingDebt:1500,minPct:40,interestPct:3,active:true}],
  categories:emptyCashFlowPlan().categories,entries:[],months:{}};
const p2=normalizeCashFlowPlan(migrationV2);
assert.equal(p2.cards[0].interestPct,3);
assert.equal(p2.cards[0].interestMode,'manual','Existing interest assumptions must stay unchanged');
assert.deepEqual(p2.loans,[]);
assert.deepEqual(p2.installments,[]);
assert(validCashFlowPlan(p2));

assert.equal(monthlyCardRate(29999,{interestMode:'auto'}),3.25);
assert.equal(monthlyCardRate(30000,{interestMode:'auto'}),3.75);
assert.equal(monthlyCardRate(180000,{interestMode:'auto'}),3.75);
assert.equal(monthlyCardRate(180001,{interestMode:'auto'}),4.25);
assert.equal(monthlyCardRate(220000,{interestMode:'manual',interestPct:2.5}),2.5);
assert.equal(monthlyCardLateRate(180001),4.55);
assert.equal(advanceMonth('2026-12',1),'2027-01');

const p=emptyCashFlowPlan();
p.startMonth='2026-11';p.openingCash=0;p.autoExtra=false;p.reserve=0;
p.cards=[{id:'garanti',name:'Garanti',openingDebt:1000,minPct:40,interestPct:4.25,interestMode:'auto',active:true}];
p.loans=[{id:'ev',name:'Ev Kredisi',amount:2000,startMonth:'2026-11',endMonth:'2027-01',active:true}];
p.installments=[{id:'p1',name:'Alışveriş taksiti',cardId:'garanti',amount:500,startMonth:'2026-12',count:2,active:true}];
p.months['2026-11']={income:5000,fixedCash:500,otherCash:100,extraPayment:600,cardSpends:{garanti:5000},minOverrides:{}};
p.months['2026-12']={income:0,fixedCash:0,otherCash:0,extraPayment:0,cardSpends:{garanti:0},minOverrides:{}};
p.months['2027-01']={income:10000,fixedCash:0,otherCash:0,extraPayment:0,cardSpends:{garanti:0},minOverrides:{}};
p.overdraft.limit=1000;
assert(validCashFlowPlan(p));
const [nov,dec,jan]=computeCashFlow(p,3);
assert.equal(nov.loanPayments,2000,'Full loan repayment mandatory');
assert.equal(nov.minimumTotal,400);
assert.equal(nov.afterMandatoryCash,2000);
assert.equal(nov.extraTotal,600,'Only user-entered extra should be applied');
assert.equal(nov.savings,1400,'Remaining funds must be carried as savings');
assert.equal(nov.closingDebt,5000,'New card purchase must be carried forward');
assert.equal(nov.overdraftDraw,0);

assert.equal(dec.installmentTotal,500,'Card installment due next month');
assert.equal(dec.minimumTotal,2200,'Statement = old balance + installment');
assert.equal(dec.loanPayments,2000);
assert.equal(dec.overdraftDraw,2800,'Overdraft required for mandatory payments');
assert.equal(dec.closingCash,0);
assert.equal(dec.overdraftLimitExceeded,true);
assert.equal(dec.cards[0].interestPct,3.25,'Tier based on 5500 statement debt, not card limit');
assert.equal(dec.cards[0].interest,107.25);
assert.equal(dec.cards[0].interestTax,32.18,'15% KKDF + 15% BSMV');
assert.equal(dec.cardInterest,107.25);
assert.equal(dec.cardTax,32.18);
assert.equal(dec.overdraftInterest,59.5);
assert.equal(dec.overdraftTax,17.85);
assert.equal(dec.overdraftCost,77.35);
assert.equal(jan.chargedOverdraftCost,77.35,'KMH cost debited next month');
assert.equal(jan.loanPayments,2000);
assert.equal(jan.overdraftRepaid,2800,'Surplus automatically reduces Enpara overdraft');
assert.equal(jan.closingOverdraft,0);
assert(jan.savings>0,'Funds remaining after KMH repayment persist in next months');
assert(jan.cardInterest>0);
assert.equal(p.cards[0].openingDebt,1000,'Forecast never modifies source balance');

const paid=emptyCashFlowPlan();
paid.startMonth='2026-11';
paid.autoExtra=false;paid.openingCash=500;
paid.cards=[{id:'ykb',name:'YKB',openingDebt:1000,minPct:40,interestPct:4.25,interestMode:'manual',active:true}];
paid.months['2026-11']={income:1000,extraPayment:600,minOverrides:{},cardSpends:{}};
const done=computeCashFlow(paid,1)[0];
assert.equal(done.minimumTotal,400);
assert.equal(done.extraTotal,600);
assert.equal(done.closingDebt,0);
assert.deepEqual(done.cardsPaidOff,['YKB']);
assert.equal(done.savings,500);
assert.equal(done.overdraftDraw,0);

paid.months['2026-11'].extraPayment=2000;
const capped=computeCashFlow(paid,1)[0];
assert.equal(capped.extraTotal,600,'Extra never exceeds outstanding card balance');
assert.equal(capped.unmetExtra,900,'Extra requested beyond available must be shown');
assert.equal(capped.overdraftDraw,0,'Never borrow just to fund an optional extra payment');

const negative=emptyCashFlowPlan();
negative.startMonth='2026-11';
negative.openingCash=-300;
negative.overdraft.interestPct=4.25;
const od=computeCashFlow(negative,2);
assert.equal(od[0].openingOverdraft,300);
assert.equal(od[0].closingOverdraft,300);
assert.equal(od[0].overdraftCost,16.58);
assert.equal(od[1].chargedOverdraftCost,16.58);
assert(od[1].closingOverdraft>300);

// A real minimum payment and a deliberately entered extra repayment may coexist.
const combined=emptyCashFlowPlan();
combined.startMonth='2026-11';combined.autoExtra=false;combined.openingCash=1000;
combined.cards=[{id:'one',name:'Test card',openingDebt:1000,minPct:40,
  interestPct:0,interestMode:'manual',active:true}];
combined.months['2026-11']={extraPayment:100,minOverrides:{},cardSpends:{}};
addCashFlowEntry(combined,{id:'realmin',type:'card_payment',date:'2026-11-07',amount:400,
  note:'Paid minimum',cardId:'one'});
const combinedRow=computeCashFlow(combined,1)[0];
assert.equal(combinedRow.minimumTotal,400);
assert.equal(combinedRow.extraTotal,100,'Manual extra applies after actual minimum');
assert.equal(combinedRow.closingCash,500);
assert.equal(combinedRow.closingDebt,500);

const archived=structuredClone(p);
archived.loans[0].active=false;
assert.equal(computeCashFlow(archived,1)[0].loanPayments,0);
archived.installments[0].active=false;
assert.equal(computeCashFlow(archived,2)[1].installmentTotal,0);

const entry=emptyCashFlowPlan();
entry.startMonth='2026-11';
entry.cards=[{id:'enpara',name:'Enpara',openingDebt:500,minPct:40,interestPct:3.75,interestMode:'manual',active:true}];
addCashFlowCategory(entry,'expense','New expense','newcat');
const add=(id,type,amount,categoryId,cardId)=>addCashFlowEntry(entry,{id,type,
  date:'2026-11-10',amount,note:'Test',categoryId,cardId});
add('inc','income',1000,'inc_salary');
add('shopping','card_expense',300,'newcat','enpara');
add('payment','card_payment',500,undefined,'enpara');
assert.equal(computeCashFlow(entry,1)[0].closingDebt,300);
setCategoryActive(entry,'expense','newcat',false);
setCardActive(entry,'enpara',false);
assert(validCashFlowPlan(entry));
assert.equal(entry.entries.length,3,'Archival must not delete history');

const invalid=structuredClone(entry);
invalid.installments.push({id:'bad',name:'Invalid',cardId:'unknown',amount:100,
  startMonth:'2026-11',count:3,active:true});
assert.equal(validCashFlowPlan(invalid),false);
assert.throws(()=>computeCashFlow(invalid));

const html=fs.readFileSync('index.html','utf8');
for(const name of ['cfLoanEditor','cfInstallmentEditor','cfOverdraftEditor','cfForecastTable',
  'cfSelectedCardDetails','cfCardMode','cfAddLoan','cfAddInstallment','cfLoan','cfInstallment']){
  assert(html.includes(name),name+' must be in UI');
}
assert(html.includes('cfSavePlan()'),'Save should require explicit action');
assert(html.includes('cfCategoryList("expense")'),'Category feature retained');
assert(html.includes('cfActivityForm()'),'Transaction feature retained');
console.log('PASS: V1/V2 migration, TCMB interest tiers + 30% taxes, loan & card installments, manual extras, Enpara KMH, color-coded forecast hooks');
