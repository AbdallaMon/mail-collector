import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const learningDir = path.join(rootDir, "docs", "learning");
const languages = ["en", "ar"];
const shouldFixLinks = process.argv.includes("--fix-links");
let repairedLinkCount = 0;

async function walkMarkdownFiles(directory, baseDirectory = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath, baseDirectory)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(baseDirectory, absolutePath));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findRepairedTarget({ absolutePath, target }) {
  if (!target.startsWith(".")) return null;

  const [pathOnly, anchor] = target.split("#", 2);
  let candidatePath = pathOnly;
  for (let depth = 0; depth < 3; depth += 1) {
    candidatePath = `../${candidatePath}`;
    const resolvedPath = path.resolve(path.dirname(absolutePath), candidatePath);
    if (await pathExists(resolvedPath)) {
      return `${candidatePath}${anchor ? `#${anchor}` : ""}`;
    }
  }
  return null;
}

function normalizeMarkdownTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

function hasLearningSection(markdown, language) {
  const pattern =
    language === "ar"
      ? /^##\s+.*(?:للتعمق|للتعمّق|ابحث عن|مصادر للتعلم)/im
      : /^##\s+.*(?:learn more|further learning|what to search|sources)/im;
  return pattern.test(markdown);
}

function hasExplicitLearningGuide(markdown, language) {
  if (language === "ar") {
    return (
      /\*\*اسم الموضوع:\*\*/i.test(markdown) &&
      /\*\*ابحث عن:\*\*/i.test(markdown) &&
      /\*\*مصادر (?:موثوقة|للتعلم):\*\*/i.test(markdown)
    );
  }

  return (
    /\*\*Topic name:\*\*/i.test(markdown) &&
    /\*\*Search for:\*\*/i.test(markdown) &&
    /\*\*Recommended sources:\*\*/i.test(markdown)
  );
}

const filesByLanguage = {};
for (const language of languages) {
  filesByLanguage[language] = await walkMarkdownFiles(
    path.join(learningDir, language),
  );
}

const errors = [];
const enFiles = new Set(filesByLanguage.en);
const arFiles = new Set(filesByLanguage.ar);

for (const relativePath of enFiles) {
  if (!arFiles.has(relativePath)) {
    errors.push(`Missing Arabic pair: ${relativePath}`);
  }
}
for (const relativePath of arFiles) {
  if (!enFiles.has(relativePath)) {
    errors.push(`Missing English pair: ${relativePath}`);
  }
}

for (const language of languages) {
  for (const relativePath of filesByLanguage[language]) {
    const absolutePath = path.join(learningDir, language, relativePath);
    const markdown = await fs.readFile(absolutePath, "utf8");
    let updatedMarkdown = markdown;
    const displayPath = path.relative(rootDir, absolutePath);

    if (!/^#\s+\S/m.test(markdown)) {
      errors.push(`Missing H1: ${displayPath}`);
    }
    if (!/https?:\/\//i.test(markdown)) {
      errors.push(`No external source: ${displayPath}`);
    }
    if (!hasLearningSection(markdown, language)) {
      errors.push(`No further-learning/search section: ${displayPath}`);
    }
    if (!hasExplicitLearningGuide(markdown, language)) {
      errors.push(`Incomplete topic/search/source guide: ${displayPath}`);
    }

    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
    const prose = markdown.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
    for (const match of prose.matchAll(linkPattern)) {
      const target = normalizeMarkdownTarget(match[1]);
      if (
        !target ||
        target.startsWith("#") ||
        target.startsWith("/") ||
        /^(https?:|mailto:)/i.test(target)
      ) {
        continue;
      }

      const pathOnly = target.split("#")[0];
      const resolvedPath = path.resolve(path.dirname(absolutePath), pathOnly);
      if (!(await pathExists(resolvedPath))) {
        if (shouldFixLinks) {
          const repairedTarget = await findRepairedTarget({
            absolutePath,
            target,
          });
          if (repairedTarget) {
            updatedMarkdown = updatedMarkdown.replace(
              `](${match[1]})`,
              `](${repairedTarget})`,
            );
            repairedLinkCount += 1;
            continue;
          }
        }
        errors.push(`Broken local link: ${displayPath} -> ${target}`);
      }
    }

    if (updatedMarkdown !== markdown) {
      await fs.writeFile(absolutePath, updatedMarkdown, "utf8");
    }
  }
}

console.log(
  `Learning docs: ${filesByLanguage.en.length} EN + ${filesByLanguage.ar.length} AR`,
);
if (repairedLinkCount) {
  console.log(`Repaired local links: ${repairedLinkCount}`);
}

if (errors.length) {
  console.error(`Validation errors (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Learning docs structure and local links are valid.");
}
