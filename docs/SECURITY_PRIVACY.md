# BütçeApp — veri gizliliği ve erişim denetimi

> Bu belge, **GitHub'daki kod** üzerinden yapılan kontrolleri anlatır. Canlı Firebase projesindeki yayımlanmış Firestore Security Rules bu depodan okunamıyor; konsoldan ayrıca doğrulanmalıdır.

## Ne nerede saklanır?
- Web sitesi / Android PWA: GitHub Pages'te herkesin erişebileceği uygulama kodu ve arayüzü. Kodun açık olması, Firebase verilerinin açık olduğu anlamına **gelmez**.
- Finansal kayıtlar: Cloud Firestore'da \`data/settings\`, \`data/cashflowPlan\`, \`data/statementInbox\`, \`transactions\`, \`investments\` ve uygulamanın diğer veri koleksiyonları.
- Kaydedilen ekstre dosyasının kendisi: Tarayıcıda PDF/Excel içeriği okunur; dosyanın ham baytları GitHub deposuna yüklenmez. Kullanıcının onayladığı **ayrıştırılmış** işlem ve ekstre bilgileri Firestore \`data/statementInbox\` belgesine yazılır.
- Android PWA service worker: uygulama kabuğunu/JS dosyalarını önbelleğe alır; Firestore ağ yanıtları üçüncü taraf kökenli olduğundan bu service worker tarafından shell cache'e eklenmez.
- Firebase Auth: oturum yönetimi. Uygulama kodundaki Firebase web API key kullanıcı gizli anahtarı değildir; erişim denetimi Security Rules ile sağlanır.

## Gerekli canlı erişim testi — Firebase Console
1. Firebase Console → ilgili proje → Firestore Database → **Rules** sekmesini aç.
2. Yayımlanan kuralda \`allow read, write: if true\` veya yalnızca \`request.auth != null\` bulunmadığından emin ol. İkisi de **tek kullanıcı için yeterli değildir**.
3. Geçerli kuralın, **yalnızca senin Firebase Auth UID'ne** okuma/yazma izni verdiğinden emin ol. Bu uygulama tek kullanıcılı olduğundan \`firestore.rules.example\` kural şablonundaki \`isOwner()\` mantığı uygundur; ancak örnekteki UID placeholder'ın canlı kurala değiştirilmiş olması gerekir.
4. Rules Playground'da \`/data/statementInbox\`, \`/data/cashflowPlan\`, \`/transactions/<belge>\` için şu üç senaryoyu dene:
   - **Oturum açmamış** istek: READ ve WRITE **DENY**
   - **Başka UID ile giriş yapmış** kullanıcı: READ ve WRITE **DENY**
   - **Senin UID'n**: ihtiyacın olan READ ve WRITE **ALLOW**
5. Aynı sonucu \`data/settings\`, \`data/goals\`, \`investments\` ve finansal veri içeren diğer yollar için kontrol et.
6. Firebase Console → Project settings → Users and permissions'da yalnızca tanıdığın proje yöneticileri bulunduğunu kontrol et; yönetici hesabında iki aşamalı doğrulamayı etkinleştir.

**Canlı kuralları değiştirmek uygulamayı çalışmaz hâle getirebilir.** Sahip UID kontrolünü doğrulamadan rastgele \`allow read, write\` kuralı yayımlama.

## Kaynak kodu / Git geçmişi
- Bu GitHub deposu **public** ve daha önce bazı örnek testlerde bankacılık ekstrelerine benzeyen gerçek tutar/kart son haneleri kullanılmıştı.
- Güncel test dosyalarındaki bu örnekleri anonim/sentetik değerlere çevirdik. **Eski Git commit geçmişi bu işlemle silinmez.** Tam temizleme gerekiyorsa geçmiş yeniden yazımı ve eski çatallar/önbellekler ayrıca değerlendirilmelidir.
- Gerçek kullanıcı ekstreleri, tam kart numarası, IBAN, kimlik veya adres asla kaynak dosyalarına ya da pull request açıklamalarına eklenmemelidir.

## Şifreleme ve sınırlar
- Google Cloud Firestore, verileri saklanırken ve ağ üzerinden iletilirken şifreler.
- Bu uçtan uca şifreleme değildir: Firebase proje yöneticileri ve gerekli yetkilere sahip Google sistemleri platform güvenlik modeli içindedir.
- Tarayıcının yerel veri/önbelleği ve indirilen Excel/PDF dosyaları kişinin cihaz güvenliğine de bağlıdır. Paylaşılan cihazda çıkış yap ve dosyaları koru.
- Mevcut Firestore güvenlik kuralı **canlı olarak doğrulanmadan** 'başkaları kesinlikle göremez' güvencesi verilemez.
- BütçeApp yalnızca sınırlı bir plan simülasyonudur; PDF okuyucusu bazen işlem kaçırabilir. Banka ekstresiyle karşılaştırma yapılmalıdır.

## Resmî kaynaklar
- https://firebase.google.com/docs/rules/basics
- https://firebase.google.com/docs/rules/insecure-rules
- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/support/privacy
