import datetime
from typing import List, Optional
from sqlalchemy import create_engine, ForeignKey, String, Integer, Float, Boolean, DateTime, JSON, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = "sqlite:///./assetflow.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    role: Mapped[str] = mapped_column(String, default="Employee")  # Admin, Asset Manager, Department Head, Employee
    status: Mapped[str] = mapped_column(String, default="Active")  # Active, Inactive

    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id], back_populates="employees")
    headed_department: Mapped[Optional["Department"]] = relationship("Department", back_populates="head", foreign_keys="Department.head_id")

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    head_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="Active")  # Active, Inactive

    head: Mapped[Optional["User"]] = relationship("User", foreign_keys=[head_id], back_populates="headed_department")
    parent: Mapped[Optional["Department"]] = relationship("Department", remote_side=[id], back_populates="sub_departments")
    sub_departments: Mapped[List["Department"]] = relationship("Department", back_populates="parent")
    employees: Mapped[List["User"]] = relationship("User", foreign_keys=[User.department_id], back_populates="department")

class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    custom_fields: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # Configuration e.g. {"warranty_months": "number", "brand": "text"}

    assets: Mapped[List["Asset"]] = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("asset_categories.id"), nullable=False)
    asset_tag: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False) # AF-0001
    serial_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    acquisition_date: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    acquisition_cost: Mapped[float] = mapped_column(Float, default=0.0)
    condition: Mapped[str] = mapped_column(String, default="New") # New, Good, Fair, Poor, Damaged
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    shared_bookable: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="Available") # Available, Allocated, Reserved, Under Maintenance, Lost, Retired, Disposed
    custom_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # values for custom fields e.g. {"warranty_months": 24, "brand": "Dell"}

    category: Mapped["AssetCategory"] = relationship("AssetCategory", back_populates="assets")
    allocations: Mapped[List["Allocation"]] = relationship("Allocation", back_populates="asset")
    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="asset")
    maintenance_requests: Mapped[List["MaintenanceRequest"]] = relationship("MaintenanceRequest", back_populates="asset")

class Allocation(Base):
    __tablename__ = "allocations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    allocated_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    allocation_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    expected_return_date: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    actual_return_date: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="Approved") # Approved, Returned, Overdue
    check_in_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="allocations")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    allocated_by: Mapped["User"] = relationship("User", foreign_keys=[allocated_by_id])

class TransferRequest(Base):
    __tablename__ = "transfer_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    requested_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    target_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    target_department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    request_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    approved_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="Pending") # Pending, Approved, Rejected

    asset: Mapped["Asset"] = relationship("Asset")
    requested_by: Mapped["User"] = relationship("User", foreign_keys=[requested_by_id])
    target_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[target_user_id])
    target_department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[target_department_id])
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    start_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String, default="Upcoming") # Upcoming, Ongoing, Completed, Cancelled

    asset: Mapped["Asset"] = relationship("Asset", back_populates="bookings")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])

class MaintenanceRequest(Base):
    __tablename__ = "maintenance_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    raised_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    request_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String, default="Medium") # Low, Medium, High
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="Pending") # Pending, Approved, Tech Assigned, In Progress, Resolved
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="maintenance_requests")
    raised_by: Mapped["User"] = relationship("User", foreign_keys=[raised_by_id])
    technician: Mapped[Optional["User"]] = relationship("User", foreign_keys=[technician_id])

class AuditCycle(Base):
    __tablename__ = "audit_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String, default="Open") # Open, Closed
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    items: Mapped[List["AuditItem"]] = relationship("AuditItem", back_populates="audit_cycle")

class AuditItem(Base):
    __tablename__ = "audit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    audit_cycle_id: Mapped[int] = mapped_column(Integer, ForeignKey("audit_cycles.id"), nullable=False)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    auditor_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="Unchecked") # Unchecked, Verified, Missing, Damaged
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    audit_cycle: Mapped["AuditCycle"] = relationship("AuditCycle", back_populates="items")
    asset: Mapped["Asset"] = relationship("Asset")
    auditor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[auditor_id])

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
