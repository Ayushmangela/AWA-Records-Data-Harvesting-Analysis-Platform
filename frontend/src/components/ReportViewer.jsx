import React, { useMemo } from "react";

/**
 * Minimal Markdown renderer for intelligence reports.
 * Supports: # headings, ## subheadings, **bold**, bullet lists, blank-line paragraphs,
 * and "Key: Value" citation lines.
 */
function renderMarkdown(markdown) {
  if (!markdown) return null;
  const lines = markdown.split("\n");
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1 heading
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={key++} className="report-h1">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // H2 heading
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="report-h2">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // H3 heading
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="report-h3">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list: collect consecutive "- " lines
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(
          <li key={items.length} className="report-li">
            {renderInline(lines[i].slice(2))}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="report-ul">
          {items}
        </ul>
      );
      continue;
    }

    // Citation / KV line: "Word(s): value" with no spaces before colon — render as metadata row
    const kvMatch = line.match(/^([A-Za-z][\w\s]{0,30}):\s+(.+)$/);
    if (kvMatch && !line.startsWith("#")) {
      elements.push(
        <div key={key++} className="report-kv">
          <span className="report-kv-label">{kvMatch[1]}</span>
          <span className="report-kv-value">{kvMatch[2]}</span>
        </div>
      );
      i++;
      continue;
    }

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="report-p">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

/** Render inline bold and plain text */
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} className="report-bold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function ReportViewer({ reportType, facilityName, generatedAt, content, onClose, onRegenerate }) {
  const formattedDate = generatedAt ? new Date(generatedAt).toLocaleString() : "—";
  const rendered = useMemo(() => renderMarkdown(content), [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content || "");
    } catch {
      /* noop */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (facilityName || "report").replace(/[^a-z0-9_-]/gi, "_");
    a.href = url;
    a.download = `${safeName}-${reportType.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    const style = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      body { font-family: Inter, system-ui, sans-serif; max-width: 860px; margin: 48px auto; color: #111; line-height: 1.7; }
      h1 { font-size: 22px; font-weight: 700; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 36px; }
      h2 { font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin-top: 28px; }
      h3 { font-size: 14px; font-weight: 600; margin-top: 20px; }
      p { margin: 12px 0; }
      ul { padding-left: 20px; }
      li { margin: 6px 0; }
      .kv { display: flex; gap: 12px; background: #f9fafb; border-left: 3px solid #d1d5db; padding: 6px 12px; margin: 6px 0; border-radius: 4px; }
      .kv-label { font-weight: 600; min-width: 120px; color: #6b7280; }
      strong { font-weight: 700; }
      .disclaimer { margin-top: 48px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    `;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${facilityName} — ${reportType}</title><style>${style}</style></head><body></body></html>`);
    w.document.close();
    const container = w.document.createElement("div");
    container.innerHTML = `<h1>${facilityName}</h1><div style="color:#6b7280;font-size:13px;margin-bottom:24px">${reportType} &mdash; ${formattedDate}</div><hr style="margin:16px 0">`;
    w.document.body.appendChild(container);
    const pre = w.document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14px";
    pre.textContent = content || "";
    w.document.body.appendChild(pre);
    const disc = w.document.createElement("p");
    disc.className = "disclaimer";
    disc.textContent = "AI-generated for research purposes only. Human legal review required before official use.";
    w.document.body.appendChild(disc);
    w.focus();
    w.print();
  };

  const isAISummary = reportType === "AI Summary";

  return (
    <div className="report-viewer-shell">
      {/* Header bar */}
      <div className="report-viewer-header">
        <div className="report-viewer-meta">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary text-[22px]">
              {isAISummary ? "analytics" : "gavel"}
            </span>
            <div>
              <div className="font-label-caps text-[10px] text-on-surface-variant tracking-widest uppercase">
                {isAISummary ? "Intelligence Report" : "Legal Memorandum"}
              </div>
              <div className="font-headline-sm text-[15px] font-bold text-on-surface leading-tight">
                {facilityName}
              </div>
            </div>
          </div>
          <div className="font-code-data text-[11px] text-on-surface-variant">
            Generated {formattedDate}
          </div>
        </div>
        <div className="report-viewer-actions">
          <button onClick={handleCopy} className="report-action-btn" title="Copy to clipboard">
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            Copy
          </button>
          <button onClick={handleDownload} className="report-action-btn" title="Download as .md">
            <span className="material-symbols-outlined text-[16px]">download</span>
            Download
          </button>
          <button onClick={handlePrint} className="report-action-btn" title="Print">
            <span className="material-symbols-outlined text-[16px]">print</span>
            Print
          </button>
          {onRegenerate && (
            <button onClick={onRegenerate} className="report-action-btn report-action-regen" title="Regenerate">
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Regenerate
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="report-action-close" title="Close">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Disclaimer bar */}
      <div className="report-disclaimer-bar">
        <span className="material-symbols-outlined text-[14px]">info</span>
        AI-generated for research purposes only. Human legal review required. Verify all citations against original source PDFs.
      </div>

      {/* Report body */}
      <div className="report-body custom-scrollbar">
        {rendered}
      </div>
    </div>
  );
}
