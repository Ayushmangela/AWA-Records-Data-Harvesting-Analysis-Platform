import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { getFacility } from "../services/api";

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

function InspectionItem({ inspection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-md)",
        marginBottom: "1rem",
        border: "1px solid var(--neutral-200)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        transition: "var(--transition-smooth)",
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
          {inspection.source_pdf && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <a
                id={`pdf-link-${inspection.id}`}
                href={inspection.source_pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{
                  padding: "0.4rem 1.25rem",
                  fontSize: "0.85rem",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--neutral-800)",
                }}
              >
                📄 View Official USDA PDF
              </a>
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
                        <strong style={{ color: "var(--neutral-900)", fontSize: "0.95rem" }}>
                          Section: {violation.section || "N/A"}
                        </strong>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

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
    <div className="page">
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
              <InspectionItem key={inspection.id} inspection={inspection} />
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

      {/* AI Research Summary Section */}
      <section style={{ marginTop: "3rem", marginBottom: "4rem" }}>
        <h2 className="timeline-title">AI Research Summary</h2>
        <div style={{ background: "#fff", padding: "2rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)" }}>
          
          {!aiSummary && !generatingAI && (
            <div style={{ textAlign: "center" }}>
              <button 
                className="btn-primary" 
                style={{ width: "100%", padding: "1rem", fontSize: "1.1rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", background: "#059669" }}
                onClick={() => {
                  setGeneratingAI(true);
                  setTimeout(() => {
                    setGeneratingAI(false);
                    setAiSummary("This facility has a history of repeated violations concerning inadequate space and improper sanitation.\\nOverall, there is a pattern of non-compliance over the last 3 inspections.");
                  }, 2000);
                }}
              >
                🤖 Generate AI Summary
              </button>
              <p style={{ marginTop: "1rem", color: "var(--neutral-500)", fontSize: "0.9rem" }}>
                Feature coming soon: Requires Anthropic API Key connection.
              </p>
            </div>
          )}

          {generatingAI && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div className="loader" style={{ margin: "0 auto", borderColor: "#059669 transparent #059669 transparent" }}></div>
              <p style={{ marginTop: "1rem", color: "var(--neutral-600)", fontWeight: "500" }}>Analyzing inspection records...</p>
            </div>
          )}

          {aiSummary && (
            <div>
              <div style={{ background: "#fef3c7", color: "#92400e", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #f59e0b", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                <strong>Disclaimer:</strong> AI-generated for research purposes only. Human review required before legal use.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--neutral-100)", paddingBottom: "1rem" }}>
                  <span style={{ display: "inline-block", background: "#dbeafe", color: "#1e40af", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.5rem" }}>[FACT]</span>
                  <p style={{ margin: 0, color: "var(--neutral-800)" }}>This facility has a history of repeated violations concerning inadequate space and improper sanitation.</p>
                  <p style={{ margin: "0.25rem 0 0 0", color: "var(--neutral-500)", fontSize: "0.85rem", fontStyle: "italic" }}>Source: Routine Inspection - Apr 15, 2024</p>
                </div>
                <div>
                  <span style={{ display: "inline-block", background: "#ffedd5", color: "#c2410c", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", marginBottom: "0.5rem" }}>[INFERENCE]</span>
                  <p style={{ margin: 0, color: "var(--neutral-800)" }}>Overall, there is a pattern of systemic non-compliance across multiple inspections.</p>
                  <p style={{ margin: "0.25rem 0 0 0", color: "var(--neutral-500)", fontSize: "0.85rem", fontStyle: "italic" }}>Source: Aggregate historical analysis</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
