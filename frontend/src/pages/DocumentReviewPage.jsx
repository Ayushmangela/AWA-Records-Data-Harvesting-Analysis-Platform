import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { searchViolations } from "../services/api";
import PDFViewer from "../components/PDFViewer";
import supabase from "../lib/supabase";


const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DocumentReviewPage() {
  const glowRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Parsing URL query parameters for workspace state persistence
  const searchParams = new URLSearchParams(location.search);
  const queryParam = searchParams.get("query") || "";
  const severityParam = searchParams.get("severity") || "All Severities";
  const stateParam = searchParams.get("state") || "All States";
  const dateStartParam = searchParams.get("date_start") || "";
  const dateEndParam = searchParams.get("date_end") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10) || 1;
  const violationIdParam = parseInt(searchParams.get("violation_id") || "0", 10) || null;
  const sortByParam = searchParams.get("sort_by") || "date_desc";

  // Data fetching and UI states
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState(null);
  const [selectedViolation, setSelectedViolation] = useState(null);

  // Local inputs state (to prevent immediate triggers during typing)
  const [localQuery, setLocalQuery] = useState("");
  const [localDateStart, setLocalDateStart] = useState("");
  const [localDateEnd, setLocalDateEnd] = useState("");
  const [nameError, setNameError] = useState(null);

  // Sync inputs with URL states on location change
  useEffect(() => {
    setLocalQuery(queryParam);
    setLocalDateStart(dateStartParam);
    setLocalDateEnd(dateEndParam);
  }, [queryParam, dateStartParam, dateEndParam]);

  // Background glow mouse tracker
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (glowRef.current) {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        glowRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(233, 195, 73, 0.1) 0%, transparent 60%)`;
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Primary fetch operation reading query state from URL
  const fetchWorkspaceData = async () => {
    if (queryParam.trim() && queryParam.trim().length < 3) {
      setNameError("Search term must be at least 3 characters");
      setLoading(false);
      setViolations([]);
      setTotalCount(0);
      return;
    }
    setNameError(null);
    setLoading(true);
    setError(null);

    try {
      const params = {
        limit: 20,
        offset: (pageParam - 1) * 20,
        include_total: true,
        sort_by: sortByParam
      };

      if (queryParam.trim()) params.query = queryParam.trim();
      if (severityParam !== "All Severities") params.severity = severityParam;
      if (stateParam !== "All States") params.state = stateParam;
      if (dateStartParam) params.date_start = dateStartParam;
      if (dateEndParam) params.date_end = dateEndParam;

      const res = await searchViolations(params);
      setViolations(res.results || []);
      setTotalCount(res.total || 0);

      // Handle selecting active violation from result set
      if (violationIdParam) {
        const active = (res.results || []).find(v => v.id === violationIdParam);
        if (active) {
          setSelectedViolation(active);
        } else {
          // Fallback if not found in current view page
          setSelectedViolation(null);
        }
      } else {
        setSelectedViolation(null);
      }
    } catch (err) {
      console.error("Workspace load error:", err);
      setError("Unable to sync portal archives. Please review network connection.");
    } finally {
      setLoading(false);
    }
  };

  // Re-run search whenever URL changes
  useEffect(() => {
    fetchWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    location.search,
    queryParam,
    severityParam,
    stateParam,
    dateStartParam,
    dateEndParam,
    pageParam,
    violationIdParam,
    sortByParam
  ]);

  // Form submit handles search queries & date range updates
  const handleFilterSubmit = (e) => {
    if (e) e.preventDefault();

    if (localQuery.trim() && localQuery.trim().length < 3) {
      setNameError("Search term must be at least 3 characters");
      return;
    }
    setNameError(null);

    const params = new URLSearchParams(location.search);
    if (localQuery.trim()) {
      params.set("query", localQuery.trim());
    } else {
      params.delete("query");
    }

    if (localDateStart) {
      params.set("date_start", localDateStart);
    } else {
      params.delete("date_start");
    }

    if (localDateEnd) {
      params.set("date_end", localDateEnd);
    } else {
      params.delete("date_end");
    }

    // Reset page and selection
    params.set("page", "1");
    params.delete("violation_id");

    navigate(`/document-review?${params.toString()}`);
  };

  // Helper updates URL for simple selects (State, Severity, Sorting)
  const handleSelectUpdate = (key, value) => {
    const params = new URLSearchParams(location.search);
    if (value && value !== "All States" && value !== "All Severities") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1"); // Reset page
    params.delete("violation_id"); // Reset selection

    navigate(`/document-review?${params.toString()}`);
  };

  // Pagination navigation updates URL
  const handlePageUpdate = (newPage) => {
    const params = new URLSearchParams(location.search);
    params.set("page", newPage.toString());
    navigate(`/document-review?${params.toString()}`);
  };

  // Clear single param filter pill
  const handleClearPill = (key) => {
    const params = new URLSearchParams(location.search);
    params.delete(key);
    params.set("page", "1");
    params.delete("violation_id");
    navigate(`/document-review?${params.toString()}`);
  };

  // Reset entire workspace filters back to default
  const handleResetWorkspace = () => {
    setLocalQuery("");
    setLocalDateStart("");
    setLocalDateEnd("");
    setNameError(null);
    navigate(`/document-review`);
  };

  // Handle row selection
  const handleSelectRow = (violation) => {
    const params = new URLSearchParams(location.search);
    if (violation) {
      params.set("violation_id", violation.id.toString());
    } else {
      params.delete("violation_id");
    }
    navigate(`/document-review?${params.toString()}`);
  };

  // Dynamic filter checks for pill render
  const hasActiveFilters =
    queryParam.trim().length > 0 ||
    severityParam !== "All Severities" ||
    stateParam !== "All States" ||
    dateStartParam !== "" ||
    dateEndParam !== "";

  // Pagination bounds checking
  const maxPages = Math.ceil(totalCount / 20) || 1;

  const [token, setToken] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });
  }, []);

  // Construct PDF Url proxy endpoint matching backend router
  const getProxyPdfUrl = (violation) => {
    if (!violation) return null;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    return `${baseUrl}/documents/proxy-pdf/${violation.inspection_id}${token ? `?token=${token}` : ""}`;
  };

  return (
    <>
      {/* Background Atmospheric Glow */}
      <div className="fixed inset-0 pointer-events-none opacity-5 z-0">
        <div
          ref={glowRef}
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"
        ></div>
      </div>

      <div className="p-12 max-w-[1440px] mx-auto relative z-10">
        {/* Header Section */}
        <section className="mb-12">
          <div className="flex flex-col md:flex-row gap-8 items-end justify-between">
            <div className="flex-1">
              <h3 className="font-headline-lg text-[40px] leading-[48px] font-bold text-on-surface mb-3 tracking-[-0.02em]">
                Archive Evidence Review
              </h3>
              <p className="font-body-lg text-[18px] text-on-surface-variant max-w-2xl leading-[28px]">
                Search specific violation texts, inspect incident severities, filter regulatory dates, and review official USDA PDFs side-by-side.
              </p>
            </div>
          </div>

          {/* Search Controls Card */}
          <form
            onSubmit={handleFilterSubmit}
            className="mt-10 glass-card rounded-2xl p-8 border border-white/5 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 relative z-10">
              {/* Query Search */}
              <div className="flex flex-col gap-2 lg:col-span-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Violation Content
                </label>
                <div className="relative flex items-center">
                  <input
                    value={localQuery}
                    onChange={(e) => {
                      setLocalQuery(e.target.value);
                      if (e.target.value.trim() && e.target.value.trim().length < 3) {
                        setNameError("Must be at least 3 characters");
                      } else {
                        setNameError(null);
                      }
                    }}
                    className={`w-full bg-surface-container-lowest border rounded-lg pl-4 pr-10 py-2.5 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none ${
                      nameError
                        ? "border-error/50 focus:ring-error focus:border-error"
                        : "border-outline-variant/20"
                    }`}
                    placeholder="Search violation text..."
                    type="text"
                  />
                  <span className="material-symbols-outlined absolute right-3 text-on-surface-variant/40 text-[18px]">
                    search
                  </span>
                </div>
                {nameError && (
                  <span className="text-error text-[11px] font-medium leading-none mt-1 animate-fade-in">
                    {nameError}
                  </span>
                )}
              </div>

              {/* State Select */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                  State
                </label>
                <div className="relative">
                  <select
                    value={stateParam}
                    onChange={(e) => handleSelectUpdate("state", e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
                  >
                    <option>All States</option>
                    {US_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Severity Select */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Severity
                </label>
                <div className="relative">
                  <select
                    value={severityParam}
                    onChange={(e) => handleSelectUpdate("severity", e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
                  >
                    <option>All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="Direct">Direct</option>
                    <option value="Indirect">Indirect</option>
                    <option value="Teachable">Teachable</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Start Date */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Date Start
                </label>
                <input
                  value={localDateStart}
                  onChange={(e) => setLocalDateStart(e.target.value)}
                  type="date"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none cursor-pointer"
                />
              </div>

              {/* End Date */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Date End
                </label>
                <input
                  value={localDateEnd}
                  onChange={(e) => setLocalDateEnd(e.target.value)}
                  type="date"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="mt-8 pt-6 border-t border-outline-variant/10 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
              {/* Sorting options */}
              <div className="flex items-center gap-3">
                <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
                  Sort Order:
                </label>
                <select
                  value={sortByParam}
                  onChange={(e) => handleSelectUpdate("sort_by", e.target.value)}
                  className="bg-transparent border-none text-[12px] font-bold font-label-caps uppercase text-secondary outline-none cursor-pointer"
                >
                  <option value="date_desc">Newest First</option>
                  <option value="date_asc">Oldest First</option>
                </select>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  className="bg-surface-container-highest hover:bg-surface-variant text-on-surface font-bold px-6 py-3 rounded-xl transition-all font-label-caps text-[12px] tracking-widest border border-outline-variant/10 cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="submit"
                  disabled={nameError !== null}
                  className={`bg-secondary text-on-secondary font-bold px-10 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg uppercase font-label-caps text-[12px] tracking-widest ${
                    nameError !== null
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:brightness-110 active:scale-95 cursor-pointer"
                  }`}
                >
                  <span className="material-symbols-outlined">filter_alt</span>
                  Apply Filters
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Active Filter Indicators */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-3 mb-8 animate-fade-in relative z-10">
            <span className="text-on-surface-variant font-label-caps text-[10px] uppercase tracking-widest font-bold">
              Active Filters:
            </span>
            {queryParam.trim() && (
              <span className="bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-xl font-label-caps text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
                Keyword: "{queryParam}"
                <button
                  onClick={() => handleClearPill("query")}
                  className="hover:text-white border-none bg-transparent cursor-pointer font-bold text-[14px] flex items-center justify-center p-0.5"
                  title="Clear Keyword Filter"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {stateParam !== "All States" && (
              <span className="bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-xl font-label-caps text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
                State: {stateParam}
                <button
                  onClick={() => handleClearPill("state")}
                  className="hover:text-white border-none bg-transparent cursor-pointer font-bold text-[14px] flex items-center justify-center p-0.5"
                  title="Clear State Filter"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {severityParam !== "All Severities" && (
              <span className="bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-xl font-label-caps text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
                Severity: {severityParam}
                <button
                  onClick={() => handleClearPill("severity")}
                  className="hover:text-white border-none bg-transparent cursor-pointer font-bold text-[14px] flex items-center justify-center p-0.5"
                  title="Clear Severity Filter"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {dateStartParam && (
              <span className="bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-xl font-label-caps text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
                From: {dateStartParam}
                <button
                  onClick={() => handleClearPill("date_start")}
                  className="hover:text-white border-none bg-transparent cursor-pointer font-bold text-[14px] flex items-center justify-center p-0.5"
                  title="Clear Date Start Filter"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}
            {dateEndParam && (
              <span className="bg-secondary/10 border border-secondary/20 text-secondary px-3.5 py-1.5 rounded-xl font-label-caps text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
                To: {dateEndParam}
                <button
                  onClick={() => handleClearPill("date_end")}
                  className="hover:text-white border-none bg-transparent cursor-pointer font-bold text-[14px] flex items-center justify-center p-0.5"
                  title="Clear Date End Filter"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            )}

            <button
              onClick={handleResetWorkspace}
              className="text-on-surface-variant hover:text-secondary text-[11px] font-bold font-label-caps uppercase border-none bg-transparent cursor-pointer underline flex items-center gap-1.5 ml-2 transition-colors"
            >
              Reset Workspace
            </button>
          </div>
        )}

        {/* WORKSPACE AREA (Split-Screen supported) */}
        <div className="flex flex-col lg:flex-row gap-8 transition-all duration-300 relative z-10">
          
          {/* LEFT PANEL: Results List */}
          <div
            className={`transition-all duration-500 flex flex-col ${
              selectedViolation ? "w-full lg:w-[45%]" : "w-full"
            }`}
          >
            {/* Header / Pagination Controls */}
            <div className="flex items-center justify-between mb-6">
              <p className="font-body-md text-[14px] text-on-surface-variant m-0">
                Found <span className="text-secondary font-bold">{totalCount}</span> violation records (Page {pageParam} of {maxPages})
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageUpdate(pageParam - 1)}
                  disabled={pageParam <= 1 || loading}
                  className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${
                    pageParam <= 1 || loading
                      ? "opacity-50 cursor-not-allowed"
                      : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface cursor-pointer"
                  }`}
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button
                  onClick={() => handlePageUpdate(pageParam + 1)}
                  disabled={pageParam >= maxPages || loading}
                  className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${
                    pageParam >= maxPages || loading
                      ? "opacity-50 cursor-not-allowed"
                      : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface cursor-pointer"
                  }`}
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div className="bg-error-container/10 border border-error-container/30 text-error p-6 rounded-2xl mb-8 flex items-center gap-3 animate-fade-in shadow-xl">
                <span className="material-symbols-outlined text-[24px]">error</span>
                <div className="flex flex-col">
                  <h4 className="font-headline-sm text-[16px] font-bold text-on-surface m-0 mb-1">
                    System Sync Failure
                  </h4>
                  <p className="font-body-md text-[13px] text-on-surface-variant m-0">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Main results switch */}
            {loading ? (
              <div className="flex flex-col gap-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 flex flex-col gap-3 animate-pulse border-t-[6px] border-t-outline-variant/20"
                  >
                    <div className="flex justify-between items-center gap-4">
                      <div className="h-4 bg-surface-variant rounded w-1/3"></div>
                      <div className="h-4 bg-surface-variant rounded w-1/5"></div>
                    </div>
                    <div className="h-5 bg-surface-variant rounded w-full"></div>
                    <div className="h-4 bg-surface-variant rounded w-5/6"></div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                      <div className="h-4 bg-surface-variant rounded w-2/5"></div>
                      <div className="h-4 bg-surface-variant rounded w-1/6"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : violations.length === 0 ? (
              <div className="py-20 text-center border border-outline-variant/10 rounded-2xl bg-surface-container-low flex flex-col items-center justify-center gap-6 px-6 shadow-xl">
                <div className="w-16 h-16 rounded-full bg-surface-variant/20 flex items-center justify-center text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[36px]">search_off</span>
                </div>
                <div>
                  <h4 className="font-headline-sm text-[22px] font-bold text-on-surface mb-2">
                    No violations archived
                  </h4>
                  <p className="font-body-md text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                    We couldn't find any violation records matching your criteria. Double check keywords or expand date filters.
                  </p>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={handleResetWorkspace}
                    className="bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 px-6 py-2.5 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
                {violations.map((v) => {
                  const isActive = selectedViolation?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelectRow(v)}
                      className={`bg-surface-container-low border rounded-2xl p-5 cursor-pointer transition-all flex flex-col gap-3 hover:border-secondary/30 shadow-lg ${
                        isActive
                          ? "ring-1 ring-secondary border-secondary bg-surface-container"
                          : "border-outline-variant/10"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 overflow-hidden">
                          <span
                            className={`font-label-caps text-[9px] font-bold px-2 py-0.5 rounded border inline-block mr-2 uppercase tracking-wider ${
                              v.severity?.toLowerCase() === "critical" ||
                              v.severity?.toLowerCase() === "direct"
                                ? "bg-error/15 text-error border-error/20"
                                : "bg-warning/15 text-warning border-warning/20"
                            }`}
                          >
                            {v.severity || "INDIRECT"}
                          </span>
                          <span className="font-code-data text-[12px] text-secondary font-bold">
                            SEC {v.section || "?"}
                          </span>
                        </div>
                        <span className="font-code-data text-[11px] text-on-surface-variant uppercase tracking-wider shrink-0">
                          {formatDate(v.inspection_date)}
                        </span>
                      </div>
                      <p className="font-body-md text-[13.5px] text-on-surface-variant leading-relaxed line-clamp-3 m-0">
                        {v.description}
                      </p>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 text-[12px]">
                        <span
                          className="text-on-surface font-medium truncate max-w-[200px]"
                          title={v.facility_name}
                        >
                          {v.facility_name}
                        </span>
                        {v.source_page && (
                          <span className="font-code-data text-on-surface-variant/60 text-[10px]">
                            Page {v.source_page}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Evidence Review & PDFViewer */}
          {selectedViolation && (
            <div className="w-full lg:w-[55%] flex flex-col animate-fade-in shrink-0 relative z-10 lg:sticky lg:top-4 max-h-[85vh]">
              {/* Investigator Evidence Context Card */}
              <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden shrink-0">
                <div className="flex items-center justify-between gap-4 mb-3 border-b border-white/5 pb-3">
                  <h4 className="font-headline-sm text-[16px] text-secondary m-0 font-bold uppercase tracking-wider flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">verified_user</span>
                    Active Evidence Panel
                  </h4>
                  <button
                    onClick={() => handleSelectRow(null)}
                    className="bg-transparent border-none text-on-surface-variant hover:text-error cursor-pointer p-1 rounded-full hover:bg-surface-variant/20 flex items-center justify-center transition-all"
                    title="Close Evidence Panel"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 text-[13px]">
                  <div>
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      Facility
                    </p>
                    <Link
                      to={`/facility/${selectedViolation.facility_id}`}
                      className="text-on-surface hover:text-secondary font-medium transition-colors no-underline block truncate"
                      title={selectedViolation.facility_name}
                    >
                      {selectedViolation.facility_name}
                    </Link>
                  </div>
                  <div>
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      Inspection Date
                    </p>
                    <p className="text-on-surface font-medium">
                      {formatDate(selectedViolation.inspection_date)}
                    </p>
                  </div>
                  <div>
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      Severity
                    </p>
                    <span
                      className={`font-label-caps text-[10px] font-bold px-2 py-0.5 rounded border inline-block uppercase ${
                        selectedViolation.severity?.toLowerCase() === "critical" ||
                        selectedViolation.severity?.toLowerCase() === "direct"
                          ? "bg-error/15 text-error border-error/20"
                          : "bg-warning/15 text-warning border-warning/20"
                      }`}
                    >
                      {selectedViolation.severity || "INDIRECT"}
                    </span>
                  </div>
                  <div>
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      AWA Section
                    </p>
                    <p className="text-secondary font-bold font-code-data">
                      SEC {selectedViolation.section || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      Source Page
                    </p>
                    <p className="text-on-surface font-medium font-code-data">
                      Page {selectedViolation.source_page || "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-4">
                  <div className="overflow-hidden">
                    <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                      AWA Category
                    </p>
                    <p className="text-on-surface-variant font-medium text-[12px] truncate capitalize">
                      {selectedViolation.category || "General Care"}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <Link
                      to={`/facility/${selectedViolation.facility_id}`}
                      className="bg-transparent border border-outline-variant/20 hover:border-secondary hover:text-secondary text-on-surface-variant px-4 py-2 rounded-lg cursor-pointer font-label-caps text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 no-underline"
                    >
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      View Profile
                    </Link>
                  </div>
                </div>
              </div>

              {/* Scrollable PDF Viewer container */}
              <div className="flex-1 min-h-[450px] overflow-hidden">
                <PDFViewer
                  pdfUrl={getProxyPdfUrl(selectedViolation)}
                  highlightPage={selectedViolation.source_page || 1}
                  highlightText={selectedViolation.section}
                  onClose={() => handleSelectRow(null)}
                  facilityName={selectedViolation.facility_name}
                  inspectionDate={formatDate(selectedViolation.inspection_date)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
