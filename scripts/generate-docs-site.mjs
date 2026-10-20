import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const docsDir = path.join(rootDir, "docs");
const sourceDir = {
  en: path.join(docsDir, "en"),
  ar: path.join(docsDir, "ar"),
};
const outDir = path.join(docsDir, "html");

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[`~!@#$%^&*()+=?\[\]{}\\|:;"'<>,./]/g, "")
    .replace(/\s+/g, "-");
}

function stripExt(fileName) {
  return fileName.replace(/\.md$/i, "");
}

function toTitleCase(fileName) {
  return stripExt(fileName)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function trimQuotes(value) {
  return value.replace(/^['\"]/, "").replace(/['\"]$/, "");
}

function parseFrontmatter(raw) {
  const text = String(raw || "").replaceAll("\r\n", "\n");
  if (!text.startsWith("---\n")) {
    return { meta: {}, body: text };
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: text };
  }

  const metaText = text.slice(4, end).trim();
  const body = text.slice(end + 5);
  const meta = {};

  for (const line of metaText.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = trimQuotes(line.slice(idx + 1).trim());
    if (!key) continue;
    meta[key] = value;
  }

  return { meta, body };
}

function headingMatch(line) {
  const m = line.match(/^(#{1,6})\s+(.*)$/);
  if (!m) return null;
  return {
    level: m[1].length,
    text: m[2].trim(),
  };
}

function tableSeparator(line) {
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line.trim());
}

function parseTable(lines, start) {
  if (!lines[start] || !lines[start + 1]) return null;
  if (!lines[start].includes("|") || !lines[start + 1].includes("|"))
    return null;
  if (!tableSeparator(lines[start + 1])) return null;

  const readRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const headers = readRow(lines[start]);
  const rows = [];
  let i = start + 2;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.includes("|") || !line.trim()) break;
    if (!/^\|?(.+\|)+.+\|?\s*$/.test(line.trim())) break;
    rows.push(readRow(line));
    i += 1;
  }

  return { block: { type: "table", headers, rows }, next: i };
}

function countIndent(line) {
  const m = line.match(/^\s*/);
  return m ? m[0].length : 0;
}

function parseList(lines, start, orderedRoot) {
  const firstIndent = countIndent(lines[start]);

  function parseItems(index, indent, ordered) {
    const items = [];
    let i = index;

    while (i < lines.length) {
      const line = lines[i];
      if (!line || !line.trim()) break;

      const m = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
      if (!m) break;

      const currentIndent = countIndent(line);
      if (currentIndent < indent) break;
      if (currentIndent > indent) break;

      const marker = m[1];
      const text = m[2].trim();
      let item = text;
      i += 1;

      if (i < lines.length) {
        const next = lines[i];
        const nextMatch = next ? next.match(/^\s*([-*+]|\d+\.)\s+(.*)$/) : null;
        if (nextMatch) {
          const nextIndent = countIndent(next);
          if (nextIndent > currentIndent) {
            const childOrdered = /\d+\./.test(nextMatch[1]);
            const child = parseItems(i, nextIndent, childOrdered);
            item = { text, children: child.items, ordered: childOrdered };
            i = child.next;
          }
        }
      }

      items.push(item);
    }

    return { items, next: i, ordered };
  }

  const parsed = parseItems(start, firstIndent, orderedRoot);
  return {
    block: {
      type: parsed.ordered ? "ordered-list" : "list",
      items: parsed.items,
    },
    next: parsed.next,
  };
}

function parseBlockquote(lines, start) {
  const content = [];
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(/^\s*>\s?(.*)$/);
    if (!m) break;
    content.push(m[1]);
    i += 1;
  }

  const text = content.join(" ").trim();
  const note =
    text.match(/^\[!NOTE\]\s*(.*)$/i) || text.match(/^NOTE:\s*(.*)$/i);
  if (note) {
    return { block: { type: "note", text: note[1].trim() }, next: i };
  }

  const warning =
    text.match(/^\[!WARNING\]\s*(.*)$/i) || text.match(/^WARNING:\s*(.*)$/i);
  if (warning) {
    return { block: { type: "warning", text: warning[1].trim() }, next: i };
  }

  return { block: { type: "paragraph", text }, next: i };
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] || "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = headingMatch(line);
    if (heading) {
      // Preserve only deep headings inside content blocks.
      if (heading.level >= 4) {
        blocks.push({ type: "paragraph", text: `**${heading.text}**` });
      }
      i += 1;
      continue;
    }

    if (/^(```)(\w+)?\s*$/.test(line.trim())) {
      const lang = line.trim().replace(/```/, "").trim();
      i += 1;
      const code = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({
        type: "code",
        language: lang || undefined,
        content: code.join("\n"),
      });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "divider" });
      i += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const parsed = parseBlockquote(lines, i);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    const table = parseTable(lines, i);
    if (table) {
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const parsed = parseList(lines, i, Boolean(ol));
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      const maybeHeading = headingMatch(lines[i]);
      if (maybeHeading) break;
      if (/^(```)(\w+)?\s*$/.test(lines[i].trim())) break;
      if (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i])) break;
      if (lines[i].trim().startsWith(">")) break;
      if (parseTable(lines, i)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())) break;
      paragraph.push(lines[i].trim());
      i += 1;
    }

    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      continue;
    }

    i += 1;
  }

  return blocks;
}

function findHeadingIndices(lines, level) {
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const h = headingMatch(lines[i]);
    if (!h || h.level !== level) continue;
    rows.push({ line: i, text: h.text });
  }
  return rows;
}

function isNumberedTitle(title) {
  return /^[\d٠-٩]/.test((title || "").trim());
}

function parseSectionContent(lines) {
  const h3 = findHeadingIndices(lines, 3);
  if (!h3.length) {
    return parseBlocks(lines);
  }

  const blocks = [];
  const firstH3 = h3[0].line;
  if (firstH3 > 0) {
    const introBlocks = parseBlocks(lines.slice(0, firstH3));
    blocks.push(...introBlocks);
  }

  const subsectionItems = [];
  for (let i = 0; i < h3.length; i += 1) {
    const current = h3[i];
    const next = h3[i + 1];
    const from = current.line + 1;
    const to = next ? next.line : lines.length;
    const subLines = lines.slice(from, to);
    subsectionItems.push({
      title: current.text,
      blocks: parseBlocks(subLines),
    });
  }

  blocks.push({ type: "subsections", items: subsectionItems });
  return blocks;
}

