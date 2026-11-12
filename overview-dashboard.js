/**
 * BütçeApp dashboard — read-only presentation of existing user records.
 * No Firebase writes, no synthetic balances, no redistribution of cashflow.
 */
const r2=n=>Math.round((Number(n)||0)*100)/100;
const pos=n=>Math.max(0,r2(n));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const months=["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const shortMonths=["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const colors=["#26c7ad","#6e90ff","#f8b85c","#d281ee","#fa807f","#4bc1e7","#8ca3c6","#71cb73"];
const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(Number(n)||0);
const ratio=(a,b)=>b>0?Math.round(a/b*100):0;
export function buildOverviewData(input){
  const {year,month,categories,transactions,investments,getBudget,forecast}=input;
  if(!Number.isInteger(year)||!Number.isInteger(month)||month<0||month>11)throw Error("Invalid overview period");
  const incomeCats=categories?.income||[],expenseCats=categories?.expense||[];
  const categoryMap=new Map([...incomeCats,...expenseCats].map(c=>[c.id,c]));
  const yearTransactions=(transactions||[]).filter(t=>String(t.date||"").startsWith(String(year)+"-"));
  const yearInvestments=(investments||[]).filter(t=>String(t.date||"").startsWith(String(year)+"-"));
  const monthly=Array.from({length:12},(_,idx)=>{
    const tx=yearTransactions.filter(t=>Number(String(t.date).slice(5,7))===idx+1);
    const budgetIncome=r2(incomeCats.reduce((sum,c)=>sum+pos(getBudget(c.id,idx,year)),0));
    const budgetExpense=r2(expenseCats.reduce((sum,c)=>sum+pos(getBudget(c.id,idx,year)),0));
    const actualIncome=r2(tx.filter(t=>t.type==="income").reduce((sum,t)=>sum+pos(t.amt),0));
    const actualExpense=r2(tx.filter(t=>t.type==="expense").reduce((sum,t)=>sum+pos(t.amt),0));
    return {month:idx,budgetIncome,budgetExpense,actualIncome,actualExpense};
  });
  const current=monthly[month];
  const categoryExpenses=expenseCats.map(c=>{
    const actual=yearTransactions.filter(t=>t.type==="expense"&&t.cat===c.id&&Number(String(t.date).slice(5,7))===month+1)
      .reduce((sum,t)=>sum+pos(t.amt),0);
    return {id:c.id,name:c.name,icon:c.icon||"●",budget:pos(getBudget(c.id,month,year)),actual:r2(actual)};
  }).sort((a,b)=>b.actual-a.actual||b.budget-a.budget);
  const recent=yearTransactions.filter(t=>Number(String(t.date).slice(5,7))===month+1)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7)
    .map(t=>({...t,categoryName:categoryMap.get(t.cat)?.name||"Diğer",
      categoryIcon:categoryMap.get(t.cat)?.icon||"•"}));
  const investmentMonth=r2(yearInvestments.filter(t=>Number(String(t.date).slice(5,7))===month+1)
      .reduce((sum,t)=>sum+pos(t.amt),0));
  const forecastPeriod=String(year)+"-"+String(month+1).padStart(2,"0");
  return {year,month,forecastPeriod,current,monthly,categoryExpenses,recent,
    investmentMonth,forecast:forecast&&forecast.month===forecastPeriod?forecast:null,
    actualNet:r2(current.actualIncome-current.actualExpense),
    budgetNet:r2(current.budgetIncome-current.budgetExpense)};
}

