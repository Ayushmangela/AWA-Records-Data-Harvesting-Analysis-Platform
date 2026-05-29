import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getFacilityDossierSummary, getFacilityInspections, getFacilityEnforcement, generateAISummary } from "../services/api";
import AdvocacyReports from "../components/AdvocacyReports";
import PDFViewer from "../components/PDFViewer";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase().replace(/ /g, "_");
}

function AISummaryPanel({ facilityId, onCitationClick }) {
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
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 shadow-xl flex flex-col items-center justify-center">
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
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-8 shadow-xl flex flex-col items-center justify-center py-16 animate-pulse">
        <span className="material-symbols-outlined text-primary text-[36px] animate-spin mb-4">sync</span>
        <span className="font-code-data text-on-surface-variant text-[12px] tracking-widest">ANALYZING PORTAL RECORDS...</span>
      </div>
    );
  }

  const { summary, evidence_coverage } = summaryData || {};

  return (
    <div className="flex flex-col gap-6">
      {/* Evidence Coverage Card */}
      {evidence_coverage && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl animate-fade-in">
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
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Executive Narrative */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <h3 className="font-headline-md text-[20px] font-bold text-on-surface flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
                AI Executive Summary
              </h3>
              <span className="font-label-caps text-[9px] font-bold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20 cursor-help flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-[11px]">info</span>
                AI NARRATIVE
              </span>
            </div>
            <p className="font-body-md text-[14px] leading-relaxed text-on-surface-variant mb-4">
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
              <div className="flex items-center gap-3 mb-4">
                <h3 className="font-headline-md text-[18px] font-bold text-on-surface flex items-center gap-2 m-0">
                  <span className="material-symbols-outlined text-secondary">analytics</span>
                  Compliance Pattern Analysis
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {summary.compliance_patterns.map((pat, idx) => (
                  <div key={idx} className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-lg flex gap-4">
                    <span className="material-symbols-outlined text-secondary shrink-0 mt-0.5">query_stats</span>
                    <div className="flex-1">
                      <h4 className="font-headline-sm text-[15px] font-bold text-on-surface m-0 mb-1">{pat.pattern_name}</h4>
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
              <div className="flex items-center gap-3 mb-4">
                <h3 className="font-headline-md text-[18px] font-bold text-on-surface flex items-center gap-2 m-0">
                  <span className="material-symbols-outlined text-secondary">psychology</span>
                  Analytical Inferences
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {summary.analytical_inferences.map((inf, idx) => {
                  const conf = inf.confidence?.toUpperCase() || "MEDIUM";
                  const confColor =
                    conf === "HIGH"
                      ? "bg-tertiary/15 text-tertiary border-tertiary/25"
                      : conf === "MEDIUM"
                      ? "bg-secondary/15 text-secondary border-secondary/25"
                      : "bg-error/15 text-error border-error/25";
                  return (
                    <div key={idx} className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-lg">
                      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                        <span className="font-headline-sm text-[15px] font-bold text-on-surface flex items-center gap-2">
                          <span className="material-symbols-outlined text-secondary text-[16px]">lightbulb</span>
                          Inference #{idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`font-label-caps text-[8px] font-bold px-2 py-0.5 rounded border ${confColor}`}>
                            {conf} CONFIDENCE
                          </span>
                        </div>
                      </div>
                      <p className="font-body-md text-[14px] text-on-surface-variant leading-relaxed mb-4">{inf.inference}</p>
                      {inf.supporting_facts && inf.supporting_facts.length > 0 && (
                        <div className="bg-surface-container-low p-4 rounded-xl mb-3">
                          <h5 className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase m-0 mb-2">Supporting Evidence</h5>
                          <ul className="list-disc pl-4 flex flex-col gap-2 m-0">
                            {inf.supporting_facts.map((factStr, fIdx) => (
                              <li key={fIdx} className="font-body-md text-[13px] text-on-surface-variant leading-relaxed">
                                {factStr}
                              </li>
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

          {/* Recommended Priorities */}
          {summary.investigation_priorities && summary.investigation_priorities.length > 0 && (
            <div>
              <h3 className="font-headline-md text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
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
        </div>
      )}
    </div>
  );
}

export default function FacilityPage() {
  const { id, tab } = useParams();
  const navigate = useNavigate();
  
  const activeTab = tab || "overview";

  // TanStack Query caching and loading optimization
  const { data: facility, isLoading: loadingSummary } = useQuery({
    queryKey: ["facilitySummary", id],
    queryFn: () => getFacilityDossierSummary(id),
    staleTime: 300000,
    gcTime: 600000,
  });

  const { data: inspections, isLoading: loadingInspections } = useQuery({
    queryKey: ["facilityInspections", id],
    queryFn: () => getFacilityInspections(id),
    staleTime: 300000,
    gcTime: 600000,
    enabled: ["inspections", "violations", "documents", "analytics"].includes(activeTab),
  });

  const { data: enforcementActions, isLoading: loadingEnforcement } = useQuery({
    queryKey: ["facilityEnforcement", id],
    queryFn: () => getFacilityEnforcement(id),
    staleTime: 300000,
    gcTime: 600000,
    enabled: ["enforcement", "documents"].includes(activeTab),
  });
  
  // PDF Viewer states (persisted across tab changes and navigation)
  const [activePdf, setActivePdf] = useState(() => {
    try {
      const val = sessionStorage.getItem(`facility_${id}_activePdf`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  });
  const [activePdfDate, setActivePdfDate] = useState(() => {
    try {
      const val = sessionStorage.getItem(`facility_${id}_activePdfDate`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  });
  const [activePdfTitle, setActivePdfTitle] = useState(() => {
    try {
      const val = sessionStorage.getItem(`facility_${id}_activePdfTitle`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  });

  // Sub-selection states (persisted across tab changes and navigation)
  const [selectedInspectionId, setSelectedInspectionId] = useState(() => {
    try {
      const val = sessionStorage.getItem(`facility_${id}_selectedInspectionId`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  });
  const [selectedEnforcementId, setSelectedEnforcementId] = useState(() => {
    try {
      const val = sessionStorage.getItem(`facility_${id}_selectedEnforcementId`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  });
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [expandedOcrDocId, setExpandedOcrDocId] = useState(null);

  // Sync state to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(`facility_${id}_activePdf`, JSON.stringify(activePdf));
  }, [id, activePdf]);

  useEffect(() => {
    sessionStorage.setItem(`facility_${id}_activePdfDate`, JSON.stringify(activePdfDate));
  }, [id, activePdfDate]);

  useEffect(() => {
    sessionStorage.setItem(`facility_${id}_activePdfTitle`, JSON.stringify(activePdfTitle));
  }, [id, activePdfTitle]);

  useEffect(() => {
    sessionStorage.setItem(`facility_${id}_selectedInspectionId`, JSON.stringify(selectedInspectionId));
  }, [id, selectedInspectionId]);

  useEffect(() => {
    sessionStorage.setItem(`facility_${id}_selectedEnforcementId`, JSON.stringify(selectedEnforcementId));
  }, [id, selectedEnforcementId]);

  // Setup default sub-selections when tabs mount (no auto PDF fetch)
  useEffect(() => {
    if (activeTab === "inspections" && !selectedInspectionId && inspections?.length > 0) {
      setSelectedInspectionId(inspections[0].id);
    }
  }, [activeTab, selectedInspectionId, inspections]);

  useEffect(() => {
    if (activeTab === "enforcement" && !selectedEnforcementId && enforcementActions?.length > 0) {
      setSelectedEnforcementId(enforcementActions[0].id);
    }
  }, [activeTab, selectedEnforcementId, enforcementActions]);

  // Scroll restoration logic per tab
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`facility_${id}_${activeTab}_scrollPosition`, window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [id, activeTab]);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem(`facility_${id}_${activeTab}_scrollPosition`);
    const pos = savedScroll ? parseInt(savedScroll, 10) : 0;
    const timer = setTimeout(() => {
      window.scrollTo(0, pos);
    }, 100);
    return () => clearTimeout(timer);
  }, [id, activeTab, facility, inspections, enforcementActions]);

  // Handle auto-scrolling to selected inspection element
  useEffect(() => {
    if (selectedInspectionId && activeTab === "inspections") {
      const timer = setTimeout(() => {
        const el = document.getElementById(`inspection-card-${selectedInspectionId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedInspectionId, activeTab]);

  const openPdfViewer = (url, dateStr, titleStr = "") => {
    setActivePdf(url);
    setActivePdfDate(dateStr);
    setActivePdfTitle(titleStr);
  };

  const closePdfViewer = () => {
    setActivePdf(null);
    setActivePdfDate(null);
    setActivePdfTitle(null);
  };

  // Compile Snapshot Metric Calculations
  const metrics = useMemo(() => {
    if (!facility || !facility.compliance_snapshot) {
      return { totalInps: 0, totalViols: 0, critCount: 0, inspectorCount: 0, lastDate: null, lastAnimalCount: 0 };
    }
    const snap = facility.compliance_snapshot;
    return {
      totalInps: snap.total_inspections,
      totalViols: snap.total_violations,
      critCount: snap.critical_direct_count,
      inspectorCount: snap.unique_inspectors_count,
      lastDate: facility.latest_inspection?.inspection_date || null,
      lastAnimalCount: snap.latest_animal_count
    };
  }, [facility]);

  // Prioritize Evidence-Backed Facts
  const prioritizedFacts = useMemo(() => {
    return facility?.prioritized_facts || [];
  }, [facility]);

  const severityDistribution = useMemo(() => {
    const counts = { Critical: 0, Direct: 0, Indirect: 0, Teachable: 0 };
    if (!inspections) return [];
    inspections.forEach(insp => {
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
  }, [inspections]);

  const categoriesData = useMemo(() => {
    if (!inspections) return [];
    const violationCategories = {};
    inspections.forEach(insp => {
      if (insp.violations) {
        insp.violations.forEach(v => {
          const cat = v.category || "General Care";
          violationCategories[cat] = (violationCategories[cat] || 0) + 1;
        });
      }
    });
    return Object.entries(violationCategories).sort((a, b) => b[1] - a[1]);
  }, [inspections]);

  const maxCategoryCount = useMemo(() => {
    if (categoriesData.length === 0) return 1;
    return Math.max(...categoriesData.map(c => c[1]), 1);
  }, [categoriesData]);

  // Compute compliance score in frontend dynamically
  const complianceScore = useMemo(() => {
    if (!facility) return 100;
    const totalViols = facility.compliance_snapshot?.total_violations || 0;
    const hasHighDirect = facility?.risk_flags?.has_high_direct_violations || false;
    const hasAnyRecentDirect = facility?.risk_flags?.risk_drivers?.some(d => d.includes("Recent critical or direct")) || false;
    const limitExceeded = facility?.risk_flags?.animal_limit_exceeded || false;
    const spike = facility?.risk_flags?.recent_inventory_spike || false;

    let deductions = totalViols * 4;
    if (hasHighDirect) deductions += 25;
    else if (hasAnyRecentDirect) deductions += 15;
    if (limitExceeded) deductions += 15;
    if (spike) deductions += 10;

    return Math.max(0, 100 - deductions);
  }, [facility]);

  const riskLvl = facility?.risk_flags?.risk_level || "LOW";
  const enforcementCount = enforcementActions?.length || 0;
  const totalInps = metrics.totalInps;
  const totalViols = metrics.totalViols;

  // Compile recent dossier activities list
  const recentActivities = useMemo(() => {
    return facility?.recent_activities || [];
  }, [facility]);

  // Compile central searchable document library (metadata only)
  const allDocumentsList = useMemo(() => {
    const list = [];
    if (!facility) return list;
    if (inspections) {
      inspections.forEach(insp => {
        const hasPdf = insp.source_pdf_path || (insp.source_pdf && insp.source_pdf !== 'placeholder');
        if (hasPdf) {
          const pdfUrl = `${import.meta.env.VITE_API_URL}/documents/proxy-pdf/${insp.id}`;
          const violationsText = insp.violations && insp.violations.length > 0
            ? insp.violations.map((v, i) => `[Violation ${i+1}] Sec ${v.section} (${v.severity}): ${v.description}`).join("\n\n")
            : "No compliance violations recorded. Structured inspection report contains animal inventory counts only.";
          
          list.push({
            id: `insp-${insp.id}`,
            inspId: insp.id,
            type: "inspection",
            title: `Inspection Report - ${formatDate(insp.inspection_date)} (${insp.inspection_type})`,
            date: insp.inspection_date,
            meta: `Inspector: ${insp.inspector_name || "UNKNOWN"} | ${insp.violation_count || 0} violations`,
            pdfUrl,
            ocrText: `INSPECTION METADATA:\nDate: ${insp.inspection_date}\nInspector: ${insp.inspector_name}\nType: ${insp.inspection_type}\n\nINVENTORY COUNT:\n${insp.inventory?.map(i => `${i.count}x ${i.common_name} (${i.scientific_name})`).join(", ") || "None"}\n\nVIOLATIONS TRANSCRIPT:\n${violationsText}`,
            filename: insp.source_pdf_path ? insp.source_pdf_path.split('/').pop() : `inspection_${insp.id}.pdf`
          });
        }
      });
    }
    if (enforcementActions) {
      enforcementActions.forEach(action => {
        if (action.source_pdf_path) {
          const pdfUrl = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/documents/enforcement-pdf/${action.id}`;
          list.push({
            id: `enforce-${action.id}`,
            enforceId: action.id,
            type: "enforcement",
            title: `Enforcement Action - ${formatDate(action.action_date)} (${action.action_type})`,
            date: action.action_date,
            meta: `Outcome: ${action.outcome || "N/A"} | Penalty: $${action.penalty_amount?.toLocaleString() || "0"}`,
            pdfUrl,
            ocrText: `ENFORCEMENT ACTION DETAILS:\nDate: ${action.action_date}\nType: ${action.action_type}\nOutcome: ${action.outcome || "N/A"}\nPenalty: $${action.penalty_amount?.toLocaleString() || "0"}\n\nEXTRACTED TEXT TRANSCRIPT:\n${action.extracted_text || action.summary || "No document text extracted by OCR."}`,
            filename: action.source_pdf_path ? action.source_pdf_path.split('/').pop() : `enforcement_${action.id}.pdf`
          });
        }
      });
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [facility, inspections, enforcementActions]);

  const filteredDocuments = useMemo(() => {
    return allDocumentsList.filter(doc => {
      if (!documentSearchQuery.trim()) return true;
      const query = documentSearchQuery.toLowerCase().trim();
      return (
        doc.title.toLowerCase().includes(query) ||
        doc.meta.toLowerCase().includes(query) ||
        doc.ocrText.toLowerCase().includes(query) ||
        doc.filename.toLowerCase().includes(query)
      );
    });
  }, [allDocumentsList, documentSearchQuery]);

  const allViolationsList = useMemo(() => {
    const list = [];
    if (!inspections) return list;
    inspections.forEach(insp => {
      if (insp.violations) {
        insp.violations.forEach(v => {
          list.push({
            ...v,
            inspection_id: insp.id,
            inspection_date: insp.inspection_date,
            inspector_name: insp.inspector_name,
            inspection_type: insp.inspection_type,
          });
        });
      }
    });
    return list.sort((a, b) => new Date(b.inspection_date) - new Date(a.inspection_date));
  }, [inspections]);

  const tabs = [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "inspections", label: "Inspections", icon: "assignment" },
    { id: "violations", label: "Violations", icon: "warning" },
    { id: "enforcement", label: "Enforcement", icon: "gavel" },
    { id: "documents", label: "Documents Center", icon: "folder_open" },
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "reports", label: "AI Reports", icon: "auto_awesome" },
  ];

  const handleTabChange = (tabId) => {
    // Close PDF viewer whenever navigating between dossier sections
    closePdfViewer();
    navigate(`/facility/${id}/${tabId}`);
  };

  if (loadingSummary) {
    return (
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto relative z-10 transition-all duration-300">
        {/* Dossier Header Card Skeleton */}
        <header className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden animate-skeleton">
          <div className="w-24 h-4 bg-white/10 rounded mb-4"></div>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="w-64 h-8 bg-white/15 rounded mb-2"></div>
              <div className="w-48 h-4 bg-white/10 rounded"></div>
            </div>
            {/* Header KPI Skeletons */}
            <div className="flex flex-wrap items-center gap-4 bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/5">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="text-center px-4 border-r border-outline-variant/10 last:border-none">
                  <div className="w-12 h-3 bg-white/10 rounded mb-1 mx-auto"></div>
                  <div className="w-8 h-5 bg-white/15 rounded mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-outline-variant/10">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="w-20 h-8 bg-white/10 rounded-lg"></div>
            ))}
          </div>
        </header>
        
        {/* Tab Body Skeleton (Overview Panel) */}
        <main className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-skeleton">
            <div className="flex flex-col gap-6">
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-64"></div>
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-48"></div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-48"></div>
              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-64"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (!facility) {
    return <div className="p-12 font-code-data text-error tracking-widest">ERR_NO_FACILITY_DOSSIER_FOUND</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto relative z-10 transition-all duration-300">
      
      {/* Dossier Header Card */}
      <header className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
        <Link to="/search" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-secondary font-label-caps text-[11px] uppercase tracking-widest transition-colors no-underline mb-4 font-bold">
          <span className="material-symbols-outlined text-[14px]">arrow_back</span> Back to search
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="m-0 text-[26px] md:text-[30px] font-headline-lg font-bold text-on-surface uppercase tracking-tight">
                {facility.name}
              </h1>
              <span className={`font-label-caps text-[9px] font-bold px-2.5 py-0.5 rounded border uppercase tracking-wider ${
                riskLvl === "HIGH"
                  ? "bg-error-container/20 text-error border-error/30"
                  : riskLvl === "MEDIUM"
                  ? "bg-secondary/15 text-secondary border-secondary/25"
                  : "bg-primary-container/25 text-primary border-primary/30"
              }`}>
                {riskLvl} Risk
              </span>
            </div>
            <p className="mt-1.5 font-code-data text-[12px] text-on-surface-variant uppercase tracking-wider flex items-center gap-2 flex-wrap m-0">
              <span>Cert: <strong className="text-on-surface">{facility.certificate_number}</strong></span>
              <span className="opacity-30">•</span>
              <span>Status: <strong className="text-tertiary">{facility.license_status}</strong></span>
              <span className="opacity-30">•</span>
              <span>Class: <strong className="text-on-surface">{facility.license_type || "N/A"}</strong></span>
              <span className="opacity-30">•</span>
              <span>{facility.city ? `${facility.city}, ${facility.state}` : facility.state}</span>
            </p>
          </div>

          {/* Header Dossier KPIs */}
          <div className="flex flex-wrap items-center gap-4 bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/5">
            <div className="text-center px-4 border-r border-outline-variant/10">
              <span className="block font-label-caps text-[8px] text-on-surface-variant tracking-wider uppercase mb-0.5">Compliance</span>
              <span className={`text-[18px] font-bold font-code-data ${
                complianceScore >= 90 ? "text-primary" : complianceScore >= 70 ? "text-secondary" : "text-error"
              }`}>
                {complianceScore}%
              </span>
            </div>
            <div className="text-center px-4 border-r border-outline-variant/10">
              <span className="block font-label-caps text-[8px] text-on-surface-variant tracking-wider uppercase mb-0.5">Inspections</span>
              <span className="text-[18px] font-bold text-on-surface font-code-data">{totalInps}</span>
            </div>
            <div className="text-center px-4 border-r border-outline-variant/10">
              <span className="block font-label-caps text-[8px] text-on-surface-variant tracking-wider uppercase mb-0.5">Violations</span>
              <span className={`text-[18px] font-bold font-code-data ${totalViols > 0 ? "text-error" : "text-primary"}`}>{totalViols}</span>
            </div>
            <div className="text-center px-4">
              <span className="block font-label-caps text-[8px] text-on-surface-variant tracking-wider uppercase mb-0.5">Enforcement</span>
              <span className={`text-[18px] font-bold font-code-data ${enforcementCount > 0 ? "text-secondary" : "text-on-surface-variant"}`}>{enforcementCount}</span>
            </div>
          </div>
        </div>

        {/* Tab Sub-Navigation */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-outline-variant/10 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider border-none transition-all cursor-pointer ${
                  isActive
                    ? "bg-primary text-on-primary shadow-lg scale-102 font-bold"
                    : "bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Dynamic Tab Body Workspace */}
      <main className="mt-6">
        <div className="flex flex-col gap-6">
          
          {/* Tab Content — always full width; PDF is an overlay */}
          <div className="w-full">
            
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                <div className="flex flex-col gap-6">
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-primary">info</span>
                      Facility Profile Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1 font-bold">REGISTRATION NAME</p>
                        <p className="font-body-md text-[14px] text-on-surface m-0">{facility.name}</p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1 font-bold">CUSTOMER ID</p>
                        <p className="font-code-data text-[13px] text-on-surface m-0">{facility.customer_id || "N/A"}</p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1 font-bold">PHYSICAL ADDRESS</p>
                        <p className="font-body-md text-[13px] text-on-surface leading-snug m-0">
                          {facility.address}<br/>
                          {facility.city}, {facility.state} {facility.zip_code}<br/>
                          {facility.county ? `${facility.county} County` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1 font-bold">LICENSED LIMIT</p>
                        <p className="font-body-md text-[14px] text-on-surface m-0">
                          {facility.licensed_animal_limit ? `${facility.licensed_animal_limit} animals max` : "No limit specified"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-primary">shield_alert</span>
                      Dossier Risk Assessment
                    </h3>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="font-code-data text-[12px] text-on-surface-variant">Classification:</span>
                      <span className={`font-label-caps text-[10px] font-bold px-2.5 py-0.5 rounded border uppercase ${
                        riskLvl === "HIGH" ? "bg-error/15 text-error border-error/20" : riskLvl === "MEDIUM" ? "bg-secondary/15 text-secondary border-secondary/20" : "bg-primary/15 text-primary border-primary/20"
                      }`}>
                        {riskLvl} Risk
                      </span>
                    </div>
                    {facility.risk_flags?.risk_drivers && facility.risk_flags.risk_drivers.length > 0 ? (
                      <div className="border-t border-outline-variant/10 pt-4">
                        <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider uppercase mb-2">Deterministic Flags Raised</p>
                        <ul className="list-disc pl-4 flex flex-col gap-1.5 m-0 text-on-surface-variant text-[13px]">
                          {facility.risk_flags.risk_drivers.map((drv, idx) => (
                            <li key={idx} className="leading-relaxed">{drv}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="font-body-md text-[13px] text-on-surface-variant italic mb-0 border-t border-outline-variant/10 pt-4">
                        No critical risk factors or violations flagged by the classification engine.
                      </p>
                    )}
                  </div>

                  {prioritizedFacts.length > 0 && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">campaign</span>
                        Key Regulatory Findings
                      </h3>
                      <div className="flex flex-col gap-3">
                        {prioritizedFacts.map((fact) => (
                          <div key={fact.key} className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/10 flex flex-col gap-2">
                            <p className="font-body-md text-[13px] text-on-surface leading-relaxed m-0">{fact.text}</p>
                            <div className="flex flex-wrap gap-1">
                              {fact.citations.map((cite, cIdx) => (
                                <button
                                  key={cIdx}
                                  onClick={() => {
                                    setSelectedInspectionId(cite.inspection_id);
                                    navigate(`/facility/${id}/inspections`);
                                  }}
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
                </div>

                <div className="flex flex-col gap-6">
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-primary">assessment</span>
                      Compliance Snapshot
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">TOTAL INSPECTIONS</p>
                        <p className="font-headline-md text-[20px] font-bold text-on-surface m-0">{metrics.totalInps}</p>
                      </div>
                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">TOTAL VIOLATIONS</p>
                        <p className="font-headline-md text-[20px] font-bold text-on-surface m-0">{metrics.totalViols}</p>
                      </div>
                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">DIRECT/CRITICAL</p>
                        <p className="font-headline-md text-[20px] font-bold text-error m-0">{metrics.critCount}</p>
                      </div>
                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5">
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">UNIQUE INSPECTORS</p>
                        <p className="font-headline-md text-[20px] font-bold text-on-surface m-0">{metrics.inspectorCount}</p>
                      </div>
                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/5 col-span-2">
                        <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider mb-1">LATEST ANIMAL LIMIT COVERAGE</p>
                        <p className="font-headline-sm text-[15px] font-bold text-on-surface m-0">
                          {metrics.lastAnimalCount} <span className="text-[12px] text-on-surface-variant font-normal">counted /</span> {facility.licensed_animal_limit || "N/A"} <span className="text-[11px] text-on-surface-variant font-normal">licensed</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-primary">history</span>
                      Recent Dossier Activity
                    </h3>
                    {recentActivities.length > 0 ? (
                      <div className="flex flex-col gap-4 border-l-2 border-outline-variant/10 pl-4 ml-2">
                        {recentActivities.map((act, index) => (
                          <div key={index} className="relative group">
                            <div className={`absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-[#151819] ${
                              act.type === "enforcement" ? "bg-secondary" : act.violations > 0 ? "bg-error" : "bg-primary"
                            }`}></div>
                            
                            <span className="font-code-data text-[10px] text-on-surface-variant block uppercase tracking-wider">{formatDate(act.date)}</span>
                            <h4 className="font-headline-sm text-[14px] font-bold text-on-surface m-0 mt-0.5 uppercase tracking-tight">{act.title}</h4>
                            <p className="font-body-md text-[13px] text-on-surface-variant m-0 mt-1 leading-relaxed">{act.description}</p>
                            
                            {act.type === "inspection" && (
                              <button
                                onClick={() => {
                                  setSelectedInspectionId(act.id);
                                  navigate(`/facility/${id}/inspections`);
                                }}
                                className="bg-transparent border-none text-secondary hover:text-tertiary cursor-pointer font-label-caps text-[9px] font-bold uppercase tracking-wider p-0 mt-1.5 flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                Audit Inspection record
                              </button>
                            )}
                            {act.type === "enforcement" && (
                              <button
                                onClick={() => {
                                  setSelectedEnforcementId(act.id);
                                  navigate(`/facility/${id}/enforcement`);
                                }}
                                className="bg-transparent border-none text-secondary hover:text-tertiary cursor-pointer font-label-caps text-[9px] font-bold uppercase tracking-wider p-0 mt-1.5 flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                Audit Enforcement record
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-body-md text-[13px] text-on-surface-variant italic mb-0">No recent regulatory activity recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* INSPECTIONS TAB */}
            {activeTab === "inspections" && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl mb-2">
                  <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary">assignment</span>
                    Dossier Inspection Timeline
                  </h3>
                  <p className="text-[13px] text-on-surface-variant m-0">
                    Select an inspection record from the timeline to review structured violations, animal inventory lists, and load the official report PDF side-by-side.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {loadingInspections ? (
                    <div className="flex flex-col gap-4">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="bg-[#151819] border border-white/5 rounded-xl p-5 flex gap-4 animate-skeleton">
                          <div className="w-1.5 h-16 bg-white/10 rounded shrink-0"></div>
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="w-32 h-4 bg-white/15 rounded"></div>
                            <div className="w-24 h-3 bg-white/10 rounded"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : inspections && inspections.length > 0 ? (
                    inspections.map((insp) => {
                      const isSelected = selectedInspectionId === insp.id;
                      const hasViolations = insp.violation_count > 0;
                      const hasPdf = insp.source_pdf_path || (insp.source_pdf && insp.source_pdf !== 'placeholder');
                      const pdfUrl = hasPdf ? `${import.meta.env.VITE_API_URL}/documents/proxy-pdf/${insp.id}` : null;
                      const isPdfActive = activePdf === pdfUrl;
                      
                      return (
                        <div
                          key={insp.id}
                          id={`inspection-card-${insp.id}`}
                          onClick={() => {
                            setSelectedInspectionId(insp.id);
                          }}
                          className={`bg-[#151819] border rounded-xl overflow-hidden cursor-pointer transition-all duration-300 flex ${
                            isSelected ? "border-secondary ring-1 ring-secondary/20" : "border-white/5 hover:border-white/10"
                          }`}
                        >
                          <div className={`w-1.5 shrink-0 ${hasViolations ? 'bg-error' : 'bg-primary'}`}></div>
                          
                          <div className="flex-1 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div>
                                <span className="font-code-data text-[10px] text-on-surface-variant block uppercase tracking-wider">INSPECTION DATE</span>
                                <span className="font-headline-sm text-[15px] font-bold text-on-surface block mt-0.5">{formatDate(insp.inspection_date)}</span>
                              </div>
                              <div>
                                <span className="font-code-data text-[10px] text-on-surface-variant block uppercase tracking-wider">TYPE</span>
                                <span className="font-code-data text-[12px] text-on-surface block mt-0.5">{insp.inspection_type}</span>
                              </div>
                              <div>
                                <span className="font-code-data text-[10px] text-on-surface-variant block uppercase tracking-wider">INSPECTOR</span>
                                <span className="font-code-data text-[12px] text-secondary font-bold block mt-0.5 uppercase">{insp.inspector_name || "UNKNOWN"}</span>
                              </div>
                              <div>
                                <span className="font-code-data text-[10px] text-on-surface-variant block uppercase tracking-wider">VIOLATIONS</span>
                                <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold block mt-0.5 uppercase ${
                                  hasViolations ? "bg-error/10 text-error border border-error/20" : "bg-primary/10 text-primary border border-primary/20"
                                }`}>
                                  {insp.violation_count || 0} violations
                                </span>
                              </div>
                              {hasPdf && isPdfActive && (
                                <div className="flex items-center gap-1 bg-primary/15 border border-primary/20 text-primary px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0">
                                  <span className="material-symbols-outlined text-[10px]">visibility</span> Active PDF
                                </div>
                              )}
                            </div>

                            {isSelected && (
                              <div className="mt-4 pt-4 border-t border-white/5 animate-fade-in cursor-default" onClick={(e) => e.stopPropagation()}>
                                {pdfUrl && (
                                  <div className="flex items-center justify-between gap-4 mb-4 bg-surface-container-low/30 p-3 rounded-lg border border-outline-variant/5">
                                    <span className="text-[12px] text-on-surface-variant font-code-data">
                                      {isPdfActive 
                                        ? "This report PDF is currently active in the workspace." 
                                        : "Select to load this report PDF in the workspace."}
                                    </span>
                                    {!isPdfActive ? (
                                      <button 
                                        onClick={() => openPdfViewer(pdfUrl, formatDate(insp.inspection_date), `INSPECTION REPORT — ${insp.inspection_type}`)}
                                        className="bg-secondary text-on-secondary border-none px-3.5 py-2 rounded-lg flex items-center gap-1.5 font-label-caps text-[10px] font-bold uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span> Open PDF
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => openPdfViewer(pdfUrl, formatDate(insp.inspection_date), `INSPECTION REPORT — ${insp.inspection_type}`)}
                                        className="bg-primary text-on-primary border-none px-3.5 py-2 rounded-lg flex items-center gap-1.5 font-label-caps text-[10px] font-bold uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[13px]">fullscreen</span> Focus PDF
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Inventory */}
                                <div className="mb-6">
                                  <h4 className="font-label-caps text-[10px] text-secondary tracking-widest uppercase mb-3 font-bold">Animal Inventory</h4>
                                  {insp.inventory && insp.inventory.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {insp.inventory.map(inv => (
                                        <div key={inv.id} className="border border-white/5 bg-surface-container-low px-2.5 py-1 rounded-lg flex items-center gap-2">
                                          <span className="font-code-data text-[11px] font-bold text-on-surface">{inv.count}</span>
                                          <span className="font-code-data text-[10px] text-on-surface-variant uppercase tracking-wider">{inv.common_name}</span>
                                          <span className="font-code-data text-[10px] text-on-surface-variant/40 italic">({inv.scientific_name})</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="font-body-md text-on-surface-variant text-[13px] italic m-0">No animal inventory recorded.</p>
                                  )}
                                </div>

                                {/* Violations */}
                                <div>
                                  <h4 className="font-label-caps text-[10px] text-secondary tracking-widest uppercase mb-3 font-bold">Detailed Violations</h4>
                                  {insp.violations && insp.violations.length > 0 ? (
                                    <div className="flex flex-col gap-2.5">
                                      {insp.violations.map(v => (
                                        <div 
                                          key={v.id} 
                                          id={`violation-card-${v.id}`}
                                          className="border border-white/5 bg-surface-container-low p-3.5 rounded-lg flex flex-col gap-2"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <span className={`font-label-caps text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                                v.severity?.toLowerCase() === 'critical' || v.severity?.toLowerCase() === 'direct'
                                                  ? 'bg-error/10 text-error border-error/20'
                                                  : 'bg-secondary/15 text-secondary border-secondary/25'
                                              }`}>
                                                {v.severity || 'INDIRECT'}
                                              </span>
                                              {v.category && (
                                                <span className="font-label-caps text-[8px] font-bold bg-surface-variant/40 text-on-surface-variant border border-outline-variant/10 px-1.5 py-0.5 rounded">
                                                  {v.category}
                                                </span>
                                              )}
                                            </div>
                                            <span className="font-code-data text-[11px] text-secondary font-bold">SEC {v.section || "?"}</span>
                                          </div>
                                          <p className="font-body-md text-on-surface-variant text-[13.5px] leading-relaxed m-0">
                                            {v.description}
                                          </p>
                                          {v.source_page && (
                                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                                              <span className="font-code-data text-[10px] text-on-surface-variant/40">Page {v.source_page}</span>
                                              {pdfUrl && (
                                                <button 
                                                  onClick={() => openPdfViewer(pdfUrl, formatDate(insp.inspection_date), `INSPECTION REPORT`)}
                                                  className="bg-transparent border-none text-secondary hover:text-tertiary cursor-pointer font-label-caps text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 p-0"
                                                >
                                                  <span className="material-symbols-outlined text-[11px]">open_in_new</span> Go to Page
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="font-body-md text-on-surface-variant text-[13px] italic m-0">No violations cited on this inspection report.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-[#151819] border border-white/5 rounded-xl p-8 text-center text-on-surface-variant italic">
                      No inspections found in this facility's records.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIOLATIONS TAB */}
            {activeTab === "violations" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl mb-2">
                    <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary">warning</span>
                      Compliance Violation History
                    </h3>
                    <p className="text-[13px] text-on-surface-variant m-0">
                      Audit all structured citations recorded against the facility. Click **Audit Evidence** to navigate to the timeline record and inspect the source PDF page.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {loadingInspections ? (
                      <div className="flex flex-col gap-3">
                        {[1, 2, 3].map(n => (
                          <div key={n} className="border border-white/5 bg-[#151819] p-5 rounded-xl flex flex-col gap-3 animate-skeleton">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-4 bg-white/10 rounded"></div>
                              <div className="w-20 h-4 bg-white/10 rounded"></div>
                            </div>
                            <div className="w-full h-16 bg-white/5 rounded"></div>
                          </div>
                        ))}
                      </div>
                    ) : allViolationsList.length > 0 ? (
                      allViolationsList.map((v) => {
                        const isCritical = v.severity?.toLowerCase() === 'critical' || v.severity?.toLowerCase() === 'direct';
                        return (
                          <div key={v.id} className="border border-white/5 bg-[#151819] p-5 rounded-xl flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-label-caps text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                  isCritical ? 'bg-error/10 text-error border-error/20' : 'bg-secondary/15 text-secondary border-secondary/25'
                                }`}>
                                  {v.severity || 'INDIRECT'}
                                </span>
                                {v.category && (
                                  <span className="font-label-caps text-[8px] font-bold bg-surface-variant/40 text-on-surface-variant border border-outline-variant/10 px-1.5 py-0.5 rounded">
                                    {v.category}
                                  </span>
                                )}
                                <span className="font-code-data text-[10.5px] text-on-surface-variant">
                                  Cited on {formatDate(v.inspection_date)}
                                </span>
                              </div>
                              <span className="font-code-data text-[12px] text-secondary font-bold">SEC {v.section || "?"}</span>
                            </div>

                            <p className="font-body-md text-[13.5px] text-on-surface-variant leading-relaxed m-0">
                              {v.description}
                            </p>

                            <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
                              <span className="font-code-data text-[11px] text-on-surface-variant/40">
                                Insp: {v.inspection_type} (Page {v.source_page || "?"})
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedInspectionId(v.inspection_id);
                                  const url = `${import.meta.env.VITE_API_URL}/documents/proxy-pdf/${v.inspection_id}`;
                                  openPdfViewer(url, formatDate(v.inspection_date), `INSPECTION REPORT`);
                                  navigate(`/facility/${id}/inspections`);
                                }}
                                className="bg-transparent border border-outline-variant/20 hover:border-secondary text-secondary hover:text-secondary px-3 py-1.5 rounded-lg cursor-pointer font-label-caps text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                              >
                                <span className="material-symbols-outlined text-[12px]">gavel</span>
                                Audit Evidence
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-[#151819] border border-white/5 rounded-xl p-8 text-center text-on-surface-variant italic">
                        No citations or violations found in this facility's records.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {severityDistribution.length > 0 && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Severity Distribution</h3>
                      <div className="h-[120px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={severityDistribution} layout="vertical" margin={{ left: -25, right: 10, top: 0, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1c19', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '10px' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={10}>
                              {severityDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {categoriesData.length > 0 && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps">Violation Categories</h3>
                      <div className="flex flex-col gap-4">
                        {categoriesData.map(([cat, count]) => {
                          const percentage = (count / maxCategoryCount) * 100;
                          return (
                            <div key={cat} className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[10px] font-label-caps tracking-wider text-on-surface-variant font-medium">
                                <span>{cat}</span>
                                <span className="font-bold text-secondary">{count}</span>
                              </div>
                              <div className="w-full h-1 bg-surface-container-low rounded-full overflow-hidden">
                                <div className="h-full bg-secondary rounded-full" style={{ width: `${percentage}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ENFORCEMENT TAB */}
            {activeTab === "enforcement" && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl mb-2">
                  <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary">gavel</span>
                    USDA Enforcement History
                  </h3>
                  <p className="text-[13px] text-on-surface-variant m-0">
                    Review AWA penalties, license suspensions, and outcomes. Selecting a record will load the official enforcement documentation side-by-side.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {loadingEnforcement ? (
                    <div className="flex flex-col gap-4">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="bg-[#151819] border border-white/5 rounded-xl p-6 flex flex-col gap-3 animate-skeleton">
                          <div className="flex items-center justify-between">
                            <div className="w-24 h-5 bg-white/10 rounded-full"></div>
                            <div className="w-16 h-4 bg-white/10 rounded"></div>
                          </div>
                          <div className="w-full h-12 bg-white/5 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : enforcementActions && enforcementActions.length > 0 ? (
                    enforcementActions.map((action) => {
                      const isSelected = selectedEnforcementId === action.id;
                      const pdfUrl = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/documents/enforcement-pdf/${action.id}`;
                      const hasPdf = action.source_pdf_path !== null;
                      const isPdfActive = activePdf === pdfUrl;
                      
                      return (
                        <div
                          key={action.id}
                          onClick={() => {
                            setSelectedEnforcementId(action.id);
                          }}
                          className={`bg-[#151819] border rounded-xl overflow-hidden cursor-pointer transition-all duration-300 p-6 flex flex-col gap-3 ${
                            isSelected ? "border-secondary ring-1 ring-secondary/20" : "border-white/5 hover:border-white/10"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="bg-secondary/15 text-secondary px-3 py-1 rounded-full font-label-caps text-[10px] font-bold tracking-wider uppercase border border-secondary/20 border-solid">
                                {action.action_type}
                              </span>
                              {action.penalty_amount !== null && action.penalty_amount > 0 && (
                                <span className="bg-error/15 text-error px-3 py-1 rounded-full font-code-data text-[10px] font-bold tracking-wider border border-error/20 border-solid">
                                  PENALTY: ${action.penalty_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {hasPdf && isPdfActive && (
                                <span className="bg-primary/10 border border-primary/20 text-primary px-2.5 py-1 rounded-full font-label-caps text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[10px]">visibility</span> Active PDF
                                </span>
                              )}
                            </div>
                            <span className="font-code-data text-[11px] text-on-surface-variant font-medium">
                              {formatDate(action.action_date)}
                            </span>
                          </div>

                          {action.summary && (
                            <p className="font-body-md text-[13px] text-on-surface-variant leading-relaxed m-0 bg-surface-container-low/40 p-4 rounded-xl border border-outline-variant/10 whitespace-pre-line">
                              {action.summary}
                            </p>
                          )}

                          {isSelected && (
                            <div className="pt-2 border-t border-white/5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                              {action.outcome && (
                                <div className="flex flex-wrap gap-4 text-[12px] font-code-data text-on-surface-variant">
                                  <span>Outcome: <strong className="text-tertiary">{action.outcome}</strong></span>
                                  {action.certificate && <span>Certificate: <strong className="text-on-surface">{action.certificate}</strong></span>}
                                </div>
                              )}

                              {hasPdf && (
                                <div className="flex items-center justify-between gap-4 mt-2 bg-surface-container-low/30 p-3 rounded-lg border border-outline-variant/5">
                                  <span className="text-[12px] text-on-surface-variant font-code-data">
                                    {isPdfActive 
                                      ? "This enforcement PDF is currently active in the workspace." 
                                      : "Select to load this enforcement PDF in the workspace."}
                                  </span>
                                  {!isPdfActive ? (
                                    <button 
                                      onClick={() => openPdfViewer(pdfUrl, formatDate(action.action_date), `ENFORCEMENT RECORD — ${action.action_type}`)}
                                      className="bg-secondary text-on-secondary border-none px-3.5 py-2 rounded-lg flex items-center gap-1.5 font-label-caps text-[10px] font-bold uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span> Open PDF
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => openPdfViewer(pdfUrl, formatDate(action.action_date), `ENFORCEMENT RECORD — ${action.action_type}`)}
                                      className="bg-primary text-on-primary border-none px-3.5 py-2 rounded-lg flex items-center gap-1.5 font-label-caps text-[10px] font-bold uppercase tracking-wider hover:brightness-110 transition-all cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-[13px]">fullscreen</span> Focus PDF
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-[#151819] border border-white/5 rounded-xl p-8 text-center text-on-surface-variant italic">
                      No enforcement records found for this facility.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DOCUMENTS CENTER TAB */}
            {activeTab === "documents" && (
              <div className="flex flex-col gap-4 animate-fade-in">
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl mb-2">
                  <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary">folder_open</span>
                    Centralized Document Repository
                  </h3>
                  <p className="text-[13px] text-on-surface-variant mb-4">
                    Access all regulatory PDFs, download official files, or inspect OCR-extracted text transcripts in the central searchable dossier storage.
                  </p>

                  <div className="relative">
                    <input
                      value={documentSearchQuery}
                      onChange={(e) => setDocumentSearchQuery(e.target.value)}
                      placeholder="Search documents by name, type, date, or OCR text..."
                      className="w-full bg-[#151819] border border-outline-variant/20 rounded-lg pl-10 pr-4 py-2.5 text-[14px] text-on-surface outline-none focus:ring-1 focus:ring-secondary focus:border-secondary transition-all"
                      type="text"
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                      search
                    </span>
                    {documentSearchQuery && (
                      <button
                        onClick={() => setDocumentSearchQuery("")}
                        className="bg-transparent border-none text-on-surface-variant hover:text-secondary cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 p-0 flex items-center"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {(loadingInspections || loadingEnforcement) ? (
                    <div className="flex flex-col gap-3">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="bg-[#151819] border border-white/5 rounded-xl p-4 flex flex-col gap-3 animate-skeleton">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 flex flex-col gap-2">
                              <div className="w-20 h-4 bg-white/10 rounded"></div>
                              <div className="w-48 h-5 bg-white/15 rounded"></div>
                              <div className="w-32 h-3.5 bg-white/10 rounded"></div>
                            </div>
                            <div className="w-8 h-8 bg-white/10 rounded-lg"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredDocuments.length > 0 ? (
                    filteredDocuments.map((doc) => {
                      const isSelected = activePdf === doc.pdfUrl;
                      const isOcrExpanded = expandedOcrDocId === doc.id;
                      
                      return (
                        <div
                          key={doc.id}
                          className={`bg-[#151819] border rounded-xl p-4 flex flex-col gap-3 transition-all duration-300 ${
                            isSelected ? "border-secondary ring-1 ring-secondary/15" : "border-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider mb-1.5 border ${
                                doc.type === "enforcement" 
                                  ? "bg-secondary/10 text-secondary border-secondary/20" 
                                  : "bg-primary/10 text-primary border-primary/20"
                              }`}>
                                {doc.type === "enforcement" ? "Enforcement Action" : "Inspection Report"}
                              </span>
                              <h4 className="font-headline-sm text-[14px] font-bold text-on-surface m-0 leading-tight">
                                {doc.title}
                              </h4>
                              <p className="font-code-data text-[11px] text-on-surface-variant m-0 mt-1 uppercase tracking-wider">
                                {doc.meta}
                              </p>
                            </div>

                            <button
                              onClick={() => window.open(doc.pdfUrl, "_blank")}
                              className="bg-transparent border border-outline-variant/15 text-on-surface-variant hover:text-secondary p-2 rounded-lg cursor-pointer flex items-center justify-center transition-colors shrink-0"
                              title="Download PDF file"
                            >
                              <span className="material-symbols-outlined text-[16px]">download</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5 flex-wrap">
                            <button
                              onClick={() => setExpandedOcrDocId(isOcrExpanded ? null : doc.id)}
                              className="bg-transparent border-none text-secondary hover:text-tertiary cursor-pointer font-label-caps text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 p-0"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                {isOcrExpanded ? "visibility_off" : "visibility"}
                              </span>
                              {isOcrExpanded ? "Hide Transcript" : "Show OCR Transcript"}
                            </button>

                            <button
                              onClick={() => openPdfViewer(doc.pdfUrl, formatDate(doc.date), doc.title)}
                              className="bg-secondary-container text-on-secondary-container border border-secondary/20 px-3.5 py-1.5 rounded-lg font-label-caps text-[10px] tracking-widest cursor-pointer uppercase flex items-center gap-1.5 hover:brightness-110 transition-all font-bold"
                            >
                              <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                              View Side-by-Side
                            </button>
                          </div>

                          {isOcrExpanded && (
                            <div className="mt-2 bg-surface-container-low border border-outline-variant/10 p-3 rounded-lg animate-fade-in">
                              <span className="font-label-caps text-[8.5px] text-on-surface-variant uppercase tracking-wider block mb-2 border-b border-white/5 pb-1 font-bold">
                                Extracted Document text (OCR)
                              </span>
                              <pre className="font-code-data text-[12px] text-on-surface-variant leading-relaxed m-0 whitespace-pre-wrap max-h-[250px] overflow-y-auto custom-scrollbar">
                                {doc.ocrText}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-[#151819] border border-white/5 rounded-xl p-8 text-center text-on-surface-variant italic">
                      No matching documents found in repository.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === "analytics" && (
              loadingInspections ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-skeleton">
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-[320px]">
                    <div className="w-32 h-5 bg-white/15 rounded mb-4"></div>
                    <div className="w-full h-[200px] bg-white/5 rounded flex flex-col justify-between p-4">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className="border-b border-white/5 w-full h-0"></div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl h-[320px]">
                    <div className="w-32 h-5 bg-white/15 rounded mb-4"></div>
                    <div className="w-full h-[200px] bg-white/5 rounded flex flex-col justify-between p-4">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className="border-b border-white/5 w-full h-0"></div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                  {inspections && inspections.some(insp => insp.inventory && insp.inventory.length > 0) && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps font-bold">Animal Inventory Trend</h3>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={[...inspections].reverse().map(insp => ({
                              date: new Date(insp.inspection_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                              count: insp.inventory ? insp.inventory.reduce((sum, item) => sum + item.count, 0) : 0
                            }))}
                            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} dy={5} />
                            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} dx={-5} />
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

                  <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps font-bold">Violation Count Trend</h3>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[...inspections].reverse().map(insp => ({
                            date: new Date(insp.inspection_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
                            violations: insp.violation_count || 0
                          }))}
                          margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} dy={5} />
                          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} tickLine={false} axisLine={false} dx={-5} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1c19', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '11px' }} />
                          <Bar dataKey="violations" fill="#ffb4ab" radius={[4, 4, 0, 0]} barSize={15} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {severityDistribution.length > 0 && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps font-bold">Severity Distribution</h3>
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={severityDistribution} layout="vertical" margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1c19', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '11px' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                              {severityDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {categoriesData.length > 0 && (
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                      <h3 className="font-headline-sm text-[16px] font-bold text-on-surface mb-4 uppercase tracking-wider font-label-caps font-bold">Recurring Violation Categories</h3>
                      <div className="flex flex-col gap-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
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
                </div>
              )
            )}

            {/* AI REPORTS TAB */}
            {activeTab === "reports" && (
              <div className="flex flex-col gap-6 animate-fade-in">
                <AISummaryPanel 
                  facilityId={facility.id} 
                  facility={facility} 
                  onCitationClick={(inspectionId) => {
                    setSelectedInspectionId(inspectionId);
                    const url = `${import.meta.env.VITE_API_URL}/documents/proxy-pdf/${inspectionId}`;
                    openPdfViewer(url, "", `INSPECTION REPORT`);
                    navigate(`/facility/${id}/inspections`);
                  }} 
                  totalInspections={totalInps} 
                />
                
                <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-xl">
                  <h3 className="font-headline-sm text-[18px] font-bold text-on-surface flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-primary">description</span>
                    Advocacy & Public Record Memo System
                  </h3>
                  <AdvocacyReports facilityId={facility.id} facilityName={facility.name} />
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* PDF Overlay Drawer — fixed to viewport, slides in from right */}
      {/* Backdrop */}
      <div
        className="pdf-overlay-backdrop"
        style={{ opacity: activePdf ? 1 : 0, pointerEvents: activePdf ? "auto" : "none" }}
        onClick={closePdfViewer}
      />
      {/* Drawer panel */}
      <div
        className="pdf-overlay-drawer"
        style={{ transform: activePdf ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Drawer header strip */}
        <div className="pdf-overlay-header">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">picture_as_pdf</span>
            <div className="min-w-0">
              <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest">PDF Workspace</div>
              <div className="font-code-data text-[12px] text-on-surface truncate">
                {activePdfTitle || (activePdfDate ? `Inspection · ${activePdfDate}` : "Document")}
              </div>
            </div>
          </div>
          <button
            onClick={closePdfViewer}
            className="shrink-0 flex items-center gap-1.5 bg-error/10 hover:bg-error/20 border border-error/20 text-error px-3 py-1.5 rounded-lg font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            Close
          </button>
        </div>
        {/* PDF viewer fills the rest */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activePdf && (
            <PDFViewer
              pdfUrl={activePdf}
              onClose={closePdfViewer}
              inspectionDate={activePdfDate}
              facilityName={facility.name}
            />
          )}
        </div>
      </div>
    </div>
  );
}
