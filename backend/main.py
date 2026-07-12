import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import Base, engine, get_db, SessionLocal, User, Department, AssetCategory, Asset, Allocation, Booking, MaintenanceRequest, AuditCycle, AuditItem, Notification, ActivityLog
import backend.crud as crud
import backend.schemas as schemas
from backend.auth import (
    get_current_user, require_admin, require_asset_manager, require_dept_head, require_active_user,
    verify_password, create_access_token
)
from backend.seeder import seed_db

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AssetFlow API",
    description="Enterprise Asset & Resource Management System API",
    version="1.0.0"
)

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_db(db)
    finally:
        db.close()


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload directory exists
UPLOAD_DIR = "frontend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload", tags=["Upload"])
def upload_file(file: UploadFile = File(...), current_user: User = Depends(require_active_user)):
    # Clean filename and save
    filename = "".join(c for c in file.filename if c.isalnum() or c in (".", "_", "-"))
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/frontend/uploads/{filename}"}

# ==========================================
# AUTH ROUTER
# ==========================================
@app.post("/api/auth/signup", response_model=schemas.UserShortResponse, tags=["Auth"])
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db, user)

@app.post("/api/auth/login", response_model=schemas.Token, tags=["Auth"])
def login(user_credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, user_credentials.email)
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="Your account is inactive.")
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

class ForgotPasswordRequest(BaseModel):
    email: str

@app.post("/api/auth/forgot-password", tags=["Auth"])
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email address not registered")
    # Reset password to a default temporary one for hackathon verification convenience
    from backend.auth import get_password_hash
    user.hashed_password = get_password_hash("temp1234")
    db.commit()
    return {"message": "Recovery complete. Your temporary password is: temp1234"}

@app.get("/api/auth/me", response_model=schemas.UserResponse, tags=["Auth"])
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/api/auth/users", response_model=List[schemas.UserResponse], tags=["Auth"])
def get_users(current_user: User = Depends(require_dept_head), db: Session = Depends(get_db)):
    return crud.get_all_users(db)

