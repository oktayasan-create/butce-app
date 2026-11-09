/**
 * Read-only projection of the existing "Genel Bakış (Bütçe)" table into a
 * temporary cash-flow forecast. Never writes legacy budgets or mutates the
 * user's saved cashflow plan.
 *
 * Budget figures are year/month-specific (including 2027) and come from the
 * same getBudget(id, monthIndex, year) function used by the Budget screen.
 * Card-funded categories with multiple card options must be linked explicitly.
 */
import {advanceMonth} from "./cashflow-model.js";

const tr=x=>String(x||"").toLocaleLowerCase("tr-TR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const isCashName=name=>/\b(aidat|kuafor|berber)\b/.test(tr(name));
const isCardName=name=>/\b(market|elektrik|dogalgaz|su|suyu|abonelik|uyelik|internet|telefon|yemek|kafe|cafe|icecek)\b/.test(tr(name));
function matchPlanExpense(name,p){
  const normalize=tr(name);
  const match=p.categories.expense.find(x=>tr(x.name)===normalize);
  if(match)return match.id;
  const aliases={
    "yemek":"exp_food","yemek kafe":"exp_food_cafe",
    "icme suyu":"exp_drinkingwater","apartman aidati":"exp_building_fee",
    "aidat":"exp_building_fee","dogalgaz":"exp_naturalgas",
    "elektrik":"exp_electricity","su":"exp_water_bill",
    "uyelik":"exp_subscription","kuafor":"exp_hairdresser",
    "market":"exp_market"
  };
  const id=aliases[normalize];
  return p.categories.expense.some(x=>x.id===id)?id:"exp_other";
}
export function defaultBudgetPayment(name){
  return isCashName(name)?"cash":isCardName(name)?"card":"cash";
}
export function budgetSourceConfig(plan,category){
  const configured=plan.budgetLink?.categories?.[category.id]||{};
  const payment=configured.payment==="cash"||configured.payment==="card"?
    configured.payment:defaultBudgetPayment(category.name);
  const validId=configured.cardId&&plan.cards.some(c=>c.id===configured.cardId)?configured.cardId:null;
  const activeCards=plan.cards.filter(c=>c.active!==false);
  return {payment,cardId:payment==="cash"?null:(validId|| (activeCards.length===1?activeCards[0].id:null)),
    excluded:configured.excluded===true};
}
export function projectBudgetToCashFlow(plan,legacyCategories,getBudget,periods=12){
  if(!plan||!legacyCategories||typeof getBudget!=="function")throw Error("Invalid budget source");
  const p=structuredClone(plan);
  if(plan.budgetLink?.enabled===false)
    return {plan:p,linked:false,missingCards:[],breakdown:[]};
  const incomeCats=legacyCategories.income||[],expenseCats=legacyCategories.expense||[];
  const months={},missingCards=[],breakdown=[];
  for(let i=0;i<periods;i++){
    const month=advanceMonth(p.startMonth,i),year=Number(month.slice(0,4)),mi=Number(month.slice(5))-1;
    const incomes=incomeCats.map(cat=>({
      id:cat.id,name:cat.name,amount:Number(getBudget(cat.id,mi,year))||0
    })).filter(x=>Number.isFinite(x.amount)&&x.amount>0);
    const expenses=[];
    for(const cat of expenseCats){
      const amount=Number(getBudget(cat.id,mi,year))||0;
      if(!(amount>0)||!Number.isFinite(amount))continue;
      const cfg=budgetSourceConfig(plan,cat);
      if(cfg.excluded)continue;
      const expense={id:cat.id,name:cat.name,amount,
        categoryId:matchPlanExpense(cat.name,p),
        payment:cfg.payment,cardId:cfg.cardId};
      if(cfg.payment==="card"&&!cfg.cardId){
        missingCards.push({month,category:cat.name,amount});
        continue; // Never silently guess the bank to debit.
      }
      expenses.push(expense);
    }
    months[month]={
      income:Math.round(incomes.reduce((sum,x)=>sum+x.amount,0)*100)/100,
      incomes,expenses
    };
    breakdown.push({month,income:months[month].income,
      incomeCategories:incomes,expenseCategories:expenses});
  }
  // A transient only projection: the original plan's recurring income/expense
  // and generic monthly income/fixed cash assumptions are ignored while linked.
  // They remain in Firestore and are restored if Budget linking is disabled.
  p.budgetProjection={months};
  return {plan:p,linked:true,missingCards,breakdown};
}
