/**
 * 轻量 Markdown 解析器（无依赖）
 * 输出块级节点树供 WXML 渲染；行内内容转成有限 HTML 交给 rich-text
 * 支持：标题/无序有序列表/代码块/引用/分割线/图片/表格(简化)/段落
 * 行内：**粗** *斜* `code` [text](url) ![alt](src) 自动转义 HTML
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 行内 markdown → 受限 HTML（供 rich-text） */
function inlineToHtml(text) {
  let s = escapeHtml(text);
  // 图片 ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img class="md-img" src="$2" alt="$1" />');
  // 链接 [text](url) —— rich-text 内 a 不可点击，渲染为高亮文本
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<span class="md-link">$1</span>');
  // 粗体
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // 行内代码
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  return s;
}

/**
 * @param {string} md markdown 文本
 * @returns {Array} 块级节点 [{type, ...}]
 */
function parseMarkdown(md) {
  const blocks = [];
  if (!md) return blocks;
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 代码块 ```
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结尾 ```
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: `h${h[1].length}`, html: inlineToHtml(h[2]) });
      i += 1;
      continue;
    }

    // 分割线
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", html: inlineToHtml(buf.join("\n")) });
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push({ html: inlineToHtml(lines[i].replace(/^\s*[-*+]\s+/, "")) });
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.、]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) {
        items.push({ html: inlineToHtml(lines[i].replace(/^\s*\d+[.、]\s+/, "")) });
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // 表格 | a | b |
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const parseRow = (l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const header = parseRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header: header.map(inlineToHtml), rows: rows.map((r) => r.map(inlineToHtml)) });
      continue;
    }

    // 独立图片行
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/);
    if (img) {
      blocks.push({ type: "img", src: img[2], alt: img[1] });
      i += 1;
      continue;
    }

    // 段落（连续非空行合并）
    const buf = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.、]\s|```|\|)/.test(lines[i]) &&
      !/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", html: inlineToHtml(buf.join("\n")) });
  }

  return blocks;
}

module.exports = { parseMarkdown, inlineToHtml, escapeHtml };
