import React, { useEffect, useState } from "react";
import { generateLegalMemo, generateAISummary, getAISummary, getLegalMemo } from "../services/api";
import ReportViewer from "./ReportViewer";
import { DossierSection } from "./IntelligenceSystem";

export default function AdvocacyReports({ facilityId, facilityName }) {
  const [memo, setMemo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingMemo, setLoadingMemo] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    // Load cached AI Summary
    (async () => {
      setLoadingSummary(true);
      try {
        const data = await getAISummary(facilityId);
        if (data && data.report) {
          setSummary({
            content: data.report,
            generated_at: data.generated_at || new Date().toISOString(),
          });
        }
      } catch {
        // No cached summary — that's fine
      } finally {
        setLoadingSummary(false);
      }
    })();

    // Load cached Legal Memo
    (async () => {
      setLoadingMemo(true);
      try {
        const data = await getLegalMemo(facilityId);
        if (data && data.memo_text) {
          setMemo({
            content: data.memo_text,
            generated_at: data.generated_at || new Date().toISOString(),
          });
        }
      } catch {
        // No cached memo — that's fine
      } finally {
        setLoadingMemo(false);
      }
    })();
  }, [facilityId]);

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setError(null);
    try {
      const data = await generateAISummary(facilityId);
      if (data && data.report) {
        const payload = {
          content: data.report,
          generated_at: data.generated_at || new Date().toISOString(),
        };
        setSummary(payload);
        setViewing({ type: "AI Summary", ...payload });
      } else if (data && data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message || "Failed to generate AI summary");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleGenerateMemo = async () => {
    setLoadingMemo(true);
    setError(null);
    try {
      const data = await generateLegalMemo(facilityId);
      if (data && data.memo_text) {
        const payload = {
          content: data.memo_text,
          generated_at: data.generated_at || new Date().toISOString(),
        };
        setMemo(payload);
        setViewing({ type: "Legal Memo", ...payload });
      } else if (data && data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message || "Failed to generate memo");
    } finally {
      setLoadingMemo(false);
    }
  };

  // Build a 1-line preview from the Markdown content (first non-heading line)
  function getPreview(content) {
    if (!content) return "—";
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const preview = lines[0] || "";
    return preview.length > 130 ? preview.slice(0, 130) + "…" : preview;
  }

  return (
    <DossierSection
      label="INTELLIGENCE REPORTS"
      title="AI Reports"
      subtitle="Structured intelligence reports and legal memoranda generated from inspection record analysis."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateSummary}
            disabled={loadingSummary}
            className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-3 py-1.5 rounded-full font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">
              {loadingSummary ? "hourglass_empty" : "analytics"}
            </span>
            {loadingSummary ? "Generating…" : "Generate AI Summary"}
          </button>
          <button
            onClick={handleGenerateMemo}
            disabled={loadingMemo}
            className="flex items-center gap-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 px-3 py-1.5 rounded-full font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[14px]">
              {loadingMemo ? "hourglass_empty" : "gavel"}
            </span>
            {loadingMemo ? "Generating…" : "Generate Legal Memo"}
          </button>
        </div>
      }
    >
      {error && (
        <div className="flex items-center gap-2 bg-error/10 border border-error/20 text-error px-4 py-3 rounded-xl mb-4 font-body-md text-[13px]">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* AI Summary card */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-label-caps text-[10px] text-on-surface-variant tracking-widest uppercase mb-1">Intelligence Report</div>
              <div className="font-headline-sm text-[15px] font-bold text-on-surface">AI Summary</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full font-label-caps text-[10px] font-bold border ${summary ? "bg-primary/10 text-primary border-primary/20" : "bg-surface-variant/30 text-on-surface-variant border-outline-variant/10"}`}>
              {loadingSummary ? "GENERATING" : summary ? "AVAILABLE" : "NOT GENERATED"}
            </span>
          </div>

          {summary ? (
            <>
              <p className="font-body-md text-[13px] text-on-surface-variant leading-relaxed">
                {getPreview(summary.content)}
              </p>
              <div className="font-code-data text-[11px] text-on-surface-variant/60">
                Generated {new Date(summary.generated_at).toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-outline-variant/10">
                <button
                  onClick={() => setViewing({ type: "AI Summary", ...summary })}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-3 py-2 rounded-lg font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  View Report
                </button>
                <button
                  onClick={handleGenerateSummary}
                  disabled={loadingSummary}
                  className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/10 text-on-surface-variant px-3 py-2 rounded-lg font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Refresh
                </button>
              </div>
            </>
          ) : (
            <div className="text-on-surface-variant font-body-md text-[13px] leading-relaxed">
              No intelligence report generated yet. Click <strong>Generate AI Summary</strong> to analyze inspection records and produce a structured compliance report.
            </div>
          )}
        </div>

        {/* Legal Memo card */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-label-caps text-[10px] text-on-surface-variant tracking-widest uppercase mb-1">Legal Memorandum</div>
              <div className="font-headline-sm text-[15px] font-bold text-on-surface">Legal Memo</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full font-label-caps text-[10px] font-bold border ${memo ? "bg-secondary/10 text-secondary border-secondary/20" : "bg-surface-variant/30 text-on-surface-variant border-outline-variant/10"}`}>
              {loadingMemo ? "GENERATING" : memo ? "AVAILABLE" : "NOT GENERATED"}
            </span>
          </div>

          {memo ? (
            <>
              <p className="font-body-md text-[13px] text-on-surface-variant leading-relaxed">
                {getPreview(memo.content)}
              </p>
              <div className="font-code-data text-[11px] text-on-surface-variant/60">
                Generated {new Date(memo.generated_at).toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-outline-variant/10">
                <button
                  onClick={() => setViewing({ type: "Legal Memo", ...memo })}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 px-3 py-2 rounded-lg font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  View Memo
                </button>
                <button
                  onClick={handleGenerateMemo}
                  disabled={loadingMemo}
                  className="flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/10 text-on-surface-variant px-3 py-2 rounded-lg font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Refresh
                </button>
              </div>
            </>
          ) : (
            <div className="text-on-surface-variant font-body-md text-[13px] leading-relaxed">
              No legal memorandum generated yet. Click <strong>Generate Legal Memo</strong> to produce a formal compliance memorandum suitable for legal review.
            </div>
          )}
        </div>
      </div>

      {/* Inline report viewer */}
      {viewing && (
        <div className="mt-6">
          <ReportViewer
            reportType={viewing.type}
            facilityName={facilityName}
            generatedAt={viewing.generated_at}
            content={viewing.content}
            onClose={() => setViewing(null)}
            onRegenerate={viewing.type === "Legal Memo" ? handleGenerateMemo : handleGenerateSummary}
          />
        </div>
      )}
    </DossierSection>
  );
}
