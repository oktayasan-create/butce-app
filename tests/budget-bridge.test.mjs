import fs from "node:fs";
import assert from "node:assert/strict";
const modelText=fs.readFileSync("cashflow-model.js","utf8");
const modelUrl="data:text/javascript;charset=utf-8,"+encodeURIComponent(modelText);
const model=await import(modelUrl);
const src=fs.readFileSync("budget-bridge.js","utf8").replace("./cashflow-model.js",modelUrl);
const bridge=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(src));

const plan=model.emptyCashFlowPlan();
plan.startMonth="2026-11";plan.openingCash=0;plan.autoExtra=false;
plan.cards=[
 {id:"g",name:"Garanti",openingDebt:0,minPct:40,interestPct:0,interestMode:"manual",active:true},
 {id:"y",name:"Yapı Kredi",openingDebt:0,minPct:40,interestPct:0,interestMode:"manual",active:true}
];
plan.statementSnapshots=[
 {id:"sn_g",cardId:"g",dueMonth:"2026-11",statementDate:"2026-10-30",balance:10000,minimum:4000},
 {id:"sn_y",cardId:"y",dueMonth:"2026-11",statementDate:"2026-11-08",balance:20000,minimum:8000}
];
plan.loans=[
 {id:"house",name:"Ev kredisi",amount:1500,startMonth:"2026-11",endMonth:"2027-12",active:true},
 {id:"car",name:"Araba kredisi",amount:500,startMonth:"2026-11",endMonth:"2027-12",active:true}
];
plan.months["2026-11"]={income:500000,fixedCash:6000,otherCash:23000,
 extraPayment:0,cardSpends:{g:9000},minOverrides:{}};
plan.recurringIncome=[{id:"old_sal",owner:"Ben",kind:"salary",name:"Manual old salary",
 amount:100000,startMonth:"2026-11",endMonth:"2027-12",active:true}];
plan.recurringExpenses.find(x=>x.id==="regular_market").amount=4200;
plan.recurringExpenses.find(x=>x.id==="regular_market").cardId="g";
plan.budgetLink.categories={
 market:{payment:"card",cardId:"g"},
 electric:{payment:"card",cardId:"g"},
 cafe:{payment:"card",cardId:"y"},
 aidat:{payment:"cash"},
 barber:{payment:"cash"}
};
const legacyCats={
 income:[{id:"salary",name:"Benim maaşım"},{id:"wife",name:"Eşim maaş"},{id:"bonus",name:"Ek gelir"}],
 expense:[{id:"market",name:"Market"},{id:"electric",name:"Elektrik"},{id:"cafe",name:"Yemek & Kafe"},
   {id:"aidat",name:"Apartman Aidatı"},{id:"barber",name:"Kuaför"}]
};
const data={
 "salary_2026":[0,0,0,0,0,0,0,0,0,0,8000,9000],
 "wife_2026":[0,0,0,0,0,0,0,0,0,0,7000,7500],
 "bonus_2026":[0,0,0,0,0,0,0,0,0,0,1000,0],
 "salary_2027":[10000,0,0,0,0,0,0,0,0,0,0,0],
 "wife_2027":[8000,0,0,0,0,0,0,0,0,0,0,0],
 "market_2026":[0,0,0,0,0,0,0,0,0,0,1000,1100],
 "electric_2026":[0,0,0,0,0,0,0,0,0,0,200,250],
 "cafe_2026":[0,0,0,0,0,0,0,0,0,0,250,300],
 "aidat_2026":[0,0,0,0,0,0,0,0,0,0,300,300],
 "barber_2026":[0,0,0,0,0,0,0,0,0,0,100,100],
 "aidat_2027":[450,0,0,0,0,0,0,0,0,0,0,0],
 "market_2027":[1400,0,0,0,0,0,0,0,0,0,0,0],
 "electric_2027":[350,0,0,0,0,0,0,0,0,0,0,0],
 "cafe_2027":[400,0,0,0,0,0,0,0,0,0,0,0]
};
const getBudget=(id,month,year)=>data[id+"_"+year]?.[month]||0;
assert(model.validCashFlowPlan(plan));
const before=JSON.stringify(plan);
const projection=bridge.projectBudgetToCashFlow(plan,legacyCats,getBudget);
assert(projection.linked);
assert.deepEqual(projection.missingCards,[]);
assert.equal(JSON.stringify(plan),before,"Projection must never mutate saved settings, loans or entries");
assert.equal(projection.plan.budgetProjection.months["2026-11"].income,16000);
assert.equal(projection.plan.budgetProjection.months["2026-12"].income,16500);
assert.equal(projection.plan.budgetProjection.months["2027-01"].income,18000);
const [nov,dec,jan]=model.computeCashFlow(projection.plan,3);
assert.equal(nov.income,16000,"Income must come from November's actual budget categories not 500k placeholder");
assert.equal(dec.income,16500,"December income must come from its own budget month");
assert.equal(jan.income,18000,"January increase from distinct 2027 budget");
assert.equal(nov.loanPayments,2000,"Home and car loans are full mandatory payments");
assert.equal(nov.fixedCash,0,"Old fixed cash placeholder ignored in linked mode");
assert.equal(nov.otherCash,400,"Only aidat and barber reduce current cash");
assert.equal(nov.recurringCardTotal,1450);
assert.equal(nov.cardPurchases,1450,"Old manual 9000 card spending and 4200 recurring market not double counted");
assert.equal(nov.minimumTotal,12000);
assert.equal(nov.actualCardPayments,0);
assert.equal(nov.minimumRemainingTotal,12000);
assert.equal(nov.cardCashOutflow,12000);
assert.equal(nov.closingCash,1600);
assert.equal(jan.recurringCashTotal,450,"Jan building fee increases via 2027 budget source");
assert.equal(jan.budgetIncomeCategories.length,2);

