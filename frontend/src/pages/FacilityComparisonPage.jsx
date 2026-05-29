import React, { useEffect, useMemo, useState } from "react";
import { searchFacilities, getFacility } from "../services/api";
import FacilityCard from "../components/FacilityCard";
import { DossierSection, EvidenceBadge, IntelligenceBrief, InvestigationTable, MetricPanel, RiskPanel } from "../components/IntelligenceSystem";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function smallNumber(value) {
  return value === null || value === undefined ? "—" : String(value);
}

export default function FacilityComparisonPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    let active = true;
    async function doSearch() {
      if (!query || query.length < 3) {
        setResults([]);
        return;
      }
      setLoadingSearch(true);
      try {
        const res = await searchFacilities({ name: query, limit: 10 });
        if (active) setResults(res.results || []);
      } catch (error) {
        console.error(error);
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }

    const timeoutId = setTimeout(doSearch, 300);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query]);

  const addFacility = async (facility) => {
    if (selected.find((item) => item.id === facility.id)) return;
    if (selected.length >= 4) return alert("Maximum 4 facilities can be compared");
    try {
      const full = await getFacility(facility.id);
      setSelected((current) => [...current, full]);
    } catch (error) {
      console.error(error);
      alert("Failed to load facility details");
    }
  };

  const removeFacility = (id) => setSelected((current) => current.filter((facility) => facility.id !== id));

  const metrics = useMemo(() => selected.map((facility) => {
    const totalInspections = (facility.inspections || []).length;
    const totalViolations = (facility.inspections || []).reduce((count, inspection) => count + (inspection.violations ? inspection.violations.length : (inspection.violation_count || 0)), 0);
    const direct = (facility.inspections || []).reduce((count, inspection) => count + ((inspection.violations || []).filter((violation) => (violation.severity || "").toLowerCase() === "direct").length), 0);
    const critical = (facility.inspections || []).reduce((count, inspection) => count + ((inspection.violations || []).filter((violation) => (violation.severity || "").toLowerCase() === "critical").length), 0);
    const enforcementActions = (facility.enforcement_actions || []).length;
    const animalInventory = (facility.inspections || []).reduce((count, inspection) => count + ((inspection.inventory || []).reduce((inventoryTotal, item) => inventoryTotal + (item.count || 0), 0)), 0);
    const riskLevel = facility.risk_flags?.risk_level || facility.risk_level || "LOW";
    const latestInspection = facility.inspections && facility.inspections.length > 0 ? facility.inspections[0].inspection_date : facility.last_inspection_date || null;
    const violationCounts = (facility.inspections || []).map((inspection) => (inspection.violations ? inspection.violations.length : (inspection.violation_count || 0)));
    const last3 = violationCounts.slice(0, 3).reduce((count, value) => count + value, 0);
    const prev3 = violationCounts.slice(3, 6).reduce((count, value) => count + value, 0);
    const trend = last3 === prev3 ? "stable" : (last3 < prev3 ? "improving" : "worsening");

    return { id: facility.id, name: facility.name, state: facility.state, license_type: facility.license_type, totalInspections, totalViolations, direct, critical, enforcementActions, animalInventory, riskLevel, latestInspection, trend };
  }), [selected]);

  const narrative = useMemo(() => {
    if (metrics.length < 2) return "Select 2–4 facilities to generate comparison insights.";
    const score = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const highestRisk = [...metrics].sort((a, b) => (score[b.riskLevel] || 0) - (score[a.riskLevel] || 0))[0];
    const mostViolations = [...metrics].sort((a, b) => b.totalViolations - a.totalViolations)[0];
    const bestCompliance = [...metrics].sort((a, b) => a.totalViolations - b.totalViolations)[0];
    const minActions = Math.min(...metrics.map((item) => item.enforcementActions));
    const maxActions = Math.max(...metrics.map((item) => item.enforcementActions));
    return `Highest-risk facility is ${highestRisk.name} (${highestRisk.riskLevel}). ${mostViolations.name} has the most violations (${mostViolations.totalViolations}). ${bestCompliance.name} shows the strongest recent compliance. Enforcement actions range from ${minActions} to ${maxActions} across the selected dossiers.`;
  }, [metrics]);

  const bestWorst = (key) => {
    if (metrics.length === 0) return {};
    const values = metrics.filter((item) => item[key] !== null && item[key] !== undefined);
    if (!values.length) return {};
    const best = values.reduce((a, b) => (a[key] < b[key] ? a : b));
    const worst = values.reduce((a, b) => (a[key] > b[key] ? a : b));
    return { bestId: best.id, worstId: worst.id };
  };

  const totalViolations = metrics.reduce((sum, item) => sum + item.totalViolations, 0);
  const totalActions = metrics.reduce((sum, item) => sum + item.enforcementActions, 0);

  const metricRows = [
    { key: "state", label: "State", render: (item) => item.state },
    { key: "license_type", label: "License Type", render: (item) => item.license_type || "—" },
    { key: "totalInspections", label: "Total Inspections", render: (item) => item.totalInspections },
    { key: "totalViolations", label: "Total Violations", render: (item) => item.totalViolations },
    { key: "direct", label: "Direct Violations", render: (item) => item.direct },
    { key: "critical", label: "Critical Violations", render: (item) => item.critical },
    { key: "enforcementActions", label: "Enforcement Actions", render: (item) => item.enforcementActions },
    { key: "animalInventory", label: "Animal Inventory", render: (item) => item.animalInventory },
    { key: "riskLevel", label: "Risk Level", render: (item) => item.riskLevel },
    { key: "latestInspection", label: "Latest Inspection", render: (item) => formatDate(item.latestInspection) },
  ];

  return (
    <div className="investigative-shell relative z-10">
      <section className="investigative-hero rounded-[28px] p-8 lg:p-10 mb-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.9fr] gap-8 items-start">
          <div>
            <div className="section-kicker mb-4">COMPARISON DOSSIERS</div>
            <h1 className="font-headline-lg text-[clamp(2rem,4vw,3.3rem)] leading-[1.04] font-bold text-on-surface mb-4">Side-by-side intelligence analysis for facilities, risk exposure, and enforcement history.</h1>
            <p className="font-body-lg text-[18px] text-on-surface-variant max-w-3xl leading-[28px]">Build a 2–4 facility dossier, compare compliance posture, and surface the highest-risk and strongest-performing operations with evidence-backed narrative context.</p>
          </div>
          <IntelligenceBrief
            title="Comparison brief"
            subtitle="Current comparison set and analysis state."
            sections={[
              { label: "Selected Facilities", value: selected.length, detail: "Comparison range 2–4" },
              { label: "Search Results", value: results.length, detail: query.length >= 3 ? `Query: ${query}` : "Waiting on search" },
              { label: "Enforcement Exposure", value: totalActions, detail: "Across the selected facilities" },
              { label: "Violation Spread", value: metrics.length >= 2 ? Math.max(...metrics.map((item) => item.totalViolations || 0)) - Math.min(...metrics.map((item) => item.totalViolations || 0)) : "—", detail: "Spread across the comparison set" },
            ]}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
        <MetricPanel label="Facilities Selected" value={selected.length} detail="Comparison window" tone="primary" />
        <MetricPanel label="Total Violations" value={totalViolations} detail="Aggregate exposure" tone="critical" />
        <MetricPanel label="Enforcement Actions" value={totalActions} detail="All selected facilities" tone="secondary" />
        <MetricPanel label="Improving Trends" value={metrics.filter((item) => item.trend === "improving").length} detail="Compliance trajectories" tone="primary" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8">
        <div className="space-y-8">
          <DossierSection label="COMPARE SET" title="Search and add facilities" subtitle="Search by name, then include the dossier in the comparison set.">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name..." className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3 text-body-md text-on-surface outline-none" />
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10 text-sm text-on-surface-variant">Type at least 3 characters to query the facility search API.</div>
            </div>
            <div className="mt-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 p-4">
              {loadingSearch ? (
                <div className="text-secondary font-code-data tracking-widest uppercase">Searching...</div>
              ) : results.length === 0 ? (
                <div className="text-on-surface-variant">No results.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                  {results.map((result) => (
                    <div key={result.id} className="rounded-2xl border border-white/5 bg-surface-container-low p-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-headline-sm text-[16px] font-bold text-on-surface">{result.name}</div>
                        <div className="font-code-data text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">{result.city ? `${result.city}, ${result.state}` : result.state}</div>
                      </div>
                      <button onClick={() => addFacility(result)} className="bg-secondary text-on-secondary px-4 py-2 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest border-none">Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DossierSection>

          <DossierSection label="SELECTED DOSSIERS" title={`Selected facilities (${selected.length}/4)`} subtitle="Open, remove, and compare the chosen facilities side-by-side.">
            <div className="grid grid-cols-1 gap-4">
              {selected.length === 0 && <div className="text-on-surface-variant">No facilities selected.</div>}
              {selected.map((facility) => (
                <div key={facility.id} className="rounded-[22px] border border-white/5 bg-surface-container-low p-4">
                  <FacilityCard facility={facility} onClick={() => window.location.href = `/facility/${facility.id}`} />
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button className="bg-transparent border border-outline-variant/20 text-on-surface-variant hover:text-secondary px-4 py-2 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest" onClick={() => removeFacility(facility.id)}>Remove</button>
                    <a className="bg-secondary text-on-secondary px-4 py-2 rounded-full font-label-caps text-[11px] font-bold uppercase tracking-widest no-underline" href={`/facility/${facility.id}`}>Open dossier</a>
                  </div>
                </div>
              ))}
            </div>
          </DossierSection>
        </div>

        <div className="space-y-8">
          <RiskPanel label="NARRATIVE INSIGHTS" value={selected.length >= 2 ? "Comparison active" : "Awaiting selection"} tone="high" subtitle={narrative} />

          {selected.length >= 2 && (
            <DossierSection label="SIDE-BY-SIDE DOSSIERS" title="Comparison cards" subtitle="Current comparison set, shown as investigative dossiers.">
              <div className="grid grid-cols-1 gap-4 max-h-[560px] overflow-y-auto custom-scrollbar pr-1">
                {metrics.map((metric) => (
                  <div key={metric.id} className="rounded-[22px] border border-white/5 bg-surface-container-low p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-headline-sm text-[18px] font-bold text-on-surface">{metric.name}</div>
                        <div className="font-code-data text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">{metric.state} · {metric.license_type || "—"}</div>
                      </div>
                      <EvidenceBadge label={metric.riskLevel} tone={metric.riskLevel === "HIGH" ? "critical" : metric.riskLevel === "MEDIUM" ? "secondary" : "primary"} icon={metric.riskLevel === "HIGH" ? "warning" : "verified"} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MetricPanel label="Inspections" value={smallNumber(metric.totalInspections)} tone="primary" />
                      <MetricPanel label="Violations" value={smallNumber(metric.totalViolations)} tone={metric.totalViolations > 5 ? "critical" : "secondary"} />
                      <MetricPanel label="Direct / Critical" value={`${smallNumber(metric.direct)} / ${smallNumber(metric.critical)}`} tone="critical" />
                      <MetricPanel label="Enforcement" value={smallNumber(metric.enforcementActions)} tone="secondary" />
                    </div>
                    <div className="mt-4 text-[13px] text-on-surface-variant leading-relaxed">Latest inspection: <span className="text-on-surface">{formatDate(metric.latestInspection)}</span> · Trend: <span className="text-on-surface">{metric.trend}</span></div>
                  </div>
                ))}
              </div>
            </DossierSection>
          )}

          {selected.length >= 2 && (
            <DossierSection label="METRIC TABLE" title="Comparison matrix" subtitle="Best / worst values are highlighted for quick review.">
              <InvestigationTable
                density="compact"
                columns={[
                  { key: "metric", label: "Metric", render: (row) => row.label },
                  ...metrics.map((metric) => ({ key: `facility-${metric.id}`, label: metric.name, render: (row) => row.render(metric, bestWorst(row.key)) })),
                ]}
                rows={metricRows}
              />
            </DossierSection>
          )}
        </div>
      </div>
    </div>
  );
}
