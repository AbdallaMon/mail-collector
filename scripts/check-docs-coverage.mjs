import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const docs = path.join(root, "docs/learning");
const errors = [];
const languages = ["ar", "en"];
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const fencePattern = /^```([^\n]*)\n([\s\S]*?)^```/gm;
const prose = (text) => text.replace(fencePattern, "");
const chapterNames = (await fs.readdir(path.join(docs, "en"))).filter(name => name.endsWith(".md"));
let examples = 0;

for (const name of chapterNames) {
  const versions = await Promise.all(languages.map(lang => fs.readFile(path.join(docs, lang, name), "utf8")));
  const blocks = versions.map(text => [...text.matchAll(fencePattern)].map(match => ({language:match[1].trim(), code:match[2].trim()})));
  if (JSON.stringify(blocks[0]) !== JSON.stringify(blocks[1])) errors.push(`Code examples differ between languages: ${name}`);
  const sections = versions.map(text => [...prose(text).matchAll(/^## /gm)].length);
  if (sections[0] !== sections[1]) errors.push(`Section counts differ: ${name}`);
  for (const block of blocks[1]) {
    try {
      if (["js", "javascript"].includes(block.language)) new vm.Script(block.code);
      if (block.language === "json") JSON.parse(block.code);
      if (block.language === "prisma" && (/@relation\([^)]*\n/.test(block.code) || /^\s*@relation/m.test(block.code))) throw new Error("Relation declaration must stay on one physical line");
      examples++;
    } catch (error) { errors.push(`Invalid ${block.language} example in ${name}: ${error.message}`); }
  }
}

const mounts = {auth:"/api/auth", accounts:"/api/accounts", dashboard:"/api/dashboard", logs:"/api/logs", webhooks:"/api/webhooks"};
const routes = ["GET /health"];
for (const [name,prefix] of Object.entries(mounts)) {
  const code = await read(`src/routes/${name}.routes.js`);
  for (const match of code.matchAll(/router\.(get|post|patch|put|delete)\(\s*["']([^"']+)["']/g)) {
    routes.push(`${match[1].toUpperCase()} ${prefix}${match[2] === "/" ? "" : match[2]}`);
  }
}
const env = new Set([...(await read("src/config/index.js")).matchAll(/process\.env\.([A-Z_]+)/g)].map(m=>m[1]));
const schema = await read("prisma/schema.prisma");
for (const match of schema.matchAll(/env\("([A-Z_]+)"\)/g)) env.add(match[1]);
const models = [...schema.matchAll(/^model (\w+)/gm)].map(m=>m[1]);
const sources = ["steam_inbound.php"];
for (const folder of ["src","public","prisma","scripts","test","local-demo"]) {
  for (const entry of await fs.readdir(path.join(root,folder), {withFileTypes:true,recursive:true})) {
    if (entry.isFile()) sources.push(path.relative(root,path.join(entry.parentPath,entry.name)).split(path.sep).join("/"));
  }
}
for (const lang of languages) {
  const api = await read(`docs/learning/${lang}/06-api-reference.md`);
  const config = await read(`docs/learning/${lang}/08-configuration-operations.md`);
  const data = await read(`docs/learning/${lang}/05-data-model.md`);
  const inventory = await read(`docs/learning/${lang}/11-source-reference.md`);
  for (const route of routes) if (!api.includes(`\`${route}\``)) errors.push(`${lang}: undocumented route ${route}`);
  for (const name of env) if (!config.includes(`\`${name}\``)) errors.push(`${lang}: undocumented environment variable ${name}`);
  for (const name of models) if (!new RegExp(`\\b${name}\\b`).test(data)) errors.push(`${lang}: undocumented model ${name}`);
  for (const file of sources) if (!inventory.includes(`](../../../${file})`)) errors.push(`${lang}: undocumented source file ${file}`);
}

// Root entrypoints must also resolve; fenced examples are not prose links.
for (const file of ["README.md","docs/README.md","docs/DIAGNOSIS.ar.md"]) {
  for (const match of prose(await read(file)).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(https?:|mailto:|\/)/i.test(target)) continue;
    try { await fs.access(path.resolve(root,path.dirname(file),decodeURIComponent(target))); }
    catch { errors.push(`Broken entrypoint link: ${file} -> ${target}`); }
  }
}
console.log(`Documentation coverage: ${chapterNames.length} pairs, ${routes.length} endpoints, ${env.size} app settings, ${models.length} models, ${sources.length} source files, ${examples} matching example blocks.`);
if (errors.length) { console.error(errors.join("\n")); process.exitCode=1; }
else console.log("Documentation coverage and bilingual examples are valid.");
