# Nakit Akışı & Kartlar — kullanım notları

Bu özellik `BütçeApp` içinde kullanıcı girişinden sonra yeni bir sekme olarak görüntülenir. Veriler, mevcut `transactions` ve `investments` koleksiyonlarına dokunulmadan, kullanıcının kendi izinleriyle `data/cashflowPlan` Firestore belgesinde saklanır.

## Başlangıç

1. **Nakit Akışı & Kartlar** sekmesini açın. Plan başlangıç ayını ve varsa eksi banka bakiyesini girin.
2. **Kartlar** bölümünden istediğiniz kadar banka/kart adı girin. Başlangıç borçlarını, tahmini asgari yüzdesini ve yalnızca biliniyorsa tahmini faiz oranını girin.
3. **Aylık plan** alanında maaş, zorunlu nakit ödemeleri, öngörülen harcamalar ve bankadan bildirilen asgari ödemeleri düzenleyin.
4. **Hareket kaydı** alanında kart harcaması, nakit gider, gelir ve kart ödemelerini ayrı ayrı işleyin; kart harcamasına kategori seçin.
5. Kategori ve gelir gruplarını **Kategoriler** alanından ekleyin/yeniden adlandırın/kaldırın.
6. Değişikliklerin Firestore'a kaydı için **Planı Kaydet** tuşuna basın.

## Önemli ayrımlar

- **Kredi kartı harcaması:** Seçilen harcama kategorisine eklenir, kart borcunu yükseltir, banka bakiyesini alışveriş anında azaltmaz.
- **Kart ödemesi:** Banka bakiyesi ve kart borcunu azaltır; ikinci gider değildir.
- **Nakit gider:** Doğrudan banka/nakit bakiyesini azaltır ve seçilen kategoriye eklenir.
- **Gerçekleşmiş gelir:** Kategorisine yazılır; aynı ay gelir kaydı varsa o ayın genel tahmini gelir tutarının *yerine* gerçekleşen toplam kullanılır.
- **Ek tahmini harcamalar:** Elle girilen kart ve nakit harcama tahminleri gerçekleşmiş hareketlerin *üzerine* eklenir; aynı harcamayı iki kez girmeyin.
- Kart veya kategori kaldırma **arşivleme** olarak çalışır. Geçmiş hareketler ve devreden borçlar silinmez; arşivlenmiş kartlara ödeme girilebilir.

## Şimdilik dahil olmayanlar

- Bu bölümün hareketleri diğer **Gerçekleşen/İşlem Geçmişi** ekranlarına otomatik aktarılmıyor. Aynı hareketi iki yerde kaydederseniz iki farklı raporda görebilirsiniz. Bu nedenle veri girişinde tek bir kullanım yöntemi seçin ve raporların kapsamını karıştırmayın.
- Banka ekstre kesim günleri, taksitlere ayırma, bankaya özgü minimum ödeme oranları, kredi kartı faiz/vergileri ve nakit avans ayrıntıları otomatik hesaplanmıyor.
- Ay bazlı model, ödemeleri o ayın mevcut borcuna uygular; yeni harcamaları ay kapanışında sonraki aya devreder. Banka ekstresi ve fiili banka bakiyesi esas alınmalı.
- Yedekleme için Google Cloud'un ücretli servisi devreye alınmadı. Uygulamanın giriş/yetki kurallarını değiştirmeyin.

## Veri koruma

Kişisel finans rakamlarını, gerçek kart numaralarını, parolaları veya UID'leri herkese açık GitHub koduna koymayın. Testlerde gerçek kart numarası yerine **kart takma adı** kullanın.

## Temel testler

- Yeni kart ekleyin, adını değiştirin, arşivleyip geri alın.
- Harcama ve gelir kategorisi ekleyin, adını değiştirin, kaldırın ve geri alın.
- Kart harcaması ve kart ödemesi girin. Ödeme kategori harcamasına eklenmemeli.
- Bir hareketi silin; hesapların değiştiğini doğrulayın.
- **Planı Kaydet**, sayfayı yenile, tekrar giriş yap, kayıtların durduğunu kontrol et.
- Var olan bütçe, yatırım ve hedef kayıtlarının değişmediğini kontrol et.

**Not:** Gerçek para veya kart hareketi oluşturulmaz. BütçeApp bir manuel takip aracıdır; bankalara bağlanmaz.


