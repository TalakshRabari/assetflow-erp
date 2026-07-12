# AssetFlow

**AssetFlow** is an Enterprise Asset & Resource Management System designed to simplify and digitize how organizations track, allocate, and maintain physical assets and shared resources. 

Built as a lightweight, clean-architecture ERP module, this application eliminates the inefficiencies of spreadsheets and paper logs by introducing structured lifecycles, overlap-free resource reservations, and automated request queues.

---

## Key Features

1.  **Tailwind CSS Redesign**: A modern, clean, and highly readable light mode corporate dashboard with responsive panel transitions and custom badge tags.
2.  **First-Come, First-Served (FCFS) Request Queuing**: 
    *   If all instances of an asset (e.g. laptops, vehicles) are occupied, subsequent allocation requests are placed in a **`Queued`** state.
    *   When an active asset is returned (check-in) or resolved from maintenance, it is automatically assigned to the oldest queued user.
3.  **Master master-data management**: Set up hierarchical departments, manage employee directory roles (Admin, Manager, Head, Employee), and update asset category attribute schemas on the fly.
4.  **Conflict-Free Resource Booking**: Reserve shared resources (conference rooms, vehicles, equipment) with precise start/end validation preventing slot overlaps.
5.  **Structured Maintenance & Auditing**:
    *   Route repair requests from holder submitters to asset managers with technician assignment and status tracking.
    *   Initiate periodic inventory audits, assign inspectors, and log missing or damaged items to auto-generate discrepancy logs.
6.  **Insights & Reporting Dashboard**:
    *   6 real-time KPI metrics cards: Available Assets, Allocated Assets, Maintenance Today, Active Bookings, **Pending Transfers**, and **Upcoming Returns**.
    *   Automatic flagging of damaged or aging assets nearing their 3-year retirement lifecycles.
    *   Actionable chart graphs and CSV export options.
7.  **Asset QR Code Displays**: View details of an asset accompanied by a dynamically generated, scannable QR Code referencing its unique tag.

---

## Tech Stack

*   **Backend**: Python, FastAPI, SQLAlchemy ORM, Uvicorn, SQLite database.
*   **Frontend**: HTML5, Tailwind CSS, JavaScript (Vanilla ES6), FontAwesome icons.

---

## Setup & How to Run

Follow these instructions to set up and start the application locally:

### **Prerequisites**
*   Python 3.10+ installed on your computer.

### **1. Clone & Navigate to Folder**
Open your terminal (PowerShell / Command Prompt) and navigate to the project directory:
```bash
cd c:\Users\talak\Documents\AssetFlow
```

### **2. Set Up Virtual Environment**
If you need to initialize or recreate the virtual environment, run:
```powershell
# Create virtual environment
python -m venv venv

# Activate it (Windows PowerShell)
.\venv\Scripts\Activate.ps1
```

### **3. Install Dependencies**
Install the backend library packages:
```powershell
pip install -r requirements.txt
```

### **4. Start the Web Server**
Start the FastAPI server using the entrypoint script:
```powershell
python run.py
```
*(The server will initialize on port 8000 and seed default mock databases if it detects a blank setup).*

### **5. Open in Browser**
Access the live interface:
*   **Web Dashboard Portal**: [http://localhost:8000](http://localhost:8000)
*   **Swagger API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Mock Login Accounts

The database automatically seeds default users to help you test different roles immediately. Default password for all seeded accounts is **`password123`**:

| Name | Email Address | Role | Privileges |
| :--- | :--- | :--- | :--- |
| **Swayam Patel** | `swayam123@gmail.com` | **Admin** | Full system configuration, department setup, user promotion. |
| **Marcus Wright** | `marcus@company.com` | **Asset Manager** | Registers/allocates assets, approves transfers, processes maintenance. |
| **Sarah Connor** | `sarah@company.com` | **Department Head** | Approves transfers inside department, books resources. |
| **John Doe** | `john@company.com` | **Employee** | Requests allocations, books resources, raises maintenance tickets. |