function cleanSectionId(title) {
  const cleaned = String(title || "")
    .replace(/^\d+[\.)]\s*/, "")
    .replace(/^\d+\.\d+\s*/, "")
    .trim();
  return slugify(cleaned || title || "section");
}

function parseMarkdownDocument(raw, fileName, lang) {
  const { meta, body } = parseFrontmatter(raw);
  const lines = body.replaceAll("\r\n", "\n").split("\n");

  const h1 = findHeadingIndices(lines, 1);
  const h2 = findHeadingIndices(lines, 2);

  const heroTitle =
    meta.heroTitle || (h1[0] ? h1[0].text : toTitleCase(fileName));
  let subtitle = meta.subtitle || "";

  if (!subtitle && h1.length > 1) {
    subtitle = h1[1].text;
  }

  const startSectionOffset = h2.length && !isNumberedTitle(h2[0].text) ? 1 : 0;
  if (!subtitle && h2.length && startSectionOffset === 1) {
    subtitle = h2[0].text;
  }

  const sectionHeaders = h2.slice(startSectionOffset);

  const firstSectionLine = sectionHeaders.length
    ? sectionHeaders[0].line
    : lines.length;
  const contentStartLine =
    h1.length > 1 ? h1[1].line + 1 : h1.length ? h1[0].line + 1 : 0;
  const prefaceLines = lines.slice(contentStartLine, firstSectionLine);
  const prefaceBlocks = parseBlocks(prefaceLines);
  const overviewBlock = prefaceBlocks.find(
    (block) => block.type === "paragraph",
  );

  const sections = sectionHeaders.map((section, index) => {
    const next = sectionHeaders[index + 1];
    const from = section.line + 1;
    const to = next ? next.line : lines.length;
    const sectionLines = lines.slice(from, to);
    const sectionNum = index + 1;

    return {
      id: cleanSectionId(section.text),
      kicker: lang === "ar" ? `Section ${sectionNum}` : `Section ${sectionNum}`,
      title: section.text,
      blocks: parseSectionContent(sectionLines),
    };
  });

  // If there are no ## sections (e.g. doc uses bold headings or flat structure),
  // wrap all content as one implicit section so nothing is lost.
  const finalSections =
    sections.length > 0
      ? sections
      : prefaceBlocks.length > 0
        ? [
            {
              id: "content",
              kicker: lang === "ar" ? "المحتوى" : "Content",
              title: toTitleCase(fileName),
              blocks: prefaceBlocks,
            },
          ]
        : [];

  const title = meta.title || toTitleCase(fileName);
  const fallbackOverview = finalSections.length
    ? findFirstParagraph(finalSections[0].blocks || [])
    : "";

  return {
    title,
    heroTitle,
    subtitle,
    overview:
      meta.overview || (overviewBlock ? overviewBlock.text : fallbackOverview),
    category: meta.category || "Documentation",
    // preface = blocks that appear before the first ## section (intro content)
    preface: sections.length > 0 ? prefaceBlocks : [],
    sections: finalSections,
  };
}

