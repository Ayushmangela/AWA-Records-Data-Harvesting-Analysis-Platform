import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { getDashboardStats } from "../services/api";
import {
  ComplianceIndicator,
  DossierSection,
  InvestigationTable,
  MetricPanel,
  TimelinePanel,
} from "../components/IntelligenceSystem";

const CACHE_KEY = "dashboard-overview-cache:v2";
const CACHE_TTL_MS = 10 * 60 * 1000;
const PIE_COLORS = ["#e9c349", "#0ea5a4", "#f97316", "#ef4444", "#a855f7", "#22c55e"];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonth(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // Ignore storage errors.
  }
}

function trendTone(change) {
  if (change === null || change === undefined) return "neutral";
  if (change > 0) return "critical";
  if (change < 0) return "primary";
  return "neutral";
}

function TrendValue({ change, delta }) {
  if (change === null || change === undefined) {
    return <span className="text-on-surface-variant">All time</span>;
  }

  const positive = change > 0;
  return (
    <span className={positive ? "text-error" : "text-secondary"}>
      {positive ? "▲" : "▼"} {formatPercent(Math.abs(change))} {delta >= 0 ? "higher" : "lower"}
    </span>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-white/5 bg-surface-container-low p-5 animate-pulse">
            <div className="h-3 w-24 rounded-full bg-surface-variant/20"></div>
            <div className="mt-4 h-8 w-28 rounded-md bg-surface-variant/25"></div>
            <div className="mt-3 h-3 w-20 rounded-md bg-surface-variant/20"></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-[28px] border border-white/5 bg-surface-container-low p-6 animate-pulse h-[420px]"></div>
        <div className="rounded-[28px] border border-white/5 bg-surface-container-low p-6 animate-pulse h-[420px]"></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="rounded-[28px] border border-white/5 bg-surface-container-low p-6 animate-pulse h-[340px]"></div>
        <div className="rounded-[28px] border border-white/5 bg-surface-container-low p-6 animate-pulse h-[340px]"></div>
        <div className="rounded-[28px] border border-white/5 bg-surface-container-low p-6 animate-pulse h-[340px]"></div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const glowRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!glowRef.current) return;
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      glowRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(233, 195, 73, 0.1) 0%, transparent 60%)`;
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const cached = readCache();
    if (cached?.data) {
      setData(cached.data);
      setLastUpdatedAt(cached.timestamp);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await getDashboardStats();
        if (cancelled) return;
        setData(response);
        setLastUpdatedAt(Date.now());
        writeCache(response);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = data?.kpi_trends || {};
  const severityData = useMemo(
    () =>
      Object.entries(data?.violations_overview?.severity_distribution || {}).map(([label, count]) => ({
        label,
        count,
      })),
    [data],
  );

  const directIndirectData = useMemo(() => {
    const summary = data?.violations_overview?.direct_vs_indirect || {};
    return [
      { label: "Direct/Critical", count: summary.direct_or_critical || 0 },
      { label: "Indirect/Teachable", count: summary.indirect_or_teachable || 0 },
    ];
  }, [data]);

  const categoryData = useMemo(
    () => (data?.violations_overview?.top_categories || []).map((item) => ({ label: item.category, count: item.count })),
    [data],
  );

  const penaltyTrendData = useMemo(
    () => (data?.enforcement_overview?.penalty_trend || []).map((item) => ({
      month: formatMonth(item.month),
      count: item.count,
      penalty_total: item.penalty_total,
    })),
    [data],
  );

  const recentInspectionItems = useMemo(
    () =>
      (data?.recent_activity || [])
        .filter((item) => item.type === "inspection")
        .slice(0, 5)
        .map((item) => ({
          title: item.title,
          meta: formatDate(item.date),
          body: item.detail,
          tone: item.tone || "primary",
        })),
    [data],
  );

  const recentActivityItems = useMemo(
    () =>
      (data?.recent_activity || []).map((item) => ({
        title: item.title,
        meta: formatDateTime(item.date),
        body: item.detail,
        tone: item.tone || "primary",
      })),
    [data],
  );

  const topInspectorsRows = (data?.inspector_activity || []).map((row) => ({ ...row, key: row.inspector_id }));
  const recentEnforcementRows = (data?.enforcement_overview?.recent_enforcement_actions || []).map((row) => ({ ...row, key: row.id }));
  const topViolationsRows = (data?.facility_risk_queue?.high_violation_facilities || []).map((row) => ({ ...row, key: row.id }));
  const directCriticalRows = (data?.facility_risk_queue?.direct_critical_facilities || []).map((row) => ({ ...row, key: row.id }));
  const enforcementHistoryRows = (data?.facility_risk_queue?.facilities_with_enforcement_actions || []).map((row) => ({ ...row, key: row.id }));

  return (
    <>
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0">
        <div ref={glowRef} className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"></div>
      </div>

      <div className="investigative-shell relative z-10">
        <header className="mb-8 rounded-[28px] border border-white/5 bg-surface-container-low px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="section-kicker mb-3">COMMAND CENTER</div>
              <h1 className="font-headline-lg text-[clamp(2rem,3vw,3rem)] leading-tight font-bold text-on-surface max-w-4xl">
                Compliance and investigation dashboard.
              </h1>
              <p className="mt-3 max-w-3xl text-[16px] leading-[26px] text-on-surface-variant">
                Real counts, live enforcement activity, recent inspections, and risk queues derived directly from platform records.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-on-surface-variant">
              <span className="font-bold text-secondary">Last updated</span>
              <span>{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—"}</span>
            </div>
          </div>
        </header>

        {loading ? (
          <SectionSkeleton />
        ) : (
          <div className="space-y-8">
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
              <MetricPanel label="Total Facilities" value={formatNumber(data?.total_facilities)} detail="All facilities in the platform" tone="primary" />
              <MetricPanel
                label="Total Inspections"
                value={formatNumber(data?.total_inspections)}
                detail={<TrendValue change={kpis.inspections?.change} delta={kpis.inspections?.delta} />}
                tone={trendTone(kpis.inspections?.change)}
              />
              <MetricPanel
                label="Total Violations"
                value={formatNumber(data?.total_violations)}
                detail={<TrendValue change={kpis.violations?.change} delta={kpis.violations?.delta} />}
                tone={trendTone(kpis.violations?.change)}
              />
              <MetricPanel
                label="Total Enforcement Actions"
                value={formatNumber(data?.total_enforcement_actions)}
                detail={<TrendValue change={kpis.enforcement_actions?.change} delta={kpis.enforcement_actions?.delta} />}
                tone={trendTone(kpis.enforcement_actions?.change)}
              />
              <MetricPanel label="Total Inspectors" value={formatNumber(data?.total_inspectors)} detail="Unique inspector IDs observed" tone="primary" />
              <MetricPanel
                label="OCR Processed Documents"
                value={formatNumber(data?.ocr_processed_documents)}
                detail={<TrendValue change={kpis.ocr_processed_documents?.change} delta={kpis.ocr_processed_documents?.delta} />}
                tone={trendTone(kpis.ocr_processed_documents?.change)}
              />
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <DossierSection label="RECENT ACTIVITY" title="Operational timeline" subtitle="Latest inspections, violations, enforcement actions, and document intake events in one chronological feed.">
                <TimelinePanel items={recentActivityItems} />
              </DossierSection>

              <DossierSection label="VIOLATIONS OVERVIEW" title="Severity and category mix" subtitle="Charts are driven entirely by violation rows and mapped sections.">
                <div className="grid grid-cols-1 gap-6">
                  <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Violations by severity</div>
                    <div className="h-[220px]">
                      {severityData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={severityData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                            <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} />
                            <YAxis stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} />
                            <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#e9c349" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">No severity data</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4">
                      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Direct vs indirect</div>
                      <div className="h-[220px]">
                        {directIndirectData.some((item) => item.count > 0) ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={directIndirectData} dataKey="count" nameKey="label" innerRadius={54} outerRadius={78} paddingAngle={4}>
                                {directIndirectData.map((entry, index) => (
                                  <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">No direct/indirect split</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4">
                      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Top violation categories</div>
                      <div className="h-[220px]">
                        {categoryData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 8, left: 30, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
                              <XAxis type="number" stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} />
                              <YAxis type="category" dataKey="label" stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} width={90} />
                              <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                              <Bar dataKey="count" radius={[0, 8, 8, 0]} fill="#0ea5a4" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">No category data</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </DossierSection>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1fr] gap-6">
              <DossierSection label="GEOGRAPHIC OVERVIEW" title="Facilities by state" subtitle="State counts across facilities, violations, and enforcement actions.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "state", label: "State", render: (row) => row.state },
                    { key: "count", label: "Facilities", align: "right", render: (row) => formatNumber(row.count) },
                  ]}
                  rows={(data?.geographic_overview?.facilities_by_state || []).slice(0, 8).map((row) => ({ ...row, key: row.state }))}
                />
              </DossierSection>

              <DossierSection label="GEOGRAPHIC OVERVIEW" title="Violations by state" subtitle="Geographic concentration of violation activity.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "state", label: "State", render: (row) => row.state },
                    { key: "count", label: "Violations", align: "right", render: (row) => formatNumber(row.count) },
                  ]}
                  rows={(data?.geographic_overview?.violations_by_state || []).slice(0, 8).map((row) => ({ ...row, key: row.state }))}
                />
              </DossierSection>

              <DossierSection label="GEOGRAPHIC OVERVIEW" title="Enforcement by state" subtitle="Action volume across states.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "state", label: "State", render: (row) => row.state },
                    { key: "count", label: "Actions", align: "right", render: (row) => formatNumber(row.count) },
                  ]}
                  rows={(data?.geographic_overview?.enforcement_by_state || []).slice(0, 8).map((row) => ({ ...row, key: row.state }))}
                />
              </DossierSection>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <DossierSection label="INSPECTOR ACTIVITY" title="Most active inspectors" subtitle="Inspection volume, violations found, and most recent activity are driven from inspection records.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    {
                      key: "inspector",
                      label: "Inspector",
                      render: (row) => (
                        <div>
                          <div className="font-medium text-on-surface">{row.inspector_name}</div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{row.inspector_id}</div>
                        </div>
                      ),
                    },
                    { key: "inspection_count", label: "Inspections", align: "right", render: (row) => formatNumber(row.inspection_count) },
                    { key: "violations_found", label: "Violations Found", align: "right", render: (row) => formatNumber(row.violations_found) },
                    { key: "recent_inspection_date", label: "Recent", render: (row) => formatDate(row.recent_inspection_date) },
                  ]}
                  rows={topInspectorsRows}
                />

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Recent inspection activity</div>
                    <TimelinePanel items={recentInspectionItems} />
                  </div>
                  <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Inspector coverage</div>
                    <div className="space-y-3">
                      {topInspectorsRows.map((row) => (
                        <ComplianceIndicator
                          key={row.inspector_id}
                          label={row.inspector_name}
                          value={formatNumber(row.inspection_count)}
                          detail={`${formatNumber(row.violations_found)} violations found · Last ${formatDate(row.recent_inspection_date)}`}
                          tone={row.violations_found > 0 ? "critical" : "primary"}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </DossierSection>

              <DossierSection label="ENFORCEMENT OVERVIEW" title="Penalty trends and recent actions" subtitle="Recent action rows and penalty history are sourced from enforcement action records.">
                <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4 mb-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Penalty amount trends</div>
                  <div className="h-[220px]">
                    {penaltyTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={penaltyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} />
                          <YAxis stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                          <Area type="monotone" dataKey="penalty_total" stroke="#e9c349" fill="rgba(233,195,73,0.18)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">No penalty trend data</div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-surface-container-low p-4 mb-4">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Recent enforcement actions</div>
                  <InvestigationTable
                    density="compact"
                    columns={[
                      {
                        key: "facility",
                        label: "Facility",
                        render: (row) => (
                          <div>
                            <div className="font-medium text-on-surface">{row.facility_name}</div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{row.facility_state}</div>
                          </div>
                        ),
                      },
                      { key: "action_type", label: "Type", render: (row) => row.action_type },
                      { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                      { key: "penalty", label: "Penalty", align: "right", render: (row) => (row.penalty_amount ? `$${formatNumber(row.penalty_amount)}` : "—") },
                    ]}
                    rows={recentEnforcementRows}
                  />
                </div>

                <DossierSection label="ENFORCEMENT HISTORY" title="Facilities with enforcement history" subtitle="Facilities with repeated action history and total penalties.">
                  <InvestigationTable
                    density="compact"
                    columns={[
                      { key: "name", label: "Facility", render: (row) => row.name },
                      { key: "state", label: "State", render: (row) => row.state },
                      { key: "action_count", label: "Actions", align: "right", render: (row) => formatNumber(row.action_count) },
                    ]}
                    rows={enforcementHistoryRows}
                  />
                </DossierSection>
              </DossierSection>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <DossierSection label="RISK QUEUE" title="Highest violation counts" subtitle="Facilities with the largest overall violation exposure.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "name", label: "Facility", render: (row) => row.name },
                    { key: "count", label: "Violations", align: "right", render: (row) => formatNumber(row.violation_count) },
                  ]}
                  rows={topViolationsRows}
                />
              </DossierSection>

              <DossierSection label="RISK QUEUE" title="Direct or critical violations" subtitle="Facilities with the most direct/critical exposure over the 18-month window.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "name", label: "Facility", render: (row) => row.name },
                    { key: "count", label: "Direct/Critical", align: "right", render: (row) => formatNumber(row.direct_critical_count) },
                  ]}
                  rows={directCriticalRows}
                />
              </DossierSection>

              <DossierSection label="RISK QUEUE" title="Facilities with enforcement actions" subtitle="Facilities with repeated enforcement activity and penalty history.">
                <InvestigationTable
                  density="compact"
                  columns={[
                    { key: "name", label: "Facility", render: (row) => row.name },
                    { key: "actions", label: "Actions", align: "right", render: (row) => formatNumber(row.action_count) },
                    { key: "penalty", label: "Penalty", align: "right", render: (row) => (row.total_penalty ? `$${formatNumber(row.total_penalty)}` : "—") },
                  ]}
                  rows={enforcementHistoryRows}
                />
              </DossierSection>
            </section>

            <footer className="mt-4 border-t border-outline-variant/10 py-8 text-[11px] uppercase tracking-[0.22em] text-on-surface-variant flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <span>All widgets reflect platform records only. No synthetic metrics are used.</span>
              <div className="flex items-center gap-4">
                <Link to="/search" className="no-underline text-on-surface-variant hover:text-secondary">
                  Search
                </Link>
                <Link to="/inspectors" className="no-underline text-on-surface-variant hover:text-secondary">
                  Inspectors
                </Link>
                <Link to="/enforcement" className="no-underline text-on-surface-variant hover:text-secondary">
                  Enforcement
                </Link>
              </div>
            </footer>
          </div>
        )}
      </div>
    </>
  );
}
