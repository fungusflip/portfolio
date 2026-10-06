// Kör från repots rot:  node site/gen-pages.mjs
// Webbplatsens sektioner (Work ... Contact), sidfot och projektdialog finns bara på ETT
// ställe (site/parts/*.html). Skriptet kopierar in dem mellan markörerna i både
// site/index.html (fristående sida) och index.html (3D-startsidan med webbplatsen under).
// {{DRIVE}} blir ../index.html på den fristående sidan och #top i index.html (där JS startar spelet).
import fs from 'fs';

const parts = {
  sections: fs.readFileSync('site/parts/sections.html', 'utf8').trimEnd(),
  footer: fs.readFileSync('site/parts/footer.html', 'utf8').trimEnd(),
};
const targets = [
  { file: 'site/index.html', drive: '../index.html' },
  { file: 'index.html', drive: '#top' },
];
for (const { file, drive } of targets) {
  let html = fs.readFileSync(file, 'utf8');
  for (const [name, body] of Object.entries(parts)) {
    const re = new RegExp(`(<!-- @${name}[^>]*-->)[\\s\\S]*?(<!-- @/${name} -->)`);
    if (!re.test(html)) { console.error(`Markör @${name} saknas i ${file}`); process.exit(1); }
    html = html.replace(re, (_, a, b) => `${a}\n${body.replaceAll('{{DRIVE}}', drive)}\n${b}`);
  }
  fs.writeFileSync(file, html);
  console.log('Uppdaterade', file);
}