function safeDescription(text, max = 170) {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "No summary available.";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function findFirstParagraph(blocks) {
  for (const block of blocks || []) {
    if (!block) continue;

    if (block.type === "paragraph" && block.text && block.text.trim()) {
      return block.text.trim();
    }

    if (block.type === "subsections" && Array.isArray(block.items)) {
      for (const item of block.items) {
        const nested = findFirstParagraph(item.blocks || []);
        if (nested) return nested;
      }
    }
  }

  return "";
}

// ─── HTML Rendering ───────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(text) {
  // Protect literal identifiers before applying Markdown emphasis.
  const inlineCodes = [];
  const withPlaceholders = String(text || "").replace(/`([^`]+)`/g, (_match, code) => {
    inlineCodes.push(code);
    return `\u0000CODE${inlineCodes.length - 1}\u0000`;
  });
  // Strip markdown backslash escapes (\- \. \( \) etc.) before HTML-escaping
  const unescaped = withPlaceholders.replace(
    /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,
    "$1",
  );
  return escapeHtml(unescaped)
    // Markdown links [label](target). `.md` doc links are rewritten to the
    // generated `.html` page at build time (see rewriteInternalDocLinks), so
    // by the time we render we only ever see:
    //   • http(s)/mailto → external link (opens in a new tab)
    //   • .html or #anchor → in-site navigation link
    //   • anything else (source-file paths, folders, unresolved .md) →
    //     render the label as plain text so the static site never emits a
    //     broken relative link.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, target) => {
      const t = target.trim();
      if (/^(https?:|mailto:)/i.test(t)) {
        return `<a class="external-link" href="${t}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`;
      }
      if (/\.html(#[^\s]*)?$/i.test(t) || /^#/.test(t)) {
        return `<a href="${t}">${label}</a>`;
      }
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(^|[^\p{L}\p{N}])_([^_\n]+)_(?=$|[^\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => `<code>${escapeHtml(inlineCodes[Number(index)])}</code>`);
}

function renderListHtml(items, ordered) {
  const tag = ordered ? "ol" : "ul";
  const inner = items
    .map((item) => {
      if (typeof item === "string") {
        return `<li>${renderInline(item)}</li>`;
      }
      if (item && typeof item === "object") {
        const content = item.text ? renderInline(item.text) : "";
        const children =
          Array.isArray(item.children) && item.children.length
            ? renderListHtml(item.children, !!item.ordered)
            : "";
        return `<li>${content}${children}</li>`;
      }
      return "";
    })
    .join("");
  return `<${tag}>${inner}</${tag}>`;
}

function renderTableHtml(table) {
  const headers = (table.headers || [])
    .map((h) => `<th>${renderInline(h)}</th>`)
    .join("");
  const rows = (table.rows || [])
    .map((row) => {
      const cells = row
        .map((cell) => `<td>${renderInline(cell)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrapper"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderBlockHtml(block) {
  if (!block) return "";
  switch (block.type) {
    case "paragraph":
      return `<p>${renderInline(block.text || "")}</p>`;
    case "list":
      return renderListHtml(block.items || [], false);
    case "ordered-list":
      return renderListHtml(block.items || [], true);
    case "code": {
      const lang = block.language
        ? ` data-language="${escapeHtml(block.language)}"`
        : "";
      return (
        `<div class="code-block-wrap">` +
        `<button class="copy-btn" type="button">Copy</button>` +
        `<pre class="code-block"${lang}><code>${escapeHtml(block.content || "")}</code></pre>` +
        `</div>`
      );
    }
    case "table":
      return renderTableHtml(block);
    case "note":
      return `<div class="note-box"><p>${renderInline(block.text || "")}</p></div>`;
    case "warning":
      return `<div class="warning-box"><p>${renderInline(block.text || "")}</p></div>`;
    case "divider":
      return "<hr />";
    case "subsections":
      return (
        `<div class="subsection-list">` +
        (block.items || [])
          .map(
            (item) =>
              `<section class="subsection-card">` +
              (item.title ? `<h3>${escapeHtml(item.title)}</h3>` : "") +
              (item.blocks || [])
                .map(
                  (b) =>
                    `<div class="content-block">${renderBlockHtml(b)}</div>`,
                )
                .join("") +
              `</section>`,
          )
          .join("") +
        `</div>`
      );
    default:
      return "";
  }
}

function renderBlocksHtml(blocks) {
  return (blocks || [])
    .map((b) => `<div class="content-block">${renderBlockHtml(b)}</div>`)
    .join("");
}

// Pull a leading "1." / "٢)" style number off a section title so we can show
// it as a badge and keep the heading text clean. Falls back to the sequential
// index when the title isn't numbered. A bare "404 ..." (digits + space, no
// separator) is NOT treated as a number so real content isn't eaten.
function splitLeadingNumber(title, fallback) {
  const m = String(title || "").match(
    /^\s*([0-9٠-٩]+)\s*[.)\-:،]\s*(.*)$/,
  );
  if (m && m[1]) {
    return { num: m[1], rest: (m[2] || "").trim() };
  }
  return { num: String(fallback), rest: String(title || "").trim() };
}

function renderSectionHtml(section, index) {
  const id = section.id || slugify(section.title || `section-${index}`);
  const { num, rest } = splitLeadingNumber(section.title, index + 1);
  const heading = rest || section.title || "";
  return `
    <section class="doc-section" id="${escapeHtml(id)}" data-searchable>
      <div class="section-card">
        <div class="section-header">
          <span class="section-num" aria-hidden="true">${escapeHtml(String(num))}</span>
          <h2>${renderInline(heading)}</h2>
        </div>
        ${renderBlocksHtml(section.blocks || [])}
      </div>
    </section>`;
}

// Left-rail navigation for a doc page: the contents of the doc's OWN folder
// (sibling docs + sub-folders), so you hop between topics in the same group.
// Each item is { label, href, active, isFolder }. The "on this page" TOC lives
// in its own right-hand rail (see renderDocPage) so in-page navigation and
// cross-page navigation stay visually separate.
function buildSidebarHtml(navItems, label) {
  const items = (navItems || [])
    .map((it) => {
      const cls = it.active ? ' class="active" aria-current="page"' : "";
      const icon = it.isFolder ? "📁 " : "";
      return `<li><a href="${escapeHtml(it.href)}"${cls}>${icon}${escapeHtml(it.label)}</a></li>`;
    })
    .join("");
  return `
    <div class="sidebar-group">
      <p class="sidebar-label">${escapeHtml(label || "")}</p>
      <ul class="sidebar-list">${items}</ul>
    </div>`;
}

// Breadcrumb trail (section root → … → current). `crumbs`: [{ label, href }];
// any crumb without an href (typically the last/current one) renders as plain
// text instead of a link.
function breadcrumbHtml(crumbs) {
  if (!crumbs || !crumbs.length) return "";
  const parts = crumbs.map((c) =>
    c.href
      ? `<a class="crumb" href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
      : `<span class="crumb current">${escapeHtml(c.label)}</span>`,
  );
  return `<nav class="breadcrumb">${parts.join(
    '<span class="crumb-sep">›</span>',
  )}</nav>`;
}

function renderDocPage(data, options = {}) {
  const lang = data.lang || "en";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const isAr = lang === "ar";
  const assetsPrefix = options.assetsPrefix || "../";
  // Home = docs/html root index (lists every section).
  const homeHref = options.homeHref || `${assetsPrefix}index.html`;
  // "This section" = the section's root folder index page.
  const sectionHref = options.sectionHref || "index.html";
  // Pre-built breadcrumb trail + folder-local sidebar (computed in buildSection
  // where the folder tree is known).
  const breadcrumb = options.breadcrumbHtml || "";
  const sidebarHtml = options.sidebarHtml || "";

  const hasAlternate = data.alternate && data.alternate.hasOther;
  const alternateHref = isAr ? data.alternate.enFile : data.alternate.arFile;
  const alternateLabel = isAr ? "English" : "العربية";

  const langBtn = hasAlternate
    ? `<a class="primary-btn" href="${escapeHtml(alternateHref)}">${alternateLabel}</a>`
    : "";

  const prefaceHtml =
    data.preface && data.preface.length
      ? `<div class="doc-preface section-card">${renderBlocksHtml(data.preface)}</div>`
      : "";

  const sectionsHtml = (data.sections || [])
    .map((s, i) => renderSectionHtml(s, i))
    .join("");

  const tocJson = JSON.stringify(
    (data.sections || []).map((s, i) => ({
      id: s.id || slugify(s.title || `section-${i}`),
      title: s.title || "",
    })),
  );

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(data.title)}</title>
    <link rel="stylesheet" href="${escapeHtml(`${assetsPrefix}shared.css`)}" />
  </head>
  <body>
    <a class="skip-link" href="#docMain">${isAr ? "انتقل إلى المحتوى" : "Skip to content"}</a>
    <div class="doc-topbar">
      <div>
        <p class="eyebrow">${isAr ? "توثيق المشروع" : "Project Documentation"}</p>
        <h1>${escapeHtml(data.title)}</h1>
        <p class="lead">${escapeHtml(data.subtitle || "")}</p>
      </div>
      <div class="topbar-actions">
        <input
          id="docSearch"
          class="doc-search"
          type="search"
          aria-label="${isAr ? "ابحث داخل المستند" : "Search this document"}"
          placeholder="${isAr ? "ابحث داخل المستند..." : "Search this document..."}"
        />
        <button id="navToggle" class="nav-toggle" type="button" aria-controls="docSidebar" aria-expanded="false" aria-label="${isAr ? "القائمة" : "Menu"}">
          ☰ <span class="btn-label">${isAr ? "القائمة" : "Menu"}</span>
        </button>
        <a class="home-btn" href="${escapeHtml(homeHref)}">
          ⌂ <span class="btn-label">${isAr ? "الرئيسية" : "Home"}</span>
        </a>
        <a class="ghost-btn" href="${escapeHtml(sectionHref)}">
          ${isAr ? "هذا القسم" : "This section"}
        </a>
        ${langBtn}
      </div>
    </div>

    <div class="doc-layout" id="docLayout">
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <aside class="doc-sidebar" id="docSidebar" aria-label="${isAr ? "المستندات" : "Documents"}">
        <button class="sidebar-close" id="sidebarClose" type="button">${isAr ? "إغلاق القائمة" : "Close menu"} ×</button>
        ${sidebarHtml}
      </aside>
      <aside class="doc-toc" id="docToc" aria-label="${isAr ? "التنقل داخل الصفحة" : "On this page"}">
        <p class="sidebar-label">${isAr ? "في هذه الصفحة" : "On this page"}</p>
        <ul class="toc-list" id="tocList"></ul>
      </aside>
      <main class="doc-main" id="docMain" tabindex="-1">
        <div class="doc-main-inner">
          ${breadcrumb}
          <section class="doc-hero">
            <h2>${renderInline(data.heroTitle || data.title)}</h2>
            <div class="doc-meta">
              <span class="meta-chip">
                ${isAr ? "اللغة: العربية" : "Language: English"}
              </span>
              <span class="meta-chip">
                ${escapeHtml(data.category || (isAr ? "توثيق فني" : "Technical Documentation"))}
              </span>
            </div>
          </section>

          ${(data.sections || []).length ? `<details class="mobile-toc"><summary>${isAr ? "في هذه الصفحة" : "On this page"}</summary><ul class="toc-list">${JSON.parse(tocJson).map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></li>`).join("")}</ul></details>` : ""}

          ${prefaceHtml}

          ${sectionsHtml}

          <footer class="doc-footer">
            ${
              isAr
                ? "تم توليد هذه الصفحة تلقائياً من ملفات Markdown."
                : "This page is generated automatically from Markdown source files."
            }
          </footer>
        </div>
      </main>
    </div>

    <script>window._TOC = ${tocJson};</script>
    <script src="${escapeHtml(`${assetsPrefix}interactive.js`)}"></script>
  </body>
</html>`;
}

function renderIndexPage(registry, options = {}) {
  const assetsPrefix = options.assetsPrefix || "./";
  const cards = registry
    .map((doc) => {
      const enHref = `./pages/${doc.files.en.replace(/^\.\//, "")}`;
      const arHref = `./pages/${doc.files.ar.replace(/^\.\//, "")}`;
      const titleEn = escapeHtml(doc.title.en);
      const titleAr =
        doc.title.ar !== doc.title.en ? escapeHtml(doc.title.ar) : "";
      const desc = escapeHtml(doc.description.en || "No summary available.");
      const enBtn = doc.hasEn
        ? `<a class="btn-en" href="${escapeHtml(enHref)}">English</a>`
        : "";
      const arBtn = doc.hasAr
        ? `<a class="btn-ar" href="${escapeHtml(arHref)}">Arabic / عربي</a>`
        : "";

      return `
      <article class="doc-card">
        <div class="doc-card-title">${titleEn}</div>
        ${titleAr ? `<div class="doc-card-title doc-card-title-ar">${titleAr}</div>` : ""}
        <p class="doc-card-desc">${desc}</p>
        <div class="doc-card-actions">${enBtn}${arBtn}</div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Documentation</title>
    <link rel="stylesheet" href="${escapeHtml(`${assetsPrefix}shared.css`)}" />
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <div>
          <p class="eyebrow">Mail Collector</p>
          <h1>Project Documentation</h1>
          <p class="lead">Technical documentation generated automatically from Markdown source files.</p>
          <div class="build-actions">
            <button class="primary-btn" id="buildBtn" type="button">Rebuild Docs</button>
            <span id="buildStatus" role="status"></span>
          </div>
        </div>
      </header>
      <main class="doc-grid">
        ${cards}
      </main>
    </div>
    <script>
      (function () {
        var btn = document.getElementById("buildBtn");
        var status = document.getElementById("buildStatus");
        if (!btn) return;
        btn.addEventListener("click", function () {
          btn.disabled = true;
          if (status) status.textContent = "Building...";
          fetch("/api/build-docs", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (payload) {
              if (status) status.textContent = payload.message || "Done. Reloading...";
              setTimeout(function () { window.location.reload(); }, 600);
            })
            .catch(function () {
              if (status) status.textContent = "Build failed. Is the server running? (npm run docs:serve)";
              btn.disabled = false;
            });
        });
      })();
    </script>
  </body>
</html>`;
}

// A card linking to a sub-folder's own index page.
function folderCardHtml(label, href, count) {
  const meta = `${count} ${count === 1 ? "item" : "items"}`;
  return `
      <a class="folder-card" href="${escapeHtml(href)}">
        <span class="folder-card-icon">📁</span>
        <span class="folder-card-body">
          <span class="folder-card-title">${escapeHtml(label)}</span>
          <span class="folder-card-meta">${escapeHtml(meta)}</span>
        </span>
        <span class="folder-card-arrow">→</span>
      </a>`;
}

// A card for a single doc, with the available language buttons.
function docCardHtml({ titleEn, titleAr, desc, enHref, arHref }) {
  const titleArHtml =
    titleAr && titleAr !== titleEn
      ? `<div class="doc-card-title doc-card-title-ar">${escapeHtml(titleAr)}</div>`
      : "";
  const enBtn = enHref
    ? `<a class="btn-en" href="${escapeHtml(enHref)}">English</a>`
    : "";
  const arBtn = arHref
    ? `<a class="btn-ar" href="${escapeHtml(arHref)}">Arabic / عربي</a>`
    : "";
  return `
      <article class="doc-card">
        <div class="doc-card-title">${escapeHtml(titleEn)}</div>
        ${titleArHtml}
        <p class="doc-card-desc">${escapeHtml(desc || "")}</p>
        <div class="doc-card-actions">${enBtn}${arBtn}</div>
      </article>`;
}

// A folder index page: breadcrumb + Home button + a grid of child cards
// (sub-folders link to their own index; docs show language buttons). One of
// these is generated for the section root AND for every sub-folder, at any
// depth — that's what produces "links inside links inside links".
function renderFolderIndexPage(opts = {}) {
  const assetsPrefix = opts.assetsPrefix || "./";
  const homeHref = opts.homeHref || `${assetsPrefix}index.html`;
  const breadcrumb = opts.breadcrumbHtml || "";
  const title = opts.title || "Documentation";
  const subtitle = opts.subtitle || "";
  const cards = opts.cardsHtml || "";
  const empty = opts.empty
    ? `<p class="lead">No documents in this folder yet.</p>`
    : "";
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${escapeHtml(`${assetsPrefix}shared.css`)}" />
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <div>
          ${breadcrumb}
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        <div class="header-actions">
          <a class="home-btn" href="${escapeHtml(homeHref)}">⌂ <span class="btn-label">Home</span></a>
        </div>
      </header>
      ${empty}
      <main class="card-grid">
        ${cards}
      </main>
    </div>
  </body>
</html>`;
}

function formatPhaseLabel(phaseName) {
  return phaseName
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function renderRootIndexPage(phases) {
  const cards = phases
    .map((phase) => {
      const docsCount = Number(phase.docsCount || 0);
      const langLabel =
        phase.hasEn && phase.hasAr
          ? "Arabic + English"
          : phase.hasAr
            ? "Arabic"
            : phase.hasEn
              ? "English"
              : "No docs";

      return `
      <article class="doc-card">
        <div class="doc-card-title">${escapeHtml(phase.label)}</div>
        <p class="doc-card-desc">${escapeHtml(`${docsCount} document(s) • ${langLabel}`)}</p>
        <div class="doc-card-actions">
          <a class="btn-en" href="./${escapeHtml(phase.name)}/index.html">Browse documents</a>
        </div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Documentation</title>
    <link rel="stylesheet" href="./shared.css" />
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <div>
          <p class="eyebrow">Mail Collector</p>
          <h1>Project Documentation</h1>
          <p class="lead">Browse project guides, technical references, and learning resources in Arabic and English.</p>
          <div class="build-actions">
            <button class="primary-btn" id="buildBtn" type="button">Rebuild Docs</button>
            <span id="buildStatus" role="status"></span>
          </div>
        </div>
      </header>
      <main class="doc-grid">
        ${cards}
      </main>
    </div>
    <script>
      (function () {
        var btn = document.getElementById("buildBtn");
        var status = document.getElementById("buildStatus");
        if (!btn) return;
        btn.addEventListener("click", function () {
          btn.disabled = true;
          if (status) status.textContent = "Building...";
          fetch("/api/build-docs", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (payload) {
              if (status) status.textContent = payload.message || "Done. Reloading...";
              setTimeout(function () { window.location.reload(); }, 600);
            })
            .catch(function () {
              if (status) status.textContent = "Build failed. Is the server running? (npm run docs:serve)";
              btn.disabled = false;
            });
        });
      })();
    </script>
  </body>
</html>`;
}

function interactiveJsContent() {
  return String.raw`(function () {
  "use strict";

  var navToggle = document.getElementById("navToggle");
  var docLayout = document.getElementById("docLayout");
  var sidebar = document.getElementById("docSidebar");
  var sidebarClose = document.getElementById("sidebarClose");
  var sidebarOverlay = document.getElementById("sidebarOverlay");
  var topbar = document.querySelector(".doc-topbar");
  var main = document.getElementById("docMain");
  var tocRail = document.getElementById("docToc");
  var mobile = window.matchMedia("(max-width: 1024px)");
  var isAr = document.documentElement.lang === "ar";

  function measureTopbar() {
    if (topbar) document.documentElement.style.setProperty("--topbar-height", topbar.offsetHeight + "px");
  }
  measureTopbar();
  if (topbar && "ResizeObserver" in window) new ResizeObserver(measureTopbar).observe(topbar);
  window.addEventListener("resize", measureTopbar);

  function syncNavigation() {
    if (!docLayout || !sidebar || !navToggle) return;
    var drawerOpen = mobile.matches && docLayout.classList.contains("is-nav-visible");
    var expanded = mobile.matches ? drawerOpen : !docLayout.classList.contains("is-nav-hidden");
    navToggle.setAttribute("aria-expanded", String(expanded));
    sidebar.inert = !expanded;
    document.body.classList.toggle("is-drawer-open", drawerOpen);
    [topbar, main, tocRail].forEach(function (node) { if (node) node.inert = drawerOpen; });
    if (drawerOpen) {
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
    } else {
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
    }
  }
  function closeDrawer() {
    if (!docLayout) return;
    var wasOpen = docLayout.classList.contains("is-nav-visible");
    docLayout.classList.remove("is-nav-visible");
    syncNavigation();
    if (wasOpen && navToggle) navToggle.focus();
  }
  if (navToggle && docLayout) {
    navToggle.addEventListener("click", function () {
      docLayout.classList.toggle(mobile.matches ? "is-nav-visible" : "is-nav-hidden");
      syncNavigation();
      if (mobile.matches && sidebarClose) sidebarClose.focus();
    });
  }
  if (sidebarClose) sidebarClose.addEventListener("click", closeDrawer);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeDrawer);
  mobile.addEventListener("change", function () {
    closeDrawer();
    syncNavigation();
  });
  document.addEventListener("keydown", function (event) {
    if (!mobile.matches || !docLayout || !docLayout.classList.contains("is-nav-visible")) return;
    if (event.key === "Escape") closeDrawer();
    if (event.key === "Tab") {
      var targets = sidebar.querySelectorAll("a[href], button:not([disabled])");
      var first = targets[0];
      var last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  syncNavigation();

  var tocList = document.getElementById("tocList");
  var tocData = window._TOC || [];
  if (tocRail && !tocData.length) tocRail.hidden = true;
  if (tocList && tocData.length) {
    tocData.forEach(function (item) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.setAttribute("href", "#" + item.id);
      link.textContent = item.title;
      li.appendChild(link);
      tocList.appendChild(li);
    });
    if ("IntersectionObserver" in window) {
      var tocLinks = document.querySelectorAll(".toc-list a");
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          tocLinks.forEach(function (link) {
            var active = link.getAttribute("href") === "#" + entry.target.id;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        });
      }, { rootMargin: "-15% 0px -65% 0px", threshold: 0 });
      document.querySelectorAll(".doc-section[id]").forEach(function (section) { observer.observe(section); });
    }
  }
  document.querySelectorAll(".mobile-toc a").forEach(function (link) {
    link.addEventListener("click", function () {
      var details = link.closest("details");
      details.open = false;
      details.querySelector("summary").focus({ preventScroll: true });
    });
  });

  // Highlight text nodes only, preserving links, IDs, and copy listeners.
  var searchInput = document.getElementById("docSearch");
  if (searchInput && main) {
    searchInput.addEventListener("input", function () {
      main.querySelectorAll("mark[data-search-match]").forEach(function (mark) {
        var parent = mark.parentNode;
        mark.replaceWith(document.createTextNode(mark.textContent));
        parent.normalize();
      });
      var query = searchInput.value.trim().toLocaleLowerCase();
      if (!query) return;
      main.querySelectorAll(".doc-hero h2, .section-header h2, .content-block").forEach(function (block) {
        // Nested subsection blocks are handled by their outer content block.
        if (block.parentElement.closest(".content-block")) return;
        var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            return node.parentElement.closest("button, script, style, mark") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
          var text = node.textContent;
          var lower = text.toLocaleLowerCase();
          if (!lower.includes(query)) return;
          var fragment = document.createDocumentFragment();
          var cursor = 0;
          var index = lower.indexOf(query);
          while (index !== -1) {
            fragment.appendChild(document.createTextNode(text.slice(cursor, index)));
            var mark = document.createElement("mark");
            mark.dataset.searchMatch = "";
            mark.textContent = text.slice(index, index + query.length);
            fragment.appendChild(mark);
            cursor = index + query.length;
            index = lower.indexOf(query, cursor);
          }
          fragment.appendChild(document.createTextNode(text.slice(cursor)));
          node.replaceWith(fragment);
        });
      });
    });
  }

  // The Clipboard API requires HTTPS (except localhost); LAN HTTP uses a fallback.
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (_) { /* Try legacy copy below. */ }
    }
    var field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
    field.setAttribute("readonly", "");
    document.body.appendChild(field);
    var previous = document.activeElement;
    field.select();
    try {
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    } finally {
      field.remove();
      if (previous) previous.focus({ preventScroll: true });
    }
  }
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    var label = isAr ? "نسخ" : "Copy";
    btn.textContent = label;
    btn.setAttribute("aria-live", "polite");
    btn.addEventListener("click", async function () {
      var code = btn.parentElement.querySelector("code");
      if (!code) return;
      try { await copyText(code.textContent); btn.textContent = isAr ? "تم النسخ" : "Copied!"; }
      catch (_) { btn.textContent = isAr ? "تعذر النسخ" : "Copy failed"; }
      setTimeout(function () { btn.textContent = label; }, 2000);
    });
  });
})();
`;
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readMarkdownFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /\.md$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function dirExists(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// Recursively collect every .md file under `dir`, returning POSIX-style
// relative paths from `baseDir` (e.g. "backend/01-pdf-lib.md"). This is what
// lets a folder like docs/learning — which nests its docs under backend/ and
// frontend/ — be picked up in full, not just the files sitting at its root.
async function readMarkdownFilesRecursive(dir, baseDir = dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await readMarkdownFilesRecursive(full, baseDir)));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push(path.relative(baseDir, full).split(path.sep).join("/"));
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// Collapse "./" and "../" segments in a POSIX path without touching the disk.
function posixNormalize(value) {
  const parts = [];
  for (const seg of String(value).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

// A doc's stable id is its relative path (minus extension) with slashes
// folded to dashes, slugified. Flat docs keep their old key (e.g.
// "prisma-schema-plan"), nested docs get a collision-free one
// ("backend-01-pdf-lib") so two README.md files never overwrite each other.
function makeDocKey(relPathNoExt) {
  return slugify(relPathNoExt.split("/").join("-"));
}

// POSIX dirname for a section-relative path ("" for a top-level file).
function posixDirname(rel) {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

// Relative href from a page in directory `fromDir` (section-root relative,
// "" = section root) to a target file `toRel` (section-root relative). Both
// use "/" separators. This is what makes links work at any nesting depth.
function relFromTo(fromDir, toRel) {
  const fromParts = fromDir ? fromDir.split("/") : [];
  const toParts = toRel.split("/");
  const toFile = toParts.pop();
  let i = 0;
  while (
    i < fromParts.length &&
    i < toParts.length &&
    fromParts[i] === toParts[i]
  )
    i++;
  const ups = fromParts.slice(i).map(() => "..");
  const downs = toParts.slice(i);
  const rel = [...ups, ...downs, toFile].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

// Relative href to a folder's index.html (folderRel "" = section root).
function relIndex(fromDir, folderRel) {
  return relFromTo(
    fromDir,
    folderRel ? `${folderRel}/index.html` : "index.html",
  );
}

// "../" chain from a page in directory `dirRel` up to the docs/html root (the
// section folder itself is one extra level above the section root).
function assetPrefixFor(dirRel) {
  const depth = 1 + (dirRel ? dirRel.split("/").length : 0);
  return "../".repeat(depth);
}

function folderLabel(name) {
  return toTitleCase(name);
}

// Section-root-relative path of a doc's generated HTML page in a language.
function docPageRel(docNode, lang) {
  const dir = posixDirname(docNode.rel);
  const file = `${docNode.docKey}.${lang}.html`;
  return dir ? `${dir}/${file}` : file;
}

// Build a folder/doc tree from the union of the per-language relative paths.
// Folders nest to any depth; each leaf is a doc node carrying its per-language
// availability + (later) its parsed markdown bundle.
function buildDocTree(langFiles) {
  const root = { type: "folder", rel: "", name: "", children: new Map() };
  const ensureFolder = (segments) => {
    let node = root;
    const acc = [];
    for (const seg of segments) {
      acc.push(seg);
      let child = node.children.get(seg);
      if (!child) {
        child = {
          type: "folder",
          rel: acc.join("/"),
          name: seg,
          children: new Map(),
        };
        node.children.set(seg, child);
      }
      node = child;
    }
    return node;
  };
  const all = new Set([...langFiles.en, ...langFiles.ar]);
  for (const rel of [...all].sort((a, b) => a.localeCompare(b))) {
    const parts = rel.split("/");
    const fileName = parts.pop();
    const folder = ensureFolder(parts);
    folder.children.set(fileName, {
      type: "doc",
      rel,
      name: fileName,
      docKey: makeDocKey(stripExt(fileName)),
      langs: {
        en: langFiles.en.includes(rel),
        ar: langFiles.ar.includes(rel),
      },
      bundle: {},
    });
  }
  return root;
}

// Case-insensitive child ordering so numeric prefixes (00-, 01-) still lead.
function sortedChildren(folder) {
  return [...folder.children.values()].sort((a, b) =>
    String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()),
  );
}

function countItems(folder) {
  return folder.children.size;
}

// Index actual source files across sections before rendering any page.
// This also preserves explicit language targets and percent-encoded filenames.
async function buildDocLinkIndex(phases) {
  const links = new Map();
  for (const phase of phases) {
    const hasEn = await dirExists(path.join(phase.sourceDir, "en"));
    const hasAr = await dirExists(path.join(phase.sourceDir, "ar"));
    const languages = hasEn || hasAr
      ? [hasEn && "en", hasAr && "ar"].filter(Boolean)
      : [null];
    const targetRoot = phase.legacy ? outDir : path.join(outDir, phase.name);
    for (const sourceLang of languages) {
      const sourceRoot = sourceLang
        ? path.join(phase.sourceDir, sourceLang)
        : phase.sourceDir;
      for (const rel of await readMarkdownFilesRecursive(sourceRoot)) {
        const node = { rel, docKey: makeDocKey(stripExt(path.basename(rel))) };
        links.set(
          path.resolve(sourceRoot, rel).toLowerCase(),
          path.join(targetRoot, docPageRel(node, sourceLang || "ar")),
        );
      }
    }
  }
  return links;
}

// Resolve Markdown links from their source location, then emit a relative
// link between the generated pages. Unbuilt files remain plain references.
function rewriteInternalDocLinks(raw, sourceFile, outputFile, docLinks) {
  return String(raw).replace(
    /\]\(([^)\s#]+\.md)(#[^)\s]*)?\)/gi,
    (match, target, anchor = "") => {
      if (/^(https?:|mailto:|\/)/i.test(target)) return match;
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(target);
      } catch {
        return match;
      }
      const resolved = path.resolve(path.dirname(sourceFile), decodedTarget);
      const targetOutput = docLinks.get(resolved.toLowerCase());
      if (!targetOutput) return match;
      const href = path.relative(path.dirname(outputFile), targetOutput)
        .split(path.sep).join("/");
      return `](${href.startsWith(".") ? href : `./${href}`}${anchor})`;
    },
  );
}

// ─── Build ────────────────────────────────────────────────────────────────────

async function buildSection(sectionName, sectionSourceDir, sectionOutDir, docLinks) {
  await ensureDir(sectionOutDir);

  // Two supported layouts, auto-detected per folder:
  //  1. Bilingual (phase-1, phase-2, learning): docs under <dir>/en + <dir>/ar.
  //  2. Monolingual: docs directly under <dir>. Single language (default "ar").
  // Either way the folder structure UNDER the language root is mirrored into
  // the output tree, so nested folders become nested index pages.
  const enDir = path.join(sectionSourceDir, "en");
  const arDir = path.join(sectionSourceDir, "ar");
  const hasEnDir = await dirExists(enDir);
  const hasArDir = await dirExists(arDir);
  const bilingual = hasEnDir || hasArDir;
  const MONO_LANG = "ar";

  const langFiles = { en: [], ar: [] };
  if (bilingual) {
    if (hasEnDir) langFiles.en = await readMarkdownFilesRecursive(enDir);
    if (hasArDir) langFiles.ar = await readMarkdownFilesRecursive(arDir);
  } else {
    langFiles[MONO_LANG] = await readMarkdownFilesRecursive(sectionSourceDir);
  }
  const langSourceRoot = (lang) =>
    bilingual ? path.join(sectionSourceDir, lang) : sectionSourceDir;

  const sectionLabel = formatPhaseLabel(sectionName);
  const tree = buildDocTree(langFiles);

  // Collect and parse each document after the global link index is ready.
  const allDocs = [];
  const collect = (folder) => {
    for (const child of folder.children.values()) {
      if (child.type === "doc") {
        allDocs.push(child);
      } else collect(child);
    }
  };
  collect(tree);

  for (const doc of allDocs) {
    for (const lang of ["en", "ar"]) {
      if (!doc.langs[lang]) continue;
      try {
        let raw = await fs.readFile(
          path.join(langSourceRoot(lang), doc.rel),
          "utf8",
        );
        raw = rewriteInternalDocLinks(
          raw,
          path.join(langSourceRoot(lang), doc.rel),
          path.join(sectionOutDir, docPageRel(doc, lang)),
          docLinks,
        );
        doc.bundle[lang] = parseMarkdownDocument(
          raw,
          path.basename(doc.rel),
          lang,
        );
      } catch {
        // language version missing — skip
      }
    }
  }

  // Prefer the doc's real H1 (heroTitle) for cards / sidebar / breadcrumb, with
  // backticks stripped so inline-code markers don't show literally. Falls back
  // to the filename-derived title then the raw name.
  const stripTicks = (s) => String(s || "").replace(/`/g, "").trim();
  const docTitle = (doc, lang) => {
    const b = doc.bundle[lang] || doc.bundle.en || doc.bundle.ar;
    return stripTicks(b?.heroTitle || b?.title) || doc.name;
  };

  // ── A folder index page (section root + every sub-folder, any depth) ──
  const renderFolder = async (folder) => {
    const dirRel = folder.rel;
    const children = sortedChildren(folder);

    const crumbs = [];
    const segs = dirRel ? dirRel.split("/") : [];
    crumbs.push({
      label: sectionLabel,
      href: dirRel ? relIndex(dirRel, "") : null,
    });
    const acc = [];
    for (let i = 0; i < segs.length; i++) {
      acc.push(segs[i]);
      const isCurrent = i === segs.length - 1;
      crumbs.push({
        label: folderLabel(segs[i]),
        href: isCurrent ? null : relIndex(dirRel, acc.join("/")),
      });
    }

    const cards = children
      .map((child) => {
        if (child.type === "folder") {
          return folderCardHtml(
            folderLabel(child.name),
            relFromTo(dirRel, `${child.rel}/index.html`),
            countItems(child),
          );
        }
        return docCardHtml({
          titleEn: docTitle(child, "en"),
          titleAr: docTitle(child, "ar"),
          desc:
            safeDescription((child.bundle.en || child.bundle.ar)?.overview) ||
            "",
          enHref: child.langs.en
            ? relFromTo(dirRel, docPageRel(child, "en"))
            : "",
          arHref: child.langs.ar
            ? relFromTo(dirRel, docPageRel(child, "ar"))
            : "",
        });
      })
      .join("");

    const html = renderFolderIndexPage({
      title: dirRel ? folderLabel(folder.name) : sectionLabel,
      breadcrumbHtml: breadcrumbHtml(crumbs),
      cardsHtml: cards,
      assetsPrefix: assetPrefixFor(dirRel),
      homeHref: `${assetPrefixFor(dirRel)}index.html`,
      empty: children.length === 0,
    });

    const outDirAbs = path.join(sectionOutDir, dirRel);
    await ensureDir(outDirAbs);
    await fs.writeFile(path.join(outDirAbs, "index.html"), html, "utf8");
  };

  // ── A doc page (per available language), with folder-local sidebar ──
  const renderDoc = async (doc, parent) => {
    const docDir = posixDirname(doc.rel);
    const siblings = sortedChildren(parent);
    const sidebarLabel = docDir ? folderLabel(parent.name) : sectionLabel;

    for (const lang of ["en", "ar"]) {
      if (!doc.bundle[lang]) continue;
      const current = doc.bundle[lang];
      const fallback = lang === "en" ? doc.bundle.ar : doc.bundle.en;

      const navItems = siblings.map((child) => {
        if (child.type === "folder") {
          return {
            label: folderLabel(child.name),
            href: relFromTo(docDir, `${child.rel}/index.html`),
            isFolder: true,
            active: false,
          };
        }
        const childLang = child.langs[lang]
          ? lang
          : child.langs.en
            ? "en"
            : "ar";
        return {
          label: docTitle(child, lang),
          href: relFromTo(docDir, docPageRel(child, childLang)),
          isFolder: false,
          active: child === doc,
        };
      });

      const crumbs = [];
      const segs = docDir ? docDir.split("/") : [];
      crumbs.push({ label: sectionLabel, href: relIndex(docDir, "") });
      const acc = [];
      for (const seg of segs) {
        acc.push(seg);
        crumbs.push({
          label: folderLabel(seg),
          href: relIndex(docDir, acc.join("/")),
        });
      }
      crumbs.push({ label: docTitle(doc, lang), href: null });

      const data = {
        key: doc.docKey,
        lang,
        title: current.title,
        subtitle: current.subtitle || (fallback ? fallback.subtitle : ""),
        heroTitle: current.heroTitle,
        category: current.category,
        overview: current.overview,
        preface: current.preface || [],
        alternate: {
          hasOther: lang === "en" ? doc.langs.ar : doc.langs.en,
          enFile: `./${doc.docKey}.en.html`,
          arFile: `./${doc.docKey}.ar.html`,
        },
        sections: current.sections,
      };

      const html = renderDocPage(data, {
        assetsPrefix: assetPrefixFor(docDir),
        homeHref: `${assetPrefixFor(docDir)}index.html`,
        sectionHref: relIndex(docDir, ""),
        breadcrumbHtml: breadcrumbHtml(crumbs),
        sidebarHtml: buildSidebarHtml(navItems, sidebarLabel),
      });

      const outDirAbs = path.join(sectionOutDir, docDir);
      await ensureDir(outDirAbs);
      await fs.writeFile(
        path.join(outDirAbs, `${doc.docKey}.${lang}.html`),
        html,
        "utf8",
      );
    }
  };

  // Walk the tree: render each folder index, then descend / render docs.
  const walk = async (folder) => {
    await renderFolder(folder);
    for (const child of sortedChildren(folder)) {
      if (child.type === "folder") await walk(child);
      else await renderDoc(child, folder);
    }
  };
  await walk(tree);

  return {
    name: sectionName,
    label: sectionLabel,
    docsCount: allDocs.length,
    hasEn: langFiles.en.length > 0,
    hasAr: langFiles.ar.length > 0,
  };
}

