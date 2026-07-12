from sqlalchemy.orm import Session
from backend.database import User, Department, AssetCategory, Asset
from backend.auth import get_password_hash
import datetime

def seed_db(db: Session):
    # Check if already seeded
    if db.query(AssetCategory).count() > 0:
        return

    print("Seeding database with default mock data...")

    # 1. Create Default Categories
    laptops_cat = AssetCategory(
        name="Laptops",
        custom_fields={"brand": "text", "warranty_months": "number"}
    )
    vehicles_cat = AssetCategory(
        name="Vehicles",
        custom_fields={"make": "text", "model": "text"}
    )
    spaces_cat = AssetCategory(
        name="Conference Rooms",
        custom_fields={"capacity": "number"}
    )
    furniture_cat = AssetCategory(
        name="Office Furniture",
        custom_fields={"ergonomic": "text"}
    )
    
    db.add_all([laptops_cat, vehicles_cat, spaces_cat, furniture_cat])
    db.commit()

    # 2. Create Default Departments
    eng_dept = Department(name="Engineering", status="Active")
    design_dept = Department(name="Design", status="Active")
    ops_dept = Department(name="Operations", status="Active")
    
    db.add_all([eng_dept, design_dept, ops_dept])
    db.commit()

    # 3. Create Default Employees
    # Admin (already exists if created via UI, but let's check)
    emp1 = User(
        name="John Doe",
        email="john@company.com",
        hashed_password=get_password_hash("password123"),
        role="Employee",
        department_id=eng_dept.id,
        status="Active"
    )
    emp2 = User(
        name="Sarah Connor",
        email="sarah@company.com",
        hashed_password=get_password_hash("password123"),
        role="Department Head",
        department_id=eng_dept.id,
        status="Active"
    )
    emp3 = User(
        name="Marcus Wright",
        email="marcus@company.com",
        hashed_password=get_password_hash("password123"),
        role="Asset Manager",
        department_id=ops_dept.id,
        status="Active"
    )
    
    db.add_all([emp1, emp2, emp3])
    db.commit()

    # Update heads
    eng_dept.head_id = emp2.id
    ops_dept.head_id = emp3.id
    db.commit()

    # 4. Create Default Assets (Shared & Non-Shared)
    asset1 = Asset(
        name="MacBook Pro 16",
        category_id=laptops_cat.id,
        asset_tag="AF-0001",
        serial_number="C02H2244JJK",
        acquisition_date=datetime.datetime.utcnow(),
        acquisition_cost=2499.00,
        condition="New",
        location="Floor 3 - Row A",
        shared_bookable=False,
        status="Available",
        custom_values={"brand": "Apple", "warranty_months": 24}
    )
    
    asset2 = Asset(
        name="Conference Room B1",
        category_id=spaces_cat.id,
        asset_tag="AF-0002",
        serial_number="ROOM-B1",
        acquisition_date=datetime.datetime.utcnow(),
        acquisition_cost=0.0,
        condition="New",
        location="Floor 1 - Main Wing",
        shared_bookable=True, # This makes it appear in Book a Resource dropdown
        status="Available",
        custom_values={"capacity": 12}
    )
    
    asset3 = Asset(
        name="Tesla Model 3",
        category_id=vehicles_cat.id,
        asset_tag="AF-0003",
        serial_number="TSLA551122",
        acquisition_date=datetime.datetime.utcnow(),
        acquisition_cost=38000.0,
        condition="Good",
        location="Parking Level B",
        shared_bookable=True, # This makes it appear in Book a Resource dropdown
        status="Available",
        custom_values={"make": "Tesla", "model": "Model 3"}
    )
    
    asset4 = Asset(
        name="Aeron Ergonomic Chair",
        category_id=furniture_cat.id,
        asset_tag="AF-0004",
        serial_number="HM-AERON-88",
        acquisition_date=datetime.datetime.utcnow(),
        acquisition_cost=1200.0,
        condition="New",
        location="Floor 2 - Design Studio",
        shared_bookable=False,
        status="Available",
        custom_values={"ergonomic": "Yes"}
    )

    db.add_all([asset1, asset2, asset3, asset4])
    db.commit()
    print("Database seeding completed.")
