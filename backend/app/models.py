import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _now_utc() -> datetime:
    """Return a timezone-aware UTC datetime. Use as a column default callable."""
    return datetime.now(timezone.utc)


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    QUARANTINED = "quarantined"
    FAILED = "failed"


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    customer_id = Column(String, unique=True, index=True)
    certificate_number = Column(String, unique=True, index=True)
    license_type = Column(String)
    license_status = Column(String)
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    county = Column(String)
    licensed_animal_limit = Column(Integer)

    inspections = relationship("Inspection", back_populates="facility")
    enforcement_actions = relationship("EnforcementAction", back_populates="facility", cascade="all, delete-orphan", order_by="desc(EnforcementAction.action_date)")


class EnforcementAction(Base):
    __tablename__ = "enforcement_actions"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True)
    certificate = Column(String, nullable=True, index=True)
    action_type = Column(String, nullable=False)
    action_date = Column(Date, nullable=False)
    outcome = Column(String, nullable=True)
    penalty_amount = Column(Float, nullable=True)
    source_pdf = Column(String, nullable=True)
    source_pdf_path = Column(String, nullable=True, index=True)
    summary = Column(Text, nullable=True)
    pdf_downloaded = Column(Boolean, default=False, nullable=False)
    pdf_processed = Column(Boolean, default=False, nullable=False)
    ocr_status = Column(Enum(ProcessingStatus, native_enum=False), default=ProcessingStatus.PENDING, index=True)
    extracted_text = Column(Text, nullable=True)
    pdf_sha256 = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_utc)

    facility = relationship("Facility", back_populates="enforcement_actions")



class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False, index=True)
    inspection_date = Column(Date)
    inspection_type = Column(String)
    inspector_name = Column(String)
    inspector_id = Column(String, index=True)
    violations_found = Column(Boolean, default=False)
    violation_count = Column(Integer, default=0)
    source_pdf = Column(String)
    source_pdf_path = Column(String)
    processing_status = Column(
        Enum(ProcessingStatus, native_enum=False), default=ProcessingStatus.PENDING, index=True
    )
    processed_at = Column(DateTime)
    error_reason = Column(Text)
    source_type = Column(String, default="CSV_IMPORT")
    pdf_sha256 = Column(String(64), nullable=True)

    facility = relationship("Facility", back_populates="inspections")
    violations = relationship("Violation", back_populates="inspection")
    inventory = relationship("Inventory", back_populates="inspection")


class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False, index=True)
    severity = Column(String)
    section = Column(String)
    description = Column(Text)
    source_pdf = Column(String)
    source_page = Column(Integer)

    inspection = relationship("Inspection", back_populates="violations")


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False, index=True)
    scientific_name = Column(String)
    common_name = Column(String)
    count = Column(Integer)
    source_pdf = Column(String)

    inspection = relationship("Inspection", back_populates="inventory")


class AISummary(Base):
    __tablename__ = "ai_summaries"
    id = Column(Integer, primary_key=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"))
    summary_json = Column(Text)
    generated_at = Column(DateTime(timezone=True), default=_now_utc)
    model_used = Column(String, default="llama-3.1-70b")
    facility = relationship("Facility")


class LegalMemo(Base):
    __tablename__ = "legal_memos"
    id = Column(Integer, primary_key=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"))
    memo_text = Column(Text)
    generated_at = Column(DateTime(timezone=True), default=_now_utc)
    model_used = Column(String, default="llama-3.3-70b-versatile")
    facility = relationship("Facility")
