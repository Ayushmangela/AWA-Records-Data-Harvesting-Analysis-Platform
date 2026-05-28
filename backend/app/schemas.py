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


class FacilityDetailOut(FacilityOut):
    risk_flags: RiskFlagsOut
    inspections: List[InspectionOut] = Field(default_factory=list)


class FacilityListItemOut(FacilityOut):
    total_inspections: int = 0
    total_violations: int = 0
    last_inspection_date: date | None = None


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


class AISentence(BaseModel):
    type: str
    text: str
    citation: str | None = None


class AISummaryOut(BaseModel):
    facility_name: str
    facility_id: int
    generated_at: str
    model: str
    sentences: List[AISentence]
    total_inspections: int


class LegalMemoOut(BaseModel):
    facility_name: str
    certificate: str | None = None
    generated_at: str
    memo_text: str
    disclaimer: str

