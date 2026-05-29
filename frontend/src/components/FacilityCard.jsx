import React from "react";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FacilityCard({ facility, onClick }) {
  const risk = facility.risk_level || "LOW";
  const complianceScore = facility.compliance_score ?? 100;

  // Determine color coding based on risk level
  const borderToneColor =
    risk === "HIGH"
      ? "bg-error"
      : risk === "MEDIUM"
      ? "bg-secondary"
      : "bg-primary";

  const riskBadgeStyle =
    risk === "HIGH"
      ? "bg-error-container/20 text-error border-error/30"
      : risk === "MEDIUM"
      ? "bg-secondary/10 text-secondary border-secondary/35"
      : "bg-primary-container/25 text-primary border-primary/30";

  // Score color
  const scoreColor =
    complianceScore >= 90
      ? "text-primary"
      : complianceScore >= 70
      ? "text-secondary"
      : "text-error";

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-white/8 bg-[#151819] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.3)] hover:border-secondary/35 transition-all duration-200 relative overflow-hidden flex flex-col justify-between min-h-[175px]"
    >
      {/* Top accent bar indicator color-coded by risk */}
      <div className={`absolute left-0 top-0 h-1 w-full ${borderToneColor} opacity-90`}></div>

      {/* Row 1: Badges & Compliance Score */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border uppercase ${riskBadgeStyle}`}>
            {risk}
          </span>
          {facility.has_enforcement_actions && (
            <span className="bg-secondary-container/20 text-secondary border border-secondary-container/30 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[10px] fill-current">gavel</span>
              ENFORCEMENT
            </span>
          )}
          {facility.highest_severity && (
            <span className={`border px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${
              facility.highest_severity.toLowerCase() === "critical" || facility.highest_severity.toLowerCase() === "direct"
                ? "bg-error/10 text-error border-error/20"
                : "bg-secondary/10 text-secondary border-secondary/20"
            }`}>
              {facility.highest_severity}
            </span>
          )}
          {facility.animal_limit_exceeded && (
            <span className="bg-error-container/10 text-error border border-error-container/20 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase">
              LIMIT EXCEEDED
            </span>
          )}
          {facility.recent_inventory_spike && (
            <span className="bg-error-container/10 text-error border border-error-container/20 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase">
              SPIKE DETECTED
            </span>
          )}
        </div>
        <div className="text-[12px] font-bold text-on-surface-variant flex items-center gap-1 font-code-data">
          Score: <span className={`${scoreColor}`}>{complianceScore}</span>
        </div>
      </div>

      {/* Row 2: Facility Name & Details */}
      <div className="mb-3">
        <h3 className="font-headline-sm text-[18px] md:text-[20px] leading-tight font-bold text-on-surface uppercase tracking-tight group-hover:text-secondary transition-colors line-clamp-1">
          {facility.name}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-on-surface-variant font-code-data">
          <span>{facility.city ? `${facility.city}, ${facility.state}` : facility.state || "—"}</span>
          <span className="opacity-40">•</span>
          <span>Cert: {facility.certificate_number || "—"}</span>
          <span className="opacity-40">•</span>
          <span className="text-secondary">{facility.license_type ? `Class ${facility.license_type}` : "—"}</span>
        </div>
      </div>

      {/* Row 3: Inspection status details */}
      <div className="border-t border-white/5 pt-2 flex flex-wrap items-center justify-between gap-4 mt-auto">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[10px] font-label-caps text-on-surface-variant uppercase tracking-wider">
            Last Inspection
          </div>
          <div className="text-[12px] text-on-surface flex items-center gap-1.5 font-body-sm">
            <span className="text-secondary-fixed-dim">{formatDate(facility.last_inspection_date)}</span>
            <span className="opacity-30">|</span>
            <span className={facility.last_inspection_status?.includes("Violations") ? "text-error" : "text-primary"}>
              {facility.last_inspection_status}
            </span>
          </div>
        </div>

        {/* Dossier Action CTA */}
        <button
          id={`view-profile-btn-${facility.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-variant/30 px-3.5 py-1.5 font-label-caps text-[10px] font-bold uppercase tracking-wider text-on-surface-variant border-none transition-all duration-200 hover:bg-surface-variant/50 hover:text-on-surface hover:translate-x-0.5"
        >
          Open Dossier
          <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
        </button>
      </div>
    </article>
  );
}
