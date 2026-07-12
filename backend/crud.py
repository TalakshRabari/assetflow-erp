import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from fastapi import HTTPException, status
from typing import Optional, List, Dict, Any

from backend.database import (
    User, Department, AssetCategory, Asset, Allocation, 
    TransferRequest, Booking, MaintenanceRequest, AuditCycle, 
    AuditItem, Notification, ActivityLog
)
from backend.schemas import (
    UserCreate, UserUpdate, DepartmentCreate, DepartmentUpdate,
    CategoryCreate, AssetCreate, AssetUpdate, AllocationCreate,
    AllocationReturn, TransferRequestCreate, BookingCreate,
    MaintenanceCreate, MaintenanceUpdate, AuditCycleCreate, AuditItemUpdate
)
from backend.auth import get_password_hash

# ==========================================
# HELPERS: Logs & Notifications
# ==========================================
def log_activity(db: Session, user_id: Optional[int], action: str, details: Optional[str] = None):
    log = ActivityLog(user_id=user_id, action=action, details=details)
    db.add(log)
    db.commit()

def create_notification(db: Session, user_id: int, message: str):
    notif = Notification(user_id=user_id, message=message, is_read=False)
    db.add(notif)
    db.commit()

# ==========================================
# USER CRUD
# ==========================================
def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()

def get_all_users(db: Session) -> List[User]:
    return db.query(User).all()

def create_user(db: Session, user: UserCreate) -> User:
    # First user is Admin for setup convenience
    is_first = db.query(User).count() == 0
    role = "Admin" if is_first else "Employee"
    
    hashed_password = get_password_hash(user.password)
    db_user = User(
        name=user.name,
        email=user.email.lower(),
        hashed_password=hashed_password,
        department_id=user.department_id,
        role=role,
        status="Active"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    log_activity(db, db_user.id, "User Registered", f"Account created with default role: {role}")
    return db_user

def update_user(db: Session, user_id: int, user_update: UserUpdate, actor_id: int) -> User:
    db_user = get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    
    log_activity(db, actor_id, "Update User", f"Modified user ID {user_id}: {update_data}")
    return db_user

# ==========================================
# DEPARTMENT CRUD
# ==========================================
def get_department_by_id(db: Session, dept_id: int) -> Optional[Department]:
    return db.query(Department).filter(Department.id == dept_id).first()

def get_all_departments(db: Session) -> List[Department]:
    return db.query(Department).all()

def create_department(db: Session, dept: DepartmentCreate, actor_id: int) -> Department:
    db_dept = Department(
        name=dept.name,
        head_id=dept.head_id,
        parent_id=dept.parent_id,
        status=dept.status
    )
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    
    log_activity(db, actor_id, "Create Department", f"Department '{dept.name}' created")
    
    # Notify Department Head if assigned
    if dept.head_id:
        create_notification(db, dept.head_id, f"You have been assigned as the Department Head of '{dept.name}'")
        
    return db_dept

def update_department(db: Session, dept_id: int, dept_update: DepartmentUpdate, actor_id: int) -> Department:
    db_dept = get_department_by_id(db, dept_id)
    if not db_dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    old_head_id = db_dept.head_id
    update_data = dept_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_dept, key, value)
        
    db.commit()
    db.refresh(db_dept)
    
    log_activity(db, actor_id, "Update Department", f"Modified department ID {dept_id}")
    
    # Check if head changed
    if "head_id" in update_data and update_data["head_id"] != old_head_id:
        if update_data["head_id"]:
            create_notification(db, update_data["head_id"], f"You have been assigned as the Department Head of '{db_dept.name}'")
            
    return db_dept

# ==========================================
# CATEGORY CRUD
# ==========================================
def get_all_categories(db: Session) -> List[AssetCategory]:
    return db.query(AssetCategory).all()