## V3 — Zorunlu krediler, kart taksitleri ve Enpara Ekpara (Kasım 2026)

- **Krediler:** Ev, araba veya diğer kredilerin tam aylık taksiti ilk-son ödeme ayları arasında her ay zorunlu nakit çıkışı sayılır. Krediler için asgari ödeme yoktur. Bunları `Krediler dışındaki diğer sabit ödemeler` alanına **ikinci defa yazmayın**.
- **Kart taksitleri:** Aylık taksit tutarı + taksidin başladığı ay + toplam taksit sayısı girilir. Taksitler ilgili ayın kart ekstre tahminine eklenir. Alışverişin tamamını yeniden kart harcaması olarak kaydetmeyin.
- **Asgari sonra ek ödeme:** Krediler, nakit giderler, kart asgarileri ve varsa önceki Ekpara faizi düşüldükten sonra nakit açığı hesaplanır. Ekpara bakiyesi varsa pozitif nakitle önce kapatılır. Manuel modda **senin belirlediğin ek ödeme** kullanılabilir nakitten fazlaysa azaltılır. Otomatik modda nakit rezervi üzerindeki kalan tutar yönlendirilir.
- **Ekpara:** Negatif açığın Enpara Ekpara/KMH ile karşılandığı varsayılır. Gerçekte **tanımlı bir KMH limitinizin olması gerekir**; bu ekran kredi sağlayamaz. Girilen limit aşılırsa kırmızı uyarı verilir. Başlangıç nakit bakiyeniz eksi ise ve aynı eksi bakiyeyi Ekpara başlangıç borcu olarak ikinci kez girerseniz **çift sayılır**.
- **Ekpara faizi:** Aylık %4,25 (Kasım 2026), ilgili ayın **ortalama** tahmini eksi bakiye seviyesiyle hesaplanır; %15 KKDF + %15 BSMV eklenir ve sonraki aya tahmini nakit çıkışı olarak eklenir. Banka ise gerçek faizi **gün sonu bakiyesine günlük** uygular; bu nedenle ekrandaki tutar bir ekstre tutarı değildir.
- **Kredi kartı faizi:** TCMB'nin 1 Kasım 2026 için yayımladığı azami akdi oranlar aylık %3,25 (dönem borcu 30.000 TL altı), %3,75 (30.000–180.000 TL), %4,25 (180.000 TL üzeri). **Bu kademeler kart limitine değil, dönem borcuna göre belirlenir.** Üzerine %15 KKDF ve %15 BSMV gelir. Kartın “Faiz hesaplama” alanında TCMB otomatik veya elle tanımlanan oran seçilebilir; eski planlardaki faiz tercihi değiştirilmeden taşınır.
- **Gecikme:** Eksik asgari ödeme girişinde gecikme faiz farkı ancak yaklaşık hesaplanır. Ödeme son günü/ekstre kesimi bankanın takviminde olduğundan hesaplama **ödeme tavsiyesi veya hukuken kesin tutar değildir**.
- **Birikim:** Pozitif dönem sonu nakit bir sonraki aya devreder; Ekpara borcu varsa önce otomatik kapatılır. Kredi kartı borcu tamamen kapanan ve Ekpara gerektiren aylar ayrı renkte gösterilir.
- **Veri güvenliği:** V1/V2 kayıtları bellek içinde V3'e yükseltilir; mevcut `transactions`, `investments`, bütçeler ve hedefler değiştirilmez. Ancak V3 planını ilk kez kaydetmeden önce ekrandaki rakamları ve geçmiş dönemleri kontrol edin. Firebase verileri yalnızca kullanıcıya özel güvenlik kurallarında kalmalıdır.

### Resmî kaynaklar
- [TCMB — Kredi kartı azami faiz tablosu](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Bankacilik+Verileri/Kredi_Karti_Islemlerinde_Uygulanacak_Azami_Faiz_Oranlari)
- [Enpara — Ekpara hesabının günlük faizi ve vergileri](https://www.enpara.com/sss/kartlar/encard)
- [Enpara — Güncel Ekpara ürünü](https://www.enpara.com/krediler/ekpara)

> Bu oranlar ileriki aylarda değişebilir. Uygulama 1 Kasım 2026 verilerini gelecek aylar için varsayım olarak kullanır; bankalardan canlı oran çekmez.
