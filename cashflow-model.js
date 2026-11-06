/**
 * BütçeApp cash and credit-card projection engine.
 * Scenario-only: does not read, write or mutate existing income/expense transactions.
 * Purchases increase card liabilities, repayments reduce liabilities, not expenses.
 * Monthly estimates DO NOT replace card statements; actual minimums/interest vary.
 */
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const safeN = n => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
};
export function isoMonth(date = new Date()) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}
export function advanceMonth(month, offset) {
  const [year, part] = String(month).split("-").map(Number);
  const d = new Date(Date.UTC(year || 2026, (part || 1) - 1 + offset, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
export function emptyCashFlowPlan() {
  return {version:1,startMonth:isoMonth(),openingCash:0,autoExtra:true,reserve:0,cards:[],months:{}};
}
export function validCashFlowPlan(plan) {
  if(!plan || plan.version !== 1 || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(plan.startMonth))) return false;
  if(!Number.isFinite(plan.openingCash) || !Number.isFinite(plan.reserve) || typeof plan.autoExtra !== "boolean") return false;
  if(!Array.isArray(plan.cards) || plan.cards.length>12 || !plan.months || typeof plan.months!=="object") return false;
  const ids = new Set();
  for(const c of plan.cards) {
    if(!c || typeof c.id!=="string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(c.id) ||
       typeof c.name!=="string" || c.name.length>90 || ids.has(c.id) ||
       !Number.isFinite(c.openingDebt) || c.openingDebt<0 ||
       !Number.isFinite(c.minPct) || c.minPct<0 || c.minPct>100 ||
       !Number.isFinite(c.interestPct) || c.interestPct<0 || c.interestPct>25) return false;
    ids.add(c.id);
  }
  return true;
}
export function computeCashFlow(plan, periods=12) {
  if(!validCashFlowPlan(plan)) throw new Error("Geçersiz nakit akışı planı");
  const balances=Object.fromEntries(plan.cards.map(c=>[c.id,r2(c.openingDebt)]));
  let cash=r2(plan.openingCash);
  const rows=[];
  for(let i=0;i<periods;i++) {
    const key=advanceMonth(plan.startMonth,i), m=plan.months[key]||{};
    const income=Math.max(0,r2(safeN(m.income)));
    const fixedCash=Math.max(0,r2(safeN(m.fixedCash)));
    const otherCash=Math.max(0,r2(safeN(m.otherCash)));
    const openingCash=cash;
    const startDebt=r2(Object.values(balances).reduce((s,v)=>s+v,0));
    cash=r2(cash+income-fixedCash-otherCash);
    const state=plan.cards.map(c=>{
      const opening=r2(balances[c.id]);
      const override=m.minOverrides?.[c.id];
      const estimatedMinimum=r2(opening*c.minPct/100);
      const minimum=r2(Math.min(opening,override===null||override===""||override===undefined?estimatedMinimum:Math.max(0,safeN(override))));
      return {id:c.id,name:c.name,opening,minimum,extra:0,newSpending:Math.max(0,r2(safeN(m.cardSpends?.[c.id]))),interest:0,closing:0,interestPct:c.interestPct};
    });
    const minimumTotal=r2(state.reduce((sum,c)=>sum+c.minimum,0));
    cash=r2(cash-minimumTotal); // A negative bank balance means funding is insufficient.
    let capacity=plan.autoExtra?Math.max(0,r2(cash-Math.max(0,plan.reserve))):Math.max(0,r2(safeN(m.extraPayment)));
    // Optional extra repayments: highest interest first; scenario can show overdraft if user mandates manual extras.
    const priority=state.slice().sort((a,b)=>b.interestPct-a.interestPct||b.opening-a.opening);
    for(const c of priority) {
      const extra=r2(Math.min(capacity,Math.max(0,c.opening-c.minimum)));
      c.extra=extra;capacity=r2(capacity-extra);cash=r2(cash-extra);
    }
    for(const c of state) {
      const unpaid=r2(Math.max(0,c.opening-c.minimum-c.extra));
      const interest=r2(unpaid*c.interestPct/100);
      c.interest=interest;
      c.closing=r2(unpaid+interest+c.newSpending);
      balances[c.id]=c.closing;
    }
    rows.push({
      month:key,openingCash,income,fixedCash,otherCash,
      minimumTotal,extraTotal:r2(state.reduce((s,c)=>s+c.extra,0)),
      cardSpending:r2(state.reduce((s,c)=>s+c.newSpending,0)),
      interest:r2(state.reduce((s,c)=>s+c.interest,0)),
      openingDebt:startDebt,closingDebt:r2(state.reduce((s,c)=>s+c.closing,0)),
      closingCash:cash,netPosition:r2(cash-state.reduce((s,c)=>s+c.closing,0)),
      fundingGap:cash<0?Math.abs(cash):0,cards:state
    });
  }
  return rows;
}
