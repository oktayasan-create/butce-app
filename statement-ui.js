import {normalizeStatementBundle,mergeStatementInbox,reconcileStatement} from "./statement-import.js";

/** Local JSON upload → review → explicit owner-only Firebase save. */
export function createStatementInboxUI({auth,db,doc,getDocFromServer,setDoc,safeHtml,getPlan,rerender,notify}){
  let inbox=null,draft=null,loading=false,error="",dirty=false,uid=null;
  const esc=x=>safeHtml(String(x??""));
  const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(n||0);
  const types={purchase:"Harcama",refund:"İade",payment:"Kart ödemesi",
    interest:"Faiz",tax:"Vergi",transfer:"Ekstre transferi"};
  function reset(){inbox=null;draft=null;loading=false;error="";dirty=false;uid=null;}
  async function ensureLoaded(){
    const who=auth.currentUser?.uid;
    if(!who)return;
    if(uid!==who){reset();uid=who;}
    if(inbox||loading||error)return;
    loading=true;
    try{
      const snap=await getDocFromServer(doc(db,"data","statementInbox"));
      if(auth.currentUser?.uid!==who)return;
      const raw=snap.exists()?snap.data().inbox:null;
      inbox=raw?.statements?normalizeStatementBundle({format:"butceapp-statement-review-v1",statements:raw.statements}):{version:1,statements:[]};
    }catch(e){if(auth.currentUser?.uid===who)error="Ekstre arşivi okunamadı. Sayfayı yenileyip tekrar deneyebilirsin.";}
    finally{loading=false;if(auth.currentUser?.uid===who)rerender();}
  }
  async function selectFile(input){
    const file=input.files?.[0];if(!file)return;
    if(file.size>1500000){notify("Dosya çok büyük (en fazla 1,5 MB).");return;}
    try{draft=normalizeStatementBundle(JSON.parse(await file.text()));error="";rerender();}
    catch(e){notify("Ekstre JSON dosyası okunamadı veya biçimi beklenenden farklı.");}
  }
  function categoryEdit(source,statementId,txId,newName){
    const arr=source==="draft"?draft?.statements:inbox?.statements;
    const tx=arr?.find(x=>x.id===statementId)?.transactions.find(t=>t.id===txId);
    if(!tx||!["purchase","refund"].includes(tx.type))return;
    tx.category=newName.slice(0,90);
    if(source==="saved")dirty=true;
  }
  async function saveInbox(docData){
    const who=auth.currentUser?.uid;
    if(!who)throw Error("Giriş yapılmamış");
    const serialized=JSON.stringify(docData);
    if(serialized.length>900000)throw Error("Arşiv tek belge sınırına yaklaşıyor");
    await setDoc(doc(db,"data","statementInbox"),{inbox:docData,updatedAt:new Date().toISOString()});
    if(auth.currentUser?.uid!==who)throw Error("Oturum değişti");
  }
  async function saveDraft(){
    if(!draft||!inbox){notify("Önizleme veya bağlantı henüz hazır değil.");return;}
    let merged;
    try{merged=mergeStatementInbox(inbox,draft);
      if(!merged.added.length){notify("Bu ekstreler daha önce eklenmiş.");return;}
      if(!confirm(merged.added.length+" ekstre ayrı arşive kaydedilsin mi? Mevcut borç ve harcamalar değişmeyecek."))return;
      await saveInbox(merged.inbox);inbox=merged.inbox;draft=null;notify("Ekstreler özel arşive kaydedildi.");rerender();
    }catch(e){notify("Ekstre arşive kaydedilemedi. Bağlantıyı kontrol et.");}
  }
  async function saveCategories(){
    if(!dirty||!inbox)return;
    try{await saveInbox(inbox);dirty=false;notify("Kategori düzeltmeleri kaydedildi.");rerender();}
    catch(e){notify("Kategori düzeltmeleri kaydedilemedi.");}
  }
  function options(tx,source,stId){
    if(!["purchase","refund"].includes(tx.type))return esc(types[tx.type]);
    const categories=getPlan()?.categories.expense.map(c=>c.name)||["Diğer"];
    if(!categories.includes(tx.category))categories.push(tx.category||"Diğer");
    return '<select aria-label="Kategori seç" onchange="statementCategoryChange(\''+source+'\',\''+stId+'\',\''+tx.id+'\',this.value)">'+
      categories.map(name=>'<option value="'+esc(name)+'"'+(name===tx.category?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select>';
  }
  function card(st,source){
    const r=reconcileStatement(st);
    const counts=Object.entries(r.sums).filter(([k,v])=>v>0).map(([k,v])=>(types[k]||k)+": "+money(v)).join(" · ");
    const categoryTotals={};
    for(const tx of st.transactions){
      if(!["purchase","refund"].includes(tx.type))continue;
      const category=tx.category||"Diğer";
      categoryTotals[category]=(categoryTotals[category]||0)+(tx.type==="refund"?-tx.amount:tx.amount);
    }
    const categorySummary=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1])
      .map(([name,total])=>esc(name)+": "+money(total)).join(" · ");
    const rows=st.transactions.map(tx=>'<tr><td>'+esc(tx.date)+'</td><td>'+esc(tx.description)+'</td>'+
      '<td>'+esc(types[tx.type]||tx.type)+'</td><td>'+options(tx,source,st.id)+'</td>'+
      '<td>'+money((tx.type==="refund"||tx.type==="payment"?-1:1)*tx.amount)+'</td>'+
      '<td>'+esc(tx.installmentCurrent&&tx.installmentTotal?tx.installmentCurrent+"/"+tx.installmentTotal:"—")+'</td></tr>').join("");
    return '<div class="cf-statement-card"><strong>'+esc(st.cardLabel)+'</strong>'+
      '<div class="cf-muted">'+esc(st.bank)+' · '+esc(st.statementDate||st.periodLabel||"Tarih yok")+
      ' · '+st.transactions.length+' işlem</div>'+
      '<div>Ekstre borcu <strong>'+money(st.balance)+'</strong> · Asgari <strong>'+money(st.minimum)+'</strong></div>'+
      '<div class="cf-muted">Son ödeme: '+esc(st.dueDate||"Ekstrede yok")+
      (r.gap!==null?(r.reconciled?" · ✓ Hareket toplamı tutuyor":" · ⚠️ Tutar farkı: "+money(r.gap)):"")+'</div>'+
      '<details><summary>İşlemleri ve kategorileri incele</summary><div class="cf-statement-scroll">'+
      '<table class="cf-statement-table"><tr><th>Tarih</th><th>Açıklama</th><th>Tür</th><th>Kategori</th><th>Tutar</th><th>Taksit</th></tr>'+rows+'</table></div>'+
      '<p class="cf-muted"><strong>Kategori dağılımı:</strong> '+categorySummary+'</p>'+
      '<p class="cf-muted">'+esc(counts)+'</p></details></div>';
  }
  function render(){
    const el=document.getElementById("cf-statement-panel");if(!el)return;
    if(auth.currentUser)void ensureLoaded();
    el.innerHTML='<div class="card cb" style="margin-bottom:16px"><div class="sec-title">📄 Ekstreleri içe aktar</div>'+
    '<p class="cf-muted">PDF/Excel ekstrelerinden hazırlanmış özel JSON dosyasını seç. Dosya önce yalnızca cihazında okunur; onaylamadan Firebase\'e kaydedilmez. Ekstre arşivi mevcut kart borçlarını veya bütçe kayıtlarını otomatik değiştirmez.</p>'+
    '<input type="file" accept=".json,application/json" onchange="statementSelectFile(this)">'+
    (error?'<p style="color:#fb7185">'+esc(error)+'</p>':'')+
    (loading?'<p class="cf-muted">Özel ekstre arşivi yükleniyor...</p>':'')+
    (draft?.statements?.length?'<h4>Yeni ekstre önizlemesi</h4><div class="cf-statement-grid">'+
      draft.statements.map(st=>card(st,"draft")).join('')+'</div>'+
      '<button class="btn btn-p" style="margin-top:10px" onclick="statementSaveDraft()">Kontrol ettim, ekstreleri kaydet</button>'+
      '<button class="btn btn-ghost btn-sm" onclick="statementCancelDraft()">İptal</button>':'')+
    (inbox?.statements?.length?'<h4>Kaydedilmiş ekstreler ('+inbox.statements.length+')</h4>'+
      '<div class="cf-statement-grid">'+inbox.statements.map(st=>card(st,"saved")).join('')+'</div>'+
      (dirty?'<button class="btn btn-p btn-sm" onclick="statementSaveCategories()">Kategori değişikliklerini kaydet</button>':''):'')+
    '<p class="cf-muted">Bu sürüm JSON içe aktarır; PDF/XLSX dosyasını doğrudan yükleme henüz desteklenmiyor. Kredi kartı hesap planına otomatik yansıtma da kapalıdır; çift kayıt riskini önler.</p></div>';
  }
  return {reset,render,selectFile,saveDraft,saveCategories,categoryEdit,cancelDraft(){draft=null;rerender();}};
}
