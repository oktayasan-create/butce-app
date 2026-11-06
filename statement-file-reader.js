/**
 * Client-side statement reader for YKB, Enpara and Garanti.
 * User source files stay in the browser; only validated, reviewed output may be
 * explicitly saved to the private Firebase statement inbox.
 *
 * Extracted PDF text must be selectable; scanned/image PDFs require OCR and
 * are intentionally rejected rather than guessed.
 */
const MONTHS={
  ocak:1,subat:2,şubat:2,mart:3,nisan:4,mayis:5,mayıs:5,
  haziran:6,temmuz:7,agustos:8,ağustos:8,eylul:9,eylül:9,
  ekim:10,kasim:11,kasım:11,aralik:12,aralık:12
};
const dateISO=(year,month,day)=>{
  const y=Number(year),m=Number(month),d=Number(day);
  if(!Number.isInteger(y)||y<2000||y>2099||m<1||m>12||d<1||d>31)return null;
  const out=new Date(Date.UTC(y,m-1,d));
  return out.getUTCFullYear()===y&&out.getUTCMonth()===m-1&&out.getUTCDate()===d?
    y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0"):null;
};
export function parseStatementDate(value){
  const s=String(value??"").trim();
  let m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if(m)return dateISO(m[3],m[2],m[1]);
  m=s.match(/^(\d{1,2})\s+(Ocak|Şubat|Subat|Mart|Nisan|Mayıs|Mayis|Haziran|Temmuz|Ağustos|Agustos|Eylül|Eylul|Ekim|Kasım|Kasim|Aralık|Aralik)\s+(20\d{2})$/i);
  if(m)return dateISO(m[3],MONTHS[m[2].toLocaleLowerCase("tr-TR")],m[1]);
  m=s.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if(m)return dateISO(m[1],m[2],m[3]);
  return null;
}
export function parseStatementMoney(raw){
  if(typeof raw==="number")return Number.isFinite(raw)?Math.round(Math.abs(raw)*100)/100:null;
  let v=String(raw??"").trim().replace(/[₺\s]/g,"").replace(/TL|TRY/gi,"")
    .replace(/[−–]/g,"-").replace(/[()]/g,"");
  if(!v)return null;
  const sign=v.startsWith("-")?-1:1;
  v=v.replace(/^[+-]/,"");
  if(v.includes(",")&&v.includes("."))v=v.replace(/\./g,"").replace(",",".");
  else if(v.includes(","))v=v.replace(",",".");
  else if((v.match(/\./g)||[]).length>1)v=v.replace(/\./g,"");
  if(!/^\d+(?:\.\d{1,2})?$/.test(v))return null;
  const n=Number(v);
  return Number.isFinite(n)?Math.round(Math.abs(n)*100)/100*sign:null;
}
export function classifyStatementTransaction(description,signedAmount,bank=""){
  const s=String(description||"").toLocaleUpperCase("tr-TR");
  if(/KKDF|BSMV|DAMGA VERG|KAYNAK KULLANIM|FAİZ VERGİSİ/.test(s))return "tax";
  if(/FAİZ|FAIZ|F[AİI]Z[İI]|GEC[İI]KME F/.test(s))return "interest";
  if(/ÖDEME-İNTERNET|OTOMATİK TAHSİLAT|OTOMATIK TAHSILAT|^ÖDEME\s*-\s*ENPARA|KART BORCU ÖDEME|^ÖDEMELER\b/.test(s))return "payment";
  if(/USD EKSTREDEN|EUR EKSTREDEN|GBP EKSTREDEN|BAKİYE TRANSFER|BAKIYE TRANSFER/.test(s))return "transfer";
  if(signedAmount<0)return "refund";
  if(/\bİADE\b|\bIADE\b|\bİPTAL\b|\bIPTAL\b/.test(s))return "refund";
  return "purchase";
}
export function guessStatementCategory(description){
  const s=String(description||"").toLocaleUpperCase("tr-TR");
  const map=[
    [/(MİGROS|MIGROS|BİM|BIM|A101|CARREFOUR|FİLE MARKET|FILE MARKET|MARKET|GETİR|GETIR|GIDA|BAĞLARICI|BAGLARICI)/,"Market"],
    [/(OPET|SHELL|PETROL|BP |AKARYAKIT|TOTALENERG)/,"Akaryakıt"],
    [/(THY|TÜRK HAVA|PEGASUS|RYANAIR|UCUZABİLET|UCUZBILET|BOOKING|OTEL|AIRBNB|HOTEL|SUNEXPRESS)/,"Seyahat"],
    [/(NETFLIX|SPOTIFY|APPLE\.COM|YOUTUBE|CANVA|CHATGPT|GOOGLE|CAPCUT|MICROSOFT|STEAM)/,"Eğlence / Hobi"],
    [/(TRENDYOL|HEPSİBURADA|HEPSIBURADA|AMAZON|N11|ETİCARET|E-TİCARET)/,"E-Ticaret"],
    [/(KOTON|LCWAIKIKI|LC WAIKIKI|DEFACTO|ADİDAS|ADIDAS|MAVİ|MAVI|LUFIAN)/,"Giyim / Aksesuar"],
    [/(VETERİNER|VETERINER|ECZANE|HASTANE|SAĞLIK|SAGLIK|ROSSMANN|GRATIS)/,"Sağlık / Bakım"],
    [/(ALLIANZ|SİGORTA|SIGORTA|EMEKLİLİK|EMEKLILIK)/,"Emeklilik / Sigorta"],
    [/(VERGİ DAİRESİ|VERGI DAIRESI|GİB|GIB\.GOV)/,"Vergi"],
    [/(YEMEK|RESTORAN|RESTAURANT|BURGER|KAHVE|CAFE|BÖREK|BOREK|DÖNER|DONER)/,"Yeme / İçme"],
    [/(TELEKOM|TURKCELL|VODAFONE|SUPERONLINE|ENERJİ|ENERJI|ELEKTRİK|ELEKTRIK|SU FATURA)/,"Ev / Dekorasyon"],
  ];
  for(const [re,label] of map)if(re.test(s))return label;
  return "Diğer";
}
function installment(description,extras=""){
  const s=description+" "+extras;
  let m=s.match(/\((\d{1,2})\s*\/\s*(\d{1,2})\)/);
  if(!m)m=s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*taksid/i);
  const cur=m?Number(m[1]):null,total=m?Number(m[2]):null;
  return {installmentCurrent:cur,installmentTotal:total,
    remainingInstallments:cur&&total&&cur<=total?total-cur:null};
}
function normalizeLine(line){return String(line||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();}
function tokenId(prefix,index){return prefix+"_"+String(index).padStart(4,"0");}
function makeTx(prefix,ix,date,description,amount,type,extra=""){
  const inst=installment(description,extra);
  return {id:tokenId(prefix,ix),date,description:description.slice(0,160),
    amount:Math.round(Math.abs(amount)*100)/100,type,
    category:type==="purchase"||type==="refund"?guessStatementCategory(description):null,
    ...inst};
}
function fromLineCurrency(text){
  // Matches monetary amounts formatted with a two-digit fractional part.
  return [...String(text).matchAll(/([+-]?\d{1,3}(?:\.\d{3})*,\d{2}|[+-]?\d+,\d{2})\s*(?:TL)?/g)];
}
function findYkbSummary(text,label){
  const lines=text.split(/\r?\n/);
  const rx=label instanceof RegExp?label:new RegExp(label,"i");
  for(const line of lines){
    if(!rx.test(line))continue;
    const money=fromLineCurrency(line);
    if(money.length)return parseStatementMoney(money[0][1]);
  }
  return null;
}
function findLabelDate(text,label){
  const lines=text.split(/\r?\n/),rx=new RegExp(label,"i");
  for(const line of lines){
    if(!rx.test(line))continue;
    const token=line.match(/(\d{1,2}[./-]\d{1,2}[./-]20\d{2}|\d{1,2}\s+(?:Ocak|Şubat|Subat|Mart|Nisan|Mayıs|Mayis|Haziran|Temmuz|Ağustos|Agustos|Eylül|Eylul|Ekim|Kasım|Kasim|Aralık|Aralik)\s+20\d{2})/i);
    if(token)return parseStatementDate(token[1]);
  }
  return null;
}
function prefixFor(bank,date,hash){return (bank==="Yapı Kredi"?"ykb":bank==="Enpara"?"enpara":"garanti")+"-"+(date||"undated").replaceAll("-","")+"-"+hash.slice(0,8);}
export function parseStatementPDFText(text,fileName="statement.pdf",hash="local"){
  if(typeof text!=="string"||text.trim().length<120)throw Error("PDF'de okunabilir metin yok. Görüntü tabanlı PDF bu sürümde desteklenmiyor.");
  const bank=/Enpara|Kredi Kartı Ekstresi|Minimum ödeme tutarı/i.test(text)&&/Enpara/i.test(text)?
    "Enpara":/YAPI KREDİ|YAPI KREDI|WORLD|OPET WORLDCARD|HEPSİBURADA WORLDCARD/i.test(text)?"Yapı Kredi":null;
  if(!bank)throw Error("PDF formatı tanınmadı. Bu sürüm Yapı Kredi ve Enpara PDF ekstrelerini destekliyor.");
  const enpara=bank==="Enpara";
  const date=enpara?findLabelDate(text,"Ekstre tarihi"):findLabelDate(text,"Hesap Kesim Tarihi");
  const dueDate=enpara?findLabelDate(text,"Son ödeme tarihi"):findLabelDate(text,"Son Ödeme Tarihi");
  const balance=enpara?findYkbSummary(text,/Ekstre borcu/i):findYkbSummary(text,/Dönem Borcu/i);
  const minimum=enpara?findYkbSummary(text,/Minimum ödeme tutarı/i):
    findYkbSummary(text,/Ödenmesi Gereken Asgari Tutar\/Oran/i);
  const previousBalance=enpara?null:findYkbSummary(text,/Önceki Dönem Hesap Özeti Borcu/i);
  const periodSpending=enpara?null:findYkbSummary(text,/Dönem İçi Harcamalar/i);
  const remainingInstallmentsTotal=enpara?null:findYkbSummary(text,/Kalan Toplam Taksit Tutarı/i);
  const last4=(text.match(/(?:\*{2,4}\s*){1,3}(\d{4})/)||[])[1]||null;
  const label=bank+(last4?" •••• "+last4:" • "+fileName.replace(/\.pdf$/i,"").slice(0,28));
  const prefix=prefixFor(bank,date,hash);
  const warnings=[],tx=[];
  const lines=text.split(/\r?\n/);
  const ykbDate=/^\s*(\d{1,2}\s+(?:Ocak|Şubat|Subat|Mart|Nisan|Mayıs|Mayis|Haziran|Temmuz|Ağustos|Agustos|Eylül|Eylul|Ekim|Kasım|Kasim|Aralık|Aralik)\s+20\d{2})\s+(.+)$/i;
  const enparaDate=/^\s*(\d{1,2}[./-]\d{1,2}[./-]20\d{2})\s+(.+)$/;
  let inTransactions=enpara;
  for(const line of lines){
    if(!enpara){
      if(/İşlem Tarihi\s+İşlemler/i.test(line)){inTransactions=true;continue;}
      if(/^\s*TOPLAM\s/i.test(line)){inTransactions=false;continue;}
      if(!inTransactions)continue;
      const detail=line.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*taksidi/i);
      if(detail&&tx.length){
        const current=Number(detail[1]),total=Number(detail[2]);
        if(current>=1&&total>=current&&total<=120){
          tx[tx.length-1].installmentCurrent=current;
          tx[tx.length-1].installmentTotal=total;
          tx[tx.length-1].remainingInstallments=total-current;
        }
      }
    }
    const m=line.match(enpara?enparaDate:ykbDate);
    if(!m)continue;
    const dateStr=parseStatementDate(m[1]);if(!dateStr)continue;
    const rest=normalizeLine(m[2]);
    const amounts=fromLineCurrency(rest);if(!amounts.length)continue;
    // Enpara uses trailing amount; YKB shows first amount after description,
    // followed by remaining installment and points in other columns.
    const amountMatch=enpara?amounts[amounts.length-1]:amounts[0];
    let signed=parseStatementMoney(amountMatch[1]);if(signed===null)continue;
    if(/-\s*$/.test(rest.slice(0,amountMatch.index)))signed=-Math.abs(signed);
    const description=normalizeLine(rest.slice(0,amountMatch.index));
    if(!description||/^(TOPLAM|HESAP|İŞLEM TARİHİ|FAİZ ORANI)/i.test(description))continue;
    let type=classifyStatementTransaction(description,signed,bank);
    if(!enpara&&/^[+]/.test(amountMatch[1].trim())&&type==="purchase")type="refund";
    const t=makeTx(prefix,tx.length+1,dateStr,description,signed,type,rest.slice(amountMatch.index+amountMatch[0].length));
    // Enpara payment may be identified by explicit negative amount, even if its
    // text is different. No negative purchase is silently counted as a purchase.
    if(enpara&&signed<0&&/ÖDEME|TAHSİLAT/i.test(description))t.type="payment";
    tx.push(t);
  }
  if(!tx.length)warnings.push("İşlem satırları okunamadı. Bu PDF taranmış olabilir veya farklı formatta olabilir.");
  if(date==null)warnings.push("Ekstre tarihi okunamadı; lütfen elle kontrol et.");
  if(balance==null)warnings.push("Dönem borcu bulunamadı; lütfen ekstreyle karşılaştır.");
  if(minimum==null)warnings.push("Asgari ödeme bulunamadı; lütfen elle gir.");
  return {statement:{id:prefix,bank,cardLabel:label,statementDate:date,
    periodLabel:date?.slice(0,7)||null,dueDate:dueDate,
    balance:Math.max(0,balance??0),minimum:Math.max(0,minimum??0),
    previousBalance,periodSpending,remainingInstallmentsTotal,
    transactions:tx},warnings};
}
function readSummaryRows(rows,transactionRows=[]){
  let periodLabel=null,summary={},active=false;
  for(const row of rows){
    const cells=row.map(x=>String(x??"").trim());
    const phrase=cells.find(x=>/^\*(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s+özet/i.test(x));
    if(phrase){
      if(active)break;
      const mm=phrase.match(/^\*(\S+)/);
      const mon=MONTHS[mm?.[1].toLocaleLowerCase("tr-TR")];
      const dates=transactionRows.flatMap(row=>row.map(parseStatementDate)).filter(Boolean);
      const sameMonth=dates.filter(d=>Number(d.slice(5,7))===mon).sort();
      const reference=sameMonth.at(-1)||dates.sort().at(-1)||null;
      periodLabel=mon&&reference?reference.slice(0,4)+"-"+String(mon).padStart(2,"0"):null;
      active=true;continue;
    }
    if(!active)continue;
    const label=(cells[1]||cells[0]||"").toLocaleLowerCase("tr-TR");
    const val=parseStatementMoney(cells[2]||cells[1]);
    if(val===null)continue;
    if(/toplam borcunuz/.test(label))summary.balance=val;
    else if(/ödenecek minimum borç/.test(label))summary.minimum=val;
    else if(/devredilen bakiye/.test(label))summary.previousBalance=val;
    else if(/dönem harcamaları/.test(label))summary.periodSpending=val;
  }
  return {periodLabel,summary};
}
export function parseStatementExcelRows(sheets,fileName="statement.xlsx",hash="local",fileDate=null){
  const tabs=Object.entries(sheets);
  if(!tabs.length)throw Error("Excel dosyasında sayfa bulunamadı");
  const main=tabs.find(([name,rows])=>rows.some(r=>r.some(x=>/^\s*Tarih\s*$/i.test(String(x)))))||tabs[0];
  const sheet=main[1];
  const hix=sheet.findIndex(r=>r.some(x=>/^\s*Tarih\s*$/i.test(String(x))));
  const header=sheet[Math.max(hix,0)]?.map(x=>String(x||"").trim().toLocaleLowerCase("tr-TR"))||[];
  const dateIx=header.findIndex(x=>/^tarih$/.test(x));
  const descIx=header.findIndex(x=>/^işlem$|açıklama|aciklama/.test(x));
  const catIx=header.findIndex(x=>/^etiket$|kategori/.test(x));
  const amountIx=header.findIndex(x=>/tutar|harcama|amount/.test(x));
  const actualAmountIx=amountIx>=0?amountIx:header.length>=5?4:-1;
  if(dateIx<0||descIx<0||actualAmountIx<0)throw Error("Excel işlem sütunları tanınmadı. Tarih / İşlem / Tutar gerekli.");
  const summaryTab=tabs.find(([name])=>/özet|ozet|summary/i.test(name));
  const summary=summaryTab?readSummaryRows(summaryTab[1],sheet):{periodLabel:null,summary:{}};
  const refDate=fileDate?parseStatementDate(fileDate):null;
  const periodLabel=summary.periodLabel||refDate?.slice(0,7)||null;
  const prefix=prefixFor("Garanti BBVA",periodLabel?periodLabel+"-01":null,hash);
  const transactions=[];
  let rejected=0;
  for(const row of sheet.slice(hix+1)){
    const d=parseStatementDate(row[dateIx]);
    const desc=normalizeLine(row[descIx]);
    const signed=parseStatementMoney(row[actualAmountIx]);
    if(!d||!desc||signed===null||signed===0){if(desc||row[actualAmountIx])rejected++;continue;}
    const type=classifyStatementTransaction(desc,signed,"Garanti BBVA");
    // Garanti statement spreadsheet records expenses with negative sign.
    const corrected=/ÖDEME|TAHSILAT|TAHSİLAT/i.test(desc)?"payment":signed<0?"purchase":
      type==="purchase"?"refund":type;
    const entry=makeTx(prefix,transactions.length+1,d,desc,signed,corrected);
    if(["purchase","refund"].includes(corrected)&&catIx>=0&&String(row[catIx]||"").trim())
      entry.category=String(row[catIx]).trim().slice(0,90);
    transactions.push(entry);
  }
  const warnings=[];
  if(rejected)warnings.push(rejected+" satır tarih veya tutar okunamadığı için dışarıda bırakıldı.");
  if(summary.summary.balance===undefined)warnings.push("Excel özetinden toplam borç alınamadı; elle kontrol et.");
  if(summary.summary.minimum===undefined)warnings.push("Excel özetinden asgari ödeme alınamadı; elle kontrol et.");
  if(!transactions.length)warnings.push("Excel'de okunabilir işlem bulunamadı.");
  return {statement:{id:prefix,bank:"Garanti BBVA",cardLabel:"Garanti • "+fileName.replace(/\.(xlsx|xls)$/i,"").slice(0,32),
    statementDate:null,periodLabel,dueDate:null,
    balance:Math.max(0,summary.summary.balance??0),minimum:Math.max(0,summary.summary.minimum??0),
    previousBalance:summary.summary.previousBalance??null,periodSpending:summary.summary.periodSpending??null,
    remainingInstallmentsTotal:null,transactions},warnings};
}
function pdfPageLines(items){
  const buckets=[];
  for(const item of items){
    const text=String(item.str||"");if(!text.trim())continue;
    const x=item.transform?.[4]??0,y=item.transform?.[5]??0;
    let group=buckets.find(g=>Math.abs(g.y-y)<2);
    if(!group){group={y,parts:[]};buckets.push(group);}
    group.parts.push({x,text});
  }
  buckets.sort((a,b)=>b.y-a.y);
  return buckets.map(g=>g.parts.sort((a,b)=>a.x-b.x).map(p=>p.text).join(" ").replace(/\s+/g," ").trim());
}
async function bytesHash(bytes){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("").slice(0,12);
}
export async function parseStatementFile(file,{pdfJs=null,xlsx=null}={}){
  if(!(file instanceof Blob)||file.size>8e6)throw Error("Dosya 8 MB'dan büyük veya okunamıyor.");
  const name=String(file.name||"Ekstre"),ext=name.split(".").pop().toLowerCase();
  const buffer=await file.arrayBuffer(),hash=await bytesHash(buffer);
  if(ext==="pdf"){
    const lib=pdfJs||await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    if(lib.GlobalWorkerOptions)lib.GlobalWorkerOptions.workerSrc=
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    const task=lib.getDocument({data:new Uint8Array(buffer)});
    const pdf=await task.promise;
    let text=[];
    try{
      if(pdf.numPages>40)throw Error("40 sayfadan uzun ekstre desteklenmiyor.");
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);
        const content=await page.getTextContent();
        text.push(...pdfPageLines(content.items));
      }
    }finally{await pdf.destroy();}
    return parseStatementPDFText(text.join("\n"),name,hash);
  }
  if(ext==="xlsx"||ext==="xls"){
    const lib=xlsx||await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const wb=lib.read(new Uint8Array(buffer),{type:"array",cellDates:false});
    const sheets={};
    for(const key of wb.SheetNames.slice(0,12)){
      const ws=wb.Sheets[key],rows=lib.utils.sheet_to_json(ws,{header:1,raw:false,defval:"",blankrows:false});
      if(rows.length>4000)throw Error("Excel sayfası çok uzun.");
      sheets[key]=rows;
    }
    return parseStatementExcelRows(sheets,name,hash);
  }
  throw Error("Yalnızca .pdf, .xlsx ve .xls desteklenir.");
}
