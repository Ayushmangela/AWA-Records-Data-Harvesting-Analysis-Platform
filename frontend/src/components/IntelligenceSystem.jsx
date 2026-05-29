import React from "react";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function EvidenceBadge({ label, tone = "secondary", icon = "verified", className = "" }) {
  return (
    <span className={joinClassNames("evidence-badge", `evidence-badge-${tone}`, className)}>
      <span className="material-symbols-outlined text-[11px]">{icon}</span>
      {label}
    </span>
  );
}

export function SeverityBadge({ severity, className = "" }) {
  const normalized = (severity || "indirect").toLowerCase();
  const tone = normalized === "critical" || normalized === "direct" ? "critical" : normalized === "teachable" ? "info" : "warning";
  const label = (severity || "Indirect").toString().toUpperCase();
  return <EvidenceBadge label={label} tone={tone} icon={tone === "critical" ? "warning" : tone === "warning" ? "priority_high" : "info"} className={className} />;
}

export function ComplianceIndicator({ label, value, tone = "primary", detail, className = "" }) {
  return (
    <div className={joinClassNames("compliance-indicator", className)}>
      <div className="compliance-indicator__label">{label}</div>
      <div className={joinClassNames("compliance-indicator__value", `tone-${tone}`)}>{value}</div>
      {detail ? <div className="compliance-indicator__detail">{detail}</div> : null}
    </div>
  );
}

export function MetricPanel({ label, value, detail, tone = "neutral", className = "" }) {
  return (
    <div className={joinClassNames("metric-panel", `tone-${tone}`, className)}>
      <div className="metric-panel__label">{label}</div>
      <div className="metric-panel__value">{value}</div>
      {detail ? <div className="metric-panel__detail">{detail}</div> : null}
    </div>
  );
}

export function DossierSection({ label, title, subtitle, actions, children, className = "" }) {
  return (
    <section className={joinClassNames("dossier-section", className)}>
      <div className="dossier-section__header">
        <div>
          {label ? <div className="dossier-section__label">{label}</div> : null}
          {title ? <h3 className="dossier-section__title">{title}</h3> : null}
          {subtitle ? <p className="dossier-section__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="dossier-section__actions">{actions}</div> : null}
      </div>
      <div className="dossier-section__body">{children}</div>
    </section>
  );
}

export function EvidenceCard({ label, title, metadata, status, children, className = "" }) {
  return (
    <article className={joinClassNames("evidence-card", className)}>
      <div className="evidence-card__rail">
        {label ? <div className="evidence-card__label">{label}</div> : null}
        {status ? <div className="evidence-card__status">{status}</div> : null}
      </div>
      <div className="evidence-card__content">
        {title ? <h4 className="evidence-card__title">{title}</h4> : null}
        {metadata ? <div className="evidence-card__metadata">{metadata}</div> : null}
        <div className="evidence-card__body">{children}</div>
      </div>
    </article>
  );
}

export function RiskPanel({ label = "RISK PANEL", value, tone = "high", subtitle, children, className = "" }) {
  return (
    <section className={joinClassNames("risk-panel", `tone-${tone}`, className)}>
      <div className="risk-panel__label">{label}</div>
      <div className="risk-panel__value">{value}</div>
      {subtitle ? <div className="risk-panel__subtitle">{subtitle}</div> : null}
      {children ? <div className="risk-panel__body">{children}</div> : null}
    </section>
  );
}

export function IntelligenceBrief({ title = "INTELLIGENCE BRIEF", subtitle, sections = [], footer, className = "" }) {
  return (
    <section className={joinClassNames("intelligence-brief", className)}>
      <div className="intelligence-brief__header">
        <div>
          <div className="intelligence-brief__label">INTELLIGENCE BRIEF</div>
          <h3 className="intelligence-brief__title">{title}</h3>
          {subtitle ? <p className="intelligence-brief__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="intelligence-brief__sections">
        {sections.map((section, index) => (
          <div key={index} className="intelligence-brief__section">
            <div className="intelligence-brief__section-label">{section.label}</div>
            <div className="intelligence-brief__section-value">{section.value}</div>
            {section.detail ? <div className="intelligence-brief__section-detail">{section.detail}</div> : null}
          </div>
        ))}
      </div>
      {footer ? <div className="intelligence-brief__footer">{footer}</div> : null}
    </section>
  );
}

export function TimelinePanel({ title, items = [], className = "" }) {
  return (
    <section className={joinClassNames("timeline-panel", className)}>
      {title ? <div className="timeline-panel__title">{title}</div> : null}
      <div className="timeline-panel__body">
        {items.map((item, index) => (
          <div key={index} className="timeline-panel__item">
            <div className={joinClassNames("timeline-panel__marker", item.tone ? `tone-${item.tone}` : "")}></div>
            <div className="timeline-panel__content">
              <div className="timeline-panel__item-title">{item.title}</div>
              {item.meta ? <div className="timeline-panel__item-meta">{item.meta}</div> : null}
              {item.body ? <div className="timeline-panel__item-body">{item.body}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InvestigationTable({ columns, rows, density = "comfortable", className = "" }) {
  return (
    <div className={joinClassNames("investigation-table-shell", className)}>
      <table className={joinClassNames("investigation-table", `density-${density}`)}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={joinClassNames(column.align ? `align-${column.align}` : "")}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.key || rowIndex} className={row.className || ""}>
              {columns.map((column) => (
                <td key={column.key} className={joinClassNames(column.align ? `align-${column.align}` : "")}>{column.render(row, rowIndex)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
