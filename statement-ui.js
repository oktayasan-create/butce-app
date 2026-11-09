import {normalizeStatementBundle,mergeStatementInbox,reconcileStatement} from "./statement-import.js";
import {parseStatementFile} from "./statement-file-reader.js";
import {prepareStatementPlan,statementDueMonth,statementInstallmentSchedule,calculateInstallmentTimeline} from "./statement-plan.js";

/**
 * Private, browser-only PDF/Excel/JSON statement review.
 * Does not alter legacy transactions. Only a separate, confirmed user action
 * prepares changes to the cashflow plan; final save remains explicit.
 * Explicit owner sign-in, review and confirmation are required before Firestore save.
 */
export function createStatementInboxUI({auth,db,doc,getDocFromServer,setDoc,safeHtml,getPlan,onPlanChange,rerender,notify}){
  let inbox=null,draft=null,loading=false,error="",dirty=false,uid=null;
  let importing=false,warnings=[],reviewAcknowledged=false;
  let selectedPlanCards={};
  const esc=x=>safeHtml(String(x??""));
  const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(n||0);
  const types={purchase:"Harcama",refund:"İade",payment:"Kart ödemesi",
    interest:"Faiz",tax:"Vergi",transfer:"Ekstre transferi"};
  const typeOptions=Object.entries(types);
  function reset(){
    inbox=null;draft=null;loading=false;error="";dirty=false;uid=null;
    importing=false;warnings=[];reviewAcknowledged=false;selectedPlanCards={};
  }
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
      inbox=raw?.statements?
        normalizeStatementBundle({format:"butceapp-statement-review-v1",statements:raw.statements}):
        {version:1,statements:[]};
    }catch(e){if(auth.currentUser?.uid===who)error="Ekstre arşivi okunamadı. Sayfayı yenileyip tekrar deneyebilirsin.";}
    finally{loading=false;if(auth.currentUser?.uid===who)rerender();}
  }
  async function selectFile(input){
    const files=Array.from(input.files||[]);
    if(!files.length||importing)return;
    if(files.length>12){notify("Bir seferde en fazla 12 ekstre seçebilirsin.");return;}
    const who=auth.currentUser?.uid;
    if(!who){notify("Önce hesabınla giriş yap.");return;}
    importing=true;error="";reviewAcknowledged=false;rerender();
    const parsed=[],nextWarnings=[],failed=[];
    try{
      for(const file of files){
        try{
          if(!/\.(pdf|xlsx|xls|json)$/i.test(file.name))throw Error("Dosya uzantısı desteklenmiyor");
          if(file.size>8e6)throw Error("Dosya 8 MB sınırını aşıyor");
          if(file.name.toLowerCase().endsWith(".json")){
            const data=normalizeStatementBundle(JSON.parse(await file.text()));
            parsed.push(...data.statements);
          }else{
            const output=await parseStatementFile(file);
            parsed.push(output.statement);
            if(output.warnings.length)nextWarnings.push({
              name:file.name,messages:output.warnings
            });
          }
        }catch(e){failed.push(file.name+": "+String(e?.message||"Dosya okunamadı").slice(0,180));}
      }
      if(auth.currentUser?.uid!==who)return;
      if(!parsed.length){error="Dosyalar okunamadı: "+failed.join(" | ");return;}
      const existing=new Set(),unique=[];
      for(const st of parsed){
        if(existing.has(st.id))continue;
        existing.add(st.id);unique.push(st);
      }
      try {
        draft=normalizeStatementBundle({format:"butceapp-statement-review-v1",statements:unique});
      }catch(e){
        error="Dosyalar okunabildi ancak bazı bilgiler doğrulanamadı. Önce ilgili ekstreyi kontrol et: "+String(e?.message||"Veri formatı hatalı").slice(0,160);
        draft=null;return;
      }
      warnings=nextWarnings;
      if(failed.length)error="Bazı dosyalar atlandı: "+failed.join(" | ");
      notify(draft.statements.length+" ekstre okundu. Kaydetmeden önce tutarları kontrol et.");
    }finally{importing=false;rerender();}
  }
  function entries(source,statementId){
    return (source==="draft"?draft:inbox)?.statements.find(st=>st.id===statementId)||null;
  }
  function markReviewChanged(){
    reviewAcknowledged=false;
    const box=document.getElementById("statement-review-ack");
    const button=document.getElementById("statement-save-draft");
    if(box)box.checked=false;
    if(button)button.disabled=true;
  }
  function categoryEdit(source,statementId,txId,newName){
    const tx=entries(source,statementId)?.transactions.find(t=>t.id===txId);
    if(!tx||!["purchase","refund"].includes(tx.type))return;
    tx.category=String(newName).slice(0,90);
    if(source==="saved")dirty=true;
    else markReviewChanged();
  }
  function editStatement(statementId,field,value){
    const st=entries("draft",statementId);
    if(!st)return;
    if(["balance","minimum","previousBalance","periodSpending"].includes(field)){
      if(value.trim()===""){if(field==="balance"||field==="minimum")return;st[field]=null;}
      else{
        const v=Number(value.replace(",","."));
        if(!Number.isFinite(v)||v<0||v>1e12){notify("Geçerli tutar gir.");return;}
        st[field]=Math.round(v*100)/100;
      }
    }else if(["dueDate","statementDate"].includes(field)){
      if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){notify("Geçerli tarih gir.");return;}
      st[field]=value||null;
      if(field==="statementDate")st.periodLabel=value?.slice(0,7)||st.periodLabel;
    }else if(field==="cardLabel")st.cardLabel=String(value).trim().slice(0,90);
    markReviewChanged();
  }
  function editMovement(statementId,txId,field,value){
    const st=entries("draft",statementId),t=st?.transactions.find(x=>x.id===txId);
    if(!t)return;
    if(field==="type"){
      if(!types[value])return;
      t.type=value;
      if(["purchase","refund"].includes(value))t.category=t.category||"Diğer";
      else t.category=null;
    }else if(field==="amount"){
      const n=Number(value.replace(",","."));
      if(!Number.isFinite(n)||n<0||n>1e12){notify("Geçersiz tutar.");return;}
      t.amount=Math.round(n*100)/100;
    }else if(field==="date"){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
      t.date=value;
    }else if(field==="description"){
      t.description=String(value).slice(0,160);
    }
    markReviewChanged();
  }
  function excludeMovement(statementId,txId){
    const st=entries("draft",statementId);
    if(!st)return;
    st.transactions=st.transactions.filter(x=>x.id!==txId);
    markReviewChanged();rerender();
  }
  async function saveInbox(docData){
    const who=auth.currentUser?.uid;
    if(!who)throw Error("Oturum kapalı");
    const size=JSON.stringify(docData).length;
    if(size>850000)throw Error("Ekstre arşivi tek belge boyutuna yaklaşıyor. Daha fazla ekstre ekleme.");
    await setDoc(doc(db,"data","statementInbox"),{inbox:docData,updatedAt:new Date().toISOString()});
    if(auth.currentUser?.uid!==who)throw Error("Oturum değişti");
  }
  async function saveDraft(){
    if(!draft||!inbox){notify("Önizleme veya bağlantı henüz hazır değil.");return;}
    if(!reviewAcknowledged){notify("Lütfen ekstreleri kontrol ettiğini onayla.");return;}
    if(draft.statements.some(st=>!st.cardLabel.trim()||!st.balance||!st.minimum||st.minimum>st.balance)){
      notify("Dönem borcu ve asgari ödeme değerlerini kontrol et. Sıfır veya tutarsız tutar var.");return;
    }
    let merged;
    try{
      // Validate once more after edits, before touching Firestore.
      draft=normalizeStatementBundle({format:"butceapp-statement-review-v1",statements:draft.statements});
      merged=mergeStatementInbox(inbox,draft);
      if(!merged.added.length){notify("Bu ekstreler daha önce eklenmiş.");return;}
      if(!confirm(merged.added.length+" ekstreyi özel Firebase arşivine kaydetmek istiyor musun? Mevcut kart borçları değişmez."))return;
      await saveInbox(merged.inbox);
      inbox=merged.inbox;draft=null;warnings=[];reviewAcknowledged=false;
      notify("Ekstreler özel arşive kaydedildi.");rerender();
    }catch(e){notify("Kaydetme başarısız: "+String(e.message||"Bağlantıyı kontrol et").slice(0,145));}
  }
  async function saveCategories(){
    if(!dirty||!inbox)return;
    try{
      const clean=normalizeStatementBundle({format:"butceapp-statement-review-v1",statements:inbox.statements});
      await saveInbox(clean);inbox=clean;dirty=false;notify("Kategori düzeltmeleri kaydedildi.");rerender();
    }catch(e){notify("Kategori değişiklikleri kaydedilemedi.");}
  }
  function selectPlanCard(stId,cardId){
    selectedPlanCards[stId]=cardId;rerender();
  }
  function statementPlanControls(st){
    const plan=getPlan();
    if(!plan)return '<p class="cf-muted">Nakit akışı planı yükleniyor.</p>';
    const due=statementDueMonth(st);
    const cardId=selectedPlanCards[st.id]||"";
    const eligible=st.transactions.filter(t=>t.type==="purchase"&&t.remainingInstallments>0);
    const total=eligible.reduce((sum,t)=>sum+t.amount*t.remainingInstallments,0);
    const list=plan.cards.map(c=>'<option value="'+esc(c.id)+'"'+(cardId===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join("");
    return '<div class="cf-statement-plan">'+
      '<div style="font-weight:700">Nakit akışına otomatik aktar</div>'+
      '<p class="cf-muted">Ekstre son ödeme ayı: '+esc(due||"Tarih eksik")+
      ' · Gelecek aylara aktarılabilecek taksit: <strong>'+eligible.length+
      ' işlem / '+money(total)+'</strong>. Taksitler ödeme ayına göre planlanır; mevcut ekstreye tekrar eklenmez.</p>'+
      '<div class="cf-statement-actions">'+
      '<label class="cf-muted">Hangi kredi kartına ait?<select onchange="statementPlanCard(\''+st.id+'\',this.value)">'+
      '<option value="">Kart seç...</option>'+list+
      '<option value="__new"'+(cardId==="__new"?' selected':'')+'>+ Yeni kart oluştur (Enpara – Damla dahil)</option>'+
      '</select></label>'+
      '<button class="btn btn-p btn-sm" '+(!cardId||!due?'disabled ':'')+
      'onclick="statementPlanApply(\''+st.id+'\')">Ekstre + kalan taksitleri plana ekle</button></div>'+
      '<p class="cf-muted">Bu işlemde tutarlar önce nakit akışı planında hazırlanır. Kalıcı olması için ayrıca <strong>Planı Kaydet</strong> düğmesine basılır. Eski harcamalar ikinci kez eklenmez.</p>'+
      '</div>';
  }
  function applyToPlan(stId){
    const st=entries("saved",stId);
    const plan=getPlan();
    const cardId=selectedPlanCards[stId];
    if(!st||!plan||!cardId){notify("Önce kartı seç.");return;}
    let name=null;
    if(cardId==="__new"){
      name=prompt("Yeni kartın adı (örnek: Enpara - Damla):",st.cardLabel);
      if(name===null)return;
      if(!name.trim()){notify("Kart adı boş olamaz.");return;}
    }
    try{
      const prepared=prepareStatementPlan(plan,st,{cardId,newCardName:name});
      const upcoming=prepared.timeline.slice(0,8).map(item=>item.month+": "+money(item.amount)).join("\n");
      const issues=prepared.warnings.length?"\n\nKontrol:\n"+prepared.warnings.join("\n"):"";
      const message=prepared.cardName+" kartı için ekstreyi uygulayalım mı?"+
        "\nDönem borcu: "+money(prepared.statementBalance)+
        "\nAsgari ödeme: "+money(prepared.statementMinimum)+
        "\nÖdeme ayı: "+prepared.dueMonth+
        "\nGelecek taksit: "+prepared.installmentsAdded+" işlem / "+money(prepared.remainingSum)+
        (prepared.reference!==null?"\nBankanın kalan taksit toplamı: "+money(prepared.reference)+
          " (fark "+money(prepared.diff)+")":"")+
        (upcoming?"\n\nGelecek aylık taksitler:\n"+upcoming:"")+
        (prepared.replacedInstallments?"\nÖnceki ekstrelerden oluşan "+prepared.replacedInstallments+" planlanan taksit güncellenecek.":"")+
        issues+"\n\nDevam edersen planın önizlemesi değişir; kaydetmek için ayrıca Planı Kaydet'e basmalısın.";
      if(!confirm(message))return;
      onPlanChange(prepared.plan);
      notify("Ekstre nakit akışına eklendi. Taksitleri kontrol edip Planı Kaydet'e bas.");
    }catch(e){
      notify("Nakit planına uygulanamadı: "+String(e?.message||"Kontrol gerekiyor").slice(0,160));
    }
  }
  function options(tx,source,stId){
    if(!["purchase","refund"].includes(tx.type))return esc(types[tx.type]);
    const categories=getPlan()?.categories?.expense?.map(c=>c.name)||["Diğer"];
    if(!categories.includes(tx.category))categories.push(tx.category||"Diğer");
    return '<select aria-label="Kategori seç" onchange="statementCategoryChange(\''+source+'\',\''+stId+'\',\''+tx.id+'\',this.value)">'+
      categories.map(name=>'<option value="'+esc(name)+'"'+(name===tx.category?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select>';
  }
  function summaryInput(st,field,label){
    const value=st[field]??"";
    return '<label class="cf-muted" style="display:flex;flex-direction:column;gap:4px">'+esc(label)+
      '<input style="padding:8px;max-width:100%;background:var(--bg4);color:var(--text);border:1px solid var(--border);border-radius:7px" '+
      'type="'+(["statementDate","dueDate"].includes(field)?"date":field==="cardLabel"?"text":"number")+'" '+
      (["balance","minimum"].includes(field)?'min="0" step="0.01" ':'')+
      'value="'+esc(value)+'" onchange="statementSummaryEdit(\''+st.id+'\',\''+field+'\',this.value)"></label>';
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
    const rows=st.transactions.map(tx=>{
      const typeCell=source==="draft"?
        '<select aria-label="İşlem türü" onchange="statementMovementEdit(\''+st.id+'\',\''+tx.id+'\',\'type\',this.value)">'+
        typeOptions.map(([type,label])=>'<option value="'+type+'"'+(type===tx.type?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>':
        esc(types[tx.type]||tx.type);
      const dateCell=source==="draft"?'<input type="date" value="'+esc(tx.date)+
        '" onchange="statementMovementEdit(\''+st.id+'\',\''+tx.id+'\',\'date\',this.value)">':esc(tx.date);
      const amountCell=source==="draft"?'<input style="max-width:100px" type="number" min="0" step="0.01" value="'+esc(tx.amount)+
        '" onchange="statementMovementEdit(\''+st.id+'\',\''+tx.id+'\',\'amount\',this.value)">':
        money((tx.type==="refund"||tx.type==="payment"?-1:1)*tx.amount);
      return '<tr><td>'+dateCell+'</td><td>'+esc(tx.description)+'</td><td>'+typeCell+'</td>'+
        '<td>'+options(tx,source,st.id)+'</td><td>'+amountCell+'</td>'+
        '<td>'+esc(tx.installmentCurrent&&tx.installmentTotal?tx.installmentCurrent+"/"+tx.installmentTotal:"—")+'</td>'+
        (source==="draft"?'<td><button class="btn btn-ghost btn-sm" onclick="statementExcludeMovement(\''+st.id+'\',\''+
          tx.id+'\')">Çıkar</button></td>':'')+'</tr>';
    }).join("");
    return '<div class="cf-statement-card"><strong>'+esc(st.cardLabel)+'</strong>'+
      '<div class="cf-muted">'+esc(st.bank)+' · '+esc(st.statementDate||st.periodLabel||"Tarih yok")+
      ' · '+st.transactions.length+' işlem</div>'+
      '<div>Ekstre borcu <strong>'+money(st.balance)+'</strong> · Asgari <strong>'+money(st.minimum)+'</strong></div>'+
      '<div class="cf-muted">Son ödeme: '+esc(st.dueDate||"Ekstrede yok")+
      (r.gap!==null?(r.reconciled?" · ✓ Hareket toplamı tutuyor":" · ⚠️ Tutar farkı: "+money(r.gap)):"")+'</div>'+
      (source==="draft"?'<details><summary>Ekstre özetini kontrol et / düzelt</summary>'+
        '<div class="cf-statement-meta">'+
        summaryInput(st,"cardLabel","Kart adı")+
        summaryInput(st,"balance","Ekstre borcu")+
        summaryInput(st,"minimum","Asgari ödeme")+
        summaryInput(st,"statementDate","Ekstre tarihi")+
        summaryInput(st,"dueDate","Son ödeme tarihi")+
        '</div></details>':'')+
      '<details><summary>İşlemleri ve kategorileri incele</summary><div class="cf-statement-scroll">'+
      '<table class="cf-statement-table"><tr><th>Tarih</th><th>Açıklama</th><th>Tür</th><th>Kategori</th>'+
      '<th>Tutar</th><th>Taksit</th>'+(source==="draft"?'<th>İşlem</th>':'')+'</tr>'+rows+'</table></div>'+
      '<p class="cf-muted"><strong>Kategori dağılımı:</strong> '+categorySummary+'</p>'+
      '<p class="cf-muted">'+esc(counts)+'</p></details>'+ (source==="saved"?statementPlanControls(st):'')+'</div>';
  }
  function render(){
    const el=document.getElementById("cf-statement-panel");if(!el)return;
    if(auth.currentUser)void ensureLoaded();
    el.innerHTML='<div class="card cb" style="margin-bottom:16px"><div class="sec-title">📄 PDF / Excel Ekstrelerini İçe Aktar</div>'+
      '<p class="cf-muted">Garanti Excel (.xlsx/.xls), Yapı Kredi ve Enpara PDF ekstrelerini doğrudan yükle. Dosya tarayıcında okunur; sen onaylamadan Firebase’e aktarılmaz. İstersen önceki JSON dosyalarını da kullanabilirsin.</p>'+
      '<label class="cf-muted">Ekstre dosyaları (birden fazla seçilebilir)'+
      '<input type="file" multiple accept=".pdf,.xlsx,.xls,.json,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json" onchange="statementSelectFile(this)" style="display:block;margin-top:8px;max-width:100%"></label>'+
      (importing?'<p class="cf-muted">PDF / Excel dosyaları bu cihazda işleniyor...</p>':'')+
      (error?'<div role="alert" class="cf-statement-error">⛔ <strong>Ekstre okuma hatası</strong><div style="margin-top:6px">'+esc(error)+'</div><div style="margin-top:8px;font-size:13px">Hatalı dosyayı kaydetme. Bankanın PDF biçimini kontrol edip yeniden yükle.</div></div>':'')+
      (loading?'<p class="cf-muted">Kişisel ekstre arşivi yükleniyor...</p>':'')+
      (warnings.length?'<div role="alert" aria-live="assertive" class="cf-statement-warning">'+
        '<div class="cf-statement-warning-head">⚠️ Kontrol gerektiren bilgiler ('+
        warnings.reduce((n,w)=>n+w.messages.length,0)+')</div>'+
        warnings.map(w=>'<div><strong>📄 '+esc(w.name)+'</strong><ul>'+
          w.messages.map(m=>'<li>'+esc(m)+'</li>').join('')+'</ul></div>').join('')+
        '<div class="cf-statement-warning-note">Eksik veya yanlış satırları bankanın orijinal ekstresiyle karşılaştır. Kontrol etmeden onay verme.</div></div>':'')+
      (draft?.statements?.length?'<h4>Yeni ekstre önizlemesi · '+draft.statements.length+' dosya</h4>'+
        '<div class="cf-statement-grid">'+draft.statements.map(st=>card(st,"draft")).join('')+'</div>'+
        '<label class="cf-review-check"><input id="statement-review-ack" type="checkbox" '+(reviewAcknowledged?'checked ':'')+
        'onchange="statementReviewAck(this.checked)">Ekstre borçlarını, asgari tutarları, işlem türlerini ve kategorileri kontrol ettim.</label>'+
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">'+
        '<button id="statement-save-draft" class="btn btn-p" '+(!reviewAcknowledged?'disabled ':'')+
          'onclick="statementSaveDraft()">Kontrol ettim, özel arşive kaydet</button>'+
        '<button class="btn btn-ghost btn-sm" onclick="statementCancelDraft()">Önizlemeyi iptal et</button></div>':'')+
      (inbox?.statements?.length?'<h4>Kaydedilmiş ekstreler ('+inbox.statements.length+')</h4>'+
        '<div class="cf-statement-grid">'+inbox.statements.map(st=>card(st,"saved")).join('')+'</div>'+
        '<button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="statementSaveCategories()">Kategori düzeltmelerini kaydet</button>':'')+
      '<p class="cf-muted" style="margin-top:12px">Not: Metin seçilemeyen taranmış PDF’ler bu sürümde desteklenmez. Okuma hatası olursa belgeyi eski JSON yöntemiyle aktarabiliriz. Arşive kaydetmek tek başına nakit planını değiştirmez. Kart eşlemesi ve Planı Kaydet sonrasında yalnızca tahmini kart borcu/asgari/taksit planı güncellenir; eski harcamalar yeniden eklenmez.</p></div>';
  }
  return {reset,render,selectFile,saveDraft,saveCategories,categoryEdit,
    selectPlanCard,applyToPlan,
    editStatement,editMovement,excludeMovement,reviewAck(value){reviewAcknowledged=Boolean(value);},
    cancelDraft(){draft=null;warnings=[];reviewAcknowledged=false;rerender();}};
}