def create_category(db: Session, cat: CategoryCreate, actor_id: int) -> AssetCategory:
    db_cat = AssetCategory(
        name=cat.name,
        custom_fields=cat.custom_fields
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    log_activity(db, actor_id, "Create Category", f"Category '{cat.name}' created")
    return db_cat

def update_category(db: Session, cat_id: int, cat: CategoryCreate, actor_id: int) -> AssetCategory:
    db_cat = db.query(AssetCategory).filter(AssetCategory.id == cat_id).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db_cat.name = cat.name
    db_cat.custom_fields = cat.custom_fields
    db.commit()
    db.refresh(db_cat)
    log_activity(db, actor_id, "Update Category", f"Category '{cat.name}' updated")
    return db_cat

# ==========================================
# ASSET CRUD
# ==========================================
def get_asset_by_id(db: Session, asset_id: int) -> Optional[Asset]:
    return db.query(Asset).filter(Asset.id == asset_id).first()

def get_asset_by_tag(db: Session, asset_tag: str) -> Optional[Asset]:
    return db.query(Asset).filter(Asset.asset_tag == asset_tag).first()

def get_all_assets(db: Session) -> List[Asset]:
    return db.query(Asset).all()

def create_asset(db: Session, asset: AssetCreate, actor_id: int) -> Asset:
    # Auto-generate Asset Tag (AF-0001 format)
    # Find max asset ID
    last_id = db.query(func.max(Asset.id)).scalar() or 0
    tag_num = last_id + 1
    asset_tag = f"AF-{tag_num:04d}"
    
    db_asset = Asset(
        name=asset.name,
        category_id=asset.category_id,
        asset_tag=asset_tag,
        serial_number=asset.serial_number,
        acquisition_date=asset.acquisition_date,
        acquisition_cost=asset.acquisition_cost or 0.0,
        condition=asset.condition or "New",
        location=asset.location,
        shared_bookable=asset.shared_bookable or False,
        status="Available",
        custom_values=asset.custom_values
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    
    log_activity(db, actor_id, "Register Asset", f"Registered asset '{asset.name}' with tag {asset_tag}")
    return db_asset

def update_asset(db: Session, asset_id: int, asset_update: AssetUpdate, actor_id: int) -> Asset:
    db_asset = get_asset_by_id(db, asset_id)
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    update_data = asset_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_asset, key, value)
        
    db.commit()
    db.refresh(db_asset)
    log_activity(db, actor_id, "Update Asset", f"Updated asset {db_asset.asset_tag}: {update_data}")
    return db_asset

def get_asset_history(db: Session, asset_id: int) -> Dict[str, Any]:
    allocations = db.query(Allocation).filter(Allocation.asset_id == asset_id).order_by(Allocation.allocation_date.desc()).all()
    maintenances = db.query(MaintenanceRequest).filter(MaintenanceRequest.asset_id == asset_id).order_by(MaintenanceRequest.request_date.desc()).all()
    transfers = db.query(TransferRequest).filter(TransferRequest.asset_id == asset_id).order_by(TransferRequest.request_date.desc()).all()
    
    return {
        "allocations": allocations,
        "maintenances": maintenances,
        "transfers": transfers
    }

# ==========================================
# ALLOCATION & RETURN CRUD
# ==========================================
def get_active_allocation(db: Session, asset_id: int) -> Optional[Allocation]:
    return db.query(Allocation).filter(
        Allocation.asset_id == asset_id,
        Allocation.status.in_(["Approved", "Overdue"])
    ).first()

def create_allocation(db: Session, alloc: AllocationCreate, actor_id: int) -> Allocation:
    requested_asset = get_asset_by_id(db, alloc.asset_id)
    if not requested_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    # Find if there is ANY instance with the same name that is "Available"
    available_asset = db.query(Asset).filter(
        Asset.name == requested_asset.name,
        Asset.status == "Available"
    ).first()
    
    if available_asset:
        # FCFS: An available instance was found! Allocate it.
        db_alloc = Allocation(
            asset_id=available_asset.id,
            user_id=alloc.user_id,
            department_id=alloc.department_id,
            allocated_by_id=actor_id,
            expected_return_date=alloc.expected_return_date,
            status="Approved"
        )
        db.add(db_alloc)
        
        # Update Asset status
        available_asset.status = "Allocated"
        db.commit()
        db.refresh(db_alloc)
        
        if alloc.user_id:
            create_notification(db, alloc.user_id, f"Asset '{available_asset.name}' ({available_asset.asset_tag}) has been allocated to you.")
            
        log_activity(db, actor_id, "Allocate Asset", f"Allocated asset {available_asset.asset_tag} to user ID {alloc.user_id} / dept ID {alloc.department_id}")
        return db_alloc
    else:
        # No instances available. Add request to FCFS queue!
        db_alloc = Allocation(
            asset_id=requested_asset.id,
            user_id=alloc.user_id,
            department_id=alloc.department_id,
            allocated_by_id=actor_id,
            expected_return_date=alloc.expected_return_date,
            status="Queued"
        )
        db.add(db_alloc)
        db.commit()
        db.refresh(db_alloc)
        
        if alloc.user_id:
            create_notification(db, alloc.user_id, f"Asset '{requested_asset.name}' is currently unavailable. Your request has been queued.")
            
        log_activity(db, actor_id, "Queue Asset Request", f"Queued request for '{requested_asset.name}' for user ID {alloc.user_id} / dept ID {alloc.department_id}")
        return db_alloc

def return_allocation(db: Session, allocation_id: int, ret: AllocationReturn, actor_id: int) -> Allocation:
    db_alloc = db.query(Allocation).filter(Allocation.id == allocation_id).first()
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation record not found")
        
    if db_alloc.status == "Returned":
        raise HTTPException(status_code=400, detail="Asset already returned")
        
    db_alloc.actual_return_date = datetime.datetime.utcnow()
    db_alloc.check_in_notes = ret.check_in_notes
    db_alloc.status = "Returned"
    
    # Revert asset status
    asset = db_alloc.asset
    
    # Check if there is a pending queued request for assets of the same name
    queued_alloc = db.query(Allocation).join(Asset).filter(
        Asset.name == asset.name,
        Allocation.status == "Queued"
    ).order_by(Allocation.allocation_date.asc()).first()
    
    if queued_alloc:
        # FCFS Fulfill: allocate this returned instance to the oldest queued request!
        queued_alloc.asset_id = asset.id
        queued_alloc.status = "Approved"
        queued_alloc.allocation_date = datetime.datetime.utcnow()
        
        # Keep asset status as Allocated
        asset.status = "Allocated"
        db.commit()
        db.refresh(queued_alloc)
        
        # Notify the queued user
        if queued_alloc.user_id:
            create_notification(db, queued_alloc.user_id, f"An instance of '{asset.name}' has become available and is now allocated to you!")
            
        log_activity(db, actor_id, "Fulfill Queued Request", f"Allocated returned asset {asset.asset_tag} to queued user ID {queued_alloc.user_id}")
    else:
        # No one waiting in queue
        asset.status = "Available"
        
    db.commit()
    db.refresh(db_alloc)
    
    # Notify alloc user
    if db_alloc.user_id:
        create_notification(db, db_alloc.user_id, f"Asset return for '{asset.name}' ({asset.asset_tag}) has been approved and processed.")
        
    log_activity(db, actor_id, "Return Asset", f"Asset {asset.asset_tag} returned. Notes: {ret.check_in_notes}")
    return db_alloc

def get_all_allocations(db: Session) -> List[Allocation]:
    return db.query(Allocation).all()

def flag_overdue_allocations(db: Session) -> int:
    now = datetime.datetime.utcnow()
    overdue_allocs = db.query(Allocation).filter(
        Allocation.status == "Approved",
        Allocation.expected_return_date < now
    ).all()
    
    count = 0
    for alloc in overdue_allocs:
        alloc.status = "Overdue"
        count += 1
        # Notify
        if alloc.user_id:
            create_notification(db, alloc.user_id, f"ALERT: Your allocation of '{alloc.asset.name}' ({alloc.asset.asset_tag}) is overdue.")
            
    if count > 0:
        db.commit()
        
    return count

# ==========================================
# TRANSFER REQUEST CRUD
# ==========================================
def get_transfer_by_id(db: Session, transfer_id: int) -> Optional[TransferRequest]:
    return db.query(TransferRequest).filter(TransferRequest.id == transfer_id).first()

def get_all_transfers(db: Session) -> List[TransferRequest]:
    return db.query(TransferRequest).all()

def create_transfer_request(db: Session, req: TransferRequestCreate, actor_id: int) -> TransferRequest:
    # Verify the asset is currently allocated
    asset = get_asset_by_id(db, req.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    active_alloc = get_active_allocation(db, req.asset_id)
    if not active_alloc:
        raise HTTPException(status_code=400, detail="This asset is not currently allocated. You can allocate it directly.")
        
    if active_alloc.user_id == actor_id:
        raise HTTPException(status_code=400, detail="You already hold this asset.")
        
    # Check if duplicate transfer request is pending
    duplicate = db.query(TransferRequest).filter(
        TransferRequest.asset_id == req.asset_id,
        TransferRequest.requested_by_id == actor_id,
        TransferRequest.status == "Pending"
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="You already have a pending transfer request for this asset.")

    db_req = TransferRequest(
        asset_id=req.asset_id,
        requested_by_id=actor_id,
        target_user_id=req.target_user_id,
        target_department_id=req.target_department_id,
        status="Pending"
    )
    db.add(db_req)
    db.commit()
    db.refresh(db_req)
    
    # Notify Asset Managers / current holder
    # For now, let's notify the current holder of the asset transfer request
    if active_alloc.user_id:
        create_notification(db, active_alloc.user_id, f"User '{db_req.requested_by.name}' has requested a transfer of your asset '{asset.name}' ({asset.asset_tag}).")
        
    log_activity(db, actor_id, "Request Transfer", f"Requested transfer of asset {asset.asset_tag} to user ID {req.target_user_id}")
    return db_req

def process_transfer_request(db: Session, transfer_id: int, approve: bool, actor_id: int) -> TransferRequest:
    req = get_transfer_by_id(db, transfer_id)
    if not req:
        raise HTTPException(status_code=404, detail="Transfer request not found")
        
    if req.status != "Pending":
        raise HTTPException(status_code=400, detail="Transfer request has already been processed")
        
    if not approve:
        req.status = "Rejected"
        req.approved_by_id = actor_id
        db.commit()
        create_notification(db, req.requested_by_id, f"Your transfer request for asset '{req.asset.name}' has been REJECTED.")
        log_activity(db, actor_id, "Reject Transfer", f"Rejected transfer ID {transfer_id}")
        return req
        
    # Verify active allocation is still there
    active_alloc = get_active_allocation(db, req.asset_id)
    if active_alloc:
        # Mark as returned
        active_alloc.actual_return_date = datetime.datetime.utcnow()
        active_alloc.status = "Returned"
        active_alloc.check_in_notes = f"Transferred directly to user ID {req.target_user_id}"
        
    # Create new allocation
    new_alloc = Allocation(
        asset_id=req.asset_id,
        user_id=req.target_user_id or req.requested_by_id, # Default to the requester if target is blank
        department_id=req.target_department_id,
        allocated_by_id=actor_id,
        status="Approved"
    )
    db.add(new_alloc)
    
    req.status = "Approved"
    req.approved_by_id = actor_id
    
    # Update Asset status to Allocated (should already be Allocated but safety check)
    req.asset.status = "Allocated"
    
    db.commit()
    db.refresh(req)
    
    # Notify requester
    create_notification(db, req.requested_by_id, f"Your transfer request for asset '{req.asset.name}' ({req.asset.asset_tag}) has been APPROVED.")
    if req.target_user_id and req.target_user_id != req.requested_by_id:
        create_notification(db, req.target_user_id, f"Asset '{req.asset.name}' ({req.asset.asset_tag}) has been transferred to you.")
        
    log_activity(db, actor_id, "Approve Transfer", f"Approved transfer ID {transfer_id}. Re-allocated asset.")
    return req

# ==========================================
# RESOURCE BOOKING CRUD
# ==========================================
def get_all_bookings(db: Session) -> List[Booking]:
    return db.query(Booking).all()

def create_booking(db: Session, booking: BookingCreate, user_id: int) -> Booking:
    asset = get_asset_by_id(db, booking.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    if not asset.shared_bookable:
        raise HTTPException(status_code=400, detail="This asset is not flagged as a shared bookable resource.")
        
    if booking.start_time >= booking.end_time:
        raise HTTPException(status_code=400, detail="Start time must be before end time.")
        
    # Calendar Overlap validation:
    # Check if there is any booking for this asset where:
    # (start_time < booking.end_time) AND (end_time > booking.start_time) AND status != 'Cancelled'
    overlapping = db.query(Booking).filter(
        Booking.asset_id == booking.asset_id,
        Booking.status != "Cancelled",
        Booking.start_time < booking.end_time,
        Booking.end_time > booking.start_time
    ).first()
    
    if overlapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resource booking conflict. Slot is already booked from {overlapping.start_time.strftime('%H:%M')} to {overlapping.end_time.strftime('%H:%M')} by user ID {overlapping.user_id}."
        )
        
    user = db.query(User).filter(User.id == user_id).first()
    initial_status = "Pending Approval" if (user and user.role == "Employee") else "Upcoming"

    db_booking = Booking(
        asset_id=booking.asset_id,
        user_id=user_id,
        department_id=booking.department_id,
        start_time=booking.start_time,
        end_time=booking.end_time,
        status=initial_status
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    
    log_activity(db, user_id, "Book Resource", f"Booked resource {asset.asset_tag} from {booking.start_time} to {booking.end_time} (Status: {initial_status})")
    return db_booking

def cancel_booking(db: Session, booking_id: int, actor_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    booking.status = "Cancelled"
    db.commit()
    
    log_activity(db, actor_id, "Cancel Booking", f"Cancelled booking ID {booking_id}")
    return booking

def process_booking(db: Session, booking_id: int, approve: bool, actor_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking request not found")
    
    if booking.status != "Pending Approval":
        raise HTTPException(status_code=400, detail="Booking request has already been processed")
        
    if approve:
        booking.status = "Upcoming"
        create_notification(db, booking.user_id, f"Your booking for resource '{booking.asset.name}' has been APPROVED.")
        log_activity(db, actor_id, "Approve Booking", f"Approved booking request ID {booking_id}")
    else:
        booking.status = "Cancelled"
        create_notification(db, booking.user_id, f"Your booking for resource '{booking.asset.name}' has been REJECTED.")
        log_activity(db, actor_id, "Reject Booking", f"Rejected booking request ID {booking_id}")
        
    db.commit()
    db.refresh(booking)
    return booking

# ==========================================
# MAINTENANCE CRUD
# ==========================================
def get_all_maintenance(db: Session) -> List[MaintenanceRequest]:
    return db.query(MaintenanceRequest).all()

def create_maintenance_request(db: Session, req: MaintenanceCreate, actor_id: int) -> MaintenanceRequest:
    asset = get_asset_by_id(db, req.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    db_req = MaintenanceRequest(
        asset_id=req.asset_id,
        raised_by_id=actor_id,
        description=req.description,
        priority=req.priority,
        status="Pending"
    )
    db.add(db_req)
    db.commit()
    db.refresh(db_req)
    
    log_activity(db, actor_id, "Raise Maintenance", f"Raised repair request for {asset.asset_tag}: {req.description}")
    return db_req

def update_maintenance_request(db: Session, req_id: int, update: MaintenanceUpdate, actor_id: int) -> MaintenanceRequest:
    db_req = db.query(MaintenanceRequest).filter(MaintenanceRequest.id == req_id).first()
    if not db_req:
        raise HTTPException(status_code=404, detail="Maintenance request not found")
        
    old_status = db_req.status
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_req, key, value)
        
    # State side-effects:
    # Pending -> Approved (Status shifts asset to 'Under Maintenance')
    # Any status -> Resolved (Status shifts asset to 'Available')
    asset = db_req.asset
    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == "Approved" and old_status != "Approved":
            asset.status = "Under Maintenance"
            # Cancel active allocations / bookings for this time? 
            # Standard: active allocation is kept but asset is offline, or mark returned. Let's just update asset status.
            create_notification(db, db_req.raised_by_id, f"Your maintenance request for '{asset.name}' has been APPROVED.")
        elif new_status == "Resolved" and old_status != "Resolved":
            # Check if there is a pending queued request for assets of the same name
            queued_alloc = db.query(Allocation).join(Asset).filter(
                Asset.name == asset.name,
                Allocation.status == "Queued"
            ).order_by(Allocation.allocation_date.asc()).first()
            
            if queued_alloc:
                # FCFS Fulfill: allocate this resolved instance to the oldest queued request!
                queued_alloc.asset_id = asset.id
                queued_alloc.status = "Approved"
                queued_alloc.allocation_date = datetime.datetime.utcnow()
                
                # Keep asset status as Allocated
                asset.status = "Allocated"
                db.commit()
                db.refresh(queued_alloc)
                
                # Notify the queued user
                if queued_alloc.user_id:
                    create_notification(db, queued_alloc.user_id, f"Asset '{asset.name}' has returned from maintenance and is now allocated to you!")
                    
                log_activity(db, actor_id, "Fulfill Queued Request (Maint)", f"Allocated resolved asset {asset.asset_tag} to queued user ID {queued_alloc.user_id}")
            else:
                asset.status = "Available"
            create_notification(db, db_req.raised_by_id, f"Your maintenance request for '{asset.name}' is now RESOLVED.")
            
    db.commit()
    db.refresh(db_req)
    
    log_activity(db, actor_id, "Update Maintenance", f"Modified maintenance request ID {req_id} to status {db_req.status}")
    return db_req

# ==========================================
# AUDIT CRUD
# ==========================================
def get_all_audits(db: Session) -> List[AuditCycle]:
    return db.query(AuditCycle).all()

def get_audit_by_id(db: Session, cycle_id: int) -> Optional[AuditCycle]:
    return db.query(AuditCycle).filter(AuditCycle.id == cycle_id).first()

def get_audit_items(db: Session, cycle_id: int) -> List[AuditItem]:
    return db.query(AuditItem).filter(AuditItem.audit_cycle_id == cycle_id).all()

def create_audit_cycle(db: Session, cycle: AuditCycleCreate, actor_id: int) -> AuditCycle:
    db_cycle = AuditCycle(
        name=cycle.name,
        created_by_id=actor_id,
        department_id=cycle.department_id,
        location=cycle.location,
        start_date=cycle.start_date,
        end_date=cycle.end_date,
        status="Open"
    )
    db.add(db_cycle)
    db.commit()
    db.refresh(db_cycle)
    
    # Auto-generate AuditItems based on scope
    query = db.query(Asset)
    if cycle.department_id:
        # Get assets currently allocated to users in this department
        # Or directly allocated to this department
        query = query.join(Asset.allocations, isouter=True).filter(
            or_(
                Allocation.department_id == cycle.department_id,
                and_(
                    Allocation.user_id.isnot(None),
                    Allocation.user.has(User.department_id == cycle.department_id)
                )
            ),
            Allocation.status.in_(["Approved", "Overdue"])
        )
    if cycle.location:
        query = query.filter(Asset.location.like(f"%{cycle.location}%"))
        
    scoped_assets = query.all()
    
    for asset in scoped_assets:
        item = AuditItem(
            audit_cycle_id=db_cycle.id,
            asset_id=asset.id,
            status="Unchecked"
        )
        db.add(item)
        
    db.commit()
    
    log_activity(db, actor_id, "Create Audit Cycle", f"Created audit cycle '{cycle.name}' with {len(scoped_assets)} items")
    return db_cycle

def update_audit_item(db: Session, item_id: int, update: AuditItemUpdate, auditor_id: int) -> AuditItem:
    item = db.query(AuditItem).filter(AuditItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Audit item not found")
        
    if item.audit_cycle.status == "Closed":
        raise HTTPException(status_code=400, detail="Cannot update items in a closed audit cycle")
        
    item.status = update.status
    item.notes = update.notes
    item.auditor_id = auditor_id
    item.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(item)
    return item

def close_audit_cycle(db: Session, cycle_id: int, actor_id: int) -> AuditCycle:
    cycle = get_audit_by_id(db, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Audit cycle not found")
        
    if cycle.status == "Closed":
        raise HTTPException(status_code=400, detail="Audit cycle is already closed")
        
    # Process items and apply status changes
    # If marked "Missing", set asset status to "Lost"
    items = get_audit_items(db, cycle_id)
    discrepancies = 0
    for item in items:
        if item.status == "Missing":
            item.asset.status = "Lost"
            discrepancies += 1
            # Notify Asset Manager / Creator
            create_notification(db, cycle.created_by_id, f"Audit Alert: Asset '{item.asset.name}' ({item.asset.asset_tag}) marked MISSING in audit cycle '{cycle.name}'.")
        elif item.status == "Damaged":
            item.asset.condition = "Damaged"
            discrepancies += 1
            create_notification(db, cycle.created_by_id, f"Audit Alert: Asset '{item.asset.name}' ({item.asset.asset_tag}) marked DAMAGED in audit cycle '{cycle.name}'.")
            
    cycle.status = "Closed"
    db.commit()
    db.refresh(cycle)
    
    log_activity(db, actor_id, "Close Audit Cycle", f"Closed audit cycle '{cycle.name}'. Discrepancies processed: {discrepancies}")
    return cycle

# ==========================================
# ANALYTICS & REPORTS
# ==========================================
def get_dashboard_summary(db: Session) -> Dict[str, Any]:
    # Flag overdue allocations first to keep data real-time
    flag_overdue_allocations(db)
    
    total_assets = db.query(Asset).count()
    available = db.query(Asset).filter(Asset.status == "Available").count()
    allocated = db.query(Asset).filter(Asset.status == "Allocated").count()
    maintenance = db.query(Asset).filter(Asset.status == "Under Maintenance").count()
    lost = db.query(Asset).filter(Asset.status == "Lost").count()
    
    active_bookings = db.query(Booking).filter(Booking.status.in_(["Upcoming", "Ongoing"])).count()
    pending_transfers = db.query(TransferRequest).filter(TransferRequest.status == "Pending").count()
    
    overdue_returns = db.query(Allocation).filter(Allocation.status == "Overdue").count()
    
    # Upcoming returns in next 3 days
    now = datetime.datetime.utcnow()
    three_days_later = now + datetime.timedelta(days=3)
    upcoming_returns = db.query(Allocation).filter(
        Allocation.status == "Approved",
        Allocation.expected_return_date >= now,
        Allocation.expected_return_date <= three_days_later
    ).count()
    
    # Active maintenance requests today
    maintenance_today = db.query(MaintenanceRequest).filter(
        MaintenanceRequest.status.in_(["Approved", "Tech Assigned", "In Progress"])
    ).count()

    return {
        "assets_total": total_assets,
        "assets_available": available,
        "assets_allocated": allocated,
        "assets_maintenance": maintenance,
        "assets_lost": lost,
        "maintenance_today": maintenance_today,
        "active_bookings": active_bookings,
        "pending_transfers": pending_transfers,
        "upcoming_returns": upcoming_returns,
        "overdue_returns": overdue_returns
    }

def get_reports_data(db: Session) -> Dict[str, Any]:
    # 1. Asset utilization trends (Allocated vs Available vs Under Maintenance)
    status_counts = db.query(Asset.status, func.count(Asset.id)).group_by(Asset.status).all()
    utilization = {status: count for status, count in status_counts}
    
    # 2. Maintenance frequency by category
    maint_freq = db.query(AssetCategory.name, func.count(MaintenanceRequest.id)).\
        join(Asset, Asset.category_id == AssetCategory.id).\
        join(MaintenanceRequest, MaintenanceRequest.asset_id == Asset.id).\
        group_by(AssetCategory.name).all()
    maintenance_by_category = {cat: count for cat, count in maint_freq}
    
    # 3. Department-wise allocations
    dept_allocs = db.query(Department.name, func.count(Allocation.id)).\
        join(Allocation, Allocation.department_id == Department.id).\
        filter(Allocation.status.in_(["Approved", "Overdue"])).\
        group_by(Department.name).all()
    allocations_by_department = {dept: count for dept, count in dept_allocs}
    
    # Add user department allocations as well
    user_dept_allocs = db.query(Department.name, func.count(Allocation.id)).\
        join(User, User.department_id == Department.id).\
        join(Allocation, Allocation.user_id == User.id).\
        filter(Allocation.status.in_(["Approved", "Overdue"])).\
        group_by(Department.name).all()
        
    for dept, count in user_dept_allocs:
        allocations_by_department[dept] = allocations_by_department.get(dept, 0) + count
        
    # 4. Resource booking heatmap (bookings per hour of the day)
    booking_times = db.query(Booking.start_time).filter(Booking.status != "Cancelled").all()
    hourly_heatmap = [0] * 24
    for (t,) in booking_times:
        hour = t.hour
        hourly_heatmap[hour] += 1
        
    return {
        "utilization": utilization,
        "maintenance_by_category": maintenance_by_category,
        "allocations_by_department": allocations_by_department,
        "booking_hourly_heatmap": hourly_heatmap
    }
