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
