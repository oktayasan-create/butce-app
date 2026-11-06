# Ekstre içe aktarma ve kompakt kategoriler

Yeni ekran: **Nakit Akışı & Kartlar → Ekstreleri içe aktar**.

## Gizli ekstreleri güvenli içe aktarma

1. ChatGPT tarafından **özel olarak** oluşturulmuş `butceapp-statement-review-v1` biçimindeki JSON dosyasını cihazına indir.
2. BütçeApp'e Firebase hesabınla giriş yap; **Nakit Akışı & Kartlar** ekranındaki **Ekstreleri içe aktar** bölümünü aç.
3. JSON dosyasını seç. Önizleme, ekstre borcu, asgari ödeme, son ödeme tarihi, alışverişler, iadeler, kart ödemeleri, faizler, vergiler ve taksit bilgilerini gösterir.
4. Her ekstre kartını açıp **harcama kategorilerini** kontrol et. Kategoriler mevcut BütçeApp gruplarından seçilebilir.
5. Yalnızca onayladığın dosya için **Kontrol ettim, ekstreleri kaydet** seçeneğini kullan. Kullanıcıya özel `data/statementInbox` Firestore belgesine kaydedilir.
6. Aynı ekstre tekrar yüklendiğinde ekstre kimliği sayesinde ikinci kez arşive eklenmez.

**Önemli:** Bu sürüm doğrudan PDF/XLSX değil, kontrol edilmiş JSON dosyası içe aktarır. Ekstreler **ayrı bir arşive** kaydedilir; mevcut `transactions`, `data/cashflowPlan`, kredi kartı açılış borçları, kredi taksitleri veya yatırım kayıtlarını **otomatik değiştirmez**. Ekstre borcunu mevcut planın açılış borcuna doğrudan eklemek çift sayım riski oluşturabilir; plan entegrasyonu ayrı bir onaylı geliştirmeyle yapılmalıdır.

## Kompakt kategori düzeni

Harcama ve gelir grupları çok sütunlu küçük düzenlenebilir kutularda gösterilir. Kategori adına tıklayarak değiştirebilirsin. Kaldırılan kategoriler alt taraftaki kapalı **Arşivlenmiş kategoriler** bölümünde korunur; eski hareketler silinmez.

## Gizlilik

- Gerçek ekstre JSON verileri ve banka belgeleri **herkese açık GitHub'a yüklenmemelidir**.
- Dosyada tam kart numarası, IBAN, müşteri kimliği ve adres olmamalıdır.
- JSON seçimi tarayıcı içinde gerçekleşir. Yalnızca açık **Kaydet** onayından sonra Firebase kullanılır.
- Bu bir manuel takip uygulamasıdır; bankaların hesaplarına giriş yapmaz, otomatik banka entegrasyonu içermez.
- Kullanıcı hesabı değiştiğinde ekstre önizlemesi uygulama belleğinden temizlenir.
