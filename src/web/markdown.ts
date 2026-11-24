/**
 * Clean, zero-dependency client-side Markdown renderer for Yedogu's Web UI.
 * Supports headings, fenced code blocks with copy button, callouts, tables,
 * task lists, ordered/unordered lists, blockquotes, bold/italic/inline code, and links.
 */

export const MARKDOWN_CLIENT_JS = /* js */ `
function renderInlineMd(raw) {
  let s = esc(raw);
  s = s.replace(/\`([^\`]+)\`/g, '<code class="md-inline">$1</code>');
  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>');
  s = s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function renderRichMarkdown(text) {
  const src = String(text || "");
  if (!src.trim()) return "";
  const lines = src.replace(/\\r\\n?/g, "\\n").split("\\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^\\s*\`\`\`([a-zA-Z0-9_.-]*)/);
    if (fence) {
      const lang = fence[1] || "text";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^\\s*\`\`\`/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const rawCode = codeLines.join("\\n");
      const cid = "cb_" + Math.random().toString(36).slice(2, 9);
      window.__CODE_BLOCKS = window.__CODE_BLOCKS || {};
      window.__CODE_BLOCKS[cid] = rawCode;
      html += '<div class="md-code-wrap"><div class="md-code-head"><span>' + esc(lang) + '</span><button class="btn-subtle-xs" onclick="copyCodeBlock(\\'' + cid + '\\')">Copy</button></div><pre class="md-code"><code>' + esc(rawCode) + '</code></pre></div>';
      continue;
    }

    // Callout (> [!NOTE|TIP|WARNING|CAUTION|IMPORTANT])
    const calloutStart = line.match(/^>\\s*\\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\\]\\s*(.*)$/i);
    if (calloutStart) {
      const kindMap = { note: "info", tip: "success", warning: "warn", caution: "danger", important: "warn" };
      const cType = kindMap[calloutStart[1].toLowerCase()] || "info";
      const cTitle = calloutStart[2] || calloutStart[1].toUpperCase();
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\\s?/, ""));
        i++;
      }
      html += '<div class="callout callout-' + cType + '"><div class="callout-title">' + esc(cTitle) + '</div><div class="callout-body">' + bodyLines.map(renderInlineMd).join("<br/>") + '</div></div>';
      continue;
    }

    // Markdown Table
    if (line.includes("|") && i + 1 < lines.length && /^\\s*\\|?[\\s:-]+\\|[\\s|:-]+$/.test(lines[i + 1])) {
      const parseCells = (row) => row.trim().replace(/^\\|/, "").replace(/\\|$/, "").split("|").map(c => c.trim());
      const headers = parseCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseCells(lines[i]));
        i++;
      }
      html += '<div class="md-table-wrap"><table><thead><tr>' +
        headers.map(h => '<th>' + renderInlineMd(h) + '</th>').join("") +
        '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + renderInlineMd(c) + '</td>').join("") + '</tr>').join("") +
        '</tbody></table></div>';
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\\s+(.+)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      html += '<h' + lvl + '>' + renderInlineMd(hMatch[2]) + '</h' + lvl + '>';
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\\s*(---|\\*\\*\\*|___)\\s*$/.test(line)) {
      html += '<hr class="md-hr" />';
      i++;
      continue;
    }

    // Unordered / Task list
    if (/^\\s*[-*+]\\s+/.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^\\s*[-*+]\\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\\s*[-*+]\\s+/, "");
        const taskDone = item.match(/^\\[x\\]\\s+(.*)$/i);
        const taskTodo = item.match(/^\\[ \\]\\s+(.*)$/);
        if (taskDone) html += '<li class="md-task"><span class="md-check done">✓</span><span>' + renderInlineMd(taskDone[1]) + '</span></li>';
        else if (taskTodo) html += '<li class="md-task"><span class="md-check"></span><span>' + renderInlineMd(taskTodo[1]) + '</span></li>';
        else html += '<li>' + renderInlineMd(item) + '</li>';
        i++;
      }
      html += '</ul>';
      continue;
    }

    // Ordered list
    if (/^\\s*\\d+\\.\\s+/.test(line)) {
      html += '<ol>';
      while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) {
        html += '<li>' + renderInlineMd(lines[i].replace(/^\\s*\\d+\\.\\s+/, "")) + '</li>';
        i++;
      }
      html += '</ol>';
      continue;
    }

    // Plain blockquote
    if (/^>\\s?/.test(line)) {
      const qLines = [];
      while (i < lines.length && /^>\\s?/.test(lines[i])) {
        qLines.push(lines[i].replace(/^>\\s?/, ""));
        i++;
      }
      html += '<blockquote>' + qLines.map(renderInlineMd).join("<br/>") + '</blockquote>';
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\\s*\`\`\`/.test(lines[i]) &&
      !/^(#{1,4})\\s+/.test(lines[i]) &&
      !/^\\s*[-*+]\\s+/.test(lines[i]) &&
      !/^\\s*\\d+\\.\\s+/.test(lines[i]) &&
      !/^>/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    html += '<p>' + pLines.map(renderInlineMd).join("<br/>") + '</p>';
  }

  return '<div class="md-prose">' + html + '</div>';
}

function copyCodeBlock(cid) {
  const txt = (window.__CODE_BLOCKS || {})[cid] || "";
  copyTextSnippet(txt, "code snippet");
}
`;
