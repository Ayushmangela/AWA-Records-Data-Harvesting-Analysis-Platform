from datetime import date
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field

# -----------------
# Base Models
# -----------------


class ViolationOut(BaseModel):
    id: int
    severity: str | None
    section: str | None
    description: str | None
    source_pdf: str | None
    source_page: int | None
    category: str | None = None

    model_config = ConfigDict(from_attributes=True)


class InventoryOut(BaseModel):
    id: int
    scientific_name: str | None
    common_name: str | None
    count: int | None
    source_pdf: str | None

    model_config = ConfigDict(from_attributes=True)


class InspectionOut(BaseModel):
    id: int
    facility_id: int | None = None
    facility_name: str | None = None
    facility_state: str | None = None
    inspection_date: date | None
    inspection_type: str | None
    inspector_name: str | None
    inspector_id: str | None
    violations_found: bool | None
    violation_count: int | None
    source_pdf: str | None
    source_pdf_path: str | None
    violations: List[ViolationOut] = Field(default_factory=list)
    inventory: List[InventoryOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class FacilityOut(BaseModel):
    id: int
    name: str
    customer_id: str | None
    certificate_number: str | None
    license_type: str | None
    license_status: str | None
    address: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    county: str | None
    licensed_animal_limit: int | None

    model_config = ConfigDict(from_attributes=True)


# -----------------
# Extended Models
# -----------------


class RiskFlagsOut(BaseModel):
    has_high_direct_violations: bool = False
    has_repeated_indirect: bool = False
    animal_limit_exceeded: bool = False
    is_teachable_heavy: bool = False
    recent_inventory_spike: bool = False
    score: int = 0
    risk_level: str = "LOW"
    risk_drivers: List[str] = Field(default_factory=list)


class EnforcementActionOut(BaseModel):
    id: int
    facility_id: int | None = None
    certificate: str | None = None
    action_type: str
    action_date: date
    outcome: str | None = None
    penalty_amount: float | None = None
    source_pdf: str | None = None
    source_pdf_path: str | None = None
    summary: str | None = None
    pdf_downloaded: bool
    pdf_processed: bool
    ocr_status: str
    extracted_text: str | None = None

    model_config = ConfigDict(from_attributes=True)


class FacilityDetailOut(FacilityOut):
    risk_flags: RiskFlagsOut
    inspections: List[InspectionOut] = Field(default_factory=list)
    violation_categories: Dict[str, int] = Field(default_factory=dict)
    enforcement_actions: List[EnforcementActionOut] = Field(default_factory=list)



class FacilityListItemOut(FacilityOut):
    total_inspections: int = 0
    total_violations: int = 0
    last_inspection_date: date | None = None
    risk_level: str = "LOW"
    animal_limit_exceeded: bool = False
    has_high_direct_violations: bool = False
    recent_inventory_spike: bool = False
    compliance_score: int = 100
    has_enforcement_actions: bool = False
    highest_severity: str | None = None
    last_inspection_status: str | None = None


class FacilityListOut(BaseModel):
    total: int | None
    limit: int
    offset: int
    cursor: str | None = None
    results: List[FacilityListItemOut]
    message: str | None = None


class DashboardStatsOut(BaseModel):
    total_facilities: int
    total_inspections: int
    total_violations: int
    total_enforcement_actions: int = 0
    total_inspectors: int = 0
    ocr_processed_documents: int = 0
    kpi_trends: Dict[str, Any] = Field(default_factory=dict)
    recent_activity: List[Dict[str, Any]] = Field(default_factory=list)
    violations_overview: Dict[str, Any] = Field(default_factory=dict)
    geographic_overview: Dict[str, Any] = Field(default_factory=dict)
    inspector_activity: List[Dict[str, Any]] = Field(default_factory=list)
    enforcement_overview: Dict[str, Any] = Field(default_factory=dict)
    facility_risk_queue: Dict[str, Any] = Field(default_factory=dict)
    severity_distribution: Dict[str, int]
    top_violating_facilities: List[Dict[str, Any]]
    top_states: List[Dict[str, Any]]
    top_inspectors: List[Dict[str, Any]]
    risk_flags_distribution: Dict[str, int]
    inspections_per_month: List[Dict[str, Any]]


class InspectorOut(BaseModel):
    inspector_id: str | None
    inspector_name: str | None
    total_inspections: int
    non_compliance_rate: float
    primary_state: str | None
    regional_average_rate: float | None
    anomaly_flag: bool


class InspectorDetailOut(InspectorOut):
    inspections: List[InspectionOut] = Field(default_factory=list)


class InspectorListOut(BaseModel):
    total: int
    limit: int
    offset: int
    results: List[InspectorOut]


class EvidenceCoverage(BaseModel):
    inspections_reviewed: int
    total_inspections_available: int
    violations_reviewed: int
    inventory_records_reviewed: int
    inspectors_reviewed: int


class AISummaryOut(BaseModel):
    """Schema version 2: report is a Markdown intelligence report string."""
    facility_name: str
    facility_id: int
    generated_at: str
    model: str
    schema_version: int = 2
    report: str  # Full Markdown intelligence report
    evidence_coverage: EvidenceCoverage


class LegalMemoOut(BaseModel):
    facility_name: str
    certificate: str | None = None
    generated_at: str
    memo_text: str
    disclaimer: str


class LatestInspectionSummary(BaseModel):
    inspection_date: date | None = None
    inspection_type: str | None = None
    inspector_name: str | None = None
    violation_count: int = 0


class ComplianceSnapshot(BaseModel):
    total_inspections: int = 0
    total_violations: int = 0
    critical_direct_count: int = 0
    unique_inspectors_count: int = 0
    latest_animal_count: int = 0
    licensed_animal_limit: int | None = None


class DossierFactCitation(BaseModel):
    inspection_id: int
    inspection_date: str | None = None
    source_page: int | None = None


class DossierFact(BaseModel):
    key: str
    text: str
    citations: List[DossierFactCitation] = Field(default_factory=list)


class DossierActivity(BaseModel):
    type: str
    id: int
    date: str | None = None
    title: str
    violations: int = 0
    description: str


class FacilityDossierSummaryOut(BaseModel):
    id: int
    name: str
    customer_id: str | None = None
    certificate_number: str | None = None
    license_status: str | None = None
    license_type: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    county: str | None = None
    licensed_animal_limit: int | None = None
    risk_flags: RiskFlagsOut
    compliance_snapshot: ComplianceSnapshot
    latest_inspection: LatestInspectionSummary | None = None
    prioritized_facts: List[DossierFact] = Field(default_factory=list)
    recent_activities: List[DossierActivity] = Field(default_factory=list)


