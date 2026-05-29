import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getInspectors } from "../services/api";

const CACHE_PREFIX = "inspector-directory-cache:";
const CACHE_TTL_MS = 5 * 60 * 1000;

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
    sessionStorage.setItem(key, JSON.stringify({ ...payload, timestamp: Date.now() }));
  } catch {
    // Ignore storage failures.
  }
}

function buildQueryKey(name, state) {
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (state && state !== "All States") params.set("state", state);
  return params.toString() || "default";
}

function SkeletonCard() {
  return (
    <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 shadow-lg animate-pulse flex flex-col h-full">
      <div className="h-5 w-28 rounded-full bg-surface-variant/30 ml-auto"></div>
      <div className="mt-5 h-6 w-3/4 rounded-md bg-surface-variant/25"></div>
      <div className="mt-3 h-3 w-48 rounded-md bg-surface-variant/20"></div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <div className="h-3 w-24 rounded-md bg-surface-variant/20"></div>
          <div className="mt-3 h-5 w-16 rounded-md bg-surface-variant/25"></div>
        </div>
        <div>
          <div className="h-3 w-24 rounded-md bg-surface-variant/20"></div>
          <div className="mt-3 h-5 w-20 rounded-md bg-surface-variant/25"></div>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
        <div className="h-3 w-28 rounded-md bg-surface-variant/20"></div>
        <div className="h-4 w-4 rounded-full bg-surface-variant/25"></div>
      </div>
    </div>
  );
}

export default function InspectorsDirectoryPage() {
  const glowRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [inspectors, setInspectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameQuery, setNameQuery] = useState(searchParams.get("name") || "");
  const [stateFilter, setStateFilter] = useState(searchParams.get("state") || "All States");
  const [totalCount, setTotalCount] = useState(0);

  const currentQueryKey = useMemo(() => buildQueryKey(nameQuery.trim(), stateFilter), [nameQuery, stateFilter]);

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

  const loadData = async ({ name, state, forceRefresh = false } = {}) => {
    const queryKey = buildQueryKey(name?.trim() || "", state || "All States");
    const cacheKey = `${CACHE_PREFIX}${queryKey}`;
    const cached = forceRefresh ? null : readCache(cacheKey);

    if (cached) {
      setInspectors(cached.results || []);
      setTotalCount(cached.totalCount || 0);
      setLoading(false);
      requestAnimationFrame(() => {
        if (typeof cached.scrollY === "number") {
          window.scrollTo({ top: cached.scrollY, behavior: "auto" });
        }
      });
      return;
    }

    setLoading(true);
    try {
      const params = {};
      if (name?.trim()) {
        params.name = name.trim();
      }
      if (state && state !== "All States") {
        params.state = state;
      }
      const res = await getInspectors(params);
      setInspectors(res.results || []);
      setTotalCount(res.total || 0);
      writeCache(cacheKey, {
        results: res.results || [],
        totalCount: res.total || 0,
        scrollY: window.scrollY,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const name = searchParams.get("name") || "";
    const state = searchParams.get("state") || "All States";
    setNameQuery(name);
    setStateFilter(state);
    loadData({ name, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (nameQuery.trim()) params.set("name", nameQuery.trim());
    if (stateFilter && stateFilter !== "All States") params.set("state", stateFilter);
    setSearchParams(params, { replace: false });
  };

  const persistScroll = () => {
    writeCache(`${CACHE_PREFIX}${currentQueryKey}`, {
      results: inspectors,
      totalCount,
      scrollY: window.scrollY,
    });
  };

  return (
    <>
      <div className="fixed inset-0 pointer-events-none opacity-5 z-0">
        <div ref={glowRef} className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-secondary/30 via-transparent to-transparent"></div>
      </div>

      <div className="p-12 max-w-[1440px] mx-auto relative z-10">
        <section className="mb-12">
          <div className="flex flex-col md:flex-row gap-8 items-end justify-between">
            <div className="flex-1">
              <h3 className="font-headline-lg text-[40px] leading-[48px] font-bold text-on-surface mb-3 tracking-[-0.02em]">Inspector Analytics Directory</h3>
              <p className="font-body-lg text-[18px] text-on-surface-variant max-w-2xl leading-[28px]">
                Analyze historical enforcement trends, compare compliance rates, and identify anomalous inspection patterns across USDA personnel.
              </p>
            </div>
            <div className="flex items-center gap-2 text-secondary font-label-caps text-[11px] uppercase tracking-wider font-bold">
              <span className="material-symbols-outlined text-[16px]">group</span>
              <span>{totalCount} Total Inspectors</span>
            </div>
          </div>

          <form onSubmit={handleSearch} className="mt-10 glass-card rounded-2xl p-8 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.2fr_0.7fr_0.4fr] gap-6 relative z-10">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Search by Name</label>
                <input
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary outline-none"
                  placeholder="Search inspector name or ID..."
                  type="text"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[10px] text-secondary uppercase tracking-widest font-bold">Filter by State</label>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 text-body-md text-on-surface focus:ring-1 focus:ring-secondary focus:border-secondary appearance-none outline-none"
                >
                  <option>All States</option>
                  <option>CA</option>
                  <option>OR</option>
                  <option>FL</option>
                  <option>TX</option>
                  <option>NY</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="bg-secondary text-on-secondary px-6 py-2.5 rounded-lg font-label-caps text-[12px] font-bold tracking-widest hover:brightness-110 transition-all shadow-[0_0_20px_rgba(233,195,73,0.3)] w-full"
                >
                  Update Results
                </button>
              </div>
            </div>
          </form>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <SkeletonCard key={n} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {inspectors.map((inspector) => (
              <Link
                onClick={persistScroll}
                to={`/inspector/${inspector.inspector_id}`}
                key={inspector.inspector_id}
                className="bg-surface-container-low border border-outline-variant/10 hover:border-secondary/50 rounded-2xl p-6 transition-all hover:bg-surface-container shadow-lg hover:shadow-secondary/10 group no-underline relative overflow-hidden flex flex-col h-full"
              >
                {inspector.anomaly_flag && (
                  <div className="absolute top-0 right-0 bg-error text-on-error font-label-caps text-[9px] font-bold px-3 py-1 rounded-bl-lg">
                    ANOMALY
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="font-headline-sm text-[18px] font-bold text-on-surface mb-1 group-hover:text-secondary transition-colors">
                    {inspector.inspector_name || inspector.inspector_id}
                  </h4>
                  <p className="font-code-data text-[11px] text-on-surface-variant tracking-widest uppercase mb-4">ID: {inspector.inspector_id}</p>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div>
                      <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1">INSPECTIONS</p>
                      <p className="font-headline-sm text-[20px] font-bold text-on-surface">{inspector.total_inspections}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest mb-1">NON-COMPLIANT</p>
                      <p className={`font-headline-sm text-[20px] font-bold ${inspector.anomaly_flag ? "text-error" : "text-on-surface"}`}>
                        {inspector.non_compliance_rate}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
                  <span className="font-code-data text-[10px] text-on-surface-variant tracking-widest uppercase">
                    PRIMARY: <strong className="text-secondary">{inspector.primary_state || "MULTI"}</strong>
                  </span>
                  <span className="material-symbols-outlined text-secondary opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                    arrow_forward
                  </span>
                </div>
              </Link>
            ))}

            {inspectors.length === 0 && (
              <div className="col-span-full py-20 text-center font-code-data tracking-widest text-on-surface-variant text-[14px]">
                NO INSPECTOR PROFILES FOUND MATCHING YOUR CRITERIA.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
