# BütçeApp — Otomatik Firestore Yedekleme Rehberi

> **Durum:** Bu dosya sadece kurulum talimatıdır; GitHub'a eklenmesi yedeklemeyi **başlatmaz**. Yedekleme takvimi Google Cloud Console üzerinde proje sahibi tarafından açılmalıdır.

## Kapsam ve hedef

- Firebase / Google Cloud projesi: `butce-takip-9bc7f`
- Firestore veritabanı: `(default)` (konsolda doğrula)
- **Öneri:** Günlük tutarlı veritabanı yedeği, **30 gün saklama**.
- Yedekler cihazdan bağımsız, uygulama kapalıyken de oluşur. Özel `data`, `transactions` ve `investments` koleksiyonlarını da kapsar.
- Veritabanı yedekleri mevcut güvenlik kurallarını herkese açık hale getirmez. Ancak Google Cloud projesindeki **IAM yöneticileri / yetkilileri** yedekleri yönetebilir; proje erişimlerini dar tutun.

## Ön şart: Faturalandırma onayı

Cloud Firestore Scheduled Backups, Firebase **Blaze** ücretli kullandıkça öde planı gerektirir. Depolanan yedek verisi ve geri yükleme ücretlidir. Önce bir maliyet uyarısı oluşturun; **uyarılar faturayı durdurmaz**. Ücretli plana geçmek için proje sahibinin onayı gerekir.

Resmi kaynaklar:
- https://firebase.google.com/docs/firestore/backups
- https://firebase.google.com/docs/firestore/pricing
- https://firebase.google.com/docs/projects/billing/budget-alerts

## Konsolda etkinleştirme

1. Google Cloud Console'da doğru Google hesabıyla oturum açın: https://console.cloud.google.com/firestore/databases?project=butce-takip-9bc7f
2. Proje seçiciden `butce-takip-9bc7f` projesini ve **(default)** Firestore veritabanını seçin.
3. Veritabanı listesindeki **Scheduled backups** sütununda **Edit settings** ya da **View backups** açın.
4. **Disaster recovery** ekranında **Daily** (Günlük) seçeneğini açın ve saklama süresini **30 days** / `30d` olarak belirleyin. *Haftalık yedek gerekiyorsa ayrıca yapılandırılabilir.*
5. **Save** ile kaydedin.
6. Aynı ekrandan etkin bir günlük yedekleme planının listelendiğini doğrulayın.
7. İlk yedek oluştuktan sonra **Backups** bölümünde tamamlanma tarihi ve boyutunu kontrol edin. Günlük yedeğin saatini seçemeyebilirsiniz.

**Dikkat:** Yedekleme takviminin bulunması, henüz bir yedek kopyasının oluştuğunu garanti etmez.

## Doğrulama ve kurtarma

- Yedek oluşturulunca listede görüldüğünü ve düzenli yenilendiğini kontrol edin.
- Firestore yönetilen geri yükleme mevcut canlı veritabanı üzerine değil, **yeni bir Firestore veritabanına** yapılır. Eski kayıtları geri taşıma planı ayrıca gereklidir. Rastgele veri silerek kurtarma testi yapmayın.
- Yedekler proje ve konum politikalarına tabidir; bağımsız dışa aktarılmış bir yedeği de güvenli, şifrelenmiş depolamada saklamak iyi bir ikinci savunma katmanıdır.
- GitHub'ın herkese açık deposuna **asla** gerçek finans kayıtları, hizmet hesabı JSON anahtarları, giriş parolası veya yedek dosyaları koymayın.

## Komut satırı alternatifi (opsiyonel)

Firebase CLI'da projenin yönetici yetkisiyle çalıştırılacak örnek (manuel doğrulama gerektirir):

```sh
firebase use butce-takip-9bc7f
firebase firestore:backups:schedules:create --database '(default)' --recurrence DAILY --retention 30d
firebase firestore:backups:schedules:list --database '(default)'
```

Not: CLI sürümleri değişebilir, güncel komutları Firebase belgeleriyle kontrol edin.

## Yapılmaması gerekenler

- Yedek kopyalarını canlı Firestore `data` koleksiyonuna koyup **ayrı yedek** gibi değerlendirmeyin.
- Finansal kayıtları GitHub Actions loglarına veya herkese açık GitHub dosyalarına yazmayın.
- Yeniden erişim için Firestore kurallarını `allow read, write: if true` haline getirmeyin.
- Yedekleri otomatik olarak geri yüklemeye kalkışmayın; kurtarma ayrı bir kontrollü işlemdir.
