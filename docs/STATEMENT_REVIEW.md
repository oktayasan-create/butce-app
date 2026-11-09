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

## Doğrudan PDF ve Excel yükleme (v2)

**Desteklenen dosyalar**

- **Enpara (.pdf):** Metin seçilebilir kredi kartı ekstreleri, ödeme/alışveriş/faiz/KKDF/BSMV satırları
- **Yapı Kredi (.pdf):** World, Opet ve diğer Yapı Kredi kart ekstrelerinin mevcut metin düzeni; kart taksitleri ve iadeler mümkün olduğunda ayrılır
- **Garanti BBVA (.xlsx / .xls):** İşlem listesi için `Tarih / İşlem / Etiket / Tutar` düzeni ve özet sayfası
- **Önceki JSON dosyaları (.json):** Geriye dönük destek korunur

**Kullanım:** `Nakit Akışı & Kartlar → Ekstreleri içe aktar` içinden dosyaları seç. Birden çok dosya yüklenebilir. Uygulama tarayıcıda okur ve banka / kart / tutar / asgari / ödeme / faiz / vergi / taksit / kategori önizlemesini gösterir. Bulunamayan veya şüpheli alanlar uyarı verir. İlgili özetin altında borç, asgari ve tarihleri düzelt; işlem tablosunda tür ve tutarları gözden geçir. Ardından **kontrol ettim** kutusunu işaretleyip özel arşive kaydet.

**Güvenlik ve doğruluk:** Kaynak dosyanın kendisi hiçbir API'ye gönderilmez. PDF.js (4.10.38) ve SheetJS (0.20.3) istemci tarafında kullanılan, sürümü sabitlenmiş kütüphanelerdir; bunlar ilk kullanımda kendi yayıncılarının CDN adresinden indirilir. Ayrıştırılmış veriler, yalnızca açık kullanıcı onayından sonra Firebase'in kimliği doğrulanmış kullanıcıya özel Firestore belgesinde saklanır. PDF metni seçilemiyorsa (tarama/görüntü PDF), OCR yoktur ve tahminle işlemler oluşturulmaz.

**Önemli kısıtlar:** Bankalar PDF ve Excel biçimlerini zaman zaman değiştirir. Bazı satırlar veya taksitler eksik ya da hatalı tanınabilir. Ekranda kontrol etmeden içeri aktarma yapılmamalıdır. Diğer BütçeApp hareketleri, kredi kartlarının canlı borçları ve 12 aylık tahmin bu işlemle **otomatik değiştirilmez**; böylece çift kayıt önlenir. Aynı ekstrenin tekrar aktarılması kimlik eşleştirmesiyle engellenir, fakat bankanın aynı ekstreyi farklı dosya biçimiyle dışa aktarması durumunda kullanıcı yine kontrol etmelidir. Uygulama bankalara bağlanmaz.

**Kaynak kütüphaneler:** https://cdnjs.com/libraries/pdf.js/4.10.38 ve https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs


## 2026 Kasım — Banka ekstresinden otomatik nakit planı

- Garanti BBVA PDF, Yapı Kredi World PDF ve Enpara PDF için metin satırları koordinatlarına göre ayrıştırılır. Garanti ekstrelerindeki puanlar/bonus kampanyaları nakit harcaması olarak sayılmaz; Yapı Kredi taksit açıklamasının sonraki satırda olmasına dikkat edilir.
- Ekstreyi **özel arşive kaydet** adımından sonra ilgili kartın karşısında **Nakit akışına otomatik aktar** yer alır. Daha önce tanımlanmış kartı seçebilir veya yeni bir kart açabilirsin; eşinin Enpara kartı için **Enpara - Damla** gibi ayrı kart adı seçilmelidir.
- Tek tıkla önizlemeye alınan **banka ekstresi dönem borcu ve asgari**, son ödeme tarihinin ait olduğu aya yazılır. Ekstre içindeki halihazırda faturalandırılmış alışverişler tekrar harcama olarak girilmez.
- **Kalan taksitler** son ödeme tarihinin **bir sonraki ayından** başlayarak eklenir. Örnek: Garanti 30 Ekim hesap kesimi / 9 Kasım son ödeme: sonraki alışveriş taksitleri Kasım değil, **Aralık ödeme planından** başlar.
- Kartın sonraki ekstresi yüklendiğinde önceki dosyadan otomatik türetilmiş ileri taksitler yenilenir, kullanıcı tarafından elle yazılan taksit ve krediler silinmez. Aynı ekstre yeniden uygulanırsa taksitler iki kez oluşmaz.
- Ekstre nakit planına uygulandıktan sonra **Planı Kaydet** butonuna basılmalıdır; arşive kaydetme ve nakit akışına ekleme ayrı kontrollü adımlardır.
- Resmî dönem borcu ve asgarinin kullanıldığı ayda o ayın zaten faturalandırılmış taksitleri ikinci kez borca eklenmez. **Sonraki ekstre** banka borç bilgisini tekrar günceller.
- PDF'lerde tanınmayan/eksik tutar satırları varsa önizlemede uyarı verilir; kullanıcı kontrolü gereklidir. Yeni veriler kesin bankacılık kaydı değil, nakit akışı tahminini iyileştirmek içindir. Finansal PDF içerikleri herkese açık GitHub'a yüklenmez.
