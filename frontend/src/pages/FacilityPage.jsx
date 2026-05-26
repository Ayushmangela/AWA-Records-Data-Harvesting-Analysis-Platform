import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { getFacility, generateAISummary, generateLegalMemo } from "../services/api";
import { toast } from "../components/Toast";
import PDFViewer from "../components/PDFViewer";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RiskBanners({ flags }) {
  if (!flags) return null;

  const banners = [];

  if (flags.exceeds_animal_limit) {
    banners.push({
      key: "exceeds",
      style: { color: "var(--danger-text)", background: "var(--danger-bg)", borderColor: "var(--danger-border)" },
      text: "Exceeds licensed animal limit",
    });
  }
  if (flags.high_direct_violations) {
    banners.push({
      key: "direct",
      style: { color: "var(--warning-text)", background: "var(--warning-bg)", borderColor: "var(--warning-border)" },
      text: "More than 3 direct violations in the last 18 months",
    });
  }
  if (flags.inventory_spike) {
    banners.push({
      key: "spike",
      style: { color: "var(--warning-text)", background: "var(--warning-bg)", borderColor: "var(--warning-border)" },
      text: "Inventory spike detected — signal for investigation, not a conclusion",
    });
  }

  if (banners.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", margin: "1.5rem 0" }}>
      {banners.map((banner) => (
        <div
          key={banner.key}
          className="risk-banner-card"
          style={{ ...banner.style, borderLeftWidth: "4px" }}
        >
          <span>⚠️</span> {banner.text}
        </div>
      ))}
    </div>
  );
}

