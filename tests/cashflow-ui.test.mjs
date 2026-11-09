import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('// ── INDEPENDENT CASH & CREDIT CARD SCENARIO');
const end=html.indexOf('// ── MODAL UTILS',start);
assert(start>0&&end>start,'Cashflow UI module should be extractable');
const source=fs.readFileSync('cashflow-model.js','utf8');
const model=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const initial=model.emptyCashFlowPlan();
initial.startMonth='2026-11';
initial.autoExtra=false;
initial.cards=[{id:'visa',name:'Test Visa',active:true,openingDebt:1000,minPct:40,interestPct:0,interestMode:'manual'}];
initial.months['2026-11']={income:1000,fixedCash:0,otherCash:0,cardSpends:{},minOverrides:{}};
const root={innerHTML:''};
const inputs={
 'cf-entry-date':{value:'2026-11-10'},
 'cf-entry-amount':{value:'80'},
 'cf-entry-note':{value:'Test purchase'},
 'cf-entry-cat':{value:'exp_market'},
 'cf-entry-card':{value:'visa'},
 'cf-new-expense':{value:'Yeni Harcama'}
};
const messages=[];
const sandbox={
 window:{},initial,auth:{currentUser:{uid:'test'}},authRevision:0,
 db:{},doc:()=>({}),getDocFromServer:()=>({}),setDoc:()=>({}),
 document:{getElementById(id){return id==='tab-cashflow'?root:inputs[id]||null}},
 safeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))},
 showToast(x){messages.push(x)},confirm(){return true},Date,Math,Intl,Number,String,Array,Object,
 structuredClone,createStatementInboxUI:()=>({render(){},reset(){},getOverview(){return {count:0,loading:false,error:"",debt:0,minimum:0,statements:[]}},selectFile(){},saveDraft(){},saveCategories(){},categoryEdit(){},cancelDraft(){}}),...model
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start,end),sandbox,{filename:'cashflow-ui.js'});
vm.runInContext("cfPlan=initial;cfSelectedMonth='2026-11';",sandbox);
await sandbox.window.renderCashflow();
assert(root.innerHTML.includes('Özet'));
assert(root.innerHTML.includes('Ekstreler'));
assert(root.innerHTML.includes('Taksitler'));
assert(root.innerHTML.includes('Nakit Planı'));
assert(root.innerHTML.includes('Tam kredi ödemesi'));
assert(root.innerHTML.includes('Ev / Araba / Diğer krediler'));
assert(root.innerHTML.includes('12 ay'));
assert(!root.innerHTML.includes('undefined TL'));

sandbox.window.cfSetView('plan');
assert(root.innerHTML.includes('Test Visa'));
assert(root.innerHTML.includes('Ev, araba ve diğer kredileri düzenle'));
assert(root.innerHTML.includes('Kartı kaldır (arşivle)'));
assert(root.innerHTML.includes('cfCategoryActive'));
assert(root.innerHTML.includes('Kredi kartı harcaması'));
assert(root.innerHTML.includes('Kategori'));
assert(root.innerHTML.includes('Maaş'));
assert(root.innerHTML.includes('Enpara Ekpara'));
assert(root.innerHTML.includes('Benim belirlediğim ek kart ödemesi')===false,
  'Use shorter manual extra payment label in compact plan');
assert(root.innerHTML.includes('Senin seçtiğin ek kart ödemesi'));
assert(root.innerHTML.includes('TCMB azami oranları'));
assert(root.innerHTML.includes('Kalan Ekpara'));
assert(root.innerHTML.includes('Kart faiz + vergi'));
sandbox.window.cfAddCategory('expense');
const p=vm.runInContext('cfPlan',sandbox);
assert(p.categories.expense.some(c=>c.name==='Yeni Harcama'));
sandbox.window.cfAddEntry();
assert.equal(p.entries.length,1);
assert.equal(p.entries[0].type,'card_expense');
assert.equal(p.entries[0].cardId,'visa');
assert.equal(model.computeCashFlow(p,1)[0].cardSpending,80);
sandbox.window.cfCategoryActive('expense','exp_market');
assert.equal(p.categories.expense.find(c=>c.id==='exp_market').active,false);
assert.equal(p.entries[0].categoryId,'exp_market','Archive cannot delete old movement');
sandbox.window.cfRemoveCard(0);
assert.equal(p.cards[0].active,false,'Card should archive');
assert.equal(model.computeCashFlow(p,1)[0].closingDebt,680,'Archived card still has debt');
sandbox.window.cfDeleteEntry(p.entries[0].id);
assert.equal(p.entries.length,0,'User should be able to remove a movement before saving');
assert.equal(model.computeCashFlow(p,1)[0].closingDebt,600);

sandbox.window.cfSetView('installments');
assert(root.innerHTML.includes('Gelecek kart taksitleri'));
assert(root.innerHTML.includes('Aylık taksit yükü'));
assert(root.innerHTML.includes('Ev / Araba kredisi (tam)'));
sandbox.window.cfSetView('statements');
assert(root.innerHTML.includes('id="cf-statement-panel"'));
sandbox.window.cfSetView('plan');
sandbox.window.cfAddLoan('Ev Kredisi');
sandbox.window.cfLoan(0,'amount','500');
assert(root.innerHTML.includes('Tam aylık taksit (₺)'));
assert.equal(p.loans[0].amount,500);
assert.equal(model.computeCashFlow(p,1)[0].loanPayments,500);
sandbox.window.cfAddInstallment();
sandbox.window.cfInstallment(0,'amount','200');
sandbox.window.cfInstallment(0,'startMonth','2026-11');
sandbox.window.cfInstallment(0,'count','3');
assert.equal(model.computeCashFlow(p,1)[0].installmentTotal,200);
sandbox.window.cfOverdraft('interestPct','4.25');
assert.equal(p.overdraft.interestPct,4.25);
sandbox.window.cfCardMode(0,'auto');
assert.equal(p.cards[0].interestMode,'auto');
sandbox.window.cfArchiveLoan(0);
assert.equal(model.computeCashFlow(p,1)[0].loanPayments,0);
sandbox.window.cfArchiveInstallment(0);
assert.equal(model.computeCashFlow(p,1)[0].installmentTotal,0);

console.log('PASS: v3 cashflow UI, loan/installment schedules, interest mode, overdraft and archive support');
