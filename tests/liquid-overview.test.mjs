import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {buildOverviewData,renderOverviewDashboard} from "../overview-dashboard.js";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const file=n=>readFileSync(join(root,n),"utf8");
const fixture=()=>{
  const categories={
    income:[{id:"salary",name:"Maaş",icon:"💼"}],
    expense:[{id:"market",name:"Market",icon:"🛒"},
      {id:"rent",name:"Kira",icon:"🏠"}]
  };
  const source={"salary":170000,"market":15000,"rent":30000};
  const getBudget=(id,month,year)=>year===2026&&month===10?source[id]||0:0;
  const transactions=[
    {date:"2026-11-01",type:"income",cat:"salary",amt:125000,note:"Maaş",_id:"a"},
    {date:"2026-11-03",type:"income",cat:"salary",amt:45000,note:"Ek gelir",_id:"b"},
    {date:"2026-11-05",type:"expense",cat:"market",amt:6500,note:"Market",_id:"c"},
    {date:"2026-11-06",type:"expense",cat:"rent",amt:30000,note:"Kira",_id:"d"},
    {date:"2026-10-02",type:"expense",cat:"rent",amt:10000,note:"Önceki ay",_id:"e"}
  ];
  const investments=[{date:"2026-11-07",amt:10000,invType:"gold"}];
  const forecast={month:"2026-11",closingCardDebt:54692.18,closingOverdraft:0,
    cardPayments:131716.61,closingSavings:0,loans:76636,minimum:69384.83,unfundedMandatory:0};
  return {year:2026,month:10,categories,getBudget,transactions,investments,forecast};
};

test("overview uses the correct month/year and distinguishes budget from actual",()=>{
  const data=buildOverviewData(fixture());
  assert.equal(data.current.budgetIncome,170000);
  assert.equal(data.current.budgetExpense,45000);
  assert.equal(data.current.actualIncome,170000);
  assert.equal(data.current.actualExpense,36500);
  assert.equal(data.actualNet,133500);
  assert.equal(data.investmentMonth,10000);
  assert.equal(data.categoryExpenses.find(c=>c.id==="market").actual,6500);
  assert.equal(data.forecast.closingCardDebt,54692.18);
  assert.equal(data.recent.length,4);
  assert.equal(data.monthly[9].actualExpense,10000);
  assert.equal(data.monthly[10].actualExpense,36500);
  assert.equal(data.daily.length,7);
  assert.ok(data.daily.every(day=>Number.isFinite(day.income)&&Number.isFinite(day.expense)));
  assert.ok(data.daily.every(day=>day.date.startsWith("2026-11-")));
});

test("dashboard includes trend, donut, progress, activity, debt without modifying user records",()=>{
  const input=fixture(),raw=JSON.stringify(input.transactions);
  const html=renderOverviewDashboard(buildOverviewData(input));
  for(const needle of ["Gelir – gider trendi","Harcamalar nereye gidiyor?",
    "Bütçe kullanımın","Son işlemler","Borç ve nakit görünümü",
    "Genel Bakış","Bütçe ve gerçekleşen tablosu","Son 7 gün",
    "overviewExpand('table')","overviewExpand('daily')","overviewExpand('trend')","overviewExpand('categories')",
    "54.692","133.500","2026"]){
    assert.ok(html.includes(needle),"Missing "+needle);
  }
  assert.equal(JSON.stringify(input.transactions),raw);
  assert.doesNotMatch(html,/<script/i);
});

test("bank forecast is conditional on selected period; no fabricated balance",()=>{
  const input=fixture();input.year=2027;input.month=0;
  const data=buildOverviewData(input);
  assert.equal(data.forecast,null);
  assert.match(renderOverviewDashboard(data),/nakit akışı tahmini bulunmuyor/);
});

test("unsafe category or transaction strings are encoded, not inserted as HTML",()=>{
  const input=fixture();
  input.categories.expense[0].name='<img src=x onerror=alert(1)>';
  input.transactions[2].note='<script>alert(1)</script>';
  const html=renderOverviewDashboard(buildOverviewData(input));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<img src=x onerror'));
});

test("cashflow-first navigation, combined tabs and theme controls are wired",()=>{
  const html=file("index.html"),css=file("liquid-glass.css");
  assert.ok(html.indexOf('id="dnav-cashflow"')<html.indexOf('id="dnav-planning"'));
  assert.ok(html.indexOf('id="dnav-planning"')<html.indexOf('id="dnav-overview"'));
  assert.ok(!html.includes('id="dnav-analiz"'));
  assert.ok(!html.includes('id="mnav-analiz"'));
  assert.match(html,/id="tab-planning"/);
  for(const id of ["tab-budget","tab-actual","tab-variance","tab-overview",
    "appearance-sheet","mnav-cashflow","mnav-planning","mnav-overview"]){
    assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
  }
  for(const mode of ["light","dark","system"])assert.ok(html.includes('data-mode-choice="'+mode+'"'));
  for(const palette of ["aurora","ocean","orchid","sunset"]){
    assert.ok(html.includes('data-palette-choice="'+palette+'"'));
    assert.ok(css.includes('data-palette="'+palette+'"'));
  }
  assert.match(css,/backdrop-filter:blur/);
  assert.match(html,/window\.planningSwitch=function/);
  assert.match(html,/window\.renderOverview=function/);
  assert.match(html,/liquid-glass\.css\?v=19/);
  assert.match(file("sw.js"),/butceapp-shell-v19/);
  assert.match(file("sw.js"),/overview-dashboard\.js\?v=18/);
});
