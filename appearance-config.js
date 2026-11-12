/**
 * Appearance preferences are local, presentation-only, and never touch
 * Firebase or financial records. Helpers remain pure for regression tests.
 */
export const PALETTES=["aurora","ocean","orchid","sunset","sageglass","custom"];
export const ICON_STYLES=["outline","soft","bold","custom"];
export const NAV_KEYS=["cashflow","planning","overview","invest","history","txadd"];
export const GLYPH_LABELS={
  wallet:"Cüzdan",layers:"Katmanlar",grid:"Kareler",sparkles:"Yıldızlar",
  history:"Geçmiş",settings:"Ayarlar",palette:"Palet",plus:"Ekle",
  "credit-card":"Kredi kartı",chart:"Çizgi grafik",receipt:"Fiş",calendar:"Takvim",
  coins:"Paralar",pie:"Pasta grafik",home:"Ev",sliders:"Kontroller",
  target:"Hedef",bank:"Banka",shield:"Kalkan",briefcase:"Çanta",
  activity:"Aktivite",book:"Defter",circle:"Halka",trending:"Yükseliş",
  leaf:"Yaprak",gem:"Elmas"
};
export const NAV_DEFAULT={cashflow:"wallet",planning:"layers",overview:"grid",
  invest:"sparkles",history:"history",txadd:"settings"};
export const NAV_PRESET={
  outline:NAV_DEFAULT,
  soft:{cashflow:"credit-card",planning:"book",overview:"pie",
    invest:"trending",history:"calendar",txadd:"sliders"},
  bold:{cashflow:"bank",planning:"coins",overview:"chart",
    invest:"gem",history:"receipt",txadd:"shield"}
};
export const DEFAULT_COLORS={
  accent:"#517f72",secondary:"#91b0a6",background:"#dce9e5",surface:"#f6faf7"
};
const HEX=/^#[0-9a-fA-F]{6}$/;
export function safeHex(value,fallback){
  return typeof value==="string"&&HEX.test(value)?value.toLowerCase():fallback;
}
export function sanitizeCustomColors(raw){
  const value=raw&&typeof raw==="object"?raw:{};
  return Object.fromEntries(Object.entries(DEFAULT_COLORS).map(
    ([key,fallback])=>[key,safeHex(value[key],fallback)]
  ));
}
export function sanitizeIconConfig(raw){
  const value=raw&&typeof raw==="object"?raw:{};
  const style=ICON_STYLES.includes(value.style)?value.style:"outline";
  const name=typeof value.name==="string"?
    value.name.trim().replace(/[<>&"']/g,"").slice(0,28):"İkon Setim";
  const incoming=value.custom&&typeof value.custom==="object"?value.custom:{};
  const custom={};
  NAV_KEYS.forEach(key=>{
    custom[key]=Object.hasOwn(GLYPH_LABELS,incoming[key])?incoming[key]:NAV_DEFAULT[key];
  });
  const customStyle=["outline","soft","bold"].includes(value.customStyle)?
    value.customStyle:"soft";
  return {style,name:name||"İkon Setim",custom,customStyle};
}
export function resolvedNavIcons(config){
  const p=sanitizeIconConfig(config);
  return p.style==="custom"?p.custom:NAV_PRESET[p.style]||NAV_DEFAULT;
}
function rgb(hex){
  const normalized=safeHex(hex,"#ffffff");
  return [1,3,5].map(i=>parseInt(normalized.slice(i,i+2),16));
}
function mix(a,b,part){
  const ca=rgb(a),cb=rgb(b);
  return "#"+ca.map((v,i)=>Math.round(v*part+cb[i]*(1-part))
    .toString(16).padStart(2,"0")).join("");
}
function rgba(hex,alpha){
  return "rgba("+rgb(hex).join(",")+","+alpha+")";
}
export function customThemeVars(raw,mode="light"){
  const c=sanitizeCustomColors(raw),dark=mode==="dark";
  const bg=dark?mix(c.background,"#081419",0.11):c.background;
  const surface=dark?mix(c.surface,"#17282d",0.12):c.surface;
  const accent=dark?mix(c.accent,"#b9f9e6",0.57):c.accent;
  const secondary=dark?mix(c.secondary,"#9fbafa",0.57):c.secondary;
  const srgb=rgb(surface);
  const brightness=srgb.map(v=>{
    const x=v/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;
  });
  const lightSurface=0.2126*brightness[0]+0.7152*brightness[1]+0.0722*brightness[2]>0.25;
  const text=dark?"#ecf8f4":lightSurface?"#1a3335":"#f3fcf7";
  const text2=dark?"#cde2dc":lightSurface?"#395454":"#d0e8e2";
  const text3=dark?"#9fbbb2":lightSurface?"#617b78":"#a9cbc0";
  return {
    "--accent":accent,"--accent-alt":secondary,"--brand":accent,
    "--accent-soft":rgba(accent,dark?0.23:0.16),
    "--accent-grad":"linear-gradient(125deg,"+accent+","+secondary+")",
    "--bg":bg,"--bg2":rgba(surface,dark?.81:.73),
    "--bg3":rgba(surface,dark?.88:.79),
    "--bg4":rgba(mix(surface,bg,.62),dark?.82:.82),
    "--bg5":mix(surface,bg,.48),
    "--border":rgba(accent,.19),"--border2":rgba(accent,.27),
    "--border3":rgba(accent,.12),
    "--text":text,"--text2":text2,"--text3":text3,
    "--text4":text3,"--hover":rgba(accent,dark?.16:.13),
    "--chart-bg":surface,
    "--glass-outline":rgba(dark?"#b3e1d4":"#ffffff",dark?.17:.77),
    "--glass-shadow":dark?"0 18px 42px rgba(0,0,0,.22)":
      "0 16px 40px rgba(44,84,73,.13)"
  };
}
export const CUSTOM_THEME_CSS_VARS=Object.keys(customThemeVars(DEFAULT_COLORS));