async function resolvePhases() {
  let entries = [];
  try {
    entries = await fs.readdir(docsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const phases = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Take EVERY top-level docs folder — phase-1, phase-2, learning, and any
    // similar folder added later. Skip only the generated output dir and
    // hidden/dot folders. Each folder is then built exactly like a phase
    // (its own index + per-doc pages + sidebar links).
    if (entry.name === "html") continue;
    if (entry.name.startsWith(".")) continue;
    phases.push({
      name: entry.name,
      sourceDir: path.join(docsDir, entry.name),
    });
  }

  if (phases.length) {
    return phases.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Backward compatibility with the previous docs/en + docs/ar layout.
  return [{ name: "default", sourceDir: docsDir, legacy: true }];
}

async function build() {
  await ensureDir(outDir);

  await fs.copyFile(
    path.join(rootDir, "scripts", "docs-site.css"),
    path.join(outDir, "shared.css"),
  );

  await fs.writeFile(
    path.join(outDir, "interactive.js"),
    interactiveJsContent(),
    "utf8",
  );

  const phases = await resolvePhases();
  const docLinks = await buildDocLinkIndex(phases);
  const phaseResults = [];

  for (const phase of phases) {
    const phaseOutDir = phase.legacy ? outDir : path.join(outDir, phase.name);
    const result = await buildSection(phase.name, phase.sourceDir, phaseOutDir, docLinks);
    phaseResults.push(result);
  }

  if (phases.length === 1 && phases[0].legacy) {
    return {
      outputDir: outDir,
      docsCount: phaseResults[0].docsCount,
      phaseCount: 1,
    };
  }

  await fs.writeFile(
    path.join(outDir, "index.html"),
    renderRootIndexPage(phaseResults),
    "utf8",
  );

  const totalDocs = phaseResults.reduce((sum, item) => sum + item.docsCount, 0);
  return {
    outputDir: outDir,
    docsCount: totalDocs,
    phaseCount: phaseResults.length,
  };
}

build()
  .then((result) => {
    console.log(`\u2705 Docs generated → ${result.outputDir}`);
    console.log(
      `   ${result.docsCount} document(s) written across ${result.phaseCount || 1} phase(s).`,
    );
  })
  .catch((error) => {
    console.error("Build failed.");
    console.error(error);
    process.exit(1);
  });
