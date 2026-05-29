import React, { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchFacilities } from "../services/api";
import FacilityCard from "../components/FacilityCard";
import { useSearch } from "../context/SearchContext";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function SearchPage() {
  const glowRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const {
    searchTerm,
    setSearchTerm,
    stateFilter,
    setStateFilter,
    licenseTypeFilter,
    setLicenseTypeFilter,
    speciesFilter,
    setSpeciesFilter,
    severityFilter,
    setSeverityFilter,
    hasViolations,
    setHasViolations,
    sortBy,
    setSortBy,
    pageIndex,
    setPageIndex,
    cursors,
    setCursors,
    nextCursor,
    setNextCursor,
    scrollPosition,
    setScrollPosition,
    resetPagination,
    clearAllFilters,
  } = useSearch();

  // Local input state to prevent querying on every keystroke
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const [nameError, setNameError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

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

  // Listen to window scroll to save scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [setScrollPosition]);

  // Sync URL search params with state (local input and global state)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nameParam = params.get("name") || "";
    setLocalSearchTerm(nameParam);
    if (nameParam !== searchTerm) {
      setSearchTerm(nameParam);
      resetPagination();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // TanStack Query for facilities retrieval
  const { data, isLoading } = useQuery({
    queryKey: [
      "facilities",
      {
        searchTerm,
        stateFilter,
        licenseTypeFilter,
        speciesFilter,
        severityFilter,
        hasViolations,
        sortBy,
        pageIndex,
        cursor: cursors[pageIndex],
      },
    ],
    queryFn: async () => {
      if (searchTerm.trim() && searchTerm.trim().length < 3) {
        return { results: [], total: 0, cursor: null };
      }

      const params = {
        limit: 20,
        sort_by: sortBy,
      };

      if (searchTerm.trim()) {
        params.name = searchTerm.trim();
      }
      if (stateFilter && stateFilter !== "All States") {
        params.state = stateFilter;
      }
      if (licenseTypeFilter && licenseTypeFilter !== "All Types") {
        params.license_type = licenseTypeFilter;
      }
      if (speciesFilter.trim()) {
        params.species = speciesFilter.trim();
      }
      if (severityFilter && severityFilter !== "All Severities") {
        params.severity = severityFilter;
      }
      if (hasViolations) {
        params.has_violations = true;
      }

      const cursor = cursors[pageIndex];
      if (cursor) {
        params.cursor = cursor;
      } else {
        params.offset = pageIndex * 20;
      }

      if (pageIndex === 0) {
        params.include_total = true;
      }

      return await searchFacilities(params);
    },
    staleTime: 5 * 60 * 1000, // Cache is fresh for 5 minutes
    gcTime: 10 * 60 * 1000,    // Cache garbage collection in 10 minutes
  });

  const facilities = useMemo(() => data?.results || [], [data?.results]);

  // Update total count
  useEffect(() => {
    if (data?.total !== undefined && data?.total !== null) {
      setTotalCount(data.total);
    } else if (pageIndex === 0 && data?.results) {
      setTotalCount(data.results.length);
    }
  }, [data, pageIndex]);

  // Update next cursor
  useEffect(() => {
    if (data?.cursor !== undefined) {
      setNextCursor(data.cursor || null);
    }
  }, [data, setNextCursor]);

  // Scroll restoration logic
  useEffect(() => {
    if (!isLoading && facilities.length > 0 && scrollPosition > 0) {
      const timer = setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading, facilities, scrollPosition]);

  // Form submit trigger
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (localSearchTerm.trim() && localSearchTerm.trim().length < 3) {
      setNameError("Facility name must be at least 3 characters");
      return;
    }
    setNameError(null);
    setSearchTerm(localSearchTerm.trim());
    resetPagination();

    const params = new URLSearchParams(location.search);
    if (localSearchTerm.trim()) {
      params.set("name", localSearchTerm.trim());
    } else {
      params.delete("name");
    }
    navigate(`/search?${params.toString()}`);
  };

  // Clear all filters back to original state
  const handleClearAll = () => {
    setNameError(null);
    setLocalSearchTerm("");
    clearAllFilters();
    navigate(`/search`);
  };

  // Pagination navigation handlers
  const handleNextPage = () => {
    if (!nextCursor && facilities.length < 20) return;
    const nextIdx = pageIndex + 1;
    const newCursors = [...cursors];
    newCursors[nextIdx] = nextCursor;
    setCursors(newCursors);
    setPageIndex(nextIdx);
  };

  const handlePrevPage = () => {
    if (pageIndex === 0) return;
    setPageIndex(pageIndex - 1);
  };

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    stateFilter !== "All States" ||
    licenseTypeFilter !== "All Types" ||
    speciesFilter.trim().length > 0 ||
    severityFilter !== "All Severities" ||
    hasViolations;

  return (
    <>
      <div className="fixed inset-0 pointer-events-none opacity-5 z-0">
        <div
          ref={glowRef}
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"
        ></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 md:px-8 py-6 md:py-8">
        <header className="mb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-4xl">
              <h1 className="font-headline-lg text-[clamp(2.1rem,4vw,3.4rem)] leading-[1.05] text-on-surface font-bold tracking-[-0.03em]">
                AWA Harvest & Analytics Portal
              </h1>
              <p className="mt-3 max-w-3xl text-[16px] leading-[26px] text-on-surface-variant">
                Advanced legal research and violation tracking platform for comprehensive Animal Welfare Act facility inspections and regulatory compliance.
              </p>
            </div>
            <div className="font-label-caps text-[10px] uppercase tracking-[0.28em] text-secondary">
              Last database update: today, 04:15 AM est
            </div>
          </div>
        </header>

        <section className="glass-card rounded-[22px] p-5 md:p-6 border border-white/5 shadow-2xl mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

          <form onSubmit={handleSearchSubmit} className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                Facility Name
              </label>
              <input
                value={localSearchTerm}
                onChange={(e) => {
                  setLocalSearchTerm(e.target.value);
                  if (e.target.value.trim() && e.target.value.trim().length < 3) {
                    setNameError("Must be at least 3 characters");
                  } else {
                    setNameError(null);
                  }
                }}
                className={`w-full bg-surface-container-lowest border rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none ${nameError ? "border-error/50 focus:ring-error focus:border-error" : "border-outline-variant/20"}`}
                placeholder="Search facility name..."
                type="text"
              />
              {nameError && <span className="text-error text-[11px] font-medium leading-none mt-1">{nameError}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                State
              </label>
              <div className="relative">
                <select
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    resetPagination();
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
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

            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                Species Search
              </label>
              <input
                value={speciesFilter}
                onChange={(e) => {
                  setSpeciesFilter(e.target.value);
                  resetPagination();
                }}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary transition-all outline-none"
                placeholder="e.g. rabbit, dog..."
                type="text"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                License Type
              </label>
              <div className="relative">
                <select
                  value={licenseTypeFilter}
                  onChange={(e) => {
                    setLicenseTypeFilter(e.target.value);
                    resetPagination();
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
                >
                  <option>All Types</option>
                  <option value="A">Class A (Breeder)</option>
                  <option value="B">Class B (Dealer)</option>
                  <option value="C">Class C (Exhibitor)</option>
                  <option value="R">Class R (Research)</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                Violation Severity
              </label>
              <div className="relative">
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    resetPagination();
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
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

            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">
                Sort By
              </label>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    resetPagination();
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-[14px] text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none cursor-pointer"
                >
                  <option value="violations_desc">Most Violations</option>
                  <option value="violations_asc">Least Violations</option>
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="date_desc">Last Inspected</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
                  expand_more
                </span>
              </div>
            </div>

            <div className="xl:col-span-6 flex flex-col gap-4 pt-2 border-t border-outline-variant/10">
              <label
                className="flex items-center gap-3 cursor-pointer group"
                onClick={(e) => {
                  e.preventDefault();
                  setHasViolations(!hasViolations);
                  resetPagination();
                }}
              >
                <div className={`w-10 h-5 rounded-full relative transition-all duration-300 ${hasViolations ? "bg-secondary" : "bg-surface-variant"}`}>
                  <div className={`absolute left-1 top-1 w-3 h-3 rounded-full transition-all duration-300 ${hasViolations ? "bg-on-secondary translate-x-5" : "bg-on-surface"}`}></div>
                </div>
                <span className="font-label-caps text-[11px] font-bold text-on-surface uppercase tracking-wider select-none">
                  Show Active Violations Only
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-on-surface-variant hover:text-secondary text-[11px] font-bold font-label-caps uppercase border-none bg-transparent cursor-pointer underline flex items-center gap-1.5 transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="submit"
                  disabled={nameError !== null}
                  className={`bg-secondary text-on-secondary font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg uppercase font-label-caps text-[12px] tracking-widest ${nameError !== null ? "opacity-50 cursor-not-allowed" : "hover:brightness-110 active:scale-95 cursor-pointer"}`}
                >
                  <span className="material-symbols-outlined">search</span>
                  Execute Search
                </button>
              </div>
            </div>
          </form>
        </section>

        <div className="flex items-center justify-between gap-4 mb-6 text-[14px] text-on-surface-variant">
          <p>
            Showing <span className="text-secondary font-bold">{facilities.length}</span> of {totalCount === null || (totalCount === 0 && facilities.length > 0) ? "many" : totalCount} facilities (Page {pageIndex + 1})
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={pageIndex === 0 || isLoading}
              className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${pageIndex === 0 || isLoading ? "opacity-50 cursor-not-allowed" : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface cursor-pointer"}`}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button
              onClick={handleNextPage}
              disabled={(!nextCursor && facilities.length < 20) || facilities.length === 0 || isLoading}
              className={`p-2 border border-outline-variant/10 rounded-lg transition-all ${(!nextCursor && facilities.length < 20) || facilities.length === 0 || isLoading ? "opacity-50 cursor-not-allowed" : "text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface cursor-pointer"}`}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="rounded-[18px] border border-white/10 bg-[#191c1d] p-6 h-[250px] animate-pulse">
                <div className="h-5 w-24 rounded-full bg-surface-variant/30 ml-auto"></div>
                <div className="mt-5 h-8 w-3/4 rounded-md bg-surface-variant/30"></div>
                <div className="mt-4 h-3 w-48 rounded-md bg-surface-variant/20"></div>
                <div className="mt-8 grid grid-cols-2 gap-6">
                  <div>
                    <div className="h-3 w-20 rounded-md bg-surface-variant/20"></div>
                    <div className="mt-3 h-4 w-28 rounded-md bg-surface-variant/25"></div>
                  </div>
                  <div>
                    <div className="h-3 w-20 rounded-md bg-surface-variant/20"></div>
                    <div className="mt-3 h-4 w-16 rounded-md bg-surface-variant/25"></div>
                  </div>
                </div>
                <div className="mt-8 flex justify-end">
                  <div className="h-10 w-28 rounded-lg bg-surface-variant/25"></div>
                </div>
              </div>
            ))}
          </div>
        ) : facilities.length === 0 ? (
          <div className="py-20 text-center border border-outline-variant/10 rounded-2xl bg-surface-container-low flex flex-col items-center justify-center gap-6 px-6">
            <div className="w-16 h-16 rounded-full bg-surface-variant/20 flex items-center justify-center text-on-surface-variant/60">
              <span className="material-symbols-outlined text-[36px]">search_off</span>
            </div>
            <div>
              <h4 className="font-headline-sm text-[22px] font-bold text-on-surface mb-2">No facilities found</h4>
              <p className="font-body-md text-on-surface-variant max-w-md mx-auto leading-relaxed">
                We couldn't find any facilities matching your search criteria. Try adjusting your filter settings or clearing active filters.
              </p>
            </div>
            <button
              onClick={handleClearAll}
              className="bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 px-6 py-2.5 rounded-lg font-label-caps text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {facilities.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} onClick={() => navigate(`/facility/${facility.id}`)} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
