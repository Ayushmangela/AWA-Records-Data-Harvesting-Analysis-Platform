import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFacility, generateAISummary } from "../services/api";
import PDFViewer from "../components/PDFViewer";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase().replace(/ /g, "_");
}

const USE_MOCK_DATA = false;

const mockFacilityData = {}; // Kept for type compatibility but unused

function InspectionAccordion({ inspection, onOpenPdf, isExpandedFromParent, onCitationClick }) {
  const [expanded, setExpanded] = useState(false);
  const hasViolations = inspection.violation_count > 0;
  
  useEffect(() => {
    if (isExpandedFromParent) {
      setExpanded(true);
    }
  }, [isExpandedFromParent]);

  let filename = inspection.source_pdf_path ? inspection.source_pdf_path.split('/').pop() : null;
  if (filename && !filename.endsWith('.pdf')) filename += '.pdf';
  const hasPdf = inspection.source_pdf_path || (inspection.source_pdf && inspection.source_pdf !== 'placeholder');
  const pdfUrl = hasPdf ? `${import.meta.env.VITE_API_URL}/documents/proxy-pdf/${inspection.id}` : null;

  return (
    <div 
      id={`inspection-card-${inspection.id}`}
      className={`bg-surface-container-low border border-outline-variant/10 rounded-2xl overflow-hidden mb-6 flex transition-all duration-300 ${
        isExpandedFromParent ? 'ring-1 ring-secondary border-secondary/30' : ''
      }`}
    >
      {/* Left indicator bar */}
      <div className={`w-1.5 ${hasViolations ? 'bg-error' : 'bg-tertiary'}`}></div>
      
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">INSPECTION DATE</p>
            <p className="font-headline-sm text-[16px] font-bold text-on-surface">{formatDate(inspection.inspection_date)}</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">TYPE</p>
            <p className="font-code-data text-[13px] text-on-surface">{inspection.inspection_type}</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">INSPECTOR</p>
            {inspection.inspector_id ? (
              <Link to={`/inspector/${inspection.inspector_id}`} className="font-code-data text-[13px] text-secondary font-bold uppercase hover:text-tertiary transition-colors no-underline">
                {inspection.inspector_name || inspection.inspector_id}
              </Link>
            ) : (
              <p className="font-code-data text-[13px] text-secondary font-bold uppercase">{inspection.inspector_name || "UNKNOWN"}</p>
            )}
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">VIOLATIONS</p>
            {hasViolations ? (
              <span className="bg-error/10 text-error border border-error/20 px-3 py-1 rounded-full font-label-caps text-[11px] font-bold inline-block">
                {inspection.violation_count} VIOLATION{inspection.violation_count !== 1 ? 'S' : ''}
              </span>
            ) : (
              <span className="bg-tertiary/10 text-tertiary border border-tertiary/20 px-3 py-1 rounded-full font-label-caps text-[11px] font-bold inline-block">
                0 VIOLATIONS
              </span>
            )}
          </div>
        </div>

        <button 
          onClick={() => setExpanded(!expanded)} 
          className="bg-transparent border-none text-on-surface-variant hover:text-secondary cursor-pointer p-2 flex items-center justify-center transition-colors -ml-2 rounded-full hover:bg-surface-variant/20"
        >
          <span className="material-symbols-outlined text-[20px]">{expanded ? 'arrow_drop_up' : 'arrow_drop_down'}</span>
        </button>

        {expanded && (
          <div className="mt-4 pt-6 border-t border-outline-variant/10 animate-fade-in">
            {pdfUrl && (
              <button 
                onClick={() => onOpenPdf(pdfUrl, formatDate(inspection.inspection_date))}
                className="bg-primary-container text-on-primary-container border border-primary/20 px-4 py-2.5 rounded-lg flex items-center gap-2 font-label-caps text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all mb-8 shadow-md"
              >
                <span className="material-symbols-outlined text-[16px]">description</span> Open Report PDF
              </button>
            )}

            <div className="mb-8">
              <h4 className="font-headline-sm text-[16px] text-on-surface mb-4">Animal Inventory List</h4>
              {inspection.inventory && inspection.inventory.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {inspection.inventory.map(inv => (
                    <div key={inv.id} className="border border-outline-variant/20 bg-surface-container-highest px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <span className="font-code-data text-[12px] font-bold text-on-surface">{inv.count}</span>
                      <span className="font-code-data text-[11px] text-on-surface-variant uppercase tracking-wider">{inv.common_name}</span>
                      <span className="font-code-data text-[11px] text-on-surface-variant/50 italic">({inv.scientific_name})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant text-[14px]">No inventory recorded for this inspection.</p>
              )}
            </div>

            <div>
              <h4 className="font-headline-sm text-[16px] text-on-surface mb-4">Detailed Violations</h4>
              {inspection.violations && inspection.violations.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {inspection.violations.map(v => (
                    <div 
                      key={v.id} 
                      id={`violation-card-${v.id}`}
                      className="border border-outline-variant/10 bg-surface-container-highest p-4 rounded-lg flex flex-col gap-2 transition-all duration-300"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <span className={`font-label-caps text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            v.severity?.toLowerCase() === 'critical' || v.severity?.toLowerCase() === 'direct'
                              ? 'bg-error/20 text-error border border-error/10'
                              : 'bg-warning/20 text-warning border border-warning/10'
                          }`}>
                            {v.severity || 'INDIRECT'}
                          </span>
                          {v.category && (
                            <span className="font-label-caps text-[9px] font-bold bg-secondary/20 text-secondary border border-secondary/10 px-2 py-0.5 rounded-full">
                              {v.category.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="font-code-data text-[11px] text-secondary font-bold">SECTION {v.section || "?"}</span>
                      </div>
                      <p className="font-body-md text-on-surface-variant text-[14px] leading-relaxed mb-0">
                        {v.description}
                      </p>
                      {v.source_page && (
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/5">
                          <span className="font-code-data text-[10px] text-on-surface-variant/50">Page {v.source_page}</span>
                          {pdfUrl && (
                            <button 
                              onClick={() => onOpenPdf(pdfUrl, formatDate(inspection.inspection_date))}
                              className="bg-transparent border-none text-secondary hover:text-tertiary cursor-pointer font-label-caps text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[12px]">open_in_new</span> View Source Page
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-body-md text-on-surface-variant text-[14px] italic">No violations recorded for this inspection.</p>
              )}
            </div>
            
            {filename && (
              <p className="mt-8 font-code-data text-[11px] text-on-surface-variant tracking-widest">
                Source file: <span className="text-secondary font-bold">{filename}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AISummaryPanel({ facilityId, facility, onCitationClick, totalInspections }) {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checklist, setChecklist] = useState({});

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateAISummary(facilityId);
      if (data.error) {
        setError(data.error);
      } else {
        setSummaryData(data);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch summary");
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (idx) => {
    setChecklist(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const renderCitationsList = (citations) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {citations.map((cite, idx) => (
          <button
            key={idx}
            onClick={() => onCitationClick(cite.inspection_id)}
            className="bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 text-secondary px-2.5 py-0.5 rounded font-code-data text-[9px] tracking-wide cursor-pointer uppercase flex items-center gap-1 transition-all"
          >
            <span className="material-symbols-outlined text-[9px]">tag</span>
            INSP: {formatDate(cite.inspection_date)}
            {cite.source_page && ` (p. ${cite.source_page})`}
          </button>
        ))}
      </div>
    );
  };

  if (!summaryData && !loading && !error) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 mb-8 shadow-xl flex flex-col items-center justify-center">
        <h2 className="font-headline-md text-[24px] font-bold text-on-surface mb-4">AI Facility Analysis</h2>
        <p className="font-body-md text-on-surface-variant mb-6 text-center max-w-lg">
          Generate an AI-assisted qualitative analysis of this facility's compliance history, patterns, and priorities.
        </p>
        <button 
          onClick={fetchSummary}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-label-caps tracking-widest font-bold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer border-none"
        >
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          Generate AI Analysis
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 mb-8 shadow-xl flex flex-col items-center justify-center py-16">
        <span className="material-symbols-outlined text-primary text-[36px] animate-spin mb-4">sync</span>
        <span className="font-code-data text-on-surface-variant text-[12px] tracking-widest">ANALYZING PORTAL RECORDS...</span>
      </div>
    );
  }

  const { summary, evidence_coverage } = summaryData || {};

  return (
    <div className="flex flex-col gap-8">
      
      {/* Evidence Coverage Card */}
      {evidence_coverage && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
          <h3 className="font-headline-sm text-[16px] font-bold text-on-surface flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-[18px]">assignment_turned_in</span>
            AI Evidence Analysis Scope
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-1">INSPECTIONS SCOPE</p>
              <p className="font-headline-sm text-[14px] font-bold text-on-surface leading-tight">
                Last <span className="text-secondary">{evidence_coverage.inspections_reviewed}</span> of <span className="text-on-surface-variant">{evidence_coverage.total_inspections_available}</span>
              </p>
              <p className="text-[10px] text-on-surface-variant/70 italic mt-0.5">Analyzed recent chronological reports</p>
            </div>
            <div>
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-1">VIOLATIONS AUDITED</p>
              <p className="font-headline-sm text-[14px] font-bold text-on-surface">
                <span className="text-secondary">{evidence_coverage.violations_reviewed}</span> records
              </p>
            </div>
            <div>
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-1">SPECIES INVENTORIES</p>
              <p className="font-headline-sm text-[14px] font-bold text-on-surface">
                <span className="text-secondary">{evidence_coverage.inventory_records_reviewed}</span> counts
              </p>
            </div>
            <div>
              <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-1">INSPECTORS REVIEWED</p>
              <p className="font-headline-sm text-[14px] font-bold text-on-surface">
                <span className="text-secondary">{evidence_coverage.inspectors_reviewed}</span> unique
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-error-container/20 border border-error-container p-4 rounded-lg text-error">
          {error}
        </div>
      )}

      {summary && (
        <div className="flex flex-col gap-8 animate-fade-in">
          
          {/* Executive Narrative */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
            <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">auto_awesome</span>
              AI Executive Summary
            </h3>
            <p className="font-body-md text-[14px] leading-relaxed text-on-surface mb-4">
              {summary.executive_summary}
            </p>
            {summary.risk_narrative && (
              <div className="mt-4 pt-4 border-t border-outline-variant/10">
                <h4 className="font-label-caps text-[10px] text-secondary tracking-widest uppercase mb-2">Contributing Risk Factors</h4>
                <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant italic mb-0">
                  {summary.risk_narrative}
                </p>
              </div>
            )}
          </div>

          {/* Compliance Patterns */}
          {summary.compliance_patterns && summary.compliance_patterns.length > 0 && (
            <div>
              <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-secondary">analytics</span>
                Compliance Pattern Analysis
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {summary.compliance_patterns.map((pat, idx) => (
                  <div key={idx} className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-lg flex gap-4">
                    <span className="material-symbols-outlined text-secondary shrink-0 mt-0.5">query_stats</span>
                    <div className="flex-1">
                      <h4 className="font-headline-sm text-[15px] font-bold text-on-surface mb-1">{pat.pattern_name}</h4>
                      <p className="font-body-md text-[13px] text-on-surface-variant leading-relaxed mb-2">{pat.observation}</p>
                      {renderCitationsList(pat.citations)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analytical Inferences */}
          {summary.analytical_inferences && summary.analytical_inferences.length > 0 && (
            <div>
              <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-secondary">psychology</span>
                AI Inferences & Analytical Inferences
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {summary.analytical_inferences.map((inf, idx) => {
                  const conf = inf.confidence?.toUpperCase() || "MEDIUM";
                  const confColor = conf === "HIGH" ? "bg-emerald/20 text-emerald border-emerald/10" : conf === "MEDIUM" ? "bg-warning/20 text-warning border-warning/10" : "bg-error/20 text-error border-error/10";
                  return (
                    <div key={idx} className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-lg">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <span className="font-headline-sm text-[15px] font-bold text-on-surface italic flex items-center gap-2">
                          <span className="material-symbols-outlined text-secondary text-[16px]">lightbulb</span>
                          Inference #{idx + 1}
                        </span>
                        <span className={`font-label-caps text-[9px] font-bold px-2 py-0.5 rounded-full border ${confColor}`}>
                          {conf} CONFIDENCE
                        </span>
                      </div>
                      <p className="font-body-md text-[14px] text-on-surface leading-relaxed mb-4">{inf.inference}</p>
                      {inf.supporting_facts && inf.supporting_facts.length > 0 && (
                        <div className="bg-surface-container-low p-4 rounded-xl mb-3">
                          <h5 className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-2">Supporting facts</h5>
                          <ul className="list-disc pl-4 flex flex-col gap-1.5 m-0">
                            {inf.supporting_facts.map((factStr, fIdx) => (
                              <li key={fIdx} className="font-body-md text-[13px] text-on-surface-variant leading-relaxed">{factStr}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {renderCitationsList(inf.citations)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Investigation Priorities */}
          {summary.investigation_priorities && summary.investigation_priorities.length > 0 && (
            <div>
              <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-secondary">playlist_add_check</span>
                Recommended Investigation Priorities
              </h3>
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
                {summary.investigation_priorities.map((item, idx) => (
                  <label key={idx} className="flex gap-4 cursor-pointer select-none group p-3 rounded-lg hover:bg-surface-variant/10 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={!!checklist[idx]} 
                      onChange={() => toggleCheck(idx)}
                      className="accent-secondary w-5 h-5 shrink-0 mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className={`font-headline-sm text-[15px] font-bold text-on-surface block ${checklist[idx] ? 'line-through text-on-surface-variant/50' : ''}`}>
                        {item.priority}
                      </span>
                      <span className="font-body-md text-[13px] text-on-surface-variant leading-relaxed mt-1 block">
                        {item.rationale}
                      </span>
                      {renderCitationsList(item.citations)}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <p className="font-code-data text-[11px] text-on-surface-variant/70 text-right mt-4 italic">
            Generated at {new Date(summaryData.generated_at).toLocaleString()} | Model: {summaryData.model} | Schema: v{summaryData.schema_version}
          </p>
        </div>
      )}
    </div>
  );
}

export default function FacilityPage() {
  const { id } = useParams();
  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePdf, setActivePdf] = useState(null);
  const [activePdfDate, setActivePdfDate] = useState(null);
  const [expandedInspectionId, setExpandedInspectionId] = useState(null);

  useEffect(() => {
    async function load() {
      if (USE_MOCK_DATA) {
        setFacility(mockFacilityData);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getFacility(id);
        setFacility(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="p-12 font-code-data text-on-surface-variant tracking-widest">INITIALIZING_DATALINK...</div>;
  }
  if (!facility) {
    return <div className="p-12 font-code-data text-error tracking-widest">ERR_NO_FACILITY_FOUND</div>;
  }

  const openPdfViewer = (url, dateStr) => {
    setActivePdf(url);
    setActivePdfDate(dateStr);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closePdfViewer = () => {
    setActivePdf(null);
    setActivePdfDate(null);
  };

  const handleCitationClick = (inspectionId) => {
    setExpandedInspectionId(inspectionId);
    setTimeout(() => {
      const el = document.getElementById(`inspection-card-${inspectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  // Compile Snapshot Metric Calculations
  const getSnapshotMetrics = () => {
    if (!facility || !facility.inspections) return { totalInps: 0, totalViols: 0, critCount: 0, inspectorCount: 0, lastDate: null, lastAnimalCount: 0 };
    
    let totalViols = 0;
    let critCount = 0;
    const inspectors = new Set();
    
    facility.inspections.forEach(insp => {
      totalViols += (insp.violation_count || 0);
      if (insp.inspector_name || insp.inspector_id) {
        inspectors.add(insp.inspector_name || insp.inspector_id);
      }
      if (insp.violations) {
        insp.violations.forEach(v => {
          const sev = v.severity ? v.severity.trim().toLowerCase() : "";
          if (["critical", "direct"].includes(sev)) {
            critCount++;
          }
        });
      }
    });

    const latestInspWithInv = facility.inspections.find(insp => insp.inventory && insp.inventory.length > 0);
    const lastAnimalCount = latestInspWithInv && latestInspWithInv.inventory
      ? latestInspWithInv.inventory.reduce((sum, item) => sum + item.count, 0)
      : 0;

    return {
      totalInps: facility.inspections.length,
      totalViols,
      critCount,
      inspectorCount: inspectors.size,
      lastDate: facility.inspections[0] ? facility.inspections[0].inspection_date : null,
      lastAnimalCount
    };
  };

  // Prioritize Evidence-Backed Facts (Deterministic)
  const getPrioritizedFacts = () => {
    const facts = [];
    if (!facility || !facility.inspections) return facts;

    const limit = facility.licensed_animal_limit;
    
    // 1. Most recent inspection fact
    const latestInsp = facility.inspections[0];
    if (latestInsp) {
      facts.push({
        key: `latest-insp`,
        text: `The most recent inspection on ${formatDate(latestInsp.inspection_date)} was a ${latestInsp.inspection_type || "ROUTINE INSPECTION"} and recorded ${latestInsp.violation_count || 0} violation(s).`,
        citations: [{ inspection_id: latestInsp.id, inspection_date: latestInsp.inspection_date }]
      });
    }

    // 2. Critical & Direct violations, plus Animal limits
    const sectionCounts = {};
    const criticalDirectViols = [];
    
    facility.inspections.forEach(insp => {
      const totalAnimals = insp.inventory ? insp.inventory.reduce((sum, item) => sum + item.count, 0) : 0;
      if (limit && totalAnimals > limit) {
        facts.push({
          key: `limit-exceeded-${insp.id}`,
          text: `Total animal inventory (${totalAnimals}) exceeded the licensed limit of ${limit} during the inspection on ${formatDate(insp.inspection_date)}.`,
          citations: [{ inspection_id: insp.id, inspection_date: insp.inspection_date }]
        });
      }

      if (insp.violations) {
        insp.violations.forEach(v => {
          if (v.section) {
            sectionCounts[v.section] = sectionCounts[v.section] || [];
            sectionCounts[v.section].push({ inspection_id: insp.id, inspection_date: insp.inspection_date, source_page: v.source_page });
          }

          const isCriticalOrDirect = v.severity && ["critical", "direct"].includes(v.severity.toLowerCase());
          const isRepeat = v.description && v.description.toLowerCase().includes("repeat");
          
          if (isCriticalOrDirect || isRepeat) {
            criticalDirectViols.push({
              v,
              date: insp.inspection_date,
              inspId: insp.id
            });
          }
        });
      }
    });

    // Add critical/direct items
    criticalDirectViols.slice(0, 3).forEach(({ v, date, inspId }) => {
      const typeLabel = v.severity ? v.severity.toUpperCase() : "VIOLATION";
      const descExcerpt = v.description ? (v.description.length > 90 ? v.description.substring(0, 90) + "..." : v.description) : "";
      facts.push({
        key: `viol-${v.id}`,
        text: `Cited for a ${typeLabel} violation of Section ${v.section || "?"} (${v.category || "General Care"}) on ${formatDate(date)}: "${descExcerpt}"`,
        citations: [{ inspection_id: inspId, inspection_date: date, source_page: v.source_page }]
      });
    });

    // 3. Recurring section violations (cited 2+ times)
    Object.keys(sectionCounts).forEach(sec => {
      const occurrences = sectionCounts[sec];
      if (occurrences.length >= 2) {
        facts.push({
          key: `recurring-sec-${sec}`,
          text: `Section ${sec} was cited recurrently (${occurrences.length} times) across multiple inspections.`,
          citations: occurrences.map(occ => ({ inspection_id: occ.inspection_id, inspection_date: occ.inspection_date, source_page: occ.source_page }))
        });
      }
    });

    return facts.slice(0, 5);
  };

  const getSeverityDistribution = () => {
    const counts = { Critical: 0, Direct: 0, Indirect: 0, Teachable: 0 };
    if (!facility || !facility.inspections) return [];
    facility.inspections.forEach(insp => {
      if (insp.violations) {
        insp.violations.forEach(v => {
          const sev = v.severity ? v.severity.trim().toLowerCase() : "";
          if (sev === "critical") counts.Critical++;
          else if (sev === "direct") counts.Direct++;
          else if (sev === "teachable") counts.Teachable++;
          else counts.Indirect++;
        });
      }
    });
    
    return Object.keys(counts).map(key => ({
      name: key.toUpperCase(),
      value: counts[key],
      fill: key === "Critical" ? "#ef4444" : key === "Direct" ? "#f97316" : key === "Teachable" ? "#3b82f6" : "#eab308"
    })).filter(item => item.value > 0);
  };

  const metrics = getSnapshotMetrics();
  const prioritizedFacts = getPrioritizedFacts();
  const severityData = getSeverityDistribution();
  const categoriesData = Object.entries(facility.violation_categories || {}).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(...categoriesData.map(c => c[1]), 1);

  // Deterministic Risk Badge styling
  const riskLvl = facility.risk_flags?.risk_level || "LOW";
  const riskBadgeColor = riskLvl === "HIGH" ? "bg-error text-on-error" : riskLvl === "MEDIUM" ? "bg-warning text-on-warning" : "bg-tertiary text-on-tertiary";

  return (
    <div className="p-12 mx-auto relative z-10 transition-all duration-300">
      
      {/* Back Button */}
      <Link to="/" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-secondary font-label-caps text-[12px] uppercase tracking-widest transition-colors no-underline mb-8 font-bold">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to search
      </Link>

      <div className={`flex flex-col lg:flex-row gap-8 transition-all duration-300 ${activePdf ? 'w-full' : 'max-w-[1280px]'}`}>
        
        {/* LEFT COLUMN (60%) - Report and Timelines */}
        <div className={`flex flex-col transition-all duration-300 ${activePdf ? 'w-1/2' : 'w-full lg:w-[65%]'}`}>
          
          {/* Facility Header Card */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 mb-8 shadow-xl">
            <h1 className="m-0 text-[32px] font-headline-lg font-bold text-on-surface mb-2">{facility.name}</h1>
            <p className="font-code-data text-[13px] text-on-surface-variant tracking-widest uppercase mb-8">
              Certificate: <strong className="text-on-surface">{facility.certificate_number}</strong>
            </p>
            
            <div className="border-t border-outline-variant/10 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">ADDRESS DETAILS</p>
                <p className="font-body-md text-[14px] text-on-surface leading-snug">
                  {facility.address}<br/>
                  {facility.city}, {facility.state} {facility.zip_code}
                </p>
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">LICENSE TYPE</p>
                <p className="font-body-md text-[14px] text-on-surface">{facility.license_type ? facility.license_type.split(' ').slice(1).join(' ') : "N/A"}</p>
              </div>
              <div>
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">LICENSE STATUS</p>
                <p className="font-code-data text-[13px] text-tertiary font-bold tracking-widest">{facility.license_status}</p>
              </div>
            </div>
          </div>

          {/* AI SUMMARY PANEL */}
          <div className="mb-8">
            <AISummaryPanel 
              facilityId={facility.id} 
              facility={facility} 
              onCitationClick={handleCitationClick} 
              totalInspections={metrics.totalInps} 
            />
          </div>

          {/* EVIDENCE-BACKED FACTS (DETERMINISTIC) */}
          {prioritizedFacts.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 mb-8 shadow-xl">
              <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">fact_check</span>
                Evidence-Backed Facts
              </h3>
              <div className="flex flex-col gap-4">
                {prioritizedFacts.map((fact) => (
                  <div key={fact.key} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 flex flex-col gap-2">
                    <p className="font-body-md text-[13.5px] text-on-surface leading-relaxed m-0">{fact.text}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {fact.citations.map((cite, cIdx) => (
                        <button
                          key={cIdx}
                          onClick={() => handleCitationClick(cite.inspection_id)}
                          className="bg-primary-container text-on-primary-container border border-primary/20 px-2 py-0.5 rounded font-code-data text-[9px] tracking-wide cursor-pointer uppercase flex items-center gap-1 hover:brightness-110 transition-all"
                        >
                          <span className="material-symbols-outlined text-[9px]">tag</span>
                          INSP: {formatDate(cite.inspection_date)}
                          {cite.source_page && ` (p. ${cite.source_page})`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning Banner */}
          {(facility.risk_flags?.has_high_direct_violations || facility.risk_flags?.high_direct_violations) && (
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 flex items-center gap-3 mb-8 shadow-lg">
              <span className="material-symbols-outlined text-secondary">warning</span>
              <span className="font-label-caps text-[12px] font-bold text-secondary tracking-widest">More than 3 direct violations in the last 18 months</span>
            </div>
          )}

          {/* Inspection Timeline */}
          <div>
            <h2 className="font-headline-md text-[24px] font-bold text-on-surface mb-6">Inspection Timeline</h2>
            <div className="flex flex-col">
              {facility.inspections?.map((insp) => (
                <InspectionAccordion 
                  key={insp.id} 
                  inspection={insp} 
                  onOpenPdf={openPdfViewer} 
                  isExpandedFromParent={expandedInspectionId === insp.id}
                  onCitationClick={handleCitationClick} 
                />
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (40%) - Metrics & Side Charts */}
        <div className={`flex flex-col gap-8 transition-all duration-300 ${activePdf ? 'hidden' : 'w-full lg:w-[35%]'}`}>
          
          {/* Risk Level & Drivers */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
            <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Risk Assessment</h3>
            <div className="flex items-center gap-3 mb-6">
              <span className="font-code-data text-[12px] text-on-surface-variant uppercase">Deterministic Classification:</span>
              <span className={`font-label-caps text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${riskBadgeColor}`}>
                {riskLvl} RISK
              </span>
            </div>
            {facility.risk_flags?.risk_drivers && facility.risk_flags.risk_drivers.length > 0 ? (
              <div className="border-t border-outline-variant/10 pt-4">
                <h4 className="font-label-caps text-[10px] text-on-surface-variant tracking-wider uppercase mb-2">Deterministic Risk Drivers</h4>
                <ul className="list-disc pl-4 flex flex-col gap-2 m-0">
                  {facility.risk_flags.risk_drivers.map((drv, idx) => (
                    <li key={idx} className="font-body-md text-[12.5px] text-on-surface-variant leading-relaxed">
                      {drv}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="font-body-md text-[13px] text-on-surface-variant italic mb-0 border-t border-outline-variant/10 pt-4">
                No critical risk drivers flagged by the engine.
              </p>
            )}
          </div>

          {/* Compliance Snapshot KPI Scorecard */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
            <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Compliance Snapshot</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">TOTAL INSPECTIONS</p>
                <p className="font-headline-md text-[20px] font-bold text-on-surface">{metrics.totalInps}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">TOTAL VIOLATIONS</p>
                <p className="font-headline-md text-[20px] font-bold text-on-surface">{metrics.totalViols}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">DIRECT/CRITICAL</p>
                <p className="font-headline-md text-[20px] font-bold text-error">{metrics.critCount}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">UNIQUE INSPECTORS</p>
                <p className="font-headline-md text-[20px] font-bold text-on-surface">{metrics.inspectorCount}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5 col-span-2">
                <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">LATEST ANIMAL LIMIT COVERAGE</p>
                <p className="font-headline-sm text-[15px] font-bold text-on-surface">
                  {metrics.lastAnimalCount} <span className="text-[12px] text-on-surface-variant font-normal">counted /</span> {facility.licensed_animal_limit || "N/A"} <span className="text-[11px] text-on-surface-variant font-normal">licensed</span>
                </p>
              </div>
            </div>
          </div>

          {/* Recurring Violation Categories Progress Bars */}
          {categoriesData.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
              <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Recurring Violation Categories</h3>
              <div className="flex flex-col gap-4">
                {categoriesData.map(([cat, count]) => {
                  const percentage = (count / maxCategoryCount) * 100;
                  return (
                    <div key={cat} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[10.5px] font-label-caps tracking-wider text-on-surface-variant font-medium">
                        <span>{cat}</span>
                        <span className="font-bold text-secondary">{count}</span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                        <div className="h-full bg-secondary rounded-full" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Severity Breakdown Bar Chart */}
          {severityData.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
              <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Severity Breakdown</h3>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={severityData} layout="vertical" margin={{ left: -25, right: 10, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1c19', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '10px' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={10}>
                      {severityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Animal Inventory Trend Chart */}
          {facility.inspections && facility.inspections.some(insp => insp.inventory && insp.inventory.length > 0) && (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
              <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Animal Inventory Trend</h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[...facility.inspections].reverse().map(insp => ({
                      date: new Date(insp.inspection_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                      count: insp.inventory ? insp.inventory.reduce((sum, item) => sum + item.count, 0) : 0
                    }))}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={9} 
                      tickLine={false} 
                      axisLine={false}
                      dy={5}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.4)" 
                      fontSize={9} 
                      tickLine={false} 
                      axisLine={false}
                      dx={-5}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#064e3b', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Animals"
                      stroke="#e9c349" 
                      strokeWidth={2} 
                      dot={{ r: 3, fill: '#e9c349', strokeWidth: 1.5, stroke: '#1a1c19' }} 
                      activeDot={{ r: 5, fill: '#fff', stroke: '#e9c349' }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT PANEL - PDF Viewer */}
        {activePdf && (
          <div className="w-1/2 sticky top-[100px] h-[calc(100vh-120px)] transition-all duration-300 rounded-2xl overflow-hidden border border-outline-variant/20 shadow-2xl z-25">
            <PDFViewer
              pdfUrl={activePdf}
              onClose={closePdfViewer}
              inspectionDate={activePdfDate}
              facilityName={facility.name}
            />
          </div>
        )}
      </div>
    </div>
  );
}
