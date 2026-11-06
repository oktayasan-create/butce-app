import fs from 'node:fs';
import assert from 'node:assert/strict';
const moduleText=fs.readFileSync('statement-import.js','utf8');
const {normalizeStatementBundle,mergeStatementInbox,reconcileStatement,
 statementPlanMonth,suggestStatementInstallments}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(moduleText));
const sample={format:'butceapp-statement-review-v1',statements:[{
  id:'bankcard-2026-10',bank:'Example Bank',cardLabel:'Private card',statementDate:'2026-10-31',
  dueDate:'2026-11-12',balance:9000,minimum:3600,periodSpending:1050,
  previousBalance:7950,remainingInstallmentsTotal:180,
  transactions:[
    {id:'purchase_1',date:'2026-10-20',description:'Example store',amount:1000,type:'purchase',
      category:'Market',installmentCurrent:1,installmentTotal:3,remainingInstallments:2},
    {id:'purchase_2',date:'2026-10-21',description:'Example fuel',amount:150,type:'purchase',
      category:'Akaryakıt'},
    {id:'return_1',date:'2026-10-21',description:'Example return',amount:100,type:'refund',category:'Market'},
    {id:'pay_1',date:'2026-10-10',description:'Payment',amount:300,type:'payment'}
  ]
}]};
const out=normalizeStatementBundle(sample);
assert.equal(out.version,1);
assert.equal(out.statements.length,1);
assert.equal(out.statements[0].transactions.length,4);
const summary=reconcileStatement(out.statements[0]);
assert.equal(summary.sums.purchase,1150);
assert.equal(summary.sums.refund,100);
assert.equal(summary.periodCalculated,1050);
assert(summary.reconciled);
assert.equal(statementPlanMonth(out.statements[0]),'2026-11');
const installments=suggestStatementInstallments(out.statements[0],'selected_card',[]);
assert.equal(installments.length,1);
assert.equal(installments[0].amount,1000);
assert.equal(installments[0].count,2);
assert.equal(installments[0].startMonth,'2026-11');
assert.equal(suggestStatementInstallments(out.statements[0],'selected_card',installments).length,0);
const {inbox,added,skipped}=mergeStatementInbox({version:1,statements:[]},out);
assert.deepEqual(added,['bankcard-2026-10']);assert.deepEqual(skipped,[]);
const again=mergeStatementInbox(inbox,out);
assert.equal(again.inbox.statements.length,1);
assert.equal(again.skipped.length,1,'Repeated import must not duplicate statements');
const invalid=structuredClone(sample);
invalid.statements[0].transactions[0].date='nonsense';
assert.throws(()=>normalizeStatementBundle(invalid));
const rejected=structuredClone(sample);
rejected.statements[0].transactions[0].amount=-100;
assert.throws(()=>normalizeStatementBundle(rejected));
const unknown=structuredClone(sample);
unknown.statements[0].transactions[0].exposedAccountNumber='bad';
assert(!JSON.stringify(normalizeStatementBundle(unknown)).includes('exposedAccountNumber'),
  'Unrecognized PII fields must not be persisted');
const markup=fs.readFileSync('index.html','utf8');
const view=fs.readFileSync('statement-ui.js','utf8');
assert(markup.includes('cf-category-grid'),'Categories must use compact grid');
assert(markup.includes('id="cf-statement-panel"'),'Review panel must be wired');
assert(markup.includes('statementUI.reset()'),'Signout must clear statement state');
assert(view.includes('await setDoc(doc(db,"data","statementInbox")'),
  'Save only to private Firestore document');
assert(view.includes('confirm('),'User must explicitly confirm statement writes');
assert(view.includes('PDF / Excel Ekstrelerini İçe Aktar'),'Supported direct PDF and Excel import must be shown');
assert(!view.includes('fetch('),'No statement upload to third-party endpoint');
console.log('PASS: review, purchase/refund, dedup, installments, input validation, privacy and compact UI');
