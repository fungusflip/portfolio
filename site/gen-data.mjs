// Kör från repots rot:  node site/gen-data.mjs
// Läser js/projects.js (utan 3D-importen) och skriver site/js/projects-data.js.
import fs from 'fs';
const src = fs.readFileSync('js/projects.js', 'utf8')
  .replace(/^import [^\n]*/m, '').replace(/export const/g, 'const').replace(/WORLDS\.(\w+)/g, "'$1'");
const { PROJECTS } = new Function(src + '; return {PROJECTS};')();
const cat = { hub: 'Technical Art', techart: 'Technical Art', art: 'Art', prog: 'Programming' };
const out = PROJECTS.map(p => {
  const base = (p.media || '').split('/').pop().replace(/\.\w+$/, '');
  const isVideo = !!p.media && /\.(mp4|webm)$/.test(p.media);
  const poster = fs.existsSync(`assets/posters/${base}.jpg`) ? `../assets/posters/${base}.jpg` : null;
  return {
    id: p.content.split('/').pop().replace('.html', ''),
    title: p.title, category: cat[p.world], featured: p.world === 'hub',
    freelance: p.category.startsWith('★'),
    tags: p.category.replace('★ ', '').split(' · ').filter(t => t !== 'Freelance'),
    poster, video: isVideo ? `../${p.media}` : null,
    still: !isVideo && p.media ? `../${p.media}` : null,
    url: p.url, content: `../${p.content}`, phone: !!p.phone,
  };
});
fs.writeFileSync('site/js/projects-data.js',
  `// Genererad av site/gen-data.mjs från js/projects.js. Kör om skriptet när listan ändras.\nexport const PROJECTS = ${JSON.stringify(out, null, 2)};\n`);
console.log(out.length, 'projekt,', out.filter(o => !o.poster).length, 'utan poster');
