import assert from "node:assert/strict";
import fs from "node:fs";
const model=await import("data:text/javascript;charset=utf-8,"+
  encodeURIComponent(fs.readFileSync("cashflow-model.js","utf8")));
const {emptyCashFlowPlan,normalizeCashFlowPlan,validCashFlowPlan,computeCashFlow,addCashFlowEntry}=model;
const p=emptyCashFlowPlan();
p.startMonth="2026-11";p.openingCash=6000;p.reserve=0;p.autoExtra=false;
p.cards=[{id:"garanti",name:"Garanti",active:true,openingDebt:2000,minPct:40,interestMode:"manual",interestPct:0}];
p.loans=[
 {id:"house",name:"Ev Kredisi",amount:1200,startMonth:"2026-11",endMonth:"2027-12",active:true},
 {id:"car",name:"Araba Kredisi",amount:800,startMonth:"2026-11",endMonth:"2027-12",active:true}
];
p.recurringIncome=[
 {id:"my_salary_26",owner:"Ben",kind:"salary",name:"Benim maaşım",amount:3000,
   startMonth:"2026-11",endMonth:"2026-12",active:true},
 {id:"spouse_salary_26",owner:"Eşim",kind:"salary",name:"Eşimin maaşı",amount:2000,
   startMonth:"2026-11",endMonth:"2026-12",active:true},
 {id:"my_salary_27",owner:"Ben",kind:"salary",name:"Benim maaşım",amount:3500,
   startMonth:"2027-01",endMonth:"2027-12",active:true},
 {id:"spouse_salary_27",owner:"Eşim",kind:"salary",name:"Eşimin maaşı",amount:2200,
   startMonth:"2027-01",endMonth:"2027-12",active:true}
];
const bills=Object.fromEntries(p.recurringExpenses.map(r=>[r.id,r]));
for(const r of Object.values(bills))r.startMonth="2026-11";
for(const [id,amount] of Object.entries({
 regular_market:500,regular_electricity:200,regular_water_bill:75,
 regular_naturalgas:90,regular_subscriptions:110,regular_drinking_water:45,
 regular_food_cafe:250,regular_building_fee:300,regular_hairdresser:100
})){
 bills[id].amount=amount;
 if(bills[id].payment==="card")bills[id].cardId="garanti";
}
bills.regular_building_fee.endMonth="2026-12";
p.recurringExpenses.push({
 ...structuredClone(bills.regular_building_fee),id:"regular_building_fee_2027",
 amount:450,startMonth:"2027-01",endMonth:"2027-12"
});
p.months["2026-11"]={income:125000,fixedCash:500,otherCash:0,
 extraPayment:0,cardSpends:{},minOverrides:{}};
assert(validCashFlowPlan(p),"Scheduled incomes and expenses must validate");
const [nov,dec,jan]=computeCashFlow(p,3);
assert.equal(nov.income,5000,"Dated household salary replaces old generic 125k income");
assert.equal(dec.income,5000);
assert.equal(jan.income,5700,"January salary rises as specified");
assert.equal(nov.loanPayments,2000,"Both housing and car loans paid IN FULL");
assert.equal(dec.loanPayments,2000);
assert.equal(jan.loanPayments,2000);
assert.equal(nov.recurringCashTotal,400,"Aidat+hairdresser cash");
assert.equal(jan.recurringCashTotal,550,"January aidat increase");
assert.equal(nov.recurringCardTotal,1270,"Market, utilities, subscriptions, water and cafe route to card");
assert.equal(nov.cardPurchases,1270,"Recurring card expenses increase card debt only");
assert.equal(nov.otherCash,400,"Cash expenses deducted immediately");
assert.equal(nov.minimumTotal,800,"Existing credit card minimum still due");
assert.equal(nov.fixedCash,500);
assert.equal(nov.recurringExpenses.length,9);
assert.equal(nov.scheduledIncomeRules.length,2);
assert(nov.closingDebt>0);
assert(jan.recurringExpenses.some(x=>x.name==="Apartman aidatı"&&x.amount===450));
assert.equal(jan.recurringExpenses.filter(x=>x.name==="Apartman aidatı").length,1,
 "New aidat period replaces the old period, not added twice");
assert.equal(nov.installmentTotal,0);

const actual=structuredClone(p);
addCashFlowEntry(actual,{id:"actual_market_dec",type:"card_expense",date:"2026-12-12",
 amount:650,note:"Actual market spend",cardId:"garanti",categoryId:"exp_market"});
const actualDec=computeCashFlow(actual,2)[1];
assert.equal(actualDec.recurringCardTotal,770,"Card market estimate replaced by actual category spend");
assert.equal(actualDec.cardPurchases,1420,"Includes actual market 650 and remaining recurring card bills");
assert.equal(actualDec.recurringCashTotal,400);

const oneTime=structuredClone(p);
addCashFlowEntry(oneTime,{id:"year_end_bonus",type:"income",date:"2026-11-22",
 amount:500,note:"Extra income",categoryId:"inc_extra"});
assert.equal(computeCashFlow(oneTime,1)[0].income,5500,
 "One-time extra income adds to dated salaries");
const old=structuredClone(p);
delete old.recurringIncome;delete old.recurringExpenses;
assert(validCashFlowPlan(normalizeCashFlowPlan(old)),
 "Prior V3 plan migrates safely to empty income schedules and zero-value expense templates");
assert.equal(normalizeCashFlowPlan(old).months["2026-11"].income,125000);
assert.equal(normalizeCashFlowPlan(old).loans.length,2);
assert.equal(normalizeCashFlowPlan(old).recurringExpenses.length,9);
assert.equal(computeCashFlow(normalizeCashFlowPlan(old),1)[0].income,125000,
 "Older monthly income is retained until user defines income schedule");

const invalid=structuredClone(p);
invalid.recurringExpenses[0].cardId=null;
assert.equal(validCashFlowPlan(invalid),false,"Paid card bill must reference an existing card");
console.log("PASS: date-range household income, January raises, regular card/cash bills, full loans, actual overrides and non-destructive migrations");
