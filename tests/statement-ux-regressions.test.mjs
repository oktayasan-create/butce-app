import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("statement-file-reader.js","utf8");
const {parseStatementPDFRows}=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(source));
const mk=(text,parts=[])=>({text,parts});
const part=(x,str)=>({x,str});

// Regression: YKB credit terms include wording "Dönem borcunuzun" in footer.
// It must NEVER be misclassified as Garanti.
const ykb=[
 mk("HESAP BİLGİLERİ"),
 mk("Hesap Kesim Tarihi : 8 Kasım 2026"),
 mk("Son Ödeme Tarihi : 18 Kasım 2026"),
 mk("Dönem Borcu : 132.287,35 TL"),
 mk("Ödenmesi Gereken Asgari Tutar/Oran : 52.019,28 TL / 40%"),
 mk("Kalan Toplam Taksit Tutarı : 11.459,25 TL"),
 mk("Kart Numarası : 0000 00** **** 9999"),
 mk("İşlem Tarihi İşlemler Tutar(TL) Kalan Tutar/Taksit Puan"),
 mk("11 Ekim 2026 MARKET STORE 859,00",
   [part(40,"11"),part(50,"Ekim"),part(69,"2026"),part(105,"MARKET STORE"),part(405,"859,00")]),
 mk("TOPLAM 132.287,35"),
 mk("Dönem borcunuzun tamamını son ödeme tarihine kadar ödeyebilirsiniz."),
 mk("Dönem borcunuzun tamamını ödemeyerek kredilendirme tercih ettiğiniz takdirde"),
 mk("Alışveriş faiz oranlarına KKDF ve BSMV dahil değildir.")
];
const parsedYkb=parseStatementPDFRows(ykb,"ykb.pdf","local01").statement;
assert.equal(parsedYkb.bank,"Yapı Kredi","YKB prose must never trigger Garanti detection");
assert.match(parsedYkb.cardLabel,/Yapı Kredi/);
assert.equal(parsedYkb.balance,132287.35);
assert.equal(parsedYkb.minimum,52019.28);
assert.equal(parsedYkb.transactions.length,1);

// The Bonus campaigns shown as unpaid rows are NOT missing merchant amounts.
const garanti=[
 mk("Bonus Gold Troy Bilgileriniz"),
 mk("Hesap Kesim Tarihi 30 Ekim 2026"),
 mk("Son Ödeme Tarihi 09 Kasım 2026"),
 mk("Dönem Borcunuz 149.876,51 TL"),
 mk("Min. Ödeme Tutarı 59.123,00 TL"),
 mk("İşlem Tarihi Dönem İçi İşlemler Kalan Borç / Taksit Bonus (TL) Tutar (TL)"),
 mk("02 Ekim 2026 BONUS MARKET KAMPANYASI 500,00",
   [part(105,"02"),part(115,"Ekim"),part(131,"2026"),
    part(170,"BONUS MARKET KAMPANYASI"),part(420,"500,00")]),
 mk("02 Ekim 2026 AKTİVASYON KAMPANYASI 150,00",
   [part(105,"02"),part(115,"Ekim"),part(131,"2026"),
    part(170,"AKTİVASYON KAMPANYASI"),part(420,"150,00")]),
 mk("11 Ekim 2026 BONUS BEDAVA ALIŞVERİŞ 671,60-",
   [part(105,"11"),part(115,"Ekim"),part(131,"2026"),
    part(170,"BONUS BEDAVA ALIŞVERİŞ"),part(420,"671,60-")]),
 mk("22 Ekim 2026 BONUS BEDAVA ALIŞVERİŞ 66,89-",
   [part(105,"22"),part(115,"Ekim"),part(131,"2026"),
    part(170,"BONUS BEDAVA ALIŞVERİŞ"),part(420,"66,89-")]),
 mk("03 Ekim 2026 MARKET 200,00",
   [part(105,"03"),part(115,"Ekim"),part(131,"2026"),
    part(170,"MARKET"),part(525,"200,00")]),
 mk("TOPLAM 149.876,51")
];
const resultG=parseStatementPDFRows(garanti,"garanti.pdf","local02");
assert.equal(resultG.statement.bank,"Garanti BBVA");
assert.equal(resultG.statement.transactions.length,1);
assert.equal(resultG.statement.transactions[0].amount,200);
assert(!resultG.warnings.some(w=>w.includes("tutar okunamadı")),
 "Four Bonus-only entries should not become a false 4-row error");

// A genuine unrecognized transaction must remain a visible warning.
const broken=[...garanti];
broken.splice(broken.length-1,0,mk("04 Ekim 2026 STORE WITHOUT AMOUNT",
  [part(105,"04"),part(115,"Ekim"),part(131,"2026"),
   part(170,"STORE WITHOUT AMOUNT")]));
assert(parseStatementPDFRows(broken,"garanti.pdf","local03").warnings
 .some(w=>w.includes("1 işlem satırında tutar okunamadı")));

// YKB bank legal invoice/footer may carry a transaction-like date but is not a purchase.
const ykbLegal=[
 ...ykb.slice(0,-1),
 mk("08 Kasım 2026 — YAPI ve KREDI BANKASI A.Ş. Büyük Mükellefler V.D. / 123456789 Sıra No: 9999999 55,99 TRY USD Karşılığı 1,13 USD",
   [part(40,"08"),part(58,"Kasım"),part(85,"2026"),
    part(105,"YAPI ve KREDI BANKASI A.Ş."),
    part(290,"Büyük Mükellefler V.D. / 123456789 Sıra No: 9999999"),
    part(610,"55,99 TRY USD Karşılığı 1,13 USD")]),
 mk("TOPLAM 132.287,35")
];
const legalResult=parseStatementPDFRows(ykbLegal,"ykb.pdf","local04");
assert.equal(legalResult.statement.bank,"Yapı Kredi");
assert.equal(legalResult.statement.transactions.length,1,
  "Legal footer must not be counted as card movement");
assert(!legalResult.warnings.some(w=>w.includes("tutar okunamadı")),
  "Legal footer must not cause false missing-amount warning");

const html=fs.readFileSync("index.html","utf8");
const ui=fs.readFileSync("statement-ui.js","utf8");
assert(html.includes("grid-template-columns:minmax(0,1fr)"),"Statement preview must fill the row");
assert(html.includes("cf-statement-error"),"Parsing error needs a high-visibility error panel");
assert(html.includes("cf-statement-warning-head"),"Warnings need a prominent heading");
assert(ui.includes("⚠️ Kontrol gerektiren bilgiler"),"Warnings need clear actionable text");
assert(ui.includes("role=\"alert\""),"Warnings must be accessible");
console.log("PASS: YKB issuer, Garanti reward exclusions, real missing amount warnings and full-width review UX");