function InspectionItem({ inspection, isHighlighted, onOpenPdf }) {
  const proxyUrl = `http://localhost:8000/documents/proxy-pdf/${inspection.id}`;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: isHighlighted ? "#fffbeb" : "#fff",
        borderRadius: "var(--radius-md)",
        marginBottom: "1rem",
        border: isHighlighted ? "2px solid #d97706" : "1px solid var(--neutral-200)",
        overflow: "hidden",
        boxShadow: isHighlighted ? "0 0 15px rgba(217, 119, 6, 0.3)" : "var(--shadow-sm)",
        transition: "all 0.3s ease",
        animation: isHighlighted ? "highlightPulse 1s ease 3" : "none"
      }}
    >
      <button
        id={`inspection-toggle-${inspection.id}`}
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr)) auto",
          gap: "1rem",
          alignItems: "center",
          padding: "1.25rem",
          border: "none",
          background: "#fff",
          textAlign: "left",
          cursor: "pointer",
          fontSize: "0.95rem",
          fontFamily: "inherit",
          transition: "var(--transition-smooth)",
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--neutral-50)")}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700" }}>
            Inspection Date
          </span>
          <span style={{ fontWeight: "700", color: "var(--neutral-900)", fontSize: "1.05rem" }}>
            {formatDate(inspection.inspection_date)}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700" }}>
            Type
          </span>
          <span style={{ color: "var(--neutral-800)", fontWeight: "500" }}>
            {inspection.inspection_type || "Inspection"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700" }}>
            Inspector
          </span>
          <span style={{ color: "var(--neutral-800)" }}>
            {inspection.inspector_id ? (
              <Link
                id={`inspector-link-${inspection.inspector_id}`}
                to={`/inspector/${inspection.inspector_id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ color: "var(--primary)", textDecoration: "none", fontWeight: "600" }}
              >
                {inspection.inspector_name || inspection.inspector_id}
              </Link>
            ) : (
              inspection.inspector_name || "Unknown"
            )}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700" }}>
            Violations
          </span>
          <span
            className={inspection.violation_count > 0 ? "badge badge-red" : "badge badge-green"}
            style={{ alignSelf: "flex-start" }}
          >
            {inspection.violation_count ?? 0} violation{inspection.violation_count !== 1 ? "s" : ""}
          </span>
        </div>

        <span style={{ color: "var(--neutral-600)", fontSize: "1.2rem", paddingLeft: "1rem" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: "1.5rem",
            borderTop: "1px solid var(--neutral-200)",
            background: "var(--neutral-50)",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          {/* Official USDA PDF Link */}
          {(inspection.source_pdf || inspection.source_pdf_path) && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`pdf-dropdown-${inspection.id}`);
                    el.style.display = el.style.display === "none" ? "block" : "none";
                  }}
                  className="btn-primary"
                  style={{
                    padding: "0.4rem 1.25rem",
                    fontSize: "0.85rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "var(--neutral-800)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  📄 View Official USDA PDF ▼
                </button>
                <div id={`pdf-dropdown-${inspection.id}`} style={{ display: "none", position: "absolute", top: "100%", left: 0, marginTop: "4px", background: "white", border: "1px solid #e5e7eb", borderRadius: "6px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 10, minWidth: "200px", overflow: "hidden" }}>
                  <button onClick={() => { onOpenPdf(proxyUrl, formatDate(inspection.inspection_date)); document.getElementById(`pdf-dropdown-${inspection.id}`).style.display = "none"; }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", border: "none", background: "white", cursor: "pointer", fontSize: "14px", borderBottom: "1px solid #f3f4f6" }}>📄 View in Platform</button>
                  <a href={inspection.source_pdf} download style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", textDecoration: "none", color: "black", cursor: "pointer", fontSize: "14px", borderBottom: "1px solid #f3f4f6" }}>⬇ Download PDF</a>
                  <a href={inspection.source_pdf} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", textDecoration: "none", color: "black", cursor: "pointer", fontSize: "14px" }}>↗ Open in USDA Site</a>
                </div>
              </div>
            </div>
          )}

          {/* Animal inventory list */}
          <div>
            <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: "700", color: "var(--neutral-900)" }}>
              Animal Inventory List
            </h4>
            {inspection.inventory?.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {inspection.inventory.map((item) => (
                  <span
                    key={item.id}
                    style={{
                      padding: "0.4rem 0.75rem",
                      background: "#fff",
                      color: "var(--neutral-800)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.85rem",
                      border: "1px solid var(--neutral-200)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <strong style={{ color: "var(--neutral-900)" }}>{item.count}</strong> {item.common_name} (<em>{item.scientific_name}</em>)
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--neutral-600)", margin: 0, fontStyle: "italic" }}>
                No species counts recorded.
              </p>
            )}
          </div>

          {/* Violations */}
          <div>
            <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: "700", color: "var(--neutral-900)" }}>
              Detailed Violations
            </h4>
            {inspection.violations?.length > 0 ? (
              <ul style={{ margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {inspection.violations.map((violation) => {
                  const isDirect = violation.severity?.toLowerCase() === "direct";
                  const isCritical = violation.severity?.toLowerCase() === "critical";
                  const severityBadgeClass = isDirect ? "badge badge-red" : isCritical ? "badge badge-yellow" : "badge";
                  
                  return (
                    <li
                      key={violation.id}
                      style={{
                        background: "#fff",
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--neutral-200)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                        <span className={severityBadgeClass}>{violation.severity || "Violation"}</span>
                        <strong style={{ color: "var(--neutral-900)", fontSize: "0.95rem", flex: 1 }}>
                          Section: {violation.section || "N/A"}
                        </strong>
                        <button onClick={() => onOpenPdf(proxyUrl, formatDate(inspection.inspection_date), 1, violation.description)} style={{ background: "#f3f4f6", border: "1px solid #d1d5db", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>📄 View in PDF</button>
                      </div>
                      <p style={{ margin: 0, color: "var(--neutral-800)", fontSize: "0.9rem", lineHeight: "1.5" }}>
                        {violation.description}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--neutral-600)", margin: 0, fontStyle: "italic" }}>
                No violations recorded for this inspection.
              </p>
            )}
            {inspection.source_pdf_path && (
               <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--neutral-500)" }}>
                 Source file: {inspection.source_pdf_path}
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FacilityPage() {
  const { id } = useParams();
  const [facility, setFacility] = useState(null);
  const [legalMemo, setLegalMemo] = useState(null);
  const [memoError, setMemoError] = useState(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [activePdf, setActivePdf] = useState(null);
  const [activePdfDate, setActivePdfDate] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfHighlight, setPdfHighlight] = useState(null);
  const [highlightedInspId, setHighlightedInspId] = useState(null);

  const openPdfViewer = (url, dateStr, page = 1, text = null) => {
    setActivePdf(url);
    setActivePdfDate(dateStr);
    setPdfPage(page);
    setPdfHighlight(text);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info(`Viewing inspection from ${dateStr}`);
  };

  const closePdfViewer = () => {
    setActivePdf(null);
    setPdfPage(1);
    setPdfHighlight(null);
    setActivePdfDate(null);
  };

  const jumpToCitation = (citationDate, citedText) => {
    if (!facility?.inspections) return;
    const match = citationDate.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return;
    const dateStr = match[0];
    const insp = facility.inspections.find(i => String(i.inspection_date) === dateStr);
    
    if (insp) {
      setHighlightedInspId(insp.id);
      const proxyUrl = `http://localhost:8000/documents/proxy-pdf/${insp.id}`;
      openPdfViewer(proxyUrl, formatDate(insp.inspection_date), 1, citedText);
      setTimeout(() => setHighlightedInspId(null), 3000);
      toast.info(`Jumped to inspection ${formatDate(insp.inspection_date)}`);
    } else {
      toast.warning(`Inspection ${dateStr} not found in timeline`);
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [generatingMemo, setGeneratingMemo] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getFacility(id);
        setFacility(data);
      } catch (err) {
        setError(err.response?.status === 404 ? "Facility not found" : "Failed to load facility");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Set page title dynamically
  useEffect(() => {
    if (facility) {
      document.title = `Facility: ${facility.name} - AWA Platform`;
    } else {
      document.title = "Loading Facility... - AWA Platform";
    }
  }, [facility]);

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <Link id="back-link" to="/" className="back-link">← Back to search</Link>
        <div style={{ height: "200px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", marginBottom: "2rem" }}></div>
        <div style={{ height: "60px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", marginBottom: "1rem" }}></div>
        <div style={{ height: "60px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", marginBottom: "1rem" }}></div>
        <div style={{ height: "60px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <Link id="error-back-link" to="/" className="back-link">
          ← Back to search
        </Link>
        <div className="error-banner" style={{ marginTop: "1rem" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '2rem', padding: '2rem', maxWidth: activePdf ? '100%' : '1000px', margin: '0 auto', transition: 'all 0.3s' }}>
      <div style={{ width: activePdf ? '55%' : '100%', transition: 'width 0.3s', display: 'flex', flexDirection: 'column' }}>
      <Link id="back-link" to="/" className="back-link">
        ← Back to search
      </Link>

      {/* Header section */}
      <header
        style={{
          background: "#fff",
          padding: "2rem",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--neutral-200)",
          boxShadow: "var(--shadow-md)",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)" }}>
          {facility.name}
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--neutral-600)", margin: "0 0 1.5rem 0" }}>
          Certificate: <strong>{facility.certificate_number || "—"}</strong>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", borderTop: "1px solid var(--neutral-100)", paddingTop: "1.5rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700", letterSpacing: "0.05em" }}>
              Address Details
            </span>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--neutral-800)" }}>
              {facility.address || "—"}
            </p>
            <p style={{ margin: 0, color: "var(--neutral-800)" }}>
              {[facility.city, facility.state, facility.zip_code].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700", letterSpacing: "0.05em" }}>
              License Type
            </span>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--neutral-800)", fontWeight: "600" }}>
              {facility.license_type || "—"}
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700", letterSpacing: "0.05em" }}>
              License Status
            </span>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                color: facility.license_status?.toLowerCase() === "active" ? "var(--success-text)" : "var(--danger-text)",
                fontWeight: "600",
              }}
            >
              {facility.license_status || "—"}
            </p>
          </div>
        </div>
      </header>

      {/* Risk flags as banners */}
      <RiskBanners flags={facility.risk_flags} />

      {/* Inspection timeline section */}
      <section style={{ marginTop: "2rem" }}>
        <h2 className="timeline-title">
          Inspection Timeline
        </h2>
        {facility.inspections?.length > 0 ? (
          <div>
            {facility.inspections.map((inspection) => (
              <InspectionItem key={inspection.id} inspection={inspection} isHighlighted={highlightedInspId === inspection.id} onOpenPdf={openPdfViewer} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No inspection records available</p>
          </div>
        )}
      </section>

      {/* Animal Inventory Trend Chart */}
      <section style={{ marginTop: "3rem" }}>
        <h2 className="timeline-title">Animal Inventory Trend</h2>
        <div style={{ background: "#fff", padding: "2rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)" }}>
          {(() => {
            if (!facility.inspections || facility.inspections.length === 0) {
              return <p style={{ color: "var(--neutral-500)", textAlign: "center" }}>No inventory records available</p>;
            }
            const chartData = facility.inspections
              .map(insp => {
                const total = insp.inventory?.reduce((sum, item) => sum + item.count, 0) || 0;
                return { date: formatDate(insp.inspection_date), count: total, rawDate: insp.inspection_date };
              })
              .filter(item => item.count > 0)
              .sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));
            
            if (chartData.length === 0) {
              return <p style={{ color: "var(--neutral-500)", textAlign: "center" }}>No inventory records available</p>;
            }
            if (chartData.length === 1) {
              return <p style={{ color: "var(--neutral-500)", textAlign: "center" }}>Only one inspection available for trend: <strong>{chartData[0].count} animals</strong></p>;
            }

            return (
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickMargin={10} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
                    <Line type="monotone" dataKey="count" stroke="#1d4ed8" strokeWidth={3} dot={{ r: 4, fill: "#1d4ed8" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes fadeInStagger { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUpModal { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes highlightPulse { 0% { background: #fffbeb; } 50% { background: #fef3c7; } 100% { background: #fffbeb; } }
      `}</style>

      {/* AI Research Summary Section */}
      <section style={{ marginTop: "3rem", marginBottom: "4rem" }}>
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
          overflow: "hidden"
        }}>
          {/* Header Row */}
          <div style={{ padding: "24px 32px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "28px" }}>✨</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", color: "#111827" }}>AI Research Summary</h3>
                <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>Powered by Llama 3.3 70B via Groq</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ background: "#fef08a", color: "#854d0e", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: "bold" }}>BETA</span>
              {(!aiSummary && !generatingAI) && (
                <button 
                  onClick={async () => {
                    setGeneratingAI(true);
                    setAiError(null);
                    try {
                      const result = await generateAISummary(id);
                      setAiSummary(result);
                    } catch (err) {
                      setAiError(err.response?.data?.detail || err.message);
                    } finally {
                      setGeneratingAI(false);
                    }
                  }}
                  style={{ background: "#059669", color: "white", border: "1px solid transparent", padding: "8px 16px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "14px", transition: "all 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "#047857"}
                  onMouseOut={e => e.currentTarget.style.background = "#059669"}
                >
                  Generate
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: "32px" }}>
            {aiError && (
              <div style={{ background: "#fee2e2", borderLeft: "4px solid #ef4444", padding: "16px", borderRadius: "8px", marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#b91c1c", fontWeight: "bold", marginBottom: "8px" }}>
                  <span>❌</span> Summary Generation Failed
                </div>
                <p style={{ margin: 0, color: "#991b1b", fontSize: "14px" }}>{aiError}</p>
                <button onClick={() => setAiError(null)} style={{ marginTop: "12px", background: "white", border: "1px solid #fca5a5", color: "#b91c1c", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>Dismiss</button>
              </div>
            )}

            {!aiSummary && !generatingAI && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄✨</div>
                <h3 style={{ fontSize: "24px", color: "#111827", margin: "0 0 12px 0" }}>AI-Powered Inspection Analysis</h3>
                <p style={{ color: "#6b7280", maxWidth: "600px", margin: "0 auto 32px auto", lineHeight: "1.6" }}>
                  Generate an AI-powered summary of this facility inspection history. The system analyzes all inspection records and produces a legally-structured report with cited sources.
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "40px", flexWrap: "wrap" }}>
                  <span style={{ background: "#f3f4f6", padding: "8px 16px", borderRadius: "99px", fontSize: "14px", fontWeight: "500", color: "#374151" }}>📋 Fact vs Inference Labeling</span>
                  <span style={{ background: "#f3f4f6", padding: "8px 16px", borderRadius: "99px", fontSize: "14px", fontWeight: "500", color: "#374151" }}>🔗 Source Citations</span>
                  <span style={{ background: "#f3f4f6", padding: "8px 16px", borderRadius: "99px", fontSize: "14px", fontWeight: "500", color: "#374151" }}>⚖️ Legal Language</span>
                </div>
                <button 
                  onClick={async () => {
                    setGeneratingAI(true);
                    setAiError(null);
                    try {
                      const result = await generateAISummary(id);
                      setAiSummary(result);
                    } catch (err) {
                      setAiError(err.response?.data?.detail || err.message);
                    } finally {
                      setGeneratingAI(false);
                    }
                  }}
                  style={{ background: "#059669", color: "white", border: "none", padding: "16px 32px", borderRadius: "8px", fontSize: "18px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", flexDirection: "column", alignItems: "center", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", transition: "all 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "#047857"}
                  onMouseOut={e => e.currentTarget.style.background = "#059669"}
                >
                  <span>✨ Generate AI Summary</span>
                  <span style={{ fontSize: "13px", opacity: 0.9, marginTop: "6px", fontWeight: "normal" }}>Analyzes {facility.inspections?.length || 0} inspections</span>
                </button>
              </div>
            )}

            {generatingAI && (
              <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", animation: "fadeInStagger 0.5s" }}>
                <div style={{ width: "300px", height: "6px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden", marginBottom: "32px" }}>
                  <div style={{ width: "50%", height: "100%", background: "#059669", animation: "pulse 1.5s infinite" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "300px", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#059669", fontWeight: "500", animation: "fadeInStagger 0.3s 0s both" }}><span>✅</span> Loading inspection records...</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#059669", fontWeight: "500", animation: "fadeInStagger 0.3s 1s both" }}><span>✅</span> Analyzing violation patterns...</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#d97706", fontWeight: "500", animation: "fadeInStagger 0.3s 2s both" }}>
                    <span style={{ width: "16px", height: "16px", border: "2px solid #d97706", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }}></span>
                    Generating legal summary...
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#9ca3af", animation: "fadeInStagger 0.3s 3s both" }}><span>○</span> Formatting citations...</div>
                </div>
                <p style={{ marginTop: "32px", color: "#6b7280", fontSize: "14px", textAlign: "center" }}>This takes 10-15 seconds<br/>Do not close this page</p>
              </div>
            )}

            {aiSummary && !generatingAI && (() => {
              // Group sentences into sections
              const sections = [];
              let currentSection = { title: "Overview", type: "normal", items: [] };
              
              aiSummary.sentences.forEach(s => {
                if (s.type === "TEXT" && s.text.match(/^[0-9]\.\s/)) {
                  if (currentSection.items.length > 0 || currentSection.title !== "Overview") {
                    sections.push(currentSection);
                  }
                  const titleText = s.text.replace(/^[0-9]\.\s+/, "");
                  currentSection = { 
                    title: titleText, 
                    type: titleText.toUpperCase().includes("INVESTIGATION PRIORITIES") ? "dark" : "normal", 
                    items: [] 
                  };
                } else {
                  currentSection.items.push(s);
                }
              });
              if (currentSection.items.length > 0) sections.push(currentSection);

              return (
                <div style={{ animation: "fadeInStagger 0.5s ease-out" }}>
                  <div style={{ background: "#f3f4f6", padding: "12px 16px", borderRadius: "8px", display: "flex", flexWrap: "wrap", gap: "24px", fontSize: "13px", color: "#4b5563", marginBottom: "24px" }}>
                    <div><strong>Generated:</strong> {new Date(aiSummary.generated_at).toLocaleString()}</div>
                    <div><strong>Model:</strong> {aiSummary.model || "Llama 3.3 70B"}</div>
                    <div><strong>Inspections analyzed:</strong> {aiSummary.total_inspections}</div>
                    <div><strong>Confidence:</strong> High</div>
                  </div>

                  {/* Yellow Disclaimer */}
                  {showDisclaimer && (
                    <div style={{ background: "#fef3c7", padding: "16px 20px", borderRadius: "8px", borderLeft: "4px solid #f59e0b", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "32px", position: "relative" }}>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <span style={{ fontSize: "20px" }}>⚠️</span>
                        <div>
                          <strong style={{ color: "#92400e", display: "block", marginBottom: "4px" }}>For Research Purposes Only</strong>
                          <span style={{ color: "#b45309", fontSize: "14px", lineHeight: "1.5" }}>This AI-generated summary requires human review before legal use. All claims are linked to source inspection records.</span>
                        </div>
                      </div>
                      <button onClick={() => setShowDisclaimer(false)} style={{ background: "transparent", border: "none", color: "#92400e", cursor: "pointer", fontSize: "16px", opacity: 0.7 }}>✕</button>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                    {sections.map((sec, sIdx) => {
                      if (sec.type === "dark") {
                        return (
                          <div key={sIdx} style={{ background: "#1a4731", borderRadius: "10px", padding: "24px", color: "white" }}>
                            <h4 style={{ margin: "0 0 20px 0", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>🎯</span> {sec.title}
                            </h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                              {sec.items.map((item, iIdx) => (
                                <div key={iIdx} style={{ background: "rgba(255,255,255,0.1)", padding: "16px", borderRadius: "8px", display: "flex", gap: "16px", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"} onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}>
                                  <div style={{ background: "#059669", color: "white", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}>{iIdx + 1}</div>
                                  <div style={{ fontSize: "14px", lineHeight: "1.6" }}>{item.text}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={sIdx}>
                          <h4 style={{ color: "#111827", fontSize: "18px", borderBottom: "2px solid #e5e7eb", paddingBottom: "8px", marginBottom: "16px", textTransform: "capitalize" }}>{sec.title}</h4>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {sec.items.map((item, iIdx) => {
                              if (item.type === "TEXT") {
                                return <p key={iIdx} style={{ margin: "0 0 12px 0", color: "#374151", fontSize: "15px", lineHeight: "1.6" }}>{item.text}</p>;
                              }

                              const isFact = item.type === "FACT";
                              const borderColor = isFact ? "#2563eb" : "#d97706";
                              const bgColor = isFact ? "#eff6ff" : "#fffbeb";
                              const badgeBg = isFact ? "#dbeafe" : "#ffedd5";
                              const badgeColor = isFact ? "#1e40af" : "#c2410c";
                              const badgeText = isFact ? "✓ VERIFIED FACT" : "~ ANALYTICAL INFERENCE";
                              const tooltip = isFact ? "Directly stated in inspection record" : "Analytical conclusion based on patterns";
                              
                              const animationDelay = `${Math.min((sIdx * sec.items.length + iIdx) * 50, 1000)}ms`;

                              return (
                                <div key={iIdx} style={{ borderLeft: `4px solid ${borderColor}`, background: bgColor, padding: "12px 16px", marginBottom: "8px", borderRadius: "6px", animation: `fadeInStagger 0.4s ${animationDelay} both` }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                    <span title={tooltip} style={{ background: badgeBg, color: badgeColor, padding: "2px 8px", borderRadius: "99px", fontSize: "10px", fontWeight: "bold", cursor: "help" }}>{badgeText}</span>
                                    {item.citation && (
                                      <span 
                                        title="Click to jump to this inspection"
                                        style={{ fontSize: "11px", color: "#6b7280", fontStyle: "italic", cursor: "pointer", textDecoration: "underline" }}
                                        onClick={() => {
                                          jumpToCitation(item.citation, item.text);
                                        }}
                                      >
                                        {item.citation}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ color: "#111827", fontSize: "15px", lineHeight: "1.6" }}>{item.text}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: "40px", paddingTop: "24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                    <button 
                      onClick={async () => {
                        setGeneratingAI(true);
                        setAiError(null);
                        try {
                          const result = await generateAISummary(id);
                          setAiSummary(result);
                        } catch (err) {
                          setAiError(err.response?.data?.detail || err.message);
                        } finally {
                          setGeneratingAI(false);
                        }
                      }}
                      style={{ background: "transparent", border: "1px solid #d1d5db", color: "#374151", padding: "10px 20px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
                      onMouseOver={e => e.currentTarget.style.background = "#f9fafb"}
                      onMouseOut={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span>🔄</span> Regenerate Summary
                    </button>
                    <button 
                      onClick={async () => {
                        setGeneratingMemo(true);
                        setMemoError(null);
                        try {
                          const result = await generateLegalMemo(id);
                          setLegalMemo(result);
                          setShowMemoModal(true);
                        } catch (err) {
                          setMemoError(err.response?.data?.detail || err.message);
                        } finally {
                          setGeneratingMemo(false);
                        }
                      }}
                      style={{ background: "#1a4731", color: "white", border: "none", padding: "10px 24px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                      onMouseOver={e => e.currentTarget.style.background = "#143625"}
                      onMouseOut={e => e.currentTarget.style.background = "#1a4731"}
                    >
                      {generatingMemo ? (
                        <><span className="spinner" style={{ width: "14px", height: "14px", border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }}></span> Drafting...</>
                      ) : (
                        <>📋 Draft Legal Memo <span>→</span></>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      </div> {/* End left panel */}

      {/* Right panel - PDF viewer */}
      {activePdf && (
        <div style={{ width: '45%', position: 'sticky', top: '80px', height: 'calc(100vh - 100px)' }}>
          <PDFViewer
            pdfUrl={activePdf}
            highlightPage={pdfPage}
            highlightText={pdfHighlight}
            onClose={closePdfViewer}
            inspectionDate={activePdfDate}
            facilityName={facility.name}
          />
        </div>
      )}

      {/* Full Screen Legal Memo Modal Overlay */}
      {showMemoModal && legalMemo && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "2rem" }} onClick={() => setShowMemoModal(false)}>
          <div 
            style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "800px", height: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", animation: "slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ background: "#1a4731", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "28px" }}>⚖️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>Legal Complaint Memo Draft</h3>
                  <p style={{ margin: "4px 0 0 0", color: "#a7f3d0", fontSize: "14px" }}>{legalMemo.facility_name} | Certificate {legalMemo.certificate}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button 
                  onClick={(e) => {
                    navigator.clipboard.writeText(legalMemo.memo_text);
                    const btn = e.currentTarget;
                    const oldHtml = btn.innerHTML;
                    btn.innerHTML = "✓ Copied!";
                    setTimeout(() => btn.innerHTML = oldHtml, 2000);
                  }}
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500", transition: "background 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                  onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                >📋 Copy</button>
                <button 
                  onClick={() => {
                    const blob = new Blob([legalMemo.memo_text], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `AWA_Memo_${legalMemo.facility_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
                    a.click();
                  }}
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500", transition: "background 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                  onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                >⬇️ Download</button>
                <button 
                  onClick={() => setShowMemoModal(false)}
                  style={{ background: "transparent", border: "none", color: "white", padding: "8px", cursor: "pointer", fontSize: "20px", opacity: 0.7, transition: "opacity 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.opacity = 1}
                  onMouseOut={e => e.currentTarget.style.opacity = 0.7}
                >✕</button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", background: "#f9fafb", padding: "32px", scrollBehavior: "smooth" }}>
              {/* Document Header Block */}
              <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb", borderBottom: "2px solid #d1d5db", fontFamily: "monospace", fontSize: "13px", marginBottom: "32px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <tbody>
                    <tr><td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", width: "80px", color: "#4b5563" }}>TO:</td><td style={{ padding: "4px 0" }}>Animal Welfare Investigation Team</td></tr>
                    <tr><td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", color: "#4b5563" }}>FROM:</td><td style={{ padding: "4px 0" }}>AWA Records Analysis Platform</td></tr>
                    <tr><td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", color: "#4b5563" }}>RE:</td><td style={{ padding: "4px 0", fontWeight: "bold" }}>{legalMemo.facility_name} | Certificate {legalMemo.certificate}</td></tr>
                    <tr><td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", color: "#4b5563" }}>DATE:</td><td style={{ padding: "4px 0" }}>{new Date(legalMemo.generated_at).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
                    <tr><td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", color: "#4b5563" }}>STATUS:</td><td style={{ padding: "4px 0", color: "#b91c1c", fontWeight: "bold" }}>DRAFT - REQUIRES HUMAN REVIEW</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Document Body */}
              <div style={{ background: "white", padding: "40px", borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                {(() => {
                  // Parse the memo into sections
                  const text = legalMemo.memo_text;
                  const sections = text.split(/(?=\n\d+\.\s+[A-Z\s]+)/);
                  
                  return sections.map((section, idx) => {
                    const match = section.match(/^\s*(\d+\.\s+[A-Z\s]+)\n([\s\S]*)$/);
                    if (match) {
                      const heading = match[1];
                      let content = match[2];
                      
                      return (
                        <div key={idx} style={{ marginBottom: "32px" }}>
                          <h4 style={{ textTransform: "uppercase", letterSpacing: "1px", borderBottom: "1px solid #1a4731", color: "#1a4731", margin: "0 0 16px 0", paddingBottom: "8px", fontSize: "16px" }}>
                            {heading}
                          </h4>
                          <div style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151", whiteSpace: "pre-wrap" }}>
                            {content.split(/(\([^)]*(?:Inspection|Source)[^)]*\)|Sec\s+\d+\.\d+|\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b)/g).map((part, pIdx) => {
                              if (!part) return null;
                              if (part.match(/\([^)]*(?:Inspection|Source)[^)]*\)/)) {
                                return <span key={pIdx} style={{ color: "#2563eb", textDecoration: "underline", fontWeight: "500" }}>{part}</span>;
                              }
                              if (part.match(/^Sec\s+\d+\.\d+/)) {
                                return <span key={pIdx} style={{ background: "#f3f4f6", fontFamily: "monospace", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", border: "1px solid #e5e7eb" }}>{part}</span>;
                              }
                              if (part.match(/\b\d{4}-\d{2}-\d{2}\b/) || part.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/)) {
                                return <strong key={pIdx} style={{ color: "#111827" }}>{part}</strong>;
                              }
                              if (legalMemo.facility_name && part.includes(legalMemo.facility_name)) {
                                const splitFn = part.split(new RegExp(`(${legalMemo.facility_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
                                return splitFn.map((s, sIdx) => s.toLowerCase() === legalMemo.facility_name.toLowerCase() ? <strong key={`${pIdx}-${sIdx}`} style={{ color: "#111827" }}>{s}</strong> : s);
                              }
                              return part;
                            })}
                          </div>
                        </div>
                      );
                    } else if (section.trim()) {
                      return <div key={idx} style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151", whiteSpace: "pre-wrap", marginBottom: "32px" }}>{section.trim()}</div>;
                    }
                    return null;
                  });
                })()}

                {/* Document Footer */}
                <div style={{ marginTop: "48px", background: "#fef2f2", border: "1px solid #fecaca", padding: "20px", borderRadius: "8px" }}>
                  <div style={{ color: "#dc2626", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚠️</span> DISCLAIMER
                  </div>
                  <p style={{ margin: 0, color: "#991b1b", fontSize: "13px", lineHeight: "1.5" }}>{legalMemo.disclaimer}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ background: "white", borderTop: "1px solid #e5e7eb", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                Generated by AWA Records Platform<br/>
                {new Date(legalMemo.generated_at).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <button 
                  onClick={(e) => {
                    navigator.clipboard.writeText(legalMemo.memo_text);
                    const btn = e.currentTarget;
                    const oldHtml = btn.innerHTML;
                    btn.innerHTML = "✓ Copied!";
                    setTimeout(() => btn.innerHTML = oldHtml, 2000);
                  }}
                  style={{ background: "white", border: "1px solid #d1d5db", color: "#374151", padding: "10px 20px", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500", transition: "all 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "#f9fafb"}
                  onMouseOut={e => e.currentTarget.style.background = "white"}
                >📋 Copy to Clipboard</button>
                <button 
                  onClick={() => {
                    const blob = new Blob([legalMemo.memo_text], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `AWA_Memo_${legalMemo.facility_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
                    a.click();
                  }}
                  style={{ background: "#059669", border: "none", color: "white", padding: "10px 24px", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600", transition: "background 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = "#047857"}
                  onMouseOut={e => e.currentTarget.style.background = "#059669"}
                >⬇️ Download .txt</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
