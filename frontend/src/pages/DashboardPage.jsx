import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { searchFacilities } from "../services/api";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DashboardPage() {
  const glowRef = useRef(null);
  
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("All States");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [licenseTypeFilter, setLicenseTypeFilter] = useState("All Types");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState("violations_desc");
  
  const [totalCount, setTotalCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState([null]);
  const [nextCursor, setNextCursor] = useState(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (glowRef.current) {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        glowRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(233, 195, 73, 0.1) 0%, transparent 60%)`;
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const loadData = async (currentPage = pageIndex, currentCursors = cursors) => {
    setLoading(true);
    try {
      const params = {
        limit: 20,
        sort_by: sortBy
      };
      
      if (searchTerm) params.name = searchTerm;
      if (stateFilter && stateFilter !== "All States") params.state = stateFilter;
      if (speciesFilter) params.species = speciesFilter;
      if (licenseTypeFilter && licenseTypeFilter !== "All Types") params.license_type = licenseTypeFilter;
      if (showActiveOnly) params.has_violations = true;
      
      const cursor = currentCursors[currentPage];
      if (cursor) {
        params.cursor = cursor;
      } else {
        params.offset = currentPage * 20;
      }

      if (currentPage === 0) {
        params.include_total = true;
      }
      
      const res = await searchFacilities(params);
      setFacilities(res.results || []);
      setNextCursor(res.cursor || null);
      if (res.total !== undefined && res.total !== null) {
        setTotalCount(res.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPageIndex(0);
    setCursors([null]);
    loadData(0, [null]);
  };

  const handleNextPage = () => {
    if (!nextCursor && facilities.length < 20) return;
    const newCursors = [...cursors];
    newCursors[pageIndex + 1] = nextCursor;
    setCursors(newCursors);
    const nextIdx = pageIndex + 1;
    setPageIndex(nextIdx);
    loadData(nextIdx, newCursors);
  };

  const handlePrevPage = () => {
    if (pageIndex === 0) return;
    const prevIdx = pageIndex - 1;
    setPageIndex(prevIdx);
    loadData(prevIdx, cursors);
  };

  return (
    <>
      {/* Background Atmospheric Glow */}
      <div className="fixed inset-0 pointer-events-none opacity-5 z-0">
        <div ref={glowRef} className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"></div>
      </div>
      
      <div className="p-12 max-w-[1440px] mx-auto relative z-10">
        
        {/* Header Section */}
        <section className="mb-12">
          <div className="flex flex-col md:flex-row gap-8 items-end justify-between">
            <div className="flex-1">
              <h3 className="font-headline-lg text-[40px] leading-[48px] font-bold text-on-surface mb-3 tracking-[-0.02em]">AWA Harvest & Analytics Portal</h3>
              <p className="font-body-lg text-[18px] text-on-surface-variant max-w-2xl leading-[28px]">
                Advanced legal research and violation tracking platform for comprehensive Animal Welfare Act facility inspections and regulatory compliance.
              </p>
            </div>
            <div className="flex items-center gap-2 text-secondary font-label-caps text-[11px] uppercase tracking-wider font-bold">
              <span className="material-symbols-outlined text-[16px]">history</span>
              <span>Last database update: Today, 04:15 AM EST</span>
            </div>
          </div>
          
          {/* Filter Bar */}
          <form onSubmit={handleSearch} className="mt-10 glass-card rounded-2xl p-8 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Facility Name</label>
                <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none" placeholder="Search facility name..." type="text"/>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">State</label>
                <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none">
                  <option>All States</option>
                  <option>CA</option>
                  <option>OR</option>
                  <option>FL</option>
                  <option>TX</option>
                  <option>NY</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Species Search</label>
                <input value={speciesFilter} onChange={e=>setSpeciesFilter(e.target.value)} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all" placeholder="e.g. rabbit, dog..." type="text"/>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">License Type</label>
                <select value={licenseTypeFilter} onChange={e=>setLicenseTypeFilter(e.target.value)} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none">
                  <option>All Types</option>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                  <option>R</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Violation Severity</label>
                <select className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none">
                  <option>All Severities</option>
                  <option>Critical Only</option>
                  <option>Direct Only</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Sort By</label>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-2.5 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none">
                  <option value="violations_desc">Most Violations</option>
                  <option value="name_asc">Alphabetical</option>
                </select>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-outline-variant/10 flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer group" onClick={(e) => { e.preventDefault(); setShowActiveOnly(!showActiveOnly); }}>
                <div className={`w-10 h-5 rounded-full relative transition-all duration-300 ${showActiveOnly ? 'bg-secondary' : 'bg-surface-variant'}`}>
                  <div className={`absolute left-1 top-1 w-3 h-3 rounded-full transition-all duration-300 ${showActiveOnly ? 'bg-on-secondary translate-x-5' : 'bg-on-surface'}`}></div>
                </div>
                <span className="font-label-caps text-[11px] font-bold text-on-surface uppercase tracking-wider">Show active violations only</span>
              </label>
              <button type="submit" className="bg-secondary hover:brightness-110 text-on-secondary font-bold px-10 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg active:scale-95 uppercase font-label-caps text-[12px] tracking-widest">
                <span className="material-symbols-outlined">search</span>
                Execute Search
              </button>
            </div>
          </form>
        </section>

        {/* Results Count & Pagination */}
        <div className="flex items-center justify-between mb-8">
          <p className="font-body-md text-on-surface-variant">Showing <span className="text-secondary font-bold">{facilities.length}</span> of {totalCount === null || totalCount === 0 && facilities.length > 0 ? "many" : totalCount} facilities (Page {pageIndex + 1})</p>
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevPage}
              disabled={pageIndex === 0}
              className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${pageIndex === 0 ? "opacity-50 cursor-not-allowed" : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface"}`}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button 
              onClick={handleNextPage}
              disabled={(!nextCursor && facilities.length < 20) || facilities.length === 0}
              className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${(!nextCursor && facilities.length < 20) || facilities.length === 0 ? "opacity-50 cursor-not-allowed" : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface"}`}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Grid of Cards */}
        {loading ? (
          <div className="py-20 text-center font-code-data text-secondary tracking-widest uppercase">
            Querying Database...
          </div>
        ) : facilities.length === 0 ? (
          <div className="py-20 text-center font-code-data text-on-surface-variant tracking-widest uppercase border border-outline-variant/10 rounded-2xl bg-surface-container-low">
            No facilities found matching your criteria.
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {facilities.map((fac) => {
              const hasViolations = fac.violation_count > 0;
              return (
                <Link key={fac.id} to={`/facility/${fac.id}`} className="bg-surface-container-low border border-outline-variant/10 rounded-2xl overflow-hidden hover:border-secondary/30 transition-all group flex flex-col cursor-pointer shadow-xl no-underline">
                  <div className={`h-1.5 ${hasViolations ? 'bg-error' : 'bg-secondary'}`}></div>
                  <div className="p-8 flex flex-col gap-6 flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-headline-md text-[28px] font-bold text-on-surface leading-tight group-hover:text-secondary transition-colors">{fac.name}</h4>
                        <p className="font-code-data text-[13px] text-on-surface-variant mt-2 uppercase tracking-tight">Certificate: {fac.certificate_number}</p>
                      </div>
                      {hasViolations ? (
                        <div className="bg-error/10 text-error border border-error/20 px-3 py-1.5 rounded-lg font-label-caps text-[11px] flex items-center gap-1.5 uppercase font-bold">
                          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                          {fac.violation_count} VIOLATIONS
                        </div>
                      ) : (
                        <div className="bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1.5 rounded-lg font-label-caps text-[11px] flex items-center gap-1.5 uppercase font-bold">
                          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                          0 VIOLATIONS
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-6 border-y border-white/5 py-6">
                      <div>
                        <p className="font-label-caps font-bold text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Location</p>
                        <p className="text-on-surface font-medium">{fac.city}, {fac.state}</p>
                      </div>
                      <div>
                        <p className="font-label-caps font-bold text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">License Type</p>
                        <p className="text-on-surface font-medium">{fac.license_type || "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4">
                      <div className="flex flex-col">
                        <p className="font-label-caps font-bold text-[10px] text-on-surface-variant uppercase mb-1">Last Inspected</p>
                        <p className="text-secondary font-bold font-code-data text-[13px]">
                          {fac.latest_inspection_date ? formatDate(fac.latest_inspection_date) : "—"}
                        </p>
                      </div>
                      <button className="bg-surface-container-highest hover:bg-secondary text-on-surface-variant hover:text-on-secondary px-6 py-2.5 rounded-lg font-label-caps text-[11px] border border-outline-variant/10 transition-all flex items-center gap-2 uppercase font-bold">
                        View Profile
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <footer className="mt-16 pt-10 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-6 pb-12">
          <p className="font-label-caps font-bold text-[11px] text-on-surface-variant uppercase tracking-widest">© 2025 AWA Analytics Division. For official investigative use only.</p>
          <div className="flex items-center gap-10">
            <a className="font-label-caps font-bold text-[11px] text-on-surface-variant hover:text-secondary transition-colors uppercase tracking-widest no-underline" href="#">Privacy Protocol</a>
            <a className="font-label-caps font-bold text-[11px] text-on-surface-variant hover:text-secondary transition-colors uppercase tracking-widest no-underline" href="#">Data Governance</a>
            <a className="font-label-caps font-bold text-[11px] text-on-surface-variant hover:text-secondary transition-colors uppercase tracking-widest no-underline" href="#">System Status</a>
          </div>
        </footer>
      </div>
    </>
  );
}