const paid=structuredClone(plan);
model.addCashFlowEntry(paid,{
 id:"paid_g_min",type:"card_payment",cardId:"g",amount:4000,paymentKind:"minimum",
 date:"2026-11-09",note:"Bank transfer"
});
model.addCashFlowEntry(paid,{
 id:"paid_y_part",type:"card_payment",cardId:"y",amount:3000,paymentKind:"partial",
 date:"2026-11-09",note:"Partial payment"
});
const rowsPaid=model.computeCashFlow(bridge.projectBudgetToCashFlow(paid,legacyCats,getBudget).plan,1)[0];
assert.equal(rowsPaid.actualCardPayments,7000);
assert.equal(rowsPaid.minimumRemainingTotal,5000);
assert.equal(rowsPaid.cardCashOutflow,12000,"Paid 7k plus remaining min 5k, no duplicate outflow");
assert.equal(rowsPaid.closingCash,1600,"Do not deduct paid minimum a second time");
assert.equal(rowsPaid.cards[0].paymentStatus,"Asgari ödendi");
assert.equal(rowsPaid.cards[1].paymentStatus,"Kısmi ödendi");
assert.equal(rowsPaid.cards[0].minimumRemaining,0);
assert.equal(rowsPaid.cards[1].minimumRemaining,5000);
assert.equal(rowsPaid.cards[0].closing,7200,"Unpaid 6000 plus this-month g purchases 1200");
assert.equal(rowsPaid.cards[1].closing,12250,"Paid 3000 and planned 5000 minimum leave 12000 plus 250 new purchase");
const paidFull=structuredClone(paid);
model.addCashFlowEntry(paidFull,{
 id:"paid_y_full",type:"card_payment",cardId:"y",amount:17000,paymentKind:"full",
 date:"2026-11-09",note:"Paid all remaining statement"
});
const rr=model.computeCashFlow(bridge.projectBudgetToCashFlow(paidFull,legacyCats,getBudget).plan,1)[0];
assert.equal(rr.actualCardPayments,24000);
assert.equal(rr.minimumRemainingTotal,0);
assert.equal(rr.cards[1].paymentStatus,"Tamamı ödendi");
assert.equal(rr.cards[1].closing,250,"Full statement settled; new current-month purchase still becomes next statement debt");
assert.equal(rr.overdraftDraw,10400,"16k income minus 24k actual payments, 2k full loans and 400 cash bills");
assert.equal(rr.loanPayments,2000);

const manyCards=structuredClone(plan);manyCards.budgetLink.categories={};
const missing=bridge.projectBudgetToCashFlow(manyCards,legacyCats,getBudget);
assert(missing.missingCards.some(x=>x.category==="Market"));
assert.equal(model.computeCashFlow(missing.plan,1)[0].recurringCardTotal,0,
 "Unmatched card purchases must not be assigned to a guessed bank");
assert.equal(bridge.defaultBudgetPayment("Apartman Aidatı"),"cash");
assert.equal(bridge.defaultBudgetPayment("Kuaför"),"cash");
assert.equal(bridge.defaultBudgetPayment("Market"),"card");
assert.equal(bridge.defaultBudgetPayment("Elektrik"),"card");
assert.equal(bridge.defaultBudgetPayment("İçme Suyu"),"card");
assert.equal(bridge.defaultBudgetPayment("Yemek & Kafe"),"card");

const disabled=structuredClone(plan);disabled.budgetLink.enabled=false;
const off=bridge.projectBudgetToCashFlow(disabled,legacyCats,getBudget);
assert.equal(off.linked,false);
assert.equal(model.computeCashFlow(off.plan,1)[0].income,100000,
 "User's existing manual salary schedule is preserved and active when disconnected");
assert.equal(JSON.stringify(plan),before);
assert.equal(model.validCashFlowPlan(model.normalizeCashFlowPlan(plan)),true);
const old=structuredClone(plan);delete old.budgetLink;
assert.equal(model.normalizeCashFlowPlan(old).budgetLink.enabled,true);
console.log("PASS: monthly legacy income and category-linked bills, November paid minimum/partial/full, January raises, loan preservation, no double-counting, ambiguous bank warning");
