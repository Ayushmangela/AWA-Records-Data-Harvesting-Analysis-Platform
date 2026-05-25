import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { getDashboardStats } from "../services/api";

const PIE_COLORS = {
  Direct: "#dc2626",
  Critical: "#ea580c",
  Indirect: "#d97706",
  Teachable: "#2563eb",
  Unknown: "#6b7280"
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "AWA Platform - Dashboard";
    async function loadStats() {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (err) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ marginBottom: "2rem", color: "var(--neutral-900)" }}>Platform Dashboard</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: "120px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}></div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "60% 38%", gap: "2%", marginBottom: "2rem" }}>
          <div style={{ height: "350px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}></div>
          <div style={{ height: "350px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="error-banner">{error}</div>
        <button className="btn-primary" onClick={() => window.location.reload()} style={{ marginTop: "1rem" }}>Retry</button>
      </div>
    );
  }

  const flaggedFacilities = (stats.risk_flags_distribution?.high_direct_violations || 0) +
    (stats.risk_flags_distribution?.inventory_spike || 0) +
    (stats.risk_flags_distribution?.exceeds_animal_limit || 0);

  // Prepare data for PieChart
  const pieData = Object.entries(stats.severity_distribution || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ marginBottom: "2rem", color: "var(--neutral-900)", fontSize: "2rem", fontWeight: "800" }}>Platform Dashboard</h1>

      {/* Section 1: Stat Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ color: "#1e3a8a", fontSize: "0.9rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>Total Facilities</h3>
          <p style={{ fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)", margin: 0 }}>{stats.total_facilities?.toLocaleString()}</p>
        </div>
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #bbf7d0", borderLeft: "4px solid #16a34a", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ color: "#14532d", fontSize: "0.9rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>Total Inspections</h3>
          <p style={{ fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)", margin: 0 }}>{stats.total_inspections?.toLocaleString()}</p>
        </div>
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ color: "#7f1d1d", fontSize: "0.9rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>Total Violations</h3>
          <p style={{ fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)", margin: 0 }}>{stats.total_violations?.toLocaleString()}</p>
        </div>
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #fed7aa", borderLeft: "4px solid #ea580c", boxShadow: "var(--shadow-sm)" }}>
          <h3 style={{ color: "#7c2d12", fontSize: "0.9rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>Flagged Facilities</h3>
          <p style={{ fontSize: "2rem", fontWeight: "800", color: "var(--neutral-900)", margin: 0 }}>{flaggedFacilities.toLocaleString()}</p>
        </div>
      </section>

      {/* Section 2: Side by Side Charts */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem", marginBottom: "3rem" }}>
        {/* Left Chart */}
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)", minHeight: "350px" }}>
          <h3 style={{ marginBottom: "1.5rem", fontSize: "1.1rem", color: "var(--neutral-900)" }}>Violations by State (Top 10)</h3>
          <div style={{ width: "100%", height: 300 }}>
            {stats.top_states?.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={stats.top_states} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="state" type="category" width={40} fontSize={12} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: "8px" }} />
                  <Bar dataKey="count" fill="#dc2626" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#6b7280', fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ textAlign: "center", color: "var(--neutral-500)" }}>No state data available</p>}
          </div>
        </div>

        {/* Right Chart */}
        <div style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)", minHeight: "350px" }}>
          <h3 style={{ marginBottom: "1.5rem", fontSize: "1.1rem", color: "var(--neutral-900)" }}>Violations by Severity</h3>
          <div style={{ width: "100%", height: 300 }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || PIE_COLORS.Unknown} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "8px" }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ textAlign: "center", color: "var(--neutral-500)" }}>No severity data available</p>}
          </div>
        </div>
      </section>

      {/* Section 3: Line Chart Full Width */}
      <section style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)", marginBottom: "3rem" }}>
        <h3 style={{ marginBottom: "1.5rem", fontSize: "1.1rem", color: "var(--neutral-900)" }}>Inspections Per Month (Last 12 Months)</h3>
        <div style={{ width: "100%", height: 350 }}>
          {stats.inspections_per_month?.length > 0 ? (
            <ResponsiveContainer>
              <LineChart data={stats.inspections_per_month} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={(val) => {
                    if (!val) return "";
                    const [yyyy, mm] = val.split("-");
                    const date = new Date(yyyy, parseInt(mm)-1, 1);
                    return date.toLocaleDateString("en-US", { month: "short" });
                  }} 
                  stroke="#6b7280" fontSize={12} tickMargin={10} 
                />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  labelFormatter={(val) => {
                    if (!val) return "";
                    const [yyyy, mm] = val.split("-");
                    return new Date(yyyy, parseInt(mm)-1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  }}
                  contentStyle={{ borderRadius: "8px" }} 
                />
                <Line type="monotone" dataKey="count" stroke="#16a34a" strokeWidth={3} dot={{ r: 4, fill: "#16a34a" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign: "center", color: "var(--neutral-500)" }}>No inspection data available</p>}
        </div>
      </section>

      {/* Section 4: Top Facilities Table */}
      <section style={{ background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--neutral-200)", boxShadow: "var(--shadow-sm)", marginBottom: "4rem" }}>
        <h3 style={{ marginBottom: "1.5rem", fontSize: "1.1rem", color: "var(--neutral-900)" }}>Most Violations (Top 10)</h3>
        {stats.top_violating_facilities?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--neutral-200)" }}>
                  <th style={{ padding: "1rem", color: "var(--neutral-600)" }}>#</th>
                  <th style={{ padding: "1rem", color: "var(--neutral-600)" }}>Facility Name</th>
                  <th style={{ padding: "1rem", color: "var(--neutral-600)" }}>Violations</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_violating_facilities.map((fac, idx) => {
                  let leftBorder = "transparent";
                  if (idx === 0) leftBorder = "#dc2626"; // red
                  else if (idx === 1) leftBorder = "#ea580c"; // orange
                  else if (idx === 2) leftBorder = "#eab308"; // yellow

                  return (
                    <tr 
                      key={fac.id} 
                      onClick={() => navigate(`/facility/${fac.id}`)}
                      style={{ 
                        borderBottom: "1px solid var(--neutral-100)", 
                        cursor: "pointer", 
                        transition: "background-color 0.2s"
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--neutral-50)"}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <td style={{ padding: "1rem", borderLeft: `4px solid ${leftBorder}`, fontWeight: "600", color: "var(--neutral-500)" }}>{idx + 1}</td>
                      <td style={{ padding: "1rem", fontWeight: "500", color: "var(--neutral-900)" }}>{fac.name}</td>
                      <td style={{ padding: "1rem" }}>
                        <span className="badge badge-red">{fac.violation_count}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p style={{ color: "var(--neutral-500)" }}>No facility data available</p>}
      </section>
    </div>
  );
}