function overviewTrend(data){
  const values=data.monthly.flatMap(r=>[r.budgetIncome,r.budgetExpense,r.actualIncome,r.actualExpense]);
  const peak=Math.max(1000,...values),W=880,H=244,L=52,R=15,T=15,B=36;
  const sx=i=>L+(W-L-R)*i/11,sy=v=>T+(H-T-B)*(1-v/peak);
  const ticks=[0,.25,.5,.75,1].map(p=>{
    const y=sy(peak*p);
    const label=peak*p>=1000000?(peak*p/1000000).toFixed(1)+"m":Math.round(peak*p/1000)+"k";
    return '<line x1="'+L+'" y1="'+y.toFixed(1)+'" x2="'+(W-R)+'" y2="'+y.toFixed(1)+'" stroke="currentColor" stroke-opacity=".1"/>'+
      '<text x="'+(L-7)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="currentColor" opacity=".62">'+label+'</text>';
  }).join("");
  const lines=[
    {key:"budgetIncome",color:"#38cba7",dash:""},
    {key:"budgetExpense",color:"#7892f8",dash:""},
    {key:"actualIncome",color:"#38cba7",dash:' stroke-dasharray="6 6"'},
    {key:"actualExpense",color:"#7892f8",dash:' stroke-dasharray="6 6"'}
  ].map(series=>{
    const points=data.monthly.map((r,i)=>[sx(i),sy(r[series.key])]);
    const d=points.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    return '<path d="'+d+'" stroke="'+series.color+'" stroke-width="2.7" fill="none"'+series.dash+
      ' stroke-linejoin="round" stroke-linecap="round"/>';
  }).join("");
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="12 aylık gelir ve gider bütçesi ile gerçekleşen karşılaştırması" preserveAspectRatio="xMidYMid meet">'+
    ticks+lines+data.monthly.map((r,i)=>'<text x="'+sx(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">'+shortMonths[i]+'</text>').join("")+'</svg>';
}

function donutMarkup(data){
  const realized=data.categoryExpenses.reduce((sum,x)=>sum+x.actual,0);
  const useActual=realized>0;
  const ranked=data.categoryExpenses.slice().sort((a,b)=>
    (useActual?b.actual:b.budget)-(useActual?a.actual:a.budget)).filter(x=>(useActual?x.actual:x.budget)>0);
  const entries=ranked.slice(0,6).map((row,i)=>({name:row.name,amount:useActual?row.actual:row.budget,color:colors[i%colors.length]}));
  const other=ranked.slice(6).reduce((sum,row)=>sum+(useActual?row.actual:row.budget),0);
  if(other>0)entries.push({name:"Diğer",amount:other,color:"#8d98a9"});
  const total=entries.reduce((s,x)=>s+x.amount,0);
  if(total===0)return '<div class="ov-empty">Bu dönemde henüz gider verisi yok.</div>';
  let cursor=0;
  const stops=entries.map(row=>{
    const from=cursor;cursor+=row.amount/total*100;
    return row.color+" "+from.toFixed(2)+"% "+cursor.toFixed(2)+"%";
  }).join(",");
  return '<div class="ov-donut-wrap"><div class="ov-donut" role="img" aria-label="Gider kategori dağılımı" style="background:conic-gradient('+stops+')">'+
    '<div class="ov-donut-center"><small>'+(useActual?"Gerçek gider":"Bütçe gideri")+'</small><strong>'+money(total)+'</strong></div></div>'+
    '<div class="ov-donut-legend">'+entries.map(row=>
      '<div class="ov-legend-line"><span class="ov-dot" style="background:'+row.color+'"></span>'+
      '<span>'+esc(row.name)+'</span><strong>'+Math.round(row.amount/total*100)+'%</strong></div>').join("")+
    '</div></div>';
}

function kpi(label,value,detail,kind){
  return '<div class="ov-kpi glass-panel '+(kind||"")+'"><div class="ov-kpi-top">'+
    '<span>'+esc(label)+'</span><span class="ov-kpi-orb"></span></div><strong>'+money(value)+'</strong>'+
    '<small>'+esc(detail)+'</small></div>';
}
const act=(tab,label)=>'<button type="button" class="ov-link" onclick="goTab(\''+tab+'\')">'+esc(label)+' <span aria-hidden="true">›</span></button>';
export function renderOverviewDashboard(data){
  const c=data.current,f=data.forecast;
  const forecastNotLoaded=!f;
  const netLabel=data.actualNet>=0?"Pozitif fark":"Negatif fark";
  const period=months[data.month]+" "+data.year;
  const hero='<header class="ov-hero glass-panel">'+
    '<div><span class="ov-eyebrow">Genel Bakış · Finansal Kontrol Merkezi</span>'+
    '<h2>Finansal görünümün</h2><p>Gelir, gider, borç ve nakit planının tek ekranda özeti.</p></div>'+
    '<div class="ov-period"><label>Dönem <span class="sr-only">Yıl ve ay</span></label>'+
    '<div class="ov-period-picker"><select aria-label="Yıl" onchange="overviewSetPeriod(this.value,null)">'+
    Array.from({length:6},(_,i)=>2025+i).map(y=>'<option value="'+y+'"'+(y===data.year?' selected':'')+'>'+y+'</option>').join("")+
    '</select><select aria-label="Ay" onchange="overviewSetPeriod(null,this.value)">'+
    months.map((m,i)=>'<option value="'+i+'"'+(i===data.month?' selected':'')+'>'+m+'</option>').join("")+
    '</select></div></div></header>';
  const currentKPIs='<div class="ov-kpi-grid">'+
    kpi("Gelir bütçesi",c.budgetIncome,period,"ov-teal")+
    kpi("Gerçekleşen gelir",c.actualIncome,"İşlem kayıtlarından","ov-indigo")+
    kpi("Gider bütçesi",c.budgetExpense,period,"ov-amber")+
    kpi("Gerçekleşen gider",c.actualExpense,"Bütçe kullanımı: %"+ratio(c.actualExpense,c.budgetExpense),"ov-coral")+
    kpi("Gerçekleşen net",data.actualNet,netLabel,"ov-teal")+
    kpi("Yatırım işlem toplamı",data.investmentMonth,"Piyasa değeri değildir","ov-indigo")+'</div>';
  const fBlock=forecastNotLoaded?
    '<div class="ov-empty">Bu ay için nakit akışı tahmini bulunmuyor. Nakit Akışı bölümünden planı ve dönemini kontrol edebilirsin.</div>':
    '<div class="ov-cash-grid">'+[
      ["Kredi kartı borcu",f.closingCardDebt,"Kartlara ödeme sonrası"],
      ["Ek Hesap / KMH",f.closingOverdraft,"Tahmini ay sonu borcu"],
      ["Kartlara ödeme",f.cardPayments,"Asgari ve ek ödeme dahil"],
      ["Toplam birikim",f.closingSavings,"Borçlar kapandıysa"],
      ["Krediler",f.loans,"Zorunlu aylık ödeme"],
      ["Kart asgarileri",f.minimum,"Tahmini yük"]
    ].map(([name,value,desc])=>
      '<div><span>'+esc(name)+'</span><strong>'+money(value)+'</strong><small>'+esc(desc)+'</small></div>').join("")+
    '</div>'+(f.unfundedMandatory>0?'<div class="ov-alert">⚠️ Ek Hesap limiti yetersiz; '+money(f.unfundedMandatory)+' zorunlu ödeme karşılanamıyor.</div>':"");
  const chart='<section class="glass-panel ov-panel" id="overview-panel-trend">'+
    '<div class="ov-panel-heading"><div><span class="ov-eyebrow">YILLIK PERFORMANS</span><h3>Gelir – gider trendi</h3></div>'+
    '<button class="ov-icon-btn" title="Grafiği genişlet" aria-label="Grafiği genişlet" onclick="overviewExpand(\'trend\')">⛶</button></div>'+
    '<div class="ov-chart-legend"><span><i style="background:#38cba7"></i>Gelir bütçesi</span>'+
    '<span><i style="background:#7892f8"></i>Gider bütçesi</span>'+
    '<span><i class="ov-dashed" style="border-color:#38cba7"></i>Gelir gerçekleşen</span>'+
    '<span><i class="ov-dashed" style="border-color:#7892f8"></i>Gider gerçekleşen</span></div>'+
    '<div class="ov-chart-scroll">'+overviewTrend(data)+'</div></section>';
  const budgets='<section class="glass-panel ov-panel"><div class="ov-panel-heading"><div>'+
    '<span class="ov-eyebrow">KATEGORİLER</span><h3>Bütçe kullanımın</h3></div>'+act("planning","Bütçe / Gerçekleşen")+'</div>'+
    '<div class="ov-progress-list">'+data.categoryExpenses.slice(0,7).map(row=>{
      const pct=ratio(row.actual,row.budget);
      return '<div class="ov-progress-row"><div class="ov-progress-label"><span>'+esc(row.icon)+' '+esc(row.name)+'</span>'+
      '<span>'+money(row.actual)+' / '+money(row.budget)+'</span></div>'+
      '<div class="ov-meter"><div style="width:'+Math.min(100,pct)+'%;background:'+(pct>100?"#fb7185":"var(--accent)")+'"></div></div>'+
      '<small>'+ (row.budget>0?"%"+pct+" kullanıldı":"Tanımlı bütçe yok")+'</small></div>';
    }).join("")+'</div></section>';
  const spending='<section class="glass-panel ov-panel" id="overview-panel-categories"><div class="ov-panel-heading"><div>'+
    '<span class="ov-eyebrow">DAĞILIM</span><h3>Harcamalar nereye gidiyor?</h3></div>'+
    '<button class="ov-icon-btn" aria-label="Dağılımı genişlet" onclick="overviewExpand(\'categories\')">⛶</button></div>'+
    donutMarkup(data)+'</section>';
  const timeline='<section class="glass-panel ov-panel"><div class="ov-panel-heading"><div>'+
    '<span class="ov-eyebrow">GÜNCEL HAREKETLER</span><h3>Son işlemler</h3></div>'+act("history","Tüm işlemler")+'</div>'+
    (data.recent.length?'<div class="ov-activity">'+data.recent.map(t=>{
      const inc=t.type==="income";
      return '<div class="ov-activity-item"><div class="ov-activity-symbol">'+esc(t.categoryIcon)+'</div>'+
      '<div class="ov-activity-description"><strong>'+esc(t.categoryName)+'</strong><span>'+esc(t.date||"")+' · '+esc(t.note||"İşlem")+'</span></div>'+
      '<strong class="'+(inc?"ov-positive":"ov-negative")+'">'+(inc?"+":"−")+money(t.amt)+'</strong></div>';
    }).join("")+'</div>':'<div class="ov-empty">Bu ay henüz gerçekleşmiş işlem kaydı bulunmuyor.</div>')+
    '</section>';
  const cash='<section class="glass-panel ov-panel ov-cash-panel"><div class="ov-panel-heading"><div>'+
    '<span class="ov-eyebrow">ÖDEME ÖNCELİĞİ</span><h3>Borç ve nakit görünümü <small>Tahmini</small></h3></div>'+
    act("cashflow","Nakit akışı")+'</div>'+fBlock+'</section>';
  const intro='<div class="ov-headline"><h3>Tek bakışta '+esc(period)+'</h3>'+
    '<span class="ov-subtle">Bütçe, gerçekleşen ve nakit planı farklı kaynaklardan gösterilir; aynı tutar ikinci kez eklenmez.</span></div>';
  return '<div class="overview-dashboard fade">'+hero+intro+currentKPIs+
    '<div class="ov-dashboard-grid">'+chart+spending+budgets+timeline+'</div>'+cash+'</div>';
}
