/**
 * Presentation-only source registry. Every figure links back to the screen
 * that owns its inputs. The registry never accesses Firebase or writes data.
 */
export const FORECAST_FIELDS=[
 {name:"Ay",source:"plan"},
 {name:"Gelir",source:"budget"},
 {name:"Krediler",source:"loans"},
 {name:"Faizli devreden kart",source:"card"},
 {name:"Ay içi kart harcaması",source:"budget"},
 {name:"Gelecek taksitler",source:"installments"},
 {name:"Kart ödeme hedefi",source:"statements"},
 {name:"Gelecek ay asgari",source:"statements"},
 {name:"Planlanan kart ödemesi",source:"plan"},
 {name:"Ödenmeden kalan kart",source:"plan"},
 {name:"Nakit gider",source:"budget"},
 {name:"Devreden Ek Hesap",source:"overdraft"},
 {name:"Ek Hesap geri ödemesi",source:"overdraft"},
 {name:"Toplam nakit çıkışı",source:"plan"},
 {name:"Sonraki aya Ek Hesap",source:"overdraft"},
 {name:"Aylık net",source:"plan"},
 {name:"Toplam birikim",source:"plan"}
];
export const INSTALLMENT_FIELDS=[
  {name:"Ödeme ayı",source:"installments"},
  {name:"Ekstreye yansımış taksit",source:"statements"},
  {name:"Geleceğe planlanan taksit",source:"installments"},
  {name:"Kredi taksiti",source:"loans"}
];
export const OVERVIEW_FIELDS=["budget","budget","actual","budget","actual","actual"];
export function sourceForForecastColumn(index){
  return FORECAST_FIELDS[index]?.source||"plan";
}
export function sourceForInstallmentColumn(index){
  return INSTALLMENT_FIELDS[index]?.source||"installments";
}
export function sourceForOverviewColumn(index){
  return OVERVIEW_FIELDS[index]||"budget";
}
export function summarySource(label){
  const key=String(label||"").toLocaleLowerCase("tr-TR");
  if(/yatırım/.test(key))return "investment";
  if(/ek hesap|kmh/.test(key))return "overdraft";
  if(/kart|asgari|borç|kredi|birikim/.test(key))return "plan";
  if(/gerçek|işlem/.test(key))return "actual";
  return "budget";
}
