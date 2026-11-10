/**
 * Read-only finance forecast presentation. Does not write to Firestore.
 * The month-end cash model is the sole source of financial numbers.
 */
import {computeCashPositionTable} from "./cashflow-model.js";

export function createCashflowForecastUI({money,monthLabel}){
  const metricDefs=[
    {key:"income",label:"Gelir",color:"#4285e9"},
    {key:"totalExpenses",label:"Toplam harcama",color:"#eb667c"},
    {key:"monthlyNet",label:"Aylık net fark",color:"#12a681"},
    {key:"closingSavings",label:"Toplam birikim",color:"#9a70e9"},
    {key:"closingOverdraft",label:"Ek Hesap borcu",color:"#e59b41"},
    {key:"statementTotal",label:"Kart borcu",color:"#17aab3"},
    {key:"minimum",label:"Kart asgarisi",color:"#8b99af"},
    {key:"cashExpenses",label:"Nakit gider",color:"#cd6fa8"},
    {key:"loans",label:"Krediler",color:"#7a8b3a"}
  ];
  const available=new Map(metricDefs.map(m=>[m.key,m]));
  const visible=new Set(["income","totalExpenses","monthlyNet","closingSavings"]);
  const compactNumber=new Intl.NumberFormat("tr-TR",{notation:"compact",maximumFractionDigits:1});
  let data=[],modal=null,previousFocus=null;

  const numeric=x=>Number.isFinite(Number(x))?Number(x):0;
  const signed=x=>(x<0?"−":"")+money(Math.abs(x));
  const colorClass=x=>x<0?"cf-month-delta-negative":x>0?"cf-month-delta-positive":"";
  const period=x=>monthLabel(x);
  const shortMonth=x=>{
    const parts=String(x).split("-");
    const names=["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
    return names[Number(parts[1])-1]||"–";
  };
  const metricValue=(r,key)=>{
    if(key==="statementTotal")return r.card.statementTotal;
    return numeric(r[key]);
  };
  const detail=(label,value,css="")=>
    '<div class="cf-mobile-metric"><span>'+label+'</span><strong class="'+css+'">'+value+'</strong></div>';

  function table(){
    return '<div class="cf-forecast-scroll cf-forecast-desktop" role="region" tabindex="0" aria-label="12 aylık detaylı nakit tablosu, yatay kaydırılabilir">'+
      '<table class="cf-table cf-compact-forecast"><thead><tr>'+
      '<th>Ay</th><th>Gelir</th><th>Krediler</th>'+
      '<th>Faizli devreden kart borcu</th><th>Ay içi kart harcaması</th>'+
      '<th>Gelecek taksitler</th><th>Ay sonu kart borcu</th>'+
      '<th>Gelecek ay asgari</th><th>Nakit gider</th>'+
      '<th>Devreden Ek Hesap</th><th>Toplam harcama</th>'+
      '<th>Sonraki aya Ek Hesap</th><th>Aylık net (Gelir − Harcama)</th>'+
      '<th>Toplam birikim</th></tr></thead><tbody>'+
      data.map(r=>{
        const paidMonth=period(r.dueMonth);
        const verified=r.card.hasVerified?" · Banka ekstresi":"";
        return '<tr class="'+(r.closingOverdraft>0?"cf-overdraft-month":r.closingSavings>0?"cf-savings-month":"")+'">'+
          '<td><strong>'+period(r.month)+'</strong><small>Ödeme: '+paidMonth+'</small></td>'+
          '<td>'+money(r.income)+'</td><td>'+money(r.loans)+'</td>'+
          '<td>'+money(r.card.carryover)+'</td>'+
          '<td>'+money(r.card.purchases)+'</td>'+
          '<td>'+money(r.card.installments)+'</td>'+
          '<td><strong>'+money(r.card.statementTotal)+'</strong><small>'+verified+'</small></td>'+
          '<td>'+money(r.minimum)+'</td><td>'+money(r.cashExpenses)+'</td>'+
          '<td>'+(r.netOpening<0?signed(r.netOpening):money(0))+'</td>'+
          '<td><strong>'+money(r.totalExpenses)+'</strong></td>'+
          '<td class="'+(r.closingOverdraft>0?"cf-bad":"")+'">'+
            (r.closingOverdraft>0?signed(-r.closingOverdraft):money(0))+'</td>'+
          '<td class="'+colorClass(r.monthlyNet)+'"><strong>'+signed(r.monthlyNet)+'</strong></td>'+
          '<td class="'+(r.closingSavings>0?"cf-good":"")+'"><strong>'+money(r.closingSavings)+'</strong></td></tr>';
      }).join('')+'</tbody></table></div>';
  }

  function mobileCards(){
    return '<div class="cf-mobile-forecast" aria-label="Ay bazında özet">'+
      data.map((r,index)=>{
        const card=r.card;
        const fields=[
          ["Gelir",money(r.income)],
          ["Krediler",money(r.loans)],
          ["Faizli devreden kart borcu",money(card.carryover)],
          ["Ay içi kart harcaması",money(card.purchases)],
          ["Gelecek taksitler",money(card.installments)],
          ["Gelecek ay ödenecek kart borcu",money(card.statementTotal)],
          ["Gelecek ay asgari",money(r.minimum)],
          ["Nakit gider",money(r.cashExpenses)],
          ["Devreden Ek Hesap",r.netOpening<0?signed(r.netOpening):money(0)],
          ["Toplam harcama",money(r.totalExpenses)],
          ["Sonraki aya Ek Hesap",r.closingOverdraft>0?signed(-r.closingOverdraft):money(0)],
          ["Aylık net fark",signed(r.monthlyNet)],
          ["Toplam birikim",money(r.closingSavings)]
        ];
        return '<details class="cf-mobile-month"><summary>'+
          '<span class="cf-month-headline"><strong>'+period(r.month)+'</strong>'+
          '<span class="cf-muted">Kart ödeme: '+period(r.dueMonth)+'</span></span>'+
          '<span class="cf-month-delta-card"><span>Aylık net</span>'+
          '<strong class="'+colorClass(r.monthlyNet)+'">'+signed(r.monthlyNet)+'</strong>'+
          '<span>Toplam birikim: '+money(r.closingSavings)+'</span></span>'+
          '</summary><div class="cf-month-metrics">'+
          fields.map(([label,value])=>detail(label,value,label==="Aylık net fark"?colorClass(r.monthlyNet):"")).join('')+
          '</div></details>';
      }).join('')+'</div>';
  }

  function chartSvg(){
    const metrics=metricDefs.filter(m=>visible.has(m.key));
    if(!metrics.length)return '<p class="cf-muted" style="padding:24px 10px">Grafikte göstermek istediğin verileri aşağıdan seç.</p>';
    if(!data.length)return '<p class="cf-muted">Tahmin verisi yok.</p>';
    const width=960,height=310,left=78,right=22,top=20,bottom=50;
    const pw=width-left-right,ph=height-top-bottom;
    const all=metrics.flatMap(m=>data.map(r=>metricValue(r,m.key)));
    const low=Math.min(0,...all),high=Math.max(0,...all);
    const extent=high-low||1;
    const pad=extent*.07,min=low-pad,max=high+pad;
    const sx=i=>left+(data.length<=1?pw/2:pw*i/(data.length-1));
    const sy=value=>top+(max-numeric(value))/(max-min)*ph;
    const zero=sy(0);
    const grid=Array.from({length:5},(_,i)=>{
      const value=min+(max-min)*(4-i)/4,y=sy(value);
      return '<line x1="'+left+'" y1="'+y.toFixed(2)+'" x2="'+(width-right)+'" y2="'+y.toFixed(2)+
        '" stroke="currentColor" stroke-opacity=".13"/>'+
        '<text x="'+(left-12)+'" y="'+(y+4).toFixed(2)+'" text-anchor="end" font-size="12" fill="currentColor" fill-opacity=".72">'+
        compactNumber.format(value)+'</text>';
    }).join('');
    const xLabels=data.map((r,i)=>
      '<text x="'+sx(i).toFixed(1)+'" y="'+(height-19)+'" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".78">'+
      shortMonth(r.month)+(r.month.endsWith("-01")?" '"+r.month.slice(2,4):"")+'</text>').join('');
    const lines=metrics.map(m=>{
      const points=data.map((r,i)=>({x:sx(i),y:sy(metricValue(r,m.key)),v:metricValue(r,m.key),month:r.month}));
      const path=points.map((p,i)=>(i?"L":"M")+p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" ");
      return '<path d="'+path+'" fill="none" stroke="'+m.color+'" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'+
        points.map(p=>'<circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="4" fill="'+m.color+
          '" stroke="var(--bg3)" stroke-width="1.3"><title>'+period(p.month)+' · '+m.label+': '+signed(p.v)+'</title></circle>').join('');
    }).join('');
    return '<svg role="img" aria-label="12 aylık seçili finansal göstergelerin çizgi grafiği" viewBox="0 0 '+width+' '+height+
      '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'+
      '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+zero.toFixed(2)+'" y2="'+zero.toFixed(2)+'" stroke="currentColor" stroke-opacity=".36" stroke-dasharray="4 4"/>'+
      grid+xLabels+lines+'</svg>';
  }

  function chart(scope){
    const chartId="cf-trend-graph-"+scope;
    const filters=metricDefs.map(m=>
      '<label><input type="checkbox" data-cf-chart-key="'+m.key+'" '+
      (visible.has(m.key)?"checked ":"")+'onchange="cfChartToggle(\''+m.key+'\',this.checked)">'+
      '<span class="cf-chart-dot" style="background:'+m.color+'"></span>'+m.label+'</label>').join('');
    return '<section class="cf-trend" aria-label="Nakit akışı grafiği">'+
      '<div class="cf-trend-title">12 aylık finansal görünüm</div>'+
      '<p class="cf-muted">Çizgilerin üzerine gelerek tutarları görebilirsin. Sıfırın altı, o gösterge için eksi değeri ifade eder.</p>'+
      '<div class="cf-trend-chart" id="'+chartId+'">'+chartSvg()+'</div>'+
      '<fieldset class="cf-chart-controls"><legend>Grafikte görünmesini istediğin verileri seç</legend>'+filters+'</fieldset>'+
      '<div class="cf-inline-actions">'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="cfChartPreset(\'default\')">Temel göstergeler</button>'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="cfChartPreset(\'all\')">Tümünü göster</button></div>'+
      '</section>';
  }

  function syncCharts(){
    if(typeof document==="undefined")return;
    document.querySelectorAll('[id^="cf-trend-graph-"]').forEach(el=>{el.innerHTML=chartSvg();});
    document.querySelectorAll("input[data-cf-chart-key]").forEach(el=>{
      el.checked=visible.has(el.dataset.cfChartKey);
    });
  }

  function toggle(key,checked){
    if(!available.has(key))return;
    if(checked)visible.add(key);else visible.delete(key);
    syncCharts();
  }
  function preset(kind){
    visible.clear();
    const keys=kind==="all"?metricDefs.map(m=>m.key):
      ["income","totalExpenses","monthlyNet","closingSavings"];
    keys.forEach(key=>visible.add(key));
    syncCharts();
  }

  function render(rows,plan){
    data=computeCashPositionTable(plan,rows);
    const snapshot=plan.overdraft.actualSnapshot;
    const note=snapshot?
      '<div class="cf-compact-callout"><strong>Fiili Ek Hesap referansı ('+period(snapshot.month)+
      '):</strong> <strong class="cf-bad">'+signed(-snapshot.debt)+'</strong></div>':
      '<div class="cf-sync-alert"><strong>⚠️ Fiili Ek Hesap bakiyesi henüz girilmemiş.</strong>'+
      '<span>Eski tahmin gerçek bakiye olmayabilir.</span>'+
      '<button class="btn btn-p btn-sm" onclick="cfOpenSnapshotSettings()">Fiili Ek Hesap bakiyesi gir / Excel yükle</button></div>';
    const helper='<p class="cf-muted">Aylık net = <strong>Gelir − Toplam harcama</strong>. '+
      'Toplam birikim, önceki aylardan devreden net bakiyeyi de dikkate alır. '+
      'Ek Hesap borcu varsa aylık net pozitif olsa bile toplam birikim sıfır olabilir. '+
      'Kart asgarileri bir sonraki ekstre için tahminidir; KMH günlük faizi bu Excel tipi nakit planına ayrıca eklenmez.</p>';
    const toolbar='<div class="cf-forecast-actions">'+
      '<span class="cf-muted">12 ay · TL · Aylık net ve toplam birikim ayrı gösterilir</span>'+
      '<button type="button" class="btn btn-p btn-sm" onclick="cfForecastFullscreen()">⛶ Geniş ekranda aç</button></div>';
    return note+helper+toolbar+table()+mobileCards()+chart("dash");
  }

  function open(){
    if(!data.length||typeof document==="undefined")return;
    close();
    previousFocus=document.activeElement;
    modal=document.createElement("div");
    modal.className="cf-forecast-modal";
    modal.id="cf-fullscreen-forecast";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-label","12 aylık geniş nakit akışı görünümü");
    modal.innerHTML='<div class="cf-forecast-modal-shell">'+
      '<div class="cf-forecast-modal-head"><strong>12 Aylık Nakit Akışı · Geniş görünüm</strong>'+
      '<button type="button" class="btn btn-p btn-sm" id="cf-forecast-close" onclick="cfForecastClose()">✕ Kapat</button></div>'+
      '<div class="cf-forecast-modal-content"><p class="cf-muted">Tablo yatay kaydırılabilir. Telefon dik tutulduğunda görünüm yatay çevrilir.</p>'+
      table().replace('cf-forecast-desktop','cf-forecast-wide-table')+chart("expanded")+
      '</div></div>';
    modal.addEventListener("click",e=>{if(e.target===modal)close();});
    document.body.appendChild(modal);
    document.body.classList.add("cf-forecast-overlay-open");
    document.getElementById("cf-forecast-close")?.focus();
  }
  function close(){
    if(modal){
      modal.remove();
      modal=null;
      document.body.classList.remove("cf-forecast-overlay-open");
      previousFocus?.focus?.();
    }
  }
  function onKeydown(e){
    if(e.key==="Escape"&&modal){close();}
  }
  if(typeof document!=="undefined")document.addEventListener("keydown",onKeydown);
  return {render,open,close,toggle,preset};
}
