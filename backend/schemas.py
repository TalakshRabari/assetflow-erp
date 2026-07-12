from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr, ConfigDict, Field

# Base Schema
class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# User Schemas
class UserCreate(BaseSchema):
    email: EmailStr
    password: str
    name: str
    department_id: Optional[int] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseSchema):
    name: Optional[str] = None
    department_id: Optional[int] = None
    role: Optional[str] = None
    status: Optional[str] = None

class UserShortResponse(BaseSchema):
    id: int
    name: str
    email: str
    role: str
    status: str

class UserResponse(BaseSchema):
    id: int
    name: str
    email: str
    role: str
    status: str
    department_id: Optional[int] = None

# Department Schemas
class DepartmentCreate(BaseSchema):
    name: str
    head_id: Optional[int] = None
    parent_id: Optional[int] = None
    status: Optional[str] = "Active"

class DepartmentUpdate(BaseSchema):
    name: Optional[str] = None
    head_id: Optional[int] = None
    parent_id: Optional[int] = None
    status: Optional[str] = None

class DepartmentResponse(BaseSchema):
    id: int
    name: str
    head_id: Optional[int] = None
    parent_id: Optional[int] = None
    status: str
    head: Optional[UserShortResponse] = None

class DepartmentHierarchyResponse(BaseSchema):
    id: int
    name: str
    head_id: Optional[int] = None
    parent_id: Optional[int] = None
    status: str
    sub_departments: List["DepartmentHierarchyResponse"] = []

# Asset Category Schemas
class CategoryCreate(BaseSchema):
    name: str
    custom_fields: Optional[Dict[str, str]] = None # {"warranty_months": "number", "brand": "text"}

class CategoryResponse(BaseSchema):
    id: int
    name: str
    custom_fields: Optional[Dict[str, str]] = None

# Asset Schemas
class AssetCreate(BaseSchema):
    name: str
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: Optional[datetime] = None
    acquisition_cost: Optional[float] = 0.0
    condition: Optional[str] = "New"
    location: Optional[str] = None
    shared_bookable: Optional[bool] = False
    custom_values: Optional[Dict[str, Any]] = None

class AssetUpdate(BaseSchema):
    name: Optional[str] = None
    category_id: Optional[int] = None
    serial_number: Optional[str] = None
    acquisition_date: Optional[datetime] = None
    acquisition_cost: Optional[float] = None
    condition: Optional[str] = None
    location: Optional[str] = None
    shared_bookable: Optional[bool] = None
    status: Optional[str] = None
    custom_values: Optional[Dict[str, Any]] = None

class AssetResponse(BaseSchema):
    id: int
    name: str
    category_id: int
    asset_tag: str
    serial_number: Optional[str] = None
    acquisition_date: Optional[datetime] = None
    acquisition_cost: float
    condition: str
    location: Optional[str] = None
    shared_bookable: bool
    status: str
    custom_values: Optional[Dict[str, Any]] = None
    category: Optional[CategoryResponse] = None

# Allocation Schemas
class AllocationCreate(BaseSchema):
    asset_id: int
    user_id: Optional[int] = None
    department_id: Optional[int] = None
    expected_return_date: Optional[datetime] = None

class AllocationReturn(BaseSchema):
    check_in_notes: Optional[str] = None

class AllocationResponse(BaseSchema):
    id: int
    asset_id: int
    user_id: Optional[int] = None
    department_id: Optional[int] = None
    allocated_by_id: int
    allocation_date: datetime
    expected_return_date: Optional[datetime] = None
    actual_return_date: Optional[datetime] = None
    status: str
    check_in_notes: Optional[str] = None
    asset: Optional[AssetResponse] = None
    user: Optional[UserShortResponse] = None
    department: Optional[DepartmentResponse] = None

# Transfer Request Schemas
class TransferRequestCreate(BaseSchema):
    asset_id: int
    target_user_id: Optional[int] = None
    target_department_id: Optional[int] = None

class TransferRequestResponse(BaseSchema):
    id: int
    asset_id: int
    requested_by_id: int
    target_user_id: Optional[int] = None
    target_department_id: Optional[int] = None
    request_date: datetime
    approved_by_id: Optional[int] = None
    status: str
    asset: Optional[AssetResponse] = None
    requested_by: Optional[UserShortResponse] = None
    target_user: Optional[UserShortResponse] = None
    target_department: Optional[DepartmentResponse] = None

# Booking Schemas
class BookingCreate(BaseSchema):
    asset_id: int
    start_time: datetime
    end_time: datetime
    department_id: Optional[int] = None

class BookingResponse(BaseSchema):
    id: int
    asset_id: int
    user_id: int
    department_id: Optional[int] = None
    start_time: datetime
    end_time: datetime
    status: str
    asset: Optional[AssetResponse] = None
    user: Optional[UserShortResponse] = None

# Maintenance Schemas
class MaintenanceCreate(BaseSchema):
    asset_id: int
    description: str
    priority: Optional[str] = "Medium" # Low, Medium, High

class MaintenanceUpdate(BaseSchema):
    technician_id: Optional[int] = None
    status: Optional[str] = None # Pending, Approved, Tech Assigned, In Progress, Resolved
    notes: Optional[str] = None

class MaintenanceResponse(BaseSchema):
    id: int
    asset_id: int
    raised_by_id: int
    request_date: datetime
    description: str
    priority: str
    technician_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    asset: Optional[AssetResponse] = None
    raised_by: Optional[UserShortResponse] = None
    technician: Optional[UserShortResponse] = None

# Audit Cycle & Items Schemas
class AuditCycleCreate(BaseSchema):
    name: str
    department_id: Optional[int] = None
    location: Optional[str] = None
    start_date: datetime
    end_date: datetime

class AuditItemUpdate(BaseSchema):
    status: str # Verified, Missing, Damaged
    notes: Optional[str] = None

class AuditItemResponse(BaseSchema):
    id: int
    audit_cycle_id: int
    asset_id: int
    auditor_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    updated_at: datetime
    asset: Optional[AssetResponse] = None
    auditor: Optional[UserShortResponse] = None

class AuditCycleResponse(BaseSchema):
    id: int
    name: str
    created_by_id: int
    department_id: Optional[int] = None
    location: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str
    created_at: datetime
    created_by: Optional[UserShortResponse] = None
    department: Optional[DepartmentResponse] = None

# Notification & Log Schemas
class NotificationResponse(BaseSchema):
    id: int
    user_id: int
    message: str
    is_read: bool
    created_at: datetime

class ActivityLogResponse(BaseSchema):
    id: int
    user_id: Optional[int] = None
    action: str
    details: Optional[str] = None
    created_at: datetime
    user: Optional[UserShortResponse] = None

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Asset History Schema
class AssetHistoryResponse(BaseSchema):
    allocations: List[AllocationResponse]
    maintenances: List[MaintenanceResponse]
    transfers: List[TransferRequestResponse]
