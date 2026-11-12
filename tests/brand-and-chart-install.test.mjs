import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {emptyCashFlowPlan} from "../cashflow-model.js";
import {createCashflowForecastUI} from "../cashflow-forecast-ui.js";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const file=name=>readFileSync(join(root,name),"utf8");

test("installed app and favicon use the generated wallet emblem",()=>{
  const manifest=JSON.parse(file("manifest.json"));
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.id,"./");
  assert.ok(manifest.icons.some(i=>i.src.startsWith("icon-192.png")&&i.sizes==="192x192"));
  assert.ok(manifest.icons.some(i=>i.src.startsWith("icon-512.png")&&i.sizes==="512x512"));
  for(const size of [192,512]){
    const filePath=join(root,"icon-"+size+".png");
    assert.ok(existsSync(filePath));
    const bytes=readFileSync(filePath);
    assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16),size);
    assert.equal(bytes.readUInt32BE(20),size);
  }
  assert.match(file("index.html"),/rel="apple-touch-icon" href="icon-192\.png\?v=17"/);
  assert.match(file("index.html"),/rel="icon" type="image\/png" sizes="192x192"/);
  assert.match(file("index.html"),/logo-icon/);
  assert.match(file("index.html"),/v19 · Borç öncelikli plan/);
  assert.match(file("sw.js"),/butceapp-shell-v19/);
  assert.match(file("sw.js"),/icon-512\.png\?v=17/);
});

test("all and none selection is reflected in chart controls without changing plan",()=>{
  const plan=emptyCashFlowPlan();
  plan.startMonth="2027-01";
  plan.cards=[];
  plan.recurringExpenses=[];
  const rows=[{month:"2027-01",income:100000,loanPayments:0,
    fixedCash:0,otherCash:0,openingCash:0,openingOverdraft:0,cards:[]}];
  const ui=createCashflowForecastUI({money:n=>String(n),monthLabel:m=>m});
  const html=ui.render(rows,plan);
  assert.match(html,/Hepsini seç/);
  assert.match(html,/Tümünü kaldır/);
  assert.match(html,/cf-chart-selection-count/);
  ui.preset("all");
  const all=ui.render(rows,plan);
  assert.doesNotMatch(all,/data-cf-chart-key="income" onchange/); // checked
  assert.match(all,/data-cf-chart-key="income" checked/);
  ui.preset("none");
  const none=ui.render(rows,plan);
  assert.doesNotMatch(none,/data-cf-chart-key="income" checked/);
  assert.match(none,/0 \/ 12 gösterge/);
  assert.equal(plan.cards.length,0);
});
