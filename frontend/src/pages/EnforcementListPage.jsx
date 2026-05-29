import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getEnforcement, searchEnforcement } from "../services/api";
import {
  DossierSection,
  EvidenceBadge,
  InvestigationTable,
  MetricPanel,
  SeverityBadge,
  TimelinePanel,
} from "../components/IntelligenceSystem";

const CACHE_KEY = "enforcement-list-cache:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, payload) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), payload }));
  } catch {
    // Ignore storage failures.
  }
}

function EnforcementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-white/5 bg-surface-container-low p-5 animate-pulse">
            <div className="h-3 w-24 rounded-full bg-surface-variant/20"></div>
            <div className="mt-4 h-8 w-28 rounded-md bg-surface-variant/25"></div>
            <div className="mt-3 h-3 w-20 rounded-md bg-surface-variant/20"></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="rounded-[24px] border border-white/5 bg-surface-container-low p-5 animate-pulse h-[620px]"></div>
        <div className="rounded-[24px] border border-white/5 bg-surface-container-low p-5 animate-pulse h-[620px]"></div>
      </div>
    </div>
  );
}

export default function EnforcementListPage() {
  const glowRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const [filters, setFilters] = useState({ action_type: "", outcome: "", date_start: "", date_end: "", q: "" });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);
  const [total, setTotal] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const cacheKey = useMemo(() => `enforcement-list-cache:${JSON.stringify({ filters, page, limit })}`, [filters, page, limit]);

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

  const load = async (nextPage = 0, nextFilters = filters) => {
    const nextCacheKey = `enforcement-list-cache:${JSON.stringify({ filters: nextFilters, page: nextPage, limit })}`;
    const cached = readCache(nextCacheKey);
    if (cached?.payload) {
      setResults(cached.payload.results || []);
      setTotal(cached.payload.total ?? null);
      setPage(nextPage);
      setLastUpdatedAt(cached.timestamp);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = {
        action_type: nextFilters.action_type || undefined,
        outcome: nextFilters.outcome || undefined,
        date_start: nextFilters.date_start || undefined,
        date_end: nextFilters.date_end || undefined,
        limit,
        offset: nextPage * limit,
        include_total: true,
      };

      if (nextFilters.q && nextFilters.q.length >= 3) params.query = nextFilters.q;

      const res = await searchEnforcement(params);
      setResults(res.results || []);
      setTotal(res.total ?? null);
      setPage(nextPage);
      setLastUpdatedAt(Date.now());
      writeCache(nextCacheKey, { results: res.results || [], total: res.total ?? null });
    } catch (error) {
      console.error(error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const cached = readCache(cacheKey);
    if (cached?.payload) {
      setResults(cached.payload.results || []);
      setTotal(cached.payload.total ?? null);
      setLastUpdatedAt(cached.timestamp);
      setLoading(false);
      return;
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => load(0, filters);

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const detail = await getEnforcement(id);
      setSelectedDetail(detail);
    } catch (error) {
      console.error(error);
      alert("Failed to load enforcement details");
    } finally {
      setDetailLoading(false);
    }
  };

  const resetFilters = () => {
    const cleared = { action_type: "", outcome: "", date_start: "", date_end: "", q: "" };
    setFilters(cleared);
    load(0, cleared);
  };

  const pdfUrl = (id) => `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/documents/enforcement-pdf/${id}`;

  const penaltyCases = results.filter((row) => (row.penalty_amount || 0) > 0 || (row.outcome || "").toLowerCase().includes("consent"));
  const recentActivity = useMemo(
    () =>
      results.slice(0, 6).map((row) => ({
        title: `${row.action_type || "Action"} at ${row.facility_name || "Unknown facility"}`,
        meta: formatDateTime(row.action_date),
        body: `${row.outcome || "Pending"}${row.penalty_amount ? ` · $${row.penalty_amount.toLocaleString()}` : ""}`,
        tone: row.penalty_amount ? "critical" : "primary",
      })),
    [results],
  );

  return (
    <div className="investigative-shell relative z-10">
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0">
        <div ref={glowRef} className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"></div>
      </div>

      <header className="mb-8 rounded-[26px] border border-white/5 bg-surface-container-low px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="section-kicker mb-3">ENFORCEMENT</div>
            <h1 className="font-headline-lg text-[clamp(1.9rem,3vw,2.8rem)] leading-tight font-bold text-on-surface max-w-4xl">Enforcement actions, penalties, and evidence links.</h1>
            <p className="mt-3 max-w-3xl text-[16px] leading-[26px] text-on-surface-variant">A compact operations view for reviewing actions, opening source PDFs, and jumping into the linked facility record.</p>
          </div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-on-surface-variant">
            <span className="font-bold text-secondary">Last updated</span> {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—"}
          </div>
        </div>
      </header>

      {loading ? (
        <EnforcementSkeleton />
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricPanel label="Visible Actions" value={results.length} detail={total !== null ? `${total} total matched` : "Loading results"} tone="primary" />
            <MetricPanel label="Penalty Cases" value={penaltyCases.length} detail="Consent or monetary exposure" tone="critical" />
            <MetricPanel label="Current Page" value={page + 1} detail={`Page size ${limit}`} tone="secondary" />
            <MetricPanel label="Detail Open" value={selectedDetail ? 1 : 0} detail={selectedDetail ? "Drawer active" : "Select a row"} tone="primary" />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1fr_0.85fr] gap-6">
            <DossierSection label="FILTERS" title="Evidence search controls" subtitle="Use the same real API filters, now presented as an operational tool.">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <input placeholder="Search text (≥3 chars)" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
                <input placeholder="Action type" value={filters.action_type} onChange={(e) => setFilters({ ...filters, action_type: e.target.value })} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
                <input placeholder="Outcome" value={filters.outcome} onChange={(e) => setFilters({ ...filters, outcome: e.target.value })} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
                <input type="date" value={filters.date_start} onChange={(e) => setFilters({ ...filters, date_start: e.target.value })} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
                <input type="date" value={filters.date_end} onChange={(e) => setFilters({ ...filters, date_end: e.target.value })} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
                <div className="flex items-end gap-3 justify-end xl:col-span-1">
                  <button className="bg-secondary text-on-secondary px-5 py-3 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest border-none" onClick={applyFilters} type="button">Apply</button>
                  <button className="bg-transparent border border-outline-variant/20 text-on-surface-variant px-5 py-3 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest" onClick={resetFilters} type="button">Reset</button>
                </div>
              </div>
            </DossierSection>

            <DossierSection label="RECENT ACTIVITY" title="Recent enforcement timeline" subtitle="Latest enforcement actions in the current result set.">
              <TimelinePanel items={recentActivity} />
            </DossierSection>
          </section>

          <DossierSection
            label="ENFORCEMENT TABLE"
            title="Investigation table"
            subtitle="Open PDFs, inspect summaries, and navigate to the linked facility record."
            actions={<div className="flex items-center gap-2"><button className="rounded-full border border-outline-variant/15 p-2 text-on-surface-variant hover:text-secondary disabled:opacity-50" onClick={() => page > 0 && load(page - 1, filters)} disabled={page === 0} type="button"><span className="material-symbols-outlined">chevron_left</span></button><button className="rounded-full border border-outline-variant/15 p-2 text-on-surface-variant hover:text-secondary disabled:opacity-50" onClick={() => load(page + 1, filters)} disabled={results.length < limit} type="button"><span className="material-symbols-outlined">chevron_right</span></button></div>}
          >
            <InvestigationTable
              density="compact"
              columns={[
                { key: "action_date", label: "Action Date", render: (row) => formatDate(row.action_date) },
                { key: "facility", label: "Facility", render: (row) => <Link to={`/facility/${row.facility_id}`} className="no-underline text-on-surface hover:text-secondary"><div className="font-headline-sm text-[15px] font-bold">{row.facility_name || "Unknown"}</div><div className="font-code-data text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">{row.facility_state || "—"}</div></Link> },
                { key: "action_type", label: "Action Type", render: (row) => <EvidenceBadge label={row.action_type || "Unknown"} tone="secondary" icon="gavel" /> },
                { key: "outcome", label: "Outcome", render: (row) => row.outcome ? <SeverityBadge severity={row.outcome} /> : <span className="text-on-surface-variant">—</span> },
                { key: "penalty", label: "Penalty Amount", align: "right", render: (row) => row.penalty_amount != null ? <span className="font-code-data text-[14px] text-secondary">${row.penalty_amount.toLocaleString()}</span> : "—" },
                { key: "actions", label: "Evidence", render: (row) => <div className="flex flex-wrap gap-2"><a className="bg-transparent border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface-variant px-3 py-1.5 rounded-full font-label-caps text-[10px] font-bold uppercase tracking-widest no-underline" href={pdfUrl(row.id)} target="_blank" rel="noreferrer">Open PDF</a><button className="bg-secondary text-on-secondary px-3 py-1.5 rounded-full font-label-caps text-[10px] font-bold uppercase tracking-widest border-none" onClick={() => openDetail(row.id)} type="button">Open Detail</button></div> },
              ]}
              rows={results.map((row) => ({ ...row, key: row.id, className: row.penalty_amount ? "bg-secondary/5" : "" }))}
            />
            <div className="mt-4 text-sm text-on-surface-variant">{total !== null ? `Showing ${results.length} of ${total}` : `Showing ${results.length}`}</div>
          </DossierSection>

          {selectedDetail && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-surface-container rounded-[24px] p-6 w-full max-w-3xl border border-outline-variant/10 shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-headline-md text-[20px] font-bold text-on-surface">Enforcement detail</h3>
                  <button onClick={() => setSelectedDetail(null)} className="bg-transparent border border-outline-variant/20 text-on-surface-variant hover:text-secondary px-3 py-1.5 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest" type="button">Close</button>
                </div>
                {detailLoading ? <div className="text-secondary font-code-data tracking-widest uppercase">Loading...</div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                      <div className="section-kicker">Facility</div>
                      <Link to={`/facility/${selectedDetail.facility_id}`} className="no-underline text-secondary font-headline-sm text-[18px] font-bold">{selectedDetail.facility_name}</Link>
                      <div className="mt-3 text-sm text-on-surface-variant">Date: {formatDate(selectedDetail.action_date)}</div>
                      <div className="text-sm text-on-surface-variant">Type: {selectedDetail.action_type}</div>
                      <div className="text-sm text-on-surface-variant">Outcome: {selectedDetail.outcome || "—"}</div>
                      <div className="text-sm text-on-surface-variant">Penalty: {selectedDetail.penalty_amount != null ? `$${selectedDetail.penalty_amount.toLocaleString()}` : "—"}</div>
                    </div>
                    <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                      <div className="section-kicker">Summary</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-on-surface-variant leading-relaxed">{selectedDetail.summary || "—"}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
