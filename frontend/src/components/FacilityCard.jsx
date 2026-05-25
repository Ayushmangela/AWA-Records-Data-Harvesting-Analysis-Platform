function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FacilityCard({ facility, onClick }) {
  const violations = facility.total_violations ?? 0;

  // Map violations count to premium badges and borders
  const badgeClass = violations > 5 ? "badge badge-red" : violations >= 2 ? "badge badge-yellow" : "badge badge-green";
  const borderClass = violations > 5 ? "violation-high" : violations >= 2 ? "violation-medium" : "violation-low";

  return (
    <article
      className={`facility-card ${borderClass}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick?.();
      }}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          {/* Name (bold) */}
          <h3 className="facility-title">
            {facility.name}
          </h3>
          {/* Certificate number (small gray) */}
          <div className="facility-subtitle">
            Certificate: <strong>{facility.certificate_number || "—"}</strong>
          </div>
        </div>
        <span className={badgeClass} style={{ flexShrink: 0 }}>
          {violations} Violation{violations !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="facility-details-grid">
        <div>
          <strong>Location:</strong> {facility.city ? `${facility.city}, ${facility.state}` : facility.state || "—"}
        </div>
        <div>
          <strong>License Type:</strong> {facility.license_type || "—"}
        </div>
        <div>
          <strong>Last Inspected:</strong> {formatDate(facility.last_inspection_date)}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button
          id={`view-profile-btn-${facility.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="btn-primary"
          style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}
        >
          View Profile
        </button>
      </div>
    </article>
  );
}
