# BütçeApp → ChatGPT Sites: Güvenli test geçişi

> **Durum:** Yalnızca hazırlık. GitHub Pages ve mevcut Firebase kayıtları değişmeyecek. Gerçek finansal veriler, kimlik bilgileri ve ekstreler bu depoya konulmayacak.

## Mevcut uygulama mimarisi
- Kaynak: `https://github.com/oktayasan-create/butce-app`
- `index.html`: tek sayfalı arayüz, Firebase Auth + Firestore (uygulama giriş ve kayıt katmanı).
- `cashflow-model.js`: saf hesaplama modülü; krediler, kart borçları, asgariler, taksitler, faiz/vergiler, Ek Hesap/KMH.
- `budget-bridge.js`: bütçe ayları ve kategorilerinin nakit planına eşleştirilmesi.
- `cashflow-forecast-ui.js`: 12 aylık tablo, mobil kartlar, geniş ekran ve grafik.
- `statement-import.js`, `statement-plan.js`, `statement-ui.js`, `statement-file-reader.js`: ekstre akışı.
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`: kurulabilir uygulama simgesi ve çevrimdışı kabuk.
- `tests/*.test.mjs`: Node.js sentetik regresyon testleri.

## Temel güvenlik koşulları
1. `BütçeApp — Test` adında **ayrı**, **özel** bir Sites önizlemesi oluştur; **yayınlama**.
2. Test uygulamasını Firebase'ye bağlama, canlı `data/settings`, `data/cashflowPlan`, `data/goals` gibi Firestore yollarına erişme. Kullanıcının gerçek kayıtlarını okuma/yazma.
3. Kişisel gelir, borç, kart, banka, kimlik, ekstre ve şifre verisi kullanma. Gerçek bilgiler yerine **tamamen sahte** kayıtlar oluştur.
4. Kaydetme ve kullanıcı ayrımı gerekiyorsa bağımsız test veritabanı (uygun Sites D1/R2) ve sunucu tarafında sahiplik kuralları uygula.
5. Üretim geçişi ayrı kararla onaylanana dek GitHub main'e, GitHub Pages'e veya mevcut Firebase'e dokunma.

## Korunması gereken iş kuralları
- Gelir ait olduğu bütçe ayında gösterilir; ay kaydırması yok.
- Ekstre harcama dönemi ve ödeme ayı birbirinden ayrıdır.
- Zorunlu kredi/nakit giderler ve kart asgarileri ödenir; yetersizlik olursa tanımlı KMH limiti dahilinde kullanım yapılır.
- Sonraki fazla nakit mevcut KMH borcunu kapatır, sonra kredi kartlarının kalan borcunu (tercihen yüksek faizli kart önce) azaltır.
- Kart ve KMH borcu tamamen kapatılmadan birikim gösterilmez.
- Ödenemeyen kart tutarı faiz/vergisiyle sonraki aya taşınır. KMH limiti dolduğu için ödenemeyen zorunlu giderler gecikmiş borç olarak izlenir.
- Aylık net fark ve birikmiş toplam ayrı gösterilir. Grafik ve tablo aynı kaynaktan hesaplanır.
- Ekstreler ay bazında kapalı açılır gruplar, mobilde açılır kartlar, masaüstünde geniş tablo, grafikte hepsini seç/tümünü kaldır.
- PWA'da mevcut cüzdan/finans amblemi kullanılır.

## Sentetik kabul testleri
1. **Kısmi kart kapatma:** Ay geliri 100.000, zorunlu kredi 30.000, nakit gider 5.000, Ek Hesap başlangıç borcu 15.000, kart ödeme hedefi 80.000, asgari 32.000 → Ek Hesap kapanışı 0, kart ödemesi 50.000, devreden kart borcu 30.000, birikim 0.
2. Kart borcu ikinci ayda tahmini faiz/vergilerle devreder. Banka ekstresi ve taksit ikinci kez eklenmez.
3. KMH limiti 10.000, zorunlu ödeme 25.000 ve gelir 0 olduğunda 15.000 karşılanamamış zorunlu gider sonraki aya taşınır; gerçekleşen nakit çıkışı 10.000 olur.
4. Tüm borçlar kapatıldıktan sonra pozitif nakit birikim olur. Borç varken birikim 0'dır.
5. Tüm ekranlar: mobil dikey kartlar, yatay geniş tablo, 12 aylık grafik seçimleri, PWA simgesi, veri izolasyonu ve tekrar açınca test verisinin korunması.

## Karar kapısı
- Sites, mevcut kodun uyumluluğunu teyit etmeli; gerekirse güvenli bir adaptör katmanı oluşturmalı.
- Gerçek veriye geçiş öncesinde dışa aktarılabilir yedek, geri dönüş planı, kullanıcıya özel sunucu tarafında yetkilendirme, farklı hesap testleri ve tüm finansal hesap regresyonlarının geçmesi gerekir.
- Gerçek veritabanına bağlama/yükleme ve yeni Site'ı yayımlama işleri açık onay gerektirir.