@app.put("/api/auth/users/{user_id}", response_model=schemas.UserResponse, tags=["Auth"])
def update_user_role(
    user_id: int, 
    user_update: schemas.UserUpdate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.update_user(db, user_id, user_update, current_user.id)

# ==========================================
# ORGANIZATION ROUTER
# ==========================================
@app.post("/api/org/departments", response_model=schemas.DepartmentResponse, tags=["Org Setup"])
def create_department(
    dept: schemas.DepartmentCreate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.create_department(db, dept, current_user.id)

@app.get("/api/org/departments", response_model=List[schemas.DepartmentResponse], tags=["Org Setup"])
def get_departments(db: Session = Depends(get_db)):
    return crud.get_all_departments(db)

@app.put("/api/org/departments/{dept_id}", response_model=schemas.DepartmentResponse, tags=["Org Setup"])
def update_department(
    dept_id: int, 
    dept_update: schemas.DepartmentUpdate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.update_department(db, dept_id, dept_update, current_user.id)

@app.post("/api/org/categories", response_model=schemas.CategoryResponse, tags=["Org Setup"])
def create_category(
    cat: schemas.CategoryCreate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.create_category(db, cat, current_user.id)

@app.get("/api/org/categories", response_model=List[schemas.CategoryResponse], tags=["Org Setup"])
def get_categories(db: Session = Depends(get_db)):
    return crud.get_all_categories(db)

@app.put("/api/org/categories/{cat_id}", response_model=schemas.CategoryResponse, tags=["Org Setup"])
def update_category(
    cat_id: int, 
    cat: schemas.CategoryCreate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.update_category(db, cat_id, cat, current_user.id)

# ==========================================
# ASSETS ROUTER
# ==========================================
@app.post("/api/assets", response_model=schemas.AssetResponse, tags=["Assets"])
def create_asset(
    asset: schemas.AssetCreate, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.create_asset(db, asset, current_user.id)

@app.get("/api/assets", response_model=List[schemas.AssetResponse], tags=["Assets"])
def get_assets(
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    shared_bookable: Optional[bool] = None,
    query: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # Apply filtering
    q = db.query(Asset)
    if category_id:
        q = q.filter(Asset.category_id == category_id)
    if status:
        q = q.filter(Asset.status == status)
    if shared_bookable is not None:
        q = q.filter(Asset.shared_bookable == shared_bookable)
    if query:
        q = q.filter(
            (Asset.name.like(f"%{query}%")) | 
            (Asset.asset_tag.like(f"%{query}%")) | 
            (Asset.serial_number.like(f"%{query}%")) |
            (Asset.location.like(f"%{query}%"))
        )
    return q.all()

@app.get("/api/assets/{asset_id}", response_model=schemas.AssetResponse, tags=["Assets"])
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    db_asset = crud.get_asset_by_id(db, asset_id)
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return db_asset

@app.put("/api/assets/{asset_id}", response_model=schemas.AssetResponse, tags=["Assets"])
def update_asset(
    asset_id: int, 
    asset_update: schemas.AssetUpdate, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.update_asset(db, asset_id, asset_update, current_user.id)

@app.get("/api/assets/{asset_id}/history", response_model=schemas.AssetHistoryResponse, tags=["Assets"])
def get_asset_history(asset_id: int, db: Session = Depends(get_db)):
    return crud.get_asset_history(db, asset_id)

# ==========================================
# ALLOCATIONS ROUTER
# ==========================================
@app.post("/api/allocations", response_model=schemas.AllocationResponse, tags=["Allocations"])
def allocate_asset(
    alloc: schemas.AllocationCreate, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.create_allocation(db, alloc, current_user.id)

@app.get("/api/allocations", response_model=List[schemas.AllocationResponse], tags=["Allocations"])
def get_allocations(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    # Standard employee: see only their allocations. Asset Manager / Dept Head: see all.
    if current_user.role in ("Admin", "Asset Manager"):
        return crud.get_all_allocations(db)
    elif current_user.role == "Department Head":
        # Get allocations for their department OR users in their department
        return db.query(Allocation).filter(
            (Allocation.department_id == current_user.department_id) |
            (Allocation.user.has(User.department_id == current_user.department_id))
        ).all()
    else:
        return db.query(Allocation).filter(Allocation.user_id == current_user.id).all()

@app.post("/api/allocations/{allocation_id}/return", response_model=schemas.AllocationResponse, tags=["Allocations"])
def return_asset(
    allocation_id: int, 
    ret: schemas.AllocationReturn, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.return_allocation(db, allocation_id, ret, current_user.id)

# ==========================================
# TRANSFERS ROUTER
# ==========================================
@app.post("/api/transfers", response_model=schemas.TransferRequestResponse, tags=["Transfers"])
def request_transfer(
    req: schemas.TransferRequestCreate, 
    current_user: User = Depends(require_active_user), 
    db: Session = Depends(get_db)
):
    # Set default requester target if employee asks
    if not req.target_user_id and not req.target_department_id:
        req.target_user_id = current_user.id
    return crud.create_transfer_request(db, req, current_user.id)

@app.get("/api/transfers", response_model=List[schemas.TransferRequestResponse], tags=["Transfers"])
def get_transfers(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    if current_user.role in ("Admin", "Asset Manager"):
        return crud.get_all_transfers(db)
    elif current_user.role == "Department Head":
        # See transfers involving their department
        return db.query(TransferRequest).filter(
            (TransferRequest.requested_by.has(User.department_id == current_user.department_id)) |
            (TransferRequest.target_department_id == current_user.department_id) |
            (TransferRequest.target_user.has(User.department_id == current_user.department_id))
        ).all()
    else:
        # Employees see transfers they requested or target them
        return db.query(TransferRequest).filter(
            (TransferRequest.requested_by_id == current_user.id) |
            (TransferRequest.target_user_id == current_user.id)
        ).all()

@app.post("/api/transfers/{transfer_id}/process", response_model=schemas.TransferRequestResponse, tags=["Transfers"])
def process_transfer(
    transfer_id: int, 
    approve: bool = Query(...), 
    current_user: User = Depends(require_dept_head), 
    db: Session = Depends(get_db)
):
    # Department Head can approve transfers for their own department. Asset Managers can approve any.
    req = crud.get_transfer_by_id(db, transfer_id)
    if not req:
        raise HTTPException(status_code=404, detail="Transfer request not found")
        
    if current_user.role not in ("Admin", "Asset Manager"):
        # Check if dept head has authority over target user/dept
        active_alloc = crud.get_active_allocation(db, req.asset_id)
        is_source_head = active_alloc and active_alloc.user and active_alloc.user.department_id == current_user.department_id
        is_target_head = (req.target_department_id == current_user.department_id) or \
                         (req.target_user and req.target_user.department_id == current_user.department_id)
        
        if not (is_source_head or is_target_head):
            raise HTTPException(status_code=403, detail="You can only approve transfers related to your department.")
            
    return crud.process_transfer_request(db, transfer_id, approve, current_user.id)

# ==========================================
# BOOKINGS ROUTER
# ==========================================
@app.post("/api/bookings", response_model=schemas.BookingResponse, tags=["Bookings"])
def create_booking(
    booking: schemas.BookingCreate, 
    current_user: User = Depends(require_active_user), 
    db: Session = Depends(get_db)
):
    # Department Head booking on behalf of department
    if current_user.role != "Department Head" and booking.department_id:
        booking.department_id = None # ignore if regular user
    return crud.create_booking(db, booking, current_user.id)

@app.get("/api/bookings", response_model=List[schemas.BookingResponse], tags=["Bookings"])
def get_bookings(db: Session = Depends(get_db)):
    return crud.get_all_bookings(db)

@app.delete("/api/bookings/{booking_id}", response_model=schemas.BookingResponse, tags=["Bookings"])
def cancel_booking(
    booking_id: int, 
    current_user: User = Depends(require_active_user), 
    db: Session = Depends(get_db)
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    # Check permissions (Owner, Asset Manager, Admin)
    if booking.user_id != current_user.id and current_user.role not in ("Admin", "Asset Manager"):
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
        
    return crud.cancel_booking(db, booking_id, current_user.id)

# ==========================================
# MAINTENANCE ROUTER
# ==========================================
@app.post("/api/maintenance", response_model=schemas.MaintenanceResponse, tags=["Maintenance"])
def raise_maintenance(
    req: schemas.MaintenanceCreate, 
    current_user: User = Depends(require_active_user), 
    db: Session = Depends(get_db)
):
    return crud.create_maintenance_request(db, req, current_user.id)

@app.get("/api/maintenance", response_model=List[schemas.MaintenanceResponse], tags=["Maintenance"])
def get_maintenance(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    if current_user.role in ("Admin", "Asset Manager"):
        return crud.get_all_maintenance(db)
    else:
        return db.query(MaintenanceRequest).filter(
            (MaintenanceRequest.raised_by_id == current_user.id) | 
            (MaintenanceRequest.technician_id == current_user.id)
        ).all()

@app.put("/api/maintenance/{req_id}", response_model=schemas.MaintenanceResponse, tags=["Maintenance"])
def update_maintenance(
    req_id: int, 
    update: schemas.MaintenanceUpdate, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.update_maintenance_request(db, req_id, update, current_user.id)

# ==========================================
# AUDITS ROUTER
# ==========================================
@app.post("/api/audits", response_model=schemas.AuditCycleResponse, tags=["Audits"])
def create_audit(
    cycle: schemas.AuditCycleCreate, 
    current_user: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    return crud.create_audit_cycle(db, cycle, current_user.id)

@app.get("/api/audits", response_model=List[schemas.AuditCycleResponse], tags=["Audits"])
def get_audits(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    return crud.get_all_audits(db)

@app.get("/api/audits/{cycle_id}/items", response_model=List[schemas.AuditItemResponse], tags=["Audits"])
def get_audit_items(cycle_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    return crud.get_audit_items(db, cycle_id)

@app.put("/api/audits/items/{item_id}", response_model=schemas.AuditItemResponse, tags=["Audits"])
def update_audit_item(
    item_id: int, 
    update: schemas.AuditItemUpdate, 
    current_user: User = Depends(require_active_user), # Any assigned auditor can update
    db: Session = Depends(get_db)
):
    # Ideally verify current_user is assigned auditor or Asset Manager
    return crud.update_audit_item(db, item_id, update, current_user.id)

@app.post("/api/audits/{cycle_id}/close", response_model=schemas.AuditCycleResponse, tags=["Audits"])
def close_audit(
    cycle_id: int, 
    current_user: User = Depends(require_asset_manager), 
    db: Session = Depends(get_db)
):
    return crud.close_audit_cycle(db, cycle_id, current_user.id)

# ==========================================
# NOTIFICATIONS & LOGS
# ==========================================
@app.get("/api/notifications", response_model=List[schemas.NotificationResponse], tags=["Notifications"])
def get_notifications(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    return db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()

@app.post("/api/notifications/{notif_id}/read", response_model=schemas.NotificationResponse, tags=["Notifications"])
def read_notification(notif_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif

@app.get("/api/logs", response_model=List[schemas.ActivityLogResponse], tags=["Admin Logs"])
def get_logs(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).all()

# ==========================================
# REPORTS & DASHBOARD
# ==========================================
@app.get("/api/dashboard", tags=["Dashboard"])
def get_dashboard(db: Session = Depends(get_db)):
    return crud.get_dashboard_summary(db)

@app.get("/api/reports", tags=["Reports"])
def get_reports(current_user: User = Depends(require_asset_manager), db: Session = Depends(get_db)):
    return crud.get_reports_data(db)

# ==========================================
# SERVING SPA FRONTEND
# ==========================================
# Ensure frontend directory exists
os.makedirs("frontend", exist_ok=True)

# Mount files
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/{full_path:path}")
def read_index(full_path: str = ""):
    # If starting with api or docs, let FastAPI route handle it
    if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
        raise HTTPException(status_code=404)
    return FileResponse("frontend/index.html")
