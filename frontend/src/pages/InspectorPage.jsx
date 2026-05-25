import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInspector } from "../services/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function InspectorPage() {
  const { id } = useParams();
  const [inspector, setInspector] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getInspector(id);
        setInspector(data);
      } catch (err) {
        setError(err.response?.status === 404 ? "Inspector not found" : "Failed to load inspector");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Set page title dynamically
  useEffect(() => {
    if (inspector) {
      document.title = `Inspector: ${inspector.inspector_name || inspector.inspector_id} - AWA Platform`;
    } else {
      document.title = "Loading Inspector... - AWA Platform";
    }
  }, [inspector]);

  if (loading) {
    return (
      <div className="page" style={{ textAlign: "center", padding: "6rem 2rem" }}>
        <div className="loader"></div>
        <p style={{ marginTop: "1rem", color: "var(--neutral-600)" }}>Loading inspector analytics...</p>
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

  // Aggregate facilities visited from inspector's inspections
  const facilitiesMap = {};
  inspector.inspections?.forEach((ins) => {
    if (!ins.facility_id) return;
    if (!facilitiesMap[ins.facility_id]) {
      facilitiesMap[ins.facility_id] = {
        id: ins.facility_id,
        name: ins.facility_name || "Unknown Facility",
        state: ins.facility_state || "—",
        inspections_count: 0,
        violations_count: 0,
      };
    }
    facilitiesMap[ins.facility_id].inspections_count += 1;
    facilitiesMap[ins.facility_id].violations_count += ins.violation_count || 0;
  });

  const facilitiesVisited = Object.values(facilitiesMap).sort((a, b) => b.violations_count - a.violations_count);

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
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1.5rem" }}>
          <div>
            <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)" }}>
              {inspector.inspector_name || "Inspector Profile"}
            </h1>
            <p style={{ fontSize: "1rem", color: "var(--neutral-600)", margin: 0 }}>
              Inspector ID: <strong>{inspector.inspector_id}</strong>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--neutral-600)", fontWeight: "700", letterSpacing: "0.05em" }}>
              Total Inspections
            </span>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)" }}>
              {inspector.total_inspections}
            </p>
          </div>
        </div>
      </header>

      {/* Anomaly flag banner */}
      {inspector.anomaly_flag && (
        <div
          className="risk-banner-card"
          style={{
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            borderColor: "var(--danger-border)",
            borderLeftWidth: "4px",
            marginBottom: "1.5rem",
          }}
        >
          <span>⚠️</span> <strong>Anomaly Detected:</strong> Non-compliance rate deviates significantly from the regional average.
        </div>
      )}

      {/* Stats section */}
      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Non-Compliance Rate</span>
          <p className="stat-value">{inspector.non_compliance_rate}%</p>
        </div>
        <div className="stat-card">
          <span className="stat-label">Regional Average</span>
          <p className="stat-value">
            {inspector.regional_average_rate != null ? `${inspector.regional_average_rate}%` : "N/A"}
          </p>
        </div>
        <div className="stat-card">
          <span className="stat-label">Primary State</span>
          <p className="stat-value" style={{ color: "var(--primary)" }}>
            {inspector.primary_state || "—"}
          </p>
        </div>
      </section>

      {/* Comparison Chart */}
      <section style={{ marginTop: "3rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--neutral-900)", marginBottom: "1.25rem" }}>
          Compliance Rate Comparison
        </h2>
        <div style={{ background: "#fff", padding: "2rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ width: "100%", height: 300 }}>
            {inspector.regional_average_rate != null ? (
              <ResponsiveContainer>
                <BarChart data={[
                  { name: "This Inspector", rate: inspector.non_compliance_rate, fill: "#2563eb" },
                  { name: "Regional Average", rate: inspector.regional_average_rate, fill: "#9ca3af" }
                ]} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <Tooltip cursor={{ fill: 'transparent' }} formatter={(val) => `${val}%`} contentStyle={{ borderRadius: "8px" }} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} label={{ position: 'top', formatter: (val) => `${val}%`, fill: '#4b5563', fontWeight: 600 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: "var(--neutral-500)", textAlign: "center" }}>Regional comparison data not available</p>}
          </div>
          
          {inspector.regional_average_rate != null && (
            <div style={{ textAlign: "center", marginTop: "1rem", fontWeight: "600" }}>
              {inspector.anomaly_flag ? (
                <span style={{ color: "var(--danger-text)" }}>
                  {Math.abs(inspector.non_compliance_rate - inspector.regional_average_rate)}% {inspector.non_compliance_rate > inspector.regional_average_rate ? "above" : "below"} average
                </span>
              ) : (
                <span style={{ color: "var(--success-text)" }}>Within normal range</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Facilities list */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--neutral-900)", marginBottom: "1.25rem" }}>
          Facilities Inspected
        </h2>
        {facilitiesVisited.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {facilitiesVisited.map((fac) => {
              const badgeClass = fac.violations_count > 5 ? "badge badge-red" : fac.violations_count >= 2 ? "badge badge-yellow" : "badge badge-green";
              return (
                <div
                  key={fac.id}
                  style={{
                    background: "#fff",
                    padding: "1.25rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--neutral-200)",
                    boxShadow: "var(--shadow-sm)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <Link
                      id={`facility-link-${fac.id}`}
                      to={`/facility/${fac.id}`}
                      style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--primary)", textDecoration: "none" }}
                    >
                      {fac.name}
                    </Link>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--neutral-600)" }}>
                      State: <strong>{fac.state}</strong> • Visited <strong>{fac.inspections_count}</strong> time{fac.inspections_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span className={badgeClass}>
                      {fac.violations_count} Violation{fac.violations_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <p style={{ color: "var(--neutral-500)" }}>No facilities inspected.</p>
          </div>
        )}
      </section>
    </div>
  );
}
