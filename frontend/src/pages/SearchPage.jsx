import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FacilityCard from "../components/FacilityCard";
import { searchFacilities } from "../services/api";

const US_STATES = [
  "",
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export default function SearchPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [hasViolations, setHasViolations] = useState(false);
  const [species, setSpecies] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [severity, setSeverity] = useState("");
  const [sortBy, setSortBy] = useState("violations_desc");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch(event, newPage = 1) {
    if (event) event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await searchFacilities({
        name: name.trim() || undefined,
        state: state || undefined,
        has_violations: hasViolations ? true : undefined,
        species: species.trim() || undefined,
        license_type: licenseType || undefined,
        severity: severity || undefined,
        sort_by: sortBy,
        offset: (newPage - 1) * 20,
        limit: 20
      });
      setResults(data.results || []);
      setTotal(data.total || 0);
      setPage(newPage);
    } catch (err) {
      setError(err.message || "Search failed");
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  // Set document title and run initial search
  useEffect(() => {
    document.title = "AWA Records - Search Facilities";
    handleSearch();
  }, []);

  return (
    <div className="page">
      <header className="page-header" style={{ marginBottom: "2.5rem", textAlign: "center" }}>
        <h1
          style={{
            background: "linear-gradient(to right, hsl(224, 76%, 48%), hsl(262, 70%, 50%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: "0 0 0.5rem 0",
          }}
        >
          AWA Harvest & Analytics Portal
        </h1>
        <p style={{ color: "var(--neutral-600)", fontSize: "1.1rem", marginTop: "0.5rem" }}>
          Legal Research and Violation Tracking for Animal Welfare Act Inspections
        </p>
      </header>

      {/* Top section — search inputs */}
      <div className="search-form-container">
        <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-facility-name" className="form-label">Facility Name</label>
              <input
                id="search-facility-name"
                type="text"
                placeholder="Search facility name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-state" className="form-label">State</label>
              <select
                id="search-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="form-select"
              >
                <option value="">All States</option>
                {US_STATES.filter(Boolean).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-species" className="form-label">Species Search</label>
              <input
                id="search-species"
                type="text"
                placeholder="e.g. rabbit, dog..."
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginTop: "-0.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-license" className="form-label">License Type</label>
              <select id="search-license" value={licenseType} onChange={(e) => setLicenseType(e.target.value)} className="form-select">
                <option value="">All Types</option>
                <option value="A">A-Breeder</option>
                <option value="B">B-Dealer</option>
                <option value="C">C-Exhibitor</option>
                <option value="R">R-Research</option>
                <option value="H">H-Handler</option>
                <option value="T">T-Transporter</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-severity" className="form-label">Violation Severity</label>
              <select id="search-severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className="form-select">
                <option value="">All Severities</option>
                <option value="direct">Direct</option>
                <option value="critical">Critical</option>
                <option value="indirect">Indirect</option>
                <option value="teachable">Teachable</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="search-sort" className="form-label">Sort By</label>
              <select id="search-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="form-select">
                <option value="violations_desc">Most Violations</option>
                <option value="date_desc">Most Recent</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <label
              htmlFor="search-violations-only"
              className="checkbox-label"
              style={{
                fontSize: "0.95rem",
                color: "var(--neutral-700)",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              <input
                id="search-violations-only"
                type="checkbox"
                checked={hasViolations}
                onChange={(e) => setHasViolations(e.target.checked)}
                style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer", verticalAlign: "middle" }}
              />
              <span style={{ marginLeft: "0.5rem" }}>Show violations only</span>
            </label>

            <button
              id="search-btn"
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* Middle section — results count */}
      <div className="results-meta">
        Showing {results.length} of {total} facilities (Page {page})
      </div>

      {loading && (
        <div className="results-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: "200px", backgroundColor: "var(--neutral-100)", borderRadius: "12px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}></div>
          ))}
        </div>
      )}

      {/* Bottom section — results grid */}
      {!loading && (
        <>
          <div className="results-grid">
            {results.map((facility) => (
              <FacilityCard
                key={facility.id}
                facility={facility}
                onClick={() => navigate(`/facility/${facility.id}`)}
              />
            ))}
          </div>
          
          {results.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "2.5rem" }}>
              <button className="btn-secondary" disabled={page === 1} onClick={() => handleSearch(null, page - 1)}>Previous</button>
              <span style={{ color: "var(--neutral-600)", fontWeight: "500" }}>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span>
              <button className="btn-secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => handleSearch(null, page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="empty-state" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div>
          <h3>No facilities found</h3>
          <p style={{ color: "var(--neutral-500)", marginBottom: "1.5rem" }}>Try different search terms or filters</p>
          <button className="btn-secondary" onClick={() => {
            setName(""); setState(""); setSpecies(""); setLicenseType(""); setSeverity(""); setHasViolations(false); handleSearch(null, 1);
          }}>Clear all filters</button>
        </div>
      )}
    </div>
  );
}
