import fs from "node:fs";
import assert from "node:assert/strict";
const content=fs.readFileSync("statement-file-reader.js","utf8");
const p=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(content));
const {parseStatementMoney,parseStatementDate,guessStatementCategory,
 parseStatementPDFText,parseStatementExcelRows}=p;

assert.equal(parseStatementMoney("22.136,69 TL"),22136.69);
assert.equal(parseStatementMoney("- 4.318,00 TL"),-4318);
assert.equal(parseStatementMoney("-21684.66"),-21684.66);
assert.equal(parseStatementDate("2 Kasım 2026"),"2026-11-02");
assert.equal(parseStatementDate("08/10/2026"),"2026-10-08");
assert.equal(parseStatementDate("02.11.2026"),"2026-11-02");
assert.equal(guessStatementCategory("MIGROS SOMEWHERE"),"Market");
assert.equal(guessStatementCategory("SHELL GAS"),"Akaryakıt");

const enpara=[
 "Enpara Kredi Kartı Ekstresi",
 "Ekstre tarihi 02/11/2026",
 "Ekstre borcu 22.136,69 TL",
 "Minimum ödeme tutarı 4.626,00 TL",
 "Son ödeme tarihi 12/11/2026",
 "Bir önceki ekstre borcu 21.000,00 TL",
 "07/10/2026 Ödeme - Enpara.com Cep Şubesi - 4.318,00 TL",
 "08/10/2026 TURK TELEKOM (MOBIL) 291,25 TL",
 "02/11/2026 Alışveriş faizi 579,92 TL",
 "02/11/2026 Faizlerin KKDF’si 86,99 TL",
 "02/11/2026 Faiz ve ücretlerin BSMV'si 86,99 TL",
 "05/10/2026 GOOGLE VIDEO 99,99 TL"
].join("\n");
const enp=parseStatementPDFText(enpara,"enpara.pdf","abcdeffedcba").statement;
assert.equal(enp.bank,"Enpara");
assert.equal(enp.statementDate,"2026-11-02");
assert.equal(enp.dueDate,"2026-11-12");
assert.equal(enp.balance,22136.69);
assert.equal(enp.minimum,4626);
assert.equal(enp.transactions.length,6);
assert.equal(enp.transactions.filter(t=>t.type==="payment").length,1);
assert.equal(enp.transactions.filter(t=>t.type==="tax").length,2);
assert.equal(enp.transactions.filter(t=>t.type==="interest").length,1);
assert.equal(enp.transactions.filter(t=>t.type==="purchase").length,2);

const ykb=[
 "YAPI KREDİ WORLD",
 "HESAP BİLGİLERİ",
 "Hesap Kesim Tarihi : 7 Ekim 2026",
 "Son Ödeme Tarihi : 19 Ekim 2026",
 "Dönem Borcu : 178.317,27 TL",
 "Ödenmesi Gereken Asgari Tutar/Oran : 70.120,77 TL / 40%",
 "Önceki Dönem Hesap Özeti Borcu : 180.626,72 TL",
 "Dönem İçi Harcamalar : 69.935,18 TL",
 "Kalan Toplam Taksit Tutarı : 16.675,02 TL",
 "Kart Numarası : 4506 34** **** 9157",
 "İşlem Tarihi İşlemler Tutar(TL) Kalan Tutar/Taksit Puan",
 "08 Eylül 2026 ÖDEME-İNTERNET BANKACILIĞI +74.254,73",
 "07 Ekim 2026 DÖNEM FAİZİ 8.645,82",
 "28 Haziran 2026 ADIDAS STORE 691,62 1.383,24 / 2",
 "4.149,70 TL'lik işlemin 4 / 6 taksidi",
 "21 Temmuz 2026 STORE RETURN +350,61",
 "TOPLAM 175.000,00",
 "10 Eylül 2026 OPET WORLDCARD ÜRÜN ÖZELLİĞİ KAMPANYASI 8.000 40,00 TL",
 "İşlem Tarihi İşlemler Tutar(TL)",
 "12 Eylül 2026 SHELL GAS 800,00",
 "TOPLAM 800,00"
].join("\n");
const ykbParsed=parseStatementPDFText(ykb,"world.pdf","123456789abc");
const y=ykbParsed.statement;
assert.equal(y.bank,"Yapı Kredi");
assert.equal(y.balance,178317.27);
assert.equal(y.minimum,70120.77);
assert.equal(y.previousBalance,180626.72);
assert.equal(y.periodSpending,69935.18);
assert.equal(y.dueDate,"2026-10-19");
assert.equal(y.transactions.length,5,"Promotional reward lines must not be imported");
assert.equal(y.transactions.filter(t=>t.type==="payment").length,1);
assert.equal(y.transactions.filter(t=>t.type==="refund").length,1);
assert.equal(y.transactions[2].installmentCurrent,4);
assert.equal(y.transactions[2].installmentTotal,6);
assert.equal(y.transactions[2].remainingInstallments,2);
assert.equal(y.transactions[4].category,"Akaryakıt");

const sheet=[
 ["","","","",""],["Tarih","İşlem","Etiket","Bonus",""],
 ["29/09/2027","UCUZABILET","Seyahat",0,-21684.66],
 ["05/10/2027","MIGROS MARKET","Market",0,-2000.12],
 ["06/10/2027","KREDİ KARTI ÖDEME","Diğer",0,1000.00],
 ["07/10/2027","İADE YAPILDI","Market",0,200.45]
];
const summary=[
 ["","*ekim özet","",""],
 ["","Açıklama","TL","USD"],
 ["","Devredilen bakiye",63607.22,0],
 ["","Dönem harcamaları",119717.84,0],
 ["","Ödenecek minimum borç",59123,0],
 ["","Toplam borcunuz",149876.51,0]
];
const output=parseStatementExcelRows({"Ekstre Islemleri - TL":sheet,"özet":summary},"garanti.xlsx","abcddcbaabc");
const g=output.statement;
assert.equal(g.bank,"Garanti BBVA");
assert.equal(g.periodLabel,"2027-10","Must infer year from transactions, not hardcode 2026");
assert.equal(g.balance,149876.51);
assert.equal(g.minimum,59123);
assert.equal(g.transactions.length,4);
assert.equal(g.transactions[0].type,"purchase");
assert.equal(g.transactions[0].category,"Seyahat");
assert.equal(g.transactions[2].type,"payment");
assert.equal(g.transactions[3].type,"refund");
assert(!JSON.stringify(output).includes("IBAN"));
assert.throws(()=>parseStatementPDFText("not enough text","empty.pdf","test"));
const html=fs.readFileSync("index.html","utf8"),ui=fs.readFileSync("statement-ui.js","utf8");
assert(html.includes('statementSummaryEdit'),'Editable statement summary must be wired');
assert(html.includes('statementMovementEdit'),'Editable transaction types must be wired');
assert(ui.includes('accept=".pdf,.xlsx,.xls,.json'),'PDF and Excel must be accepted');
assert(ui.includes('Ekstre borçlarını, asgari tutarları'),'Explicit confirmation required');
assert(ui.includes('await setDoc(doc(db,"data","statementInbox")'),'Only private Firestore archived document');
console.log("PASS: client PDF YKB and Enpara, Garanti Excel, installments, payments/refunds, summary and review hooks");
