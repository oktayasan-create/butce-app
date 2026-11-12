import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {
 PALETTES,ICON_STYLES,NAV_KEYS,GLYPH_LABELS,NAV_DEFAULT,DEFAULT_COLORS,
 CUSTOM_THEME_CSS_VARS,sanitizeCustomColors,sanitizeIconConfig,resolvedNavIcons,customThemeVars
} from "../appearance-config.js";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=filename=>readFileSync(join(root,filename),"utf8");

test("Sage Glass is a real sixth palette with light and dark frosted surfaces",()=>{
 assert.ok(PALETTES.includes("sageglass"));
 assert.ok(PALETTES.includes("custom"));
 const css=read("liquid-glass.css");
 assert.match(css,/body\.light\[data-palette="sageglass"\]/);
 assert.match(css,/body:not\(\.light\)\[data-palette="sageglass"\]/);
 assert.match(css,/backdrop-filter:blur\(35px\)/);
 assert.match(css,/prefers-reduced-motion/);
});

test("custom color choices are persisted only as sanitized hex colors",()=>{
 const values=sanitizeCustomColors({accent:"#123ABC",secondary:"url(javascript:alert(1))",
   background:"#112233",surface:"red",unknown:"#123456"});
 assert.deepEqual(values,{accent:"#123abc",secondary:DEFAULT_COLORS.secondary,
   background:"#112233",surface:DEFAULT_COLORS.surface});
 const light=customThemeVars(values,"light");
 const dark=customThemeVars(values,"dark");
 assert.equal(light["--bg"],"#112233");
 assert.notEqual(light["--bg"],dark["--bg"]);
 assert.equal(light["--brand"],"#123abc");
 assert.ok(dark["--accent"].startsWith("#"));
 assert.ok(CUSTOM_THEME_CSS_VARS.includes("--bg2"));
 for(const [name,value] of Object.entries(light)){
   assert.ok(name.startsWith("--"));
   assert.doesNotMatch(String(value),/javascript:|url\(/i);
 }
});

test("user-created icon packages are limited to 26 built-in SVG IDs",()=>{
 assert.equal(Object.keys(GLYPH_LABELS).length,26);
 const custom={...NAV_DEFAULT,overview:"pie",cashflow:"credit-card"};
 const pack=sanitizeIconConfig({style:"custom",name:"Benim <ikon> Setim",
   custom:{...custom,history:"<svg onload=alert(1)>"},customStyle:"bold"});
 assert.equal(pack.name,"Benim ikon Setim");
 assert.equal(pack.custom.history,NAV_DEFAULT.history);
 assert.equal(pack.custom.overview,"pie");
 assert.equal(pack.custom.cashflow,"credit-card");
 assert.equal(pack.customStyle,"bold");
 assert.deepEqual(resolvedNavIcons(pack),pack.custom);
 for(const style of ICON_STYLES){
   const items=resolvedNavIcons({style});
   NAV_KEYS.forEach(key=>assert.ok(Object.hasOwn(GLYPH_LABELS,items[key])));
 }
});

test("Studio has visible color pickers, custom icon selectors and installed-app version",()=>{
 const html=read("index.html");
 for(const name of ["accent","secondary","background","surface"]){
   assert.match(html,new RegExp('id="studio-'+name+'"'));
 }
 assert.match(html,/studioSaveColors\(\)/);
 assert.match(html,/studioRestoreColors\(\)/);
 assert.match(html,/studioSaveIcons\(\)/);
 assert.match(html,/studioResetIcons\(\)/);
 assert.match(html,/studio-icon-list/);
 assert.match(html,/data-palette-choice="sageglass"/);
 assert.match(html,/data-palette-choice="custom"/);
 assert.match(html,/data-icon-pack-choice="custom"/);
 assert.match(html,/butce-custom-colors-v1/);
 assert.match(html,/butce-icon-config-v1/);
 assert.match(html,/liquid-glass\.css\?v=19/);
 assert.match(html,/appearance-config\.js\?v=19/);
 assert.match(html,/Sage Glass ve kişisel tema stüdyosu/);
 assert.match(read("sw.js"),/butceapp-shell-v19/);
 assert.match(read("sw.js"),/appearance-config\.js\?v=19/);
 assert.equal(JSON.parse(read("manifest.json")).start_url,"./?app=v19");
});

test("financial calculations, balances, Firebase document writes are not changed",()=>{
 const html=read("index.html");
 const from=html.indexOf("// ── APPEARANCE v19:");
 const to=html.indexOf("// ── HELPERS ─",from);
 assert.ok(from>0&&to>from);
 const appearance=html.slice(from,to);
 assert.doesNotMatch(appearance,/setDoc|addDoc|updateDoc|deleteDoc|cashflowPlan/);
 assert.match(appearance,/localStorage\.setItem/);
 assert.ok(html.includes('const probe = await getDocFromServer(doc(db, "data", "settings"))'));
});
