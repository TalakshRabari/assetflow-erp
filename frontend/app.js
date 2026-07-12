/* ==========================================================================
   AssetFlow Client-Side Application Script
   SPA Router, API Interface, View Engines, and Interactive Components
   ========================================================================== */

class AssetFlowApp {
    constructor() {
        this.baseUrl = window.location.origin;
        this.token = localStorage.getItem('af_token') || null;
        this.user = JSON.parse(localStorage.getItem('af_user')) || null;
        
        // Navigation items lookup
        this.views = [
            'dashboard', 'assets', 'allocations', 'bookings', 
            'maintenance', 'audits', 'org-setup', 'reports', 
            'notifications', 'logs'
        ];
        
        // Temp variables for UI interaction
        this.customFields = [];
        this.currentAuditCycleId = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
        
        // Listen to hash changes for routing
        window.addEventListener('hashchange', () => this.route());
        
        // Refresh timer for time display
        setInterval(() => {
            const now = new Date();
            const format = now.toISOString().replace('T', ' ').substring(0, 16);
            const systemTimeEl = document.getElementById('system-time');
            if (systemTimeEl) systemTimeEl.innerText = format;
        }, 30000);
        
        // Trigger clock immediately
        const now = new Date();
        const systemTimeEl = document.getElementById('system-time');
        if (systemTimeEl) systemTimeEl.innerText = now.toISOString().replace('T', ' ').substring(0, 16);
    }

    setupEventListeners() {
        // Auth Forms
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('signup-form').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        
        document.getElementById('show-signup-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthScreen('signup');
        });
        document.getElementById('show-login-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthScreen('login');
        });

        // Search & Filter Listeners for Assets
        document.getElementById('asset-search-input').addEventListener('input', () => this.loadAssets());
        document.getElementById('asset-filter-category').addEventListener('change', () => this.loadAssets());
        document.getElementById('asset-filter-status').addEventListener('change', () => this.loadAssets());

        // File Upload Listeners
        this.setupPhotoUpload('asset-photo', 'asset-photo-url');
        this.setupPhotoUpload('maint-photo', 'maint-photo-url');

        // Form Submit Handlers
        document.getElementById('register-asset-form').addEventListener('submit', (e) => this.handleRegisterAsset(e));
        document.getElementById('allocate-asset-form').addEventListener('submit', (e) => this.handleAllocateAsset(e));
        document.getElementById('return-asset-form').addEventListener('submit', (e) => this.handleReturnAsset(e));
        document.getElementById('booking-form').addEventListener('submit', (e) => this.handleBookResource(e));
        document.getElementById('maintenance-request-form').addEventListener('submit', (e) => this.handleRaiseMaintenance(e));
        document.getElementById('update-maintenance-form').addEventListener('submit', (e) => this.handleUpdateMaintenance(e));
        document.getElementById('create-audit-form').addEventListener('submit', (e) => this.handleCreateAudit(e));
        document.getElementById('create-department-form').addEventListener('submit', (e) => this.handleCreateDepartment(e));
        document.getElementById('create-category-form').addEventListener('submit', (e) => this.handleCreateCategory(e));
        document.getElementById('edit-category-form').addEventListener('submit', (e) => this.handleUpdateCategory(e));
        document.getElementById('forgot-password-form').addEventListener('submit', (e) => this.handleForgotPassword(e));
        
        // Export button
        document.getElementById('csv-export-btn').addEventListener('click', () => this.exportReportsCSV());
    }

    // ==========================================
    // AUTHENTICATION FLOWS
    // ==========================================
    checkAuth() {
        if (this.token && this.user) {
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            this.updateUserProfileUI();
            this.loadInitialDropdowns();
            
            // Go to dashboard if no hash, otherwise route
            if (!window.location.hash) {
                window.location.hash = '#dashboard';
            } else {
                this.route();
            }
            this.startNotificationPoller();
        } else {
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            this.loadSignupDepartments();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const data = await this.apiCall('/api/auth/login', 'POST', { email, password }, false);
            this.token = data.access_token;
            localStorage.setItem('af_token', this.token);
            
            // Get user profile
            const profile = await this.apiCall('/api/auth/me', 'GET');
            this.user = profile;
            localStorage.setItem('af_user', JSON.stringify(this.user));
            
            this.showToast('Login successful', 'success');
            this.checkAuth();
        } catch (err) {
            this.showToast(err.detail || 'Login failed', 'error');
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const deptIdVal = document.getElementById('signup-dept').value;
        const department_id = deptIdVal ? parseInt(deptIdVal) : null;

        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            await this.apiCall('/api/auth/signup', 'POST', { name, email, password, department_id }, false);
            this.showToast('Account requested successfully! Please log in.', 'success');
            this.toggleAuthScreen('login');
        } catch (err) {
            this.showToast(err.detail || 'Registration failed', 'error');
        }
    }

    handleLogout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        window.location.hash = '';
        this.showToast('Logged out successfully', 'info');
        this.checkAuth();
    }

    toggleAuthScreen(screen) {
        if (screen === 'signup') {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('signup-form').classList.remove('hidden');
        } else {
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('signup-form').classList.add('hidden');
        }
    }

    updateUserProfileUI() {
        document.getElementById('sidebar-user-name').innerText = this.user.name;
        document.getElementById('sidebar-user-role').innerText = this.user.role;
        document.getElementById('sidebar-avatar').innerText = this.user.name.charAt(0).toUpperCase();

        // Show role-specific elements
        const role = this.user.role;
        
        // Reset classes
        document.body.classList.remove('role-admin', 'role-manager', 'role-head', 'role-employee');
        document.body.classList.add(`role-${role.toLowerCase().replace(' ', '-')}`);

        // Hide/show navigation links
        document.querySelectorAll('.admin-only').forEach(el => {
            role === 'Admin' ? el.classList.remove('hidden') : el.classList.add('hidden');
        });

        document.querySelectorAll('.manager-only').forEach(el => {
            (role === 'Admin' || role === 'Asset Manager') ? el.classList.remove('hidden') : el.classList.add('hidden');
        });

        document.querySelectorAll('.dept-head-only').forEach(el => {
            (role === 'Admin' || role === 'Asset Manager' || role === 'Department Head') ? el.classList.remove('hidden') : el.classList.add('hidden');
        });
    }

    // ==========================================
    // ROUTING ENGINE
    // ==========================================
    route() {
        if (!this.token) return;
        const hash = window.location.hash || '#dashboard';
        const viewId = hash.substring(1);
        
        if (!this.views.includes(viewId)) {
            window.location.hash = '#dashboard';
            return;
        }

        // Hide all views
        document.querySelectorAll('.content-view').forEach(el => el.classList.add('hidden'));
        
        // Show target view
        const targetView = document.getElementById(`${viewId}-view`);
        if (targetView) targetView.classList.remove('hidden');

        // Update nav-menu selection
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navLink = document.getElementById(`nav-${viewId}`);
        if (navLink) navLink.classList.add('active');

        // Set title
        document.getElementById('current-view-title').innerText = navLink.querySelector('span').innerText;

        // Trigger view controller
        this.loadViewController(viewId);
    }

    loadViewController(viewId) {
        switch(viewId) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'assets':
                this.loadAssets();
                break;
            case 'allocations':
                this.loadAllocations();
                break;
            case 'bookings':
                this.loadBookings();
                break;
            case 'maintenance':
                this.loadMaintenance();
                break;
            case 'audits':
                this.loadAudits();
                break;
            case 'org-setup':
                this.loadOrgSetup();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'notifications':
                this.loadNotifications();
                break;
            case 'logs':
                this.loadActivityLogs();
                break;
        }
    }

    // ==========================================
    // DROPDOWNS & DYNAMIC FORM FIELDS
    // ==========================================
    async loadInitialDropdowns() {
        // 1. Load departments
        try {
            const depts = await this.apiCall('/api/org/departments', 'GET');
            const deptSelect = document.getElementById('alloc-dept-select');
            const deptFilter = document.getElementById('audit-dept');
            const deptParentSelect = document.getElementById('dept-parent');
            const bookDeptSelect = document.getElementById('book-dept-select');
            
            if (deptSelect) {
                deptSelect.innerHTML = '<option value="">Select Department</option>';
                depts.forEach(d => {
                    deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
            if (deptFilter) {
                deptFilter.innerHTML = '<option value="">All Departments</option>';
                depts.forEach(d => {
                    deptFilter.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
            if (deptParentSelect) {
                deptParentSelect.innerHTML = '<option value="">No Parent Department</option>';
                depts.forEach(d => {
                    deptParentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
            if (bookDeptSelect) {
                bookDeptSelect.innerHTML = '<option value="">No Department</option>';
                depts.forEach(d => {
                    bookDeptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
        } catch (err) {
            console.warn("Failed to load departments dropdown:", err);
        }

        // 2. Load categories
        try {
            const cats = await this.apiCall('/api/org/categories', 'GET');
            const catSelect = document.getElementById('asset-category');
            const assetFilterCat = document.getElementById('asset-filter-category');
            if (catSelect && assetFilterCat) {
                catSelect.innerHTML = '<option value="" disabled selected>Select Category</option>';
                assetFilterCat.innerHTML = '<option value="">All Categories</option>';
                cats.forEach(c => {
                    catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                    assetFilterCat.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                });
                
                catSelect.addEventListener('change', (e) => {
                    const selectedCat = cats.find(c => c.id == e.target.value);
                    this.renderCustomFieldsInput(selectedCat);
                });
            }
        } catch (err) {
            console.warn("Failed to load categories dropdown:", err);
        }

        // 3. Load users
        try {
            const users = await this.apiCall('/api/auth/users', 'GET');
            const userSelect = document.getElementById('alloc-user-select');
            const auditCreatorSelect = document.getElementById('dept-head');
            const maintTechSelect = document.getElementById('maint-assign-tech');
            
            if (userSelect) {
                userSelect.innerHTML = '<option value="">Select Employee</option>';
                users.forEach(u => {
                    userSelect.innerHTML += `<option value="${u.id}">${u.name} (${u.email})</option>`;
                });
            }
            if (auditCreatorSelect) {
                auditCreatorSelect.innerHTML = '<option value="">No Head Assigned</option>';
                users.forEach(u => {
                    auditCreatorSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`;
                });
            }
            if (maintTechSelect) {
                maintTechSelect.innerHTML = '<option value="">Select Technician</option>';
                users.filter(u => u.role === 'Admin' || u.role === 'Asset Manager').forEach(u => {
                    maintTechSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`;
                });
            }
        } catch (err) {
            console.warn("Failed to load users dropdown:", err);
        }

        // 4. Load assets
        try {
            const assets = await this.apiCall('/api/assets', 'GET');
            const bookAssetSelect = document.getElementById('book-resource-select');
            const maintAssetSelect = document.getElementById('maint-asset-select');
            
            if (bookAssetSelect) {
                bookAssetSelect.innerHTML = '<option value="" disabled selected>Select Resource</option>';
                assets.filter(a => a.shared_bookable).forEach(a => {
                    bookAssetSelect.innerHTML += `<option value="${a.id}">${a.name} [${a.asset_tag}]</option>`;
                });
            }
            if (maintAssetSelect) {
                maintAssetSelect.innerHTML = '<option value="" disabled selected>Select Asset</option>';
                assets.forEach(a => {
                    maintAssetSelect.innerHTML += `<option value="${a.id}">${a.name} [${a.asset_tag}]</option>`;
                });
            }
        } catch (err) {
            console.warn("Failed to load assets dropdown:", err);
        }
    }

    async loadSignupDepartments() {
        try {
            const depts = await this.apiCall('/api/org/departments', 'GET', null, false);
            const signupDeptSelect = document.getElementById('signup-dept');
            if (signupDeptSelect) {
                signupDeptSelect.innerHTML = '<option value="">No Department / Setup Later</option>';
                depts.forEach(d => {
                    signupDeptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                });
            }
        } catch (err) {
            console.error("Signup departments load failed", err);
        }
    }

    // Render custom fields based on category schema fields configuration
    renderCustomFieldsInput(category) {
        const area = document.getElementById('custom-fields-area');
        area.innerHTML = '';
        if (!category || !category.custom_fields) return;

        area.innerHTML = '<h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 mt-2">Category Custom Fields</h4>';
        const fields = category.custom_fields;
        
        for (const [fieldName, fieldType] of Object.entries(fields)) {
            const htmlType = fieldType === 'number' ? 'number' : 'text';
            area.innerHTML += `
                <div class="form-group flex flex-col gap-1.5">
                    <label for="custom-${fieldName}" class="text-xs font-semibold text-slate-500">${fieldName.replace('_', ' ').toUpperCase()}</label>
                    <input type="${htmlType}" id="custom-${fieldName}" data-custom-field="${fieldName}" class="border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none">
                </div>
            `;
        }
    }

    // Photo uploads helper
    setupPhotoUpload(inputId, hiddenUrlId) {
        const input = document.getElementById(inputId);
        const urlInput = document.getElementById(hiddenUrlId);
        
        if (input && urlInput) {
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(`${this.baseUrl}/api/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error('Upload failed');
                    }

                    const result = await response.json();
                    urlInput.value = result.url;
                    this.showToast('Image uploaded successfully', 'success');
                } catch (err) {
                    this.showToast('Failed to upload image', 'error');
                }
            });
        }
    }

    // ==========================================
    // VIEW CONTROLLERS
    // ==========================================

    // VIEW: Dashboard
    async loadDashboard() {
        try {
            const stats = await this.apiCall('/api/dashboard', 'GET');
            document.getElementById('kpi-available').innerText = stats.assets_available;
            document.getElementById('kpi-allocated').innerText = stats.assets_allocated;
            document.getElementById('kpi-maintenance').innerText = stats.maintenance_today;
            document.getElementById('kpi-bookings').innerText = stats.active_bookings;
            document.getElementById('kpi-transfers').innerText = stats.pending_transfers;
            document.getElementById('kpi-upcoming').innerText = stats.upcoming_returns;

            const overdueBanner = document.getElementById('overdue-banner');
            if (stats.overdue_returns > 0) {
                overdueBanner.classList.remove('hidden');
                document.getElementById('overdue-count').innerText = stats.overdue_returns;
            } else {
                overdueBanner.classList.add('hidden');
            }

            // Recent/Upcoming Allocations table
            const allocations = await this.apiCall('/api/allocations', 'GET');
            const tbody = document.querySelector('#dash-returns-table tbody');
            tbody.innerHTML = '';
            
            // Filter only Approved or Overdue allocations
            const activeAllocs = allocations.filter(a => a.status === 'Approved' || a.status === 'Overdue');
            
            if (activeAllocs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">No active allocations</td></tr>';
                return;
            }

            activeAllocs.slice(0, 5).forEach(a => {
                const assetName = a.asset ? a.asset.name : 'Unknown Asset';
                const tag = a.asset ? a.asset.asset_tag : '';
                const holder = a.user ? a.user.name : (a.department ? a.department.name : 'Unassigned');
                const returnDate = a.expected_return_date ? new Date(a.expected_return_date).toLocaleDateString() : 'Indefinite';
                const statusBadge = a.status === 'Overdue' 
                    ? `<span class="status-badge badge-Lost">Overdue</span>` 
                    : `<span class="status-badge badge-Allocated">Active</span>`;

                tbody.innerHTML += `
                    <tr>
                        <td class="p-3"><strong>${assetName}</strong> <span class="tag-badge bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold">${tag}</span></td>
                        <td class="p-3 text-slate-600 font-semibold">${holder}</td>
                        <td class="p-3 text-slate-600 font-semibold">${returnDate}</td>
                        <td class="p-3">${statusBadge}</td>
                    </tr>
                `;
            });

        } catch (err) {
            console.error("Dashboard stats failed to load", err);
        }
    }

    // VIEW: Asset Directory
    async loadAssets() {
        const query = document.getElementById('asset-search-input').value;
        const categoryId = document.getElementById('asset-filter-category').value;
        const status = document.getElementById('asset-filter-status').value;

        let url = `/api/assets?`;
        if (query) url += `query=${encodeURIComponent(query)}&`;
        if (categoryId) url += `category_id=${categoryId}&`;
        if (status) url += `status=${status}&`;

        try {
            const assets = await this.apiCall(url, 'GET');
            const container = document.getElementById('asset-cards-container');
            container.innerHTML = '';

            if (assets.length === 0) {
                container.innerHTML = '<div class="text-center w-full text-slate-400 py-12" style="grid-column: 1/-1;">No assets found.</div>';
                return;
            }

            assets.forEach(a => {
                const isManager = this.user.role === 'Admin' || this.user.role === 'Asset Manager';
                const isAvailable = a.status === 'Available';
                
                let actionBtnHtml = '';
                if (isManager && isAvailable) {
                    actionBtnHtml = `<button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 px-3 rounded-lg shadow-sm flex-1" onclick="app.showAllocateModal(${a.id}, '${a.name}')">Allocate</button>`;
                }

                const photoHtml = a.custom_values && a.custom_values.photo_url
                    ? `<img src="${a.custom_values.photo_url}" alt="${a.name}" class="w-full h-full object-cover">`
                    : `<i class="fa-solid fa-laptop text-slate-300 text-5xl"></i>`;

                const serialText = a.serial_number ? `SN: ${a.serial_number}` : 'No Serial';

                container.innerHTML += `
                    <div class="asset-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                        <div class="w-full h-40 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center pointer" onclick="app.showAssetDetails(${a.id})">
                            ${photoHtml}
                        </div>
                        <div class="flex flex-col gap-1.5 pointer" onclick="app.showAssetDetails(${a.id})">
                            <div class="flex justify-between items-center text-xs font-semibold">
                                <span class="text-slate-400 font-mono font-bold">${a.asset_tag}</span>
                                <span class="status-badge badge-${a.status.replace(' ', '-')}">${a.status}</span>
                            </div>
                            <h3 class="font-heading text-lg font-bold text-slate-800 truncate">${a.name}</h3>
                            <span class="text-xs text-slate-400 font-semibold">${serialText}</span>
                            <div class="flex justify-between items-center text-xs font-semibold text-slate-500 mt-2">
                                <span><i class="fa-solid fa-location-dot text-blue-500 mr-1"></i> ${a.location || 'HQ'}</span>
                                ${a.shared_bookable ? '<span class="status-badge badge-Reserved">Bookable</span>' : ''}
                            </div>
                        </div>
                        <div class="flex gap-3 mt-1.5">
                            ${actionBtnHtml}
                            <button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-2 px-3 rounded-lg flex-1 transition-all" onclick="app.showAssetDetails(${a.id})">History</button>
                        </div>
                    </div>
                `;
            });
        } catch (err) {
            this.showToast('Failed to load assets', 'error');
        }
    }

    // VIEW: Allocations
    async loadAllocations() {
        this.loadActiveAllocations();
        this.loadTransferRequests();
    }

    async loadActiveAllocations() {
        try {
            const allocs = await this.apiCall('/api/allocations', 'GET');
            const tbody = document.querySelector('#allocations-table tbody');
            tbody.innerHTML = '';

            allocs.forEach(a => {
                const isManager = this.user.role === 'Admin' || this.user.role === 'Asset Manager';
                const assetTag = a.asset ? a.asset.asset_tag : '';
                const name = a.asset ? a.asset.name : 'Unknown';
                const holder = a.user ? a.user.name : (a.department ? a.department.name : 'Department');
                const allocator = a.allocated_by ? a.allocated_by.name : 'System';
                const allocDate = new Date(a.allocation_date).toLocaleDateString();
                const returnDate = a.expected_return_date ? new Date(a.expected_return_date).toLocaleDateString() : 'Indefinite';
                
                const isReturned = a.status === 'Returned';
                const badgeClass = isReturned ? 'badge-Available' : (a.status === 'Overdue' ? 'badge-Lost' : (a.status === 'Queued' ? 'badge-Queued' : 'badge-Allocated'));
                
                let returnBtn = '';
                if (isManager && !isReturned && a.status !== 'Queued') {
                    returnBtn = `
                        <button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg transition-all" onclick="app.showReturnModal(${a.id}, '${name}')">
                            <i class="fa-solid fa-arrow-rotate-left mr-1"></i> Return Check-in
                        </button>
                    `;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-mono font-bold text-slate-700">${assetTag}</td>
                        <td class="p-4 font-semibold text-slate-800">${name}</td>
                        <td class="p-4 font-semibold text-slate-600">${holder}</td>
                        <td class="p-4 text-slate-500 font-medium">${allocator}</td>
                        <td class="p-4 text-slate-500 font-medium">${allocDate}</td>
                        <td class="p-4 text-slate-500 font-medium">${returnDate}</td>
                        <td class="p-4"><span class="status-badge ${badgeClass}">${a.status}</span></td>
                        <td class="p-4 manager-only">${returnBtn}</td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    async loadTransferRequests() {
        try {
            const transfers = await this.apiCall('/api/transfers', 'GET');
            const tbody = document.querySelector('#transfers-table tbody');
            tbody.innerHTML = '';

            transfers.forEach(t => {
                const isDeptHead = this.user.role === 'Admin' || this.user.role === 'Asset Manager' || this.user.role === 'Department Head';
                const assetName = t.asset ? `${t.asset.name} (${t.asset.asset_tag})` : 'Unknown';
                const requestedBy = t.requested_by ? t.requested_by.name : 'Unknown';
                const targetHolder = t.target_user ? t.target_user.name : (t.target_department ? t.target_department.name : '-');
                const requestDate = new Date(t.request_date).toLocaleDateString();
                const isPending = t.status === 'Pending';
                
                let actionBtn = '';
                if (isPending && isDeptHead) {
                    actionBtn = `
                        <div class="flex gap-2">
                            <button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 px-3 rounded-lg" onclick="app.processTransfer(${t.id}, true)">Approve</button>
                            <button class="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-1.5 px-3 rounded-lg" onclick="app.processTransfer(${t.id}, false)">Reject</button>
                        </div>
                    `;
                } else if (isPending) {
                    actionBtn = `<span class="text-slate-400 font-semibold text-xs">Awaiting Approval</span>`;
                } else {
                    actionBtn = `<span class="text-slate-500 font-semibold text-xs">${t.status}</span>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-semibold text-slate-800">${assetName}</td>
                        <td class="p-4 font-semibold text-slate-600">${requestedBy}</td>
                        <td class="p-4 font-semibold text-slate-600">${targetHolder}</td>
                        <td class="p-4 text-slate-500 font-medium">${requestDate}</td>
                        <td class="p-4"><span class="status-badge badge-${t.status}">${t.status}</span></td>
                        <td class="p-4">${actionBtn}</td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    // VIEW: Resource Booking
    async loadBookings() {
        try {
            const bookings = await this.apiCall('/api/bookings', 'GET');
            const timeline = document.getElementById('booking-timeline');
            timeline.innerHTML = '';

            // Group bookings by resource (asset_id)
            const grouped = {};
            bookings.forEach(b => {
                if (b.status === 'Cancelled') return;
                const rId = b.asset_id;
                if (!grouped[rId]) {
                    grouped[rId] = {
                        name: b.asset ? b.asset.name : 'Resource',
                        tag: b.asset ? b.asset.asset_tag : '',
                        slots: []
                    };
                }
                grouped[rId].slots.push(b);
            });

            if (Object.keys(grouped).length === 0) {
                timeline.innerHTML = '<div class="text-center py-8 text-slate-400 font-semibold">No reservations recorded. Book a resource to begin.</div>';
                return;
            }

            for (const [rId, resource] of Object.entries(grouped)) {
                let slotsHtml = '';
                
                // Sort slots by start_time
                resource.slots.sort((a,b) => new Date(a.start_time) - new Date(b.start_time));

                resource.slots.forEach(slot => {
                    const start = new Date(slot.start_time);
                    const end = new Date(slot.end_time);
                    const now = new Date();
                    
                    const isOngoing = now >= start && now <= end;
                    const slotStatus = isOngoing ? 'slot-ongoing' : 'slot-upcoming';
                    const booker = slot.user ? slot.user.name : 'Staff';
                    
                    const timeStr = `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                    
                    // Show cancel button if owner or manager
                    let cancelBtn = '';
                    if (slot.user_id === this.user.id || this.user.role === 'Admin' || this.user.role === 'Asset Manager') {
                        cancelBtn = `<i class="fa-solid fa-xmark pointer ml-1.5 hover:text-red-700 transition-colors" onclick="app.cancelBooking(${slot.id})" title="Cancel Booking" style="color: var(--color-lost);"></i>`;
                    }

                    slotsHtml += `
                        <div class="time-slot-badge ${slotStatus}">
                            <i class="fa-solid fa-clock"></i>
                            <span>${timeStr} (Booked by ${booker})</span>
                            ${cancelBtn}
                        </div>
                    `;
                });

                timeline.innerHTML += `
                    <div class="timeline-resource-row pt-4 first:pt-0">
                        <div class="resource-row-title flex justify-between items-center text-sm font-bold text-slate-700 mb-2">
                            <span>${resource.name} <span class="tag-badge bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold">${resource.tag}</span></span>
                        </div>
                        <div class="slots-grid flex flex-wrap gap-2">
                            ${slotsHtml}
                        </div>
                    </div>
                `;
            }
        } catch (err) {
            console.error(err);
        }
    }

    // VIEW: Maintenance Management
    async loadMaintenance() {
        try {
            const requests = await this.apiCall('/api/maintenance', 'GET');
            const tbody = document.querySelector('#maintenance-table tbody');
            tbody.innerHTML = '';

            const isManager = this.user.role === 'Admin' || this.user.role === 'Asset Manager';

            if (requests.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">No maintenance request tickets raised.</td></tr>';
                return;
            }

            requests.forEach(r => {
                const assetName = r.asset ? `${r.asset.name} (${r.asset.asset_tag})` : 'Unknown';
                const raisedBy = r.raised_by ? r.raised_by.name : 'Unknown';
                const requestDate = new Date(r.request_date).toLocaleDateString();
                const tech = r.technician ? r.technician.name : '<span class="text-slate-400">Unassigned</span>';
                
                let actionBtn = '';
                if (isManager) {
                    actionBtn = `
                        <button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg transition-all" onclick="app.showUpdateMaintenanceModal(${r.id}, ${r.technician_id || 'null'}, '${r.status}')">
                            <i class="fa-solid fa-edit"></i> Process
                        </button>
                    `;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-semibold text-slate-800">${assetName}</td>
                        <td class="p-4 font-semibold text-slate-600">${raisedBy}</td>
                        <td class="p-4"><span class="status-badge badge-Lost">${r.priority}</span></td>
                        <td class="p-4 text-slate-500 font-medium">${requestDate}</td>
                        <td class="p-4 text-slate-600 font-medium max-w-xs truncate">${r.description}</td>
                        <td class="p-4"><span class="status-badge badge-${r.status.replace(' ', '-')}">${r.status}</span></td>
                        <td class="p-4 font-semibold text-slate-600">${tech}</td>
                        <td class="p-4">${actionBtn}</td>
                    </tr>
                `;
            });

        } catch (err) {
            console.error(err);
        }
    }

    // VIEW: Audits
    async loadAudits() {
        try {
            const cycles = await this.apiCall('/api/audits', 'GET');
            const tbody = document.querySelector('#audit-cycles-table tbody');
            tbody.innerHTML = '';

            cycles.forEach(c => {
                const scopeDept = c.department ? c.department.name : 'All';
                const scopeLoc = c.location ? c.location : 'All';
                const startDate = new Date(c.start_date).toLocaleDateString();
                const endDate = new Date(c.end_date).toLocaleDateString();
                const isOpen = c.status === 'Open';

                let action = '';
                if (isOpen) {
                    action = `<button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 px-3 rounded-lg" onclick="app.loadAuditSession(${c.id})">Open Auditor Checklist</button>`;
                } else {
                    action = `<button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg" onclick="app.loadAuditSession(${c.id})">View Locked Logs</button>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-bold text-slate-800">${c.name}</td>
                        <td class="p-4 text-slate-500 font-semibold">${startDate}</td>
                        <td class="p-4 text-slate-500 font-semibold">${endDate}</td>
                        <td class="p-4 text-slate-600 font-semibold">Dept: ${scopeDept} / Location: ${scopeLoc}</td>
                        <td class="p-4"><span class="status-badge badge-${c.status}">${c.status}</span></td>
                        <td class="p-4">${action}</td>
                    </tr>
                `;
            });

        } catch (err) {
            console.error(err);
        }
    }

    async loadAuditSession(cycleId) {
        this.currentAuditCycleId = cycleId;
        try {
            const cycles = await this.apiCall('/api/audits', 'GET');
            const cycle = cycles.find(c => c.id === cycleId);
            
            document.getElementById('session-cycle-name').innerText = cycle.name;
            const scopeDept = cycle.department ? cycle.department.name : 'All';
            const scopeLoc = cycle.location ? cycle.location : 'All';
            document.getElementById('session-cycle-scope').innerText = `Scope - Department: ${scopeDept} | Location: ${scopeLoc}`;
            
            // Show close cycle button if open and manager
            const closeBtn = document.getElementById('close-cycle-btn');
            const isManager = this.user.role === 'Admin' || this.user.role === 'Asset Manager';
            
            if (cycle.status === 'Open' && isManager) {
                closeBtn.classList.remove('hidden');
                closeBtn.onclick = () => this.handleCloseAuditCycle(cycleId);
            } else {
                closeBtn.classList.add('hidden');
            }

            const items = await this.apiCall(`/api/audits/${cycleId}/items`, 'GET');
            const tbody = document.querySelector('#audit-items-table tbody');
            tbody.innerHTML = '';

            items.forEach(i => {
                const assetTag = i.asset ? i.asset.asset_tag : '';
                const name = i.asset ? i.asset.name : '';
                const serial = i.asset && i.asset.serial_number ? i.asset.serial_number : '-';
                const condition = i.asset ? i.asset.condition : '';
                const assetStatus = i.asset ? i.asset.status : '';
                
                let checkBtnHtml = '';
                if (cycle.status === 'Open') {
                    checkBtnHtml = `
                        <div class="flex gap-1.5">
                            <button class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1.5 px-2.5 rounded-lg flex items-center justify-center" onclick="app.verifyAuditItem(${i.id}, 'Verified')" title="Mark Verified"><i class="fa-solid fa-check"></i></button>
                            <button class="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs py-1.5 px-2.5 rounded-lg flex items-center justify-center" onclick="app.verifyAuditItem(${i.id}, 'Damaged')" title="Mark Damaged"><i class="fa-solid fa-triangle-exclamation"></i></button>
                            <button class="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-1.5 px-2.5 rounded-lg flex items-center justify-center" onclick="app.verifyAuditItem(${i.id}, 'Missing')" title="Mark Missing"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    `;
                } else {
                    checkBtnHtml = `<span class="text-slate-400 font-semibold text-xs">Cycle Closed</span>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-mono font-bold text-slate-700">${assetTag}</td>
                        <td class="p-4 font-semibold text-slate-800">${name}</td>
                        <td class="p-4 font-semibold text-slate-500">${serial}</td>
                        <td class="p-4 font-semibold text-slate-600">${condition}</td>
                        <td class="p-4"><span class="status-badge badge-${assetStatus.replace(' ', '-')}">${assetStatus}</span></td>
                        <td class="p-4"><span class="status-badge badge-${i.status}">${i.status}</span></td>
                        <td class="p-4">
                            <input type="text" id="item-notes-${i.id}" value="${i.notes || ''}" placeholder="Auditor notes..." class="border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-700 focus:outline-none w-full" ${cycle.status === 'Closed' ? 'disabled' : ''} onblur="app.updateAuditItemNotes(${i.id})">
                        </td>
                        <td class="p-4">${checkBtnHtml}</td>
                    </tr>
                `;
            });

            // Toggle subview to Audit Items checklist
            this.toggleAuditSubView('audit-items');
            document.getElementById('audit-items-tab').classList.remove('hidden');

        } catch (err) {
            this.showToast('Failed to load audit items', 'error');
        }
    }

    async verifyAuditItem(itemId, status) {
        const notes = document.getElementById(`item-notes-${itemId}`).value;
        try {
            await this.apiCall(`/api/audits/items/${itemId}`, 'PUT', { status, notes });
            this.showToast(`Asset marked: ${status}`, 'success');
            this.loadAuditSession(this.currentAuditCycleId);
        } catch (err) {
            this.showToast('Verification failed', 'error');
        }
    }

    async updateAuditItemNotes(itemId) {
        const notes = document.getElementById(`item-notes-${itemId}`).value;
        try {
            await this.apiCall(`/api/audits/items/${itemId}`, 'PUT', { status: 'Unchecked', notes });
        } catch (err) {}
    }

    // VIEW: Org Setup
    async loadOrgSetup() {
        this.loadDepartments();
        this.loadCategories();
        this.loadEmployees();
    }

    async loadDepartments() {
        try {
            const depts = await this.apiCall('/api/org/departments', 'GET');
            const tbody = document.querySelector('#departments-table tbody');
            tbody.innerHTML = '';

            depts.forEach(d => {
                const head = d.head ? d.head.name : '<span class="text-slate-400">Unassigned</span>';
                const parent = d.parent_id ? depts.find(p => p.id === d.parent_id)?.name || '-' : '-';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-bold text-slate-800">${d.name}</td>
                        <td class="p-4 font-semibold text-slate-600">${head}</td>
                        <td class="p-4 font-semibold text-slate-500">${parent}</td>
                        <td class="p-4"><span class="status-badge badge-Available">${d.status}</span></td>
                        <td class="p-4">
                            <button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg transition-all" onclick="app.showEditDeptModal(${d.id}, '${d.name}', ${d.head_id || 'null'}, ${d.parent_id || 'null'})">Edit</button>
                        </td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    async loadCategories() {
        try {
            const cats = await this.apiCall('/api/org/categories', 'GET');
            const tbody = document.querySelector('#categories-table tbody');
            tbody.innerHTML = '';

            cats.forEach(c => {
                const fields = c.custom_fields 
                    ? Object.entries(c.custom_fields).map(([k,v]) => `${k} (${v})`).join(', ')
                    : 'None';
                const customFieldsJson = JSON.stringify(c.custom_fields || {});
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-bold text-slate-800">${c.name}</td>
                        <td class="p-4 text-slate-500 font-semibold">${fields}</td>
                        <td class="p-4">
                            <button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg transition-all" onclick="app.showEditCategoryModal(${c.id}, '${c.name}', '${customFieldsJson.replace(/'/g, "\\'")}')">Edit</button>
                        </td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    async loadEmployees() {
        try {
            const users = await this.apiCall('/api/auth/users', 'GET');
            const depts = await this.apiCall('/api/org/departments', 'GET');
            const tbody = document.querySelector('#employees-table tbody');
            tbody.innerHTML = '';

            users.forEach(u => {
                const deptName = u.department_id ? depts.find(d => d.id === u.department_id)?.name || 'Unassigned' : 'Unassigned';
                const isMe = u.id === this.user.id;
                
                let selectHtml = '';
                if (!isMe) {
                    selectHtml = `
                        <select onchange="app.promoteEmployee(${u.id}, this.value)" class="border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-700 bg-white focus:outline-none cursor-pointer">
                            <option value="Employee" ${u.role === 'Employee' ? 'selected' : ''}>Employee</option>
                            <option value="Department Head" ${u.role === 'Department Head' ? 'selected' : ''}>Dept Head</option>
                            <option value="Asset Manager" ${u.role === 'Asset Manager' ? 'selected' : ''}>Asset Manager</option>
                            <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    `;
                } else {
                    selectHtml = `<span class="text-slate-400 font-semibold text-xs">Self (Locked)</span>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 font-bold text-slate-800">${u.name}</td>
                        <td class="p-4 text-slate-500 font-semibold">${u.email}</td>
                        <td class="p-4 font-semibold text-slate-600">${deptName}</td>
                        <td class="p-4"><span class="status-badge badge-Allocated">${u.role}</span></td>
                        <td class="p-4"><span class="status-badge badge-Available">${u.status}</span></td>
                        <td class="p-4">${selectHtml}</td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    async promoteEmployee(userId, newRole) {
        try {
            await this.apiCall(`/api/auth/users/${userId}`, 'PUT', { role: newRole });
            this.showToast('User role updated successfully', 'success');
            this.loadEmployees();
        } catch (err) {
            this.showToast('Failed to promote user', 'error');
        }
    }

    // VIEW: Reports & Analytics
    async loadReports() {
        try {
            const data = await this.apiCall('/api/reports', 'GET');
            
            // Render Utilization Chart (Bar style)
            const util = data.utilization;
            const utilizationMock = document.getElementById('chart-utilization');
            utilizationMock.innerHTML = '';
            
            for (const [status, val] of Object.entries(util)) {
                const max = Math.max(...Object.values(util)) || 10;
                const percent = (val / max) * 100;
                utilizationMock.innerHTML += `
                    <div class="chart-bar-container">
                        <span class="chart-bar-value">${val}</span>
                        <div class="chart-bar" style="height: ${percent}%;"></div>
                        <span class="chart-bar-label">${status}</span>
                    </div>
                `;
            }

            // Render Maintenance by Category Chart
            const maint = data.maintenance_by_category;
            const maintMock = document.getElementById('chart-maintenance');
            maintMock.innerHTML = '';
            
            if (Object.keys(maint).length === 0) {
                maintMock.innerHTML = '<span style="margin:auto; color:#94a3b8; font-weight:600; font-size:0.8rem;">No records</span>';
            } else {
                for (const [cat, val] of Object.entries(maint)) {
                    const max = Math.max(...Object.values(maint)) || 10;
                    const percent = (val / max) * 100;
                    maintMock.innerHTML += `
                        <div class="chart-bar-container">
                            <span class="chart-bar-value">${val}</span>
                            <div class="chart-bar" style="height: ${percent}%; background:linear-gradient(135deg, #f97316 0%, #c2410c 100%);"></div>
                            <span class="chart-bar-label">${cat}</span>
                        </div>
                    `;
                }
            }

            // Render Department Allocation Chart
            const depts = data.allocations_by_department;
            const deptMock = document.getElementById('chart-departments');
            deptMock.innerHTML = '';
            
            if (Object.keys(depts).length === 0) {
                deptMock.innerHTML = '<span style="margin:auto; color:#94a3b8; font-weight:600; font-size:0.8rem;">No allocations</span>';
            } else {
                for (const [dept, val] of Object.entries(depts)) {
                    const max = Math.max(...Object.values(depts)) || 10;
                    const percent = (val / max) * 100;
                    deptMock.innerHTML += `
                        <div class="chart-bar-container">
                            <span class="chart-bar-value">${val}</span>
                            <div class="chart-bar" style="height: ${percent}%; background:linear-gradient(135deg, #10b981 0%, #047857 100%);"></div>
                            <span class="chart-bar-label">${dept}</span>
                        </div>
                    `;
                }
            }

            // Booking heat map list
            const heatmap = data.booking_hourly_heatmap;
            const heatmapMock = document.getElementById('chart-heatmap');
            heatmapMock.innerHTML = '';
            
            const maxVal = Math.max(...heatmap) || 1;
            const activeHours = [];
            
            heatmap.forEach((val, hr) => {
                if (val > 0) {
                    activeHours.push({ hr, val });
                }
            });

            if (activeHours.length === 0) {
                heatmapMock.innerHTML = '<span style="margin:auto; color:#94a3b8; font-weight:600; font-size:0.8rem;">No booking hours logged</span>';
            } else {
                activeHours.forEach(item => {
                    const percent = (item.val / maxVal) * 100;
                    heatmapMock.innerHTML += `
                        <div class="chart-bar-container">
                            <span class="chart-bar-value">${item.val}</span>
                            <div class="chart-bar" style="height: ${percent}%; background:linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);"></div>
                            <span class="chart-bar-label">${item.hr}:00</span>
                        </div>
                    `;
                });
            }

            // Render retirement and maintenance table list
            const assets = await this.apiCall('/api/assets', 'GET');
            const tableBody = document.querySelector('#retirement-maintenance-table tbody');
            if (tableBody) {
                tableBody.innerHTML = '';
                const flagged = [];
                const now = new Date();
                
                assets.forEach(a => {
                    let isFlagged = false;
                    let reason = '';
                    
                    if (a.condition === 'Damaged') {
                        isFlagged = true;
                        reason = 'Condition is Damaged (requires repair request)';
                    } else if (a.acquisition_date) {
                        const acqDate = new Date(a.acquisition_date);
                        const diffMonths = (now.getFullYear() - acqDate.getFullYear()) * 12 + (now.getMonth() - acqDate.getMonth());
                        if (diffMonths >= 36) {
                            isFlagged = true;
                            reason = `Asset age is ${diffMonths} months (nearing standard 3-year retirement lifecycle)`;
                        }
                    }
                    
                    if (isFlagged) {
                        flagged.push({ asset: a, reason });
                    }
                });
                
                if (flagged.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400 font-semibold">No assets currently nearing retirement or requiring repair.</td></tr>';
                } else {
                    flagged.forEach(item => {
                        const a = item.asset;
                        const acqStr = a.acquisition_date ? new Date(a.acquisition_date).toLocaleDateString() : '-';
                        tableBody.innerHTML += `
                            <tr class="hover:bg-slate-50/50">
                                <td class="p-3 font-semibold text-slate-800">${a.name} <span class="tag-badge bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold">${a.asset_tag}</span></td>
                                <td class="p-3 font-semibold text-slate-600">${a.category ? a.category.name : '-'}</td>
                                <td class="p-3 text-slate-500 font-medium">${acqStr}</td>
                                <td class="p-3"><span class="status-badge badge-Lost">${a.condition}</span></td>
                                <td class="p-3"><span class="status-badge badge-${a.status.replace(' ', '-')}">${a.status}</span></td>
                                <td class="p-3 text-slate-500 font-semibold text-xs">${item.reason}</td>
                            </tr>
                        `;
                    });
                }
            }

        } catch (err) {
            console.error(err);
        }
    }

    async exportReportsCSV() {
        try {
            const data = await this.apiCall('/api/reports', 'GET');
            let csvContent = "data:text/csv;charset=utf-8,";
            
            // Section 1: Utilization
            csvContent += "ASSET UTILIZATION REPORT\r\nStatus,Count\r\n";
            for (const [status, val] of Object.entries(data.utilization)) {
                csvContent += `${status},${val}\r\n`;
            }
            csvContent += "\r\n";

            // Section 2: Maintenance
            csvContent += "MAINTENANCE REQUEST FREQUENCY\r\nCategory,Tickets Count\r\n";
            for (const [cat, val] of Object.entries(data.maintenance_by_category)) {
                csvContent += `${cat},${val}\r\n`;
            }
            csvContent += "\r\n";

            // Section 3: Department-wise
            csvContent += "DEPARTMENT ALLOCATIONS SUMMARY\r\nDepartment,Allocated Assets\r\n";
            for (const [dept, val] of Object.entries(data.allocations_by_department)) {
                csvContent += `${dept},${val}\r\n`;
            }

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `assetflow_report_${new Date().toISOString().substring(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showToast('CSV Exported successfully', 'success');
        } catch (err) {
            this.showToast('Failed to export reports CSV', 'error');
        }
    }

    // VIEW: Notifications
    async loadNotifications() {
        try {
            const notifs = await this.apiCall('/api/notifications', 'GET');
            const container = document.getElementById('notifications-container');
            container.innerHTML = '';

            if (notifs.length === 0) {
                container.innerHTML = '<div class="text-center py-6 text-slate-400 font-semibold">No notifications.</div>';
                return;
            }

            // Update badge count
            const unread = notifs.filter(n => !n.is_read);
            const badge = document.getElementById('notif-badge');
            if (badge) {
                if (unread.length > 0) {
                    badge.classList.remove('hidden');
                    badge.innerText = unread.length;
                } else {
                    badge.classList.add('hidden');
                }
            }

            notifs.forEach(n => {
                const isUnread = !n.is_read;
                const time = new Date(n.created_at).toLocaleString();
                
                const readAction = isUnread 
                    ? `<button class="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-1 px-3 rounded-lg transition-all" onclick="app.markNotificationRead(${n.id})">Mark Read</button>`
                    : '';

                container.innerHTML += `
                    <div class="notif-item p-4 rounded-xl border border-slate-200 bg-white flex gap-4 items-center transition-all ${isUnread ? 'border-l-4 border-l-blue-600 bg-blue-50/10' : ''}">
                        <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><i class="fa-solid fa-bell"></i></div>
                        <div class="flex-1">
                            <div class="text-sm font-semibold text-slate-800">${n.message}</div>
                            <div class="text-slate-400 text-xxs font-semibold mt-0.5">${time}</div>
                        </div>
                        ${readAction}
                    </div>
                `;
            });

        } catch (err) {
            console.error(err);
        }
    }

    async markNotificationRead(id) {
        try {
            await this.apiCall(`/api/notifications/${id}/read`, 'POST');
            this.loadNotifications();
        } catch (err) {
            console.error(err);
        }
    }

    // VIEW: Activity Logs
    async loadActivityLogs() {
        try {
            const logs = await this.apiCall('/api/logs', 'GET');
            const tbody = document.querySelector('#logs-table tbody');
            tbody.innerHTML = '';

            logs.forEach(l => {
                const user = l.user ? l.user.name : 'Guest';
                const time = new Date(l.created_at).toLocaleString();
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="p-4 text-slate-500 font-semibold">${time}</td>
                        <td class="p-4 font-bold text-slate-800">${user}</td>
                        <td class="p-4 font-semibold text-slate-700">${l.action}</td>
                        <td class="p-4 text-slate-600 font-medium">${l.details || '-'}</td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error(err);
        }
    }

    // ==========================================
    // ACTION SUBMIT FLOWS
    // ==========================================
    
    // ACTION: Register Asset
    async handleRegisterAsset(e) {
        e.preventDefault();
        const name = document.getElementById('asset-name').value;
        const category_id = parseInt(document.getElementById('asset-category').value);
        const serial_number = document.getElementById('asset-serial').value || null;
        const costVal = document.getElementById('asset-cost').value;
        const acquisition_cost = costVal ? parseFloat(costVal) : 0.0;
        const dateVal = document.getElementById('asset-date').value;
        const acquisition_date = dateVal ? new Date(dateVal).toISOString() : null;
        const location = document.getElementById('asset-location').value || null;
        const condition = document.getElementById('asset-condition').value;
        const shared_bookable = document.getElementById('asset-bookable').checked;

        // Custom fields collector
        const custom_values = {};
        const customFieldInputs = document.querySelectorAll('#custom-fields-area input');
        customFieldInputs.forEach(input => {
            const name = input.getAttribute('data-custom-field');
            const value = input.value;
            custom_values[name] = input.type === 'number' ? parseFloat(value) : value;
        });

        // Add photo url if uploaded
        const photoUrl = document.getElementById('asset-photo-url').value;
        if (photoUrl) {
            custom_values['photo_url'] = photoUrl;
        }

        try {
            await this.apiCall('/api/assets', 'POST', {
                name, category_id, serial_number, acquisition_cost, acquisition_date,
                location, condition, shared_bookable, custom_values
            });
            this.showToast('Asset registered successfully', 'success');
            this.closeModal('register-asset-modal');
            document.getElementById('register-asset-form').reset();
            document.getElementById('custom-fields-area').innerHTML = '';
            this.loadAssets();
        } catch (err) {
            this.showToast(err.detail || 'Asset registration failed', 'error');
        }
    }

    // Modal allocator displays
    showAllocateModal(assetId, assetName) {
        document.getElementById('alloc-asset-id').value = assetId;
        document.getElementById('alloc-asset-name').value = assetName;
        this.showModal('allocate-asset-modal');
    }

    toggleAllocTarget(targetType) {
        if (targetType === 'user') {
            document.getElementById('alloc-user-group').classList.remove('hidden');
            document.getElementById('alloc-dept-group').classList.add('hidden');
        } else {
            document.getElementById('alloc-user-group').classList.add('hidden');
            document.getElementById('alloc-dept-group').classList.remove('hidden');
        }
    }

    // ACTION: Allocate Asset
    async handleAllocateAsset(e) {
        e.preventDefault();
        const asset_id = parseInt(document.getElementById('alloc-asset-id').value);
        const type = document.getElementById('alloc-target-type').value;
        
        let user_id = null;
        let department_id = null;
        if (type === 'user') {
            const userVal = document.getElementById('alloc-user-select').value;
            if (!userVal) {
                this.showToast('Please select an employee', 'error');
                return;
            }
            user_id = parseInt(userVal);
        } else {
            const deptVal = document.getElementById('alloc-dept-select').value;
            if (!deptVal) {
                this.showToast('Please select a department', 'error');
                return;
            }
            department_id = parseInt(deptVal);
        }

        const returnDateVal = document.getElementById('alloc-return-date').value;
        const expected_return_date = returnDateVal ? new Date(returnDateVal).toISOString() : null;

        try {
            await this.apiCall('/api/allocations', 'POST', {
                asset_id, user_id, department_id, expected_return_date
            });
            this.showToast('Asset allocated successfully', 'success');
            this.closeModal('allocate-asset-modal');
            this.loadAssets();
        } catch (err) {
            // Check if conflict returned and offer transfer
            if (err.detail && err.detail.includes('Currently held by')) {
                this.showConflictModal(asset_id, err.detail);
            } else {
                this.showToast(err.detail || 'Allocation failed', 'error');
            }
        }
    }

    showConflictModal(assetId, message) {
        this.closeModal('allocate-asset-modal');
        
        // Custom overlay popup for conflict
        const userConfirm = confirm(`${message}\n\nWould you like to raise a Direct Transfer Request to get this asset?`);
        if (userConfirm) {
            this.requestDirectTransfer(assetId);
        }
    }

    async requestDirectTransfer(assetId) {
        try {
            await this.apiCall('/api/transfers', 'POST', { asset_id: assetId });
            this.showToast('Transfer request submitted successfully. Awaiting Manager/Head approval.', 'success');
        } catch (err) {
            this.showToast(err.detail || 'Transfer request failed', 'error');
        }
    }

    // Modal return check-in displays
    showReturnModal(allocId, assetName) {
        document.getElementById('return-alloc-id').value = allocId;
        document.getElementById('return-asset-name').value = assetName;
        this.showModal('return-asset-modal');
    }

    // ACTION: Return check-in
    async handleReturnAsset(e) {
        e.preventDefault();
        const allocId = parseInt(document.getElementById('return-alloc-id').value);
        const check_in_notes = document.getElementById('return-notes').value;
        const condition = document.getElementById('return-condition').value;

        try {
            // Fetch asset ID from allocation
            const allocations = await this.apiCall('/api/allocations', 'GET');
            const alloc = allocations.find(a => a.id === allocId);
            
            // 1. Process return check-in
            await this.apiCall(`/api/allocations/${allocId}/return`, 'POST', { check_in_notes });
            
            // 2. Update condition in asset record
            if (alloc && alloc.asset_id) {
                await this.apiCall(`/api/assets/${alloc.asset_id}`, 'PUT', { condition });
            }
            
            this.showToast('Asset return check-in completed', 'success');
            this.closeModal('return-asset-modal');
            document.getElementById('return-asset-form').reset();
            this.loadAllocations();
        } catch (err) {
            this.showToast(err.detail || 'Return check-in failed', 'error');
        }
    }

    // ACTION: Process Transfer requests
    async processTransfer(transferId, approve) {
        try {
            await this.apiCall(`/api/transfers/${transferId}/process?approve=${approve}`, 'POST');
            this.showToast(approve ? 'Transfer request approved' : 'Transfer request rejected', 'success');
            this.loadTransferRequests();
        } catch (err) {
            this.showToast(err.detail || 'Failed to process transfer request', 'error');
        }
    }

    // ACTION: Book shared resource
    async handleBookResource(e) {
        e.preventDefault();
        const assetIdVal = document.getElementById('book-resource-select').value;
        if (!assetIdVal) {
            this.showToast('Please select a resource', 'error');
            return;
        }
        const asset_id = parseInt(assetIdVal);
        const start_time = new Date(document.getElementById('book-start-time').value).toISOString();
        const end_time = new Date(document.getElementById('book-end-time').value).toISOString();
        
        const deptVal = document.getElementById('book-dept-select').value;
        const department_id = deptVal ? parseInt(deptVal) : null;

        try {
            await this.apiCall('/api/bookings', 'POST', { asset_id, start_time, end_time, department_id });
            this.showToast('Resource booked successfully', 'success');
            document.getElementById('booking-form').reset();
            this.loadBookings();
        } catch (err) {
            this.showToast(err.detail || 'Booking overlap conflict', 'error');
        }
    }

    async cancelBooking(bookingId) {
        const confirmCancel = confirm('Are you sure you want to cancel this booking reservation?');
        if (!confirmCancel) return;

        try {
            await this.apiCall(`/api/bookings/${bookingId}`, 'DELETE');
            this.showToast('Booking reservation cancelled', 'success');
            this.loadBookings();
        } catch (err) {
            this.showToast(err.detail || 'Cancellation failed', 'error');
        }
    }

    // ACTION: Raise Maintenance Request
    async handleRaiseMaintenance(e) {
        e.preventDefault();
        const asset_id = parseInt(document.getElementById('maint-asset-select').value);
        const priority = document.getElementById('maint-priority').value;
        const description = document.getElementById('maint-desc').value;

        // Custom image upload support
        const photoUrl = document.getElementById('maint-photo-url').value;

        try {
            const ticket = await this.apiCall('/api/maintenance', 'POST', { asset_id, priority, description });
            
            // Update ticket with photo url in notes/details if uploaded
            if (photoUrl) {
                await this.apiCall(`/api/maintenance/${ticket.id}`, 'PUT', { notes: `Photo attachment: ${photoUrl}` });
            }
            
            this.showToast('Repair request ticket submitted successfully', 'success');
            this.closeModal('maintenance-request-modal');
            document.getElementById('maintenance-request-form').reset();
            this.loadViewController(window.location.hash.substring(1));
        } catch (err) {
            this.showToast(err.detail || 'Failed to submit maintenance ticket', 'error');
        }
    }

    // Modal Maintenance Displays
    showUpdateMaintenanceModal(ticketId, currentTechId, currentStatus) {
        document.getElementById('maint-ticket-id').value = ticketId;
        document.getElementById('maint-assign-tech').value = currentTechId || '';
        document.getElementById('maint-status-select').value = currentStatus;
        this.showModal('update-maintenance-modal');
    }

    // ACTION: Process Maintenance Tickets
    async handleUpdateMaintenance(e) {
        e.preventDefault();
        const req_id = parseInt(document.getElementById('maint-ticket-id').value);
        const techVal = document.getElementById('maint-assign-tech').value;
        const technician_id = techVal ? parseInt(techVal) : null;
        const status = document.getElementById('maint-status-select').value;
        const notes = document.getElementById('maint-notes').value;

        try {
            await this.apiCall(`/api/maintenance/${req_id}`, 'PUT', { technician_id, status, notes });
            this.showToast('Maintenance ticket updated successfully', 'success');
            this.closeModal('update-maintenance-modal');
            document.getElementById('update-maintenance-form').reset();
            this.loadMaintenance();
        } catch (err) {
            this.showToast(err.detail || 'Update ticket failed', 'error');
        }
    }

    // ACTION: Create Audit Cycle
    async handleCreateAudit(e) {
        e.preventDefault();
        const name = document.getElementById('audit-name').value;
        const deptVal = document.getElementById('audit-dept').value;
        const department_id = deptVal ? parseInt(deptVal) : null;
        const location = document.getElementById('audit-location').value || null;
        const start_date = new Date(document.getElementById('audit-start').value).toISOString();
        const end_date = new Date(document.getElementById('audit-end').value).toISOString();

        try {
            await this.apiCall('/api/audits', 'POST', { name, department_id, location, start_date, end_date });
            this.showToast('Audit Cycle initialized successfully', 'success');
            this.closeModal('create-audit-modal');
            document.getElementById('create-audit-form').reset();
            this.loadAudits();
        } catch (err) {
            this.showToast(err.detail || 'Initialization failed', 'error');
        }
    }

    // ACTION: Close Audit Cycle
    async handleCloseAuditCycle(cycleId) {
        const doubleCheck = confirm('Close Audit Cycle? This locks results and flags missing assets as LOST. This action cannot be undone.');
        if (!doubleCheck) return;

        try {
            await this.apiCall(`/api/audits/${cycleId}/close`, 'POST');
            this.showToast('Audit cycle closed and committed', 'success');
            this.loadAudits();
            this.toggleAuditSubView('audit-cycles');
        } catch (err) {
            this.showToast(err.detail || 'Failed to close cycle', 'error');
        }
    }

    // ACTION: Create Department
    async handleCreateDepartment(e) {
        e.preventDefault();
        const name = document.getElementById('dept-name').value;
        const headVal = document.getElementById('dept-head').value;
        const head_id = headVal ? parseInt(headVal) : null;
        const parentVal = document.getElementById('dept-parent').value;
        const parent_id = parentVal ? parseInt(parentVal) : null;

        try {
            await this.apiCall('/api/org/departments', 'POST', { name, head_id, parent_id });
            this.showToast('Department created successfully', 'success');
            this.closeModal('create-department-modal');
            document.getElementById('create-department-form').reset();
            this.loadOrgSetup();
            this.loadInitialDropdowns(); // refresh dropdown caches
        } catch (err) {
            this.showToast(err.detail || 'Creation failed', 'error');
        }
    }

    // ACTION: Create Category
    async handleCreateCategory(e) {
        e.preventDefault();
        const name = document.getElementById('cat-name').value;
        
        // Compile Schema fields config
        const custom_fields = {};
        const fieldRows = document.querySelectorAll('.field-schema-row');
        fieldRows.forEach(row => {
            const key = row.querySelector('.schema-field-key').value.trim().toLowerCase().replace(' ', '_');
            const type = row.querySelector('.schema-field-type').value;
            if (key) {
                custom_fields[key] = type;
            }
        });

        try {
            await this.apiCall('/api/org/categories', 'POST', { name, custom_fields });
            this.showToast('Category created successfully', 'success');
            this.closeModal('create-category-modal');
            document.getElementById('create-category-form').reset();
            document.getElementById('custom-fields-builder').innerHTML = '';
            this.loadOrgSetup();
            this.loadInitialDropdowns(); // refresh dropdown caches
        } catch (err) {
            this.showToast(err.detail || 'Creation failed', 'error');
        }
    }

    addSchemaFieldRow() {
        const builder = document.getElementById('custom-fields-builder');
        const row = document.createElement('div');
        row.className = 'field-schema-row mt-2 flex gap-2';
        row.innerHTML = `
            <input type="text" class="schema-field-key border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" placeholder="Field name (e.g. warranty_months)" required style="flex:2;">
            <select class="schema-field-type bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" style="flex:1; min-width:auto;">
                <option value="text">Text</option>
                <option value="number">Number</option>
            </select>
            <button type="button" class="btn bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold p-1.5 w-8 h-8 rounded-lg flex items-center justify-center" onclick="this.parentElement.remove()">&times;</button>
        `;
        builder.appendChild(row);
    }

    showForgotPasswordModal(e) {
        e.preventDefault();
        this.showModal('forgot-password-modal');
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        try {
            const result = await this.apiCall('/api/auth/forgot-password', 'POST', { email }, false);
            this.showToast(result.message, 'success');
            this.closeModal('forgot-password-modal');
        } catch (err) {
            this.showToast(err.detail || 'Reset request failed', 'error');
        }
    }

    showEditCategoryModal(catId, name, customFieldsJson) {
        document.getElementById('edit-cat-id').value = catId;
        document.getElementById('edit-cat-name').value = name;
        
        const builder = document.getElementById('edit-custom-fields-builder');
        builder.innerHTML = '';
        
        const customFields = JSON.parse(customFieldsJson);
        for (const [key, type] of Object.entries(customFields)) {
            const row = document.createElement('div');
            row.className = 'field-schema-row mt-2 flex gap-2';
            row.innerHTML = `
                <input type="text" class="schema-field-key border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" value="${key}" required style="flex:2;">
                <select class="schema-field-type bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" style="flex:1; min-width:auto;">
                    <option value="text" ${type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="number" ${type === 'number' ? 'selected' : ''}>Number</option>
                </select>
                <button type="button" class="btn bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold p-1.5 w-8 h-8 rounded-lg flex items-center justify-center" onclick="this.parentElement.remove()">&times;</button>
            `;
            builder.appendChild(row);
        }
        this.showModal('edit-category-modal');
    }

    addEditSchemaFieldRow() {
        const builder = document.getElementById('edit-custom-fields-builder');
        const row = document.createElement('div');
        row.className = 'field-schema-row mt-2 flex gap-2';
        row.innerHTML = `
            <input type="text" class="schema-field-key border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" placeholder="Field name" required style="flex:2;">
            <select class="schema-field-type bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none" style="flex:1; min-width:auto;">
                <option value="text">Text</option>
                <option value="number">Number</option>
            </select>
            <button type="button" class="btn bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold p-1.5 w-8 h-8 rounded-lg flex items-center justify-center" onclick="this.parentElement.remove()">&times;</button>
        `;
        builder.appendChild(row);
    }

    async handleUpdateCategory(e) {
        e.preventDefault();
        const catId = parseInt(document.getElementById('edit-cat-id').value);
        const name = document.getElementById('edit-cat-name').value;
        
        const custom_fields = {};
        const fieldRows = document.querySelectorAll('#edit-custom-fields-builder .field-schema-row');
        fieldRows.forEach(row => {
            const key = row.querySelector('.schema-field-key').value.trim().toLowerCase().replace(' ', '_');
            const type = row.querySelector('.schema-field-type').value;
            if (key) {
                custom_fields[key] = type;
            }
        });

        try {
            await this.apiCall(`/api/org/categories/${catId}`, 'PUT', { name, custom_fields });
            this.showToast('Category updated successfully', 'success');
            this.closeModal('edit-category-modal');
            this.loadOrgSetup();
            this.loadInitialDropdowns();
        } catch (err) {
            this.showToast(err.detail || 'Category update failed', 'error');
        }
    }

    // ==========================================
    // DETAILS MODAL & HISTORIES
    // ==========================================
    async showAssetDetails(assetId) {
        try {
            const asset = await this.apiCall(`/api/assets/${assetId}`, 'GET');
            const history = await this.apiCall(`/api/assets/${assetId}/history`, 'GET');

            // Set Meta info
            document.getElementById('detail-asset-name').innerText = asset.name;
            document.getElementById('detail-asset-tag').innerText = asset.asset_tag;
            document.getElementById('detail-asset-serial').innerText = asset.serial_number ? `SN: ${asset.serial_number}` : 'SN: -';
            
            const statusEl = document.getElementById('detail-asset-status');
            statusEl.className = `status-badge badge-${asset.status.replace(' ', '-')}`;
            statusEl.innerText = asset.status;

            document.getElementById('detail-asset-cat').innerText = asset.category ? asset.category.name : '-';
            document.getElementById('detail-asset-condition').innerText = asset.condition;
            document.getElementById('detail-asset-location').innerText = asset.location || 'HQ';
            document.getElementById('detail-asset-cost').innerText = `$${asset.acquisition_cost.toFixed(2)}`;
            document.getElementById('detail-asset-date').innerText = asset.acquisition_date ? new Date(asset.acquisition_date).toLocaleDateString() : '-';

            // Set QR code mockup
            document.getElementById('detail-asset-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${asset.asset_tag}`;

            // Custom photo
            const imgEl = document.getElementById('detail-asset-photo');
            const placeholderEl = document.getElementById('detail-asset-photo-placeholder');
            if (asset.custom_values && asset.custom_values.photo_url) {
                imgEl.src = asset.custom_values.photo_url;
                imgEl.classList.remove('hidden');
                placeholderEl.classList.add('hidden');
            } else {
                imgEl.classList.add('hidden');
                placeholderEl.classList.remove('hidden');
            }

            // Custom fields list render
            const customBox = document.getElementById('detail-custom-fields');
            const customList = document.getElementById('detail-custom-fields-list');
            customList.innerHTML = '';
            
            if (asset.custom_values) {
                let hasCustomKeys = false;
                for (const [k, v] of Object.entries(asset.custom_values)) {
                    if (k === 'photo_url') continue;
                    hasCustomKeys = true;
                    customList.innerHTML += `<div><strong>${k.replace('_', ' ').toUpperCase()}:</strong> ${v}</div>`;
                }
                if (hasCustomKeys) {
                    customBox.classList.remove('hidden');
                } else {
                    customBox.classList.add('hidden');
                }
            } else {
                customBox.classList.add('hidden');
            }

            // Load Allocation History Timeline
            const allocTimeline = document.getElementById('alloc-history-timeline');
            allocTimeline.innerHTML = '';
            if (history.allocations.length === 0) {
                allocTimeline.innerHTML = '<li class="p-2 text-slate-400 text-xs font-semibold">No allocation history recorded.</li>';
            } else {
                history.allocations.forEach(a => {
                    const holderName = a.user ? a.user.name : (a.department ? a.department.name : 'Unknown');
                    const returnDate = a.actual_return_date ? `Returned: ${new Date(a.actual_return_date).toLocaleDateString()}` : 'In Possession';
                    allocTimeline.innerHTML += `
                        <li class="timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <div class="timeline-date">${new Date(a.allocation_date).toLocaleDateString()}</div>
                                <div class="timeline-title">Allocated to ${holderName}</div>
                                <div class="timeline-desc">Status: ${a.status} / ${returnDate}</div>
                                ${a.check_in_notes ? `<div class="timeline-desc" style="font-style:italic;">Check-in notes: ${a.check_in_notes}</div>` : ''}
                            </div>
                        </li>
                    `;
                });
            }

            // Load Maintenance History Timeline
            const maintTimeline = document.getElementById('maint-history-timeline');
            maintTimeline.innerHTML = '';
            if (history.maintenances.length === 0) {
                maintTimeline.innerHTML = '<li class="p-2 text-slate-400 text-xs font-semibold">No maintenance history recorded.</li>';
            } else {
                history.maintenances.forEach(m => {
                    maintTimeline.innerHTML += `
                        <li class="timeline-item">
                            <div class="timeline-dot" style="border-color:var(--color-maintenance);"></div>
                            <div class="timeline-content">
                                <div class="timeline-date">${new Date(m.request_date).toLocaleDateString()}</div>
                                <div class="timeline-title">${m.description} (${m.priority} Priority)</div>
                                <div class="timeline-desc">Status: <strong>${m.status}</strong></div>
                                ${m.notes ? `<div class="timeline-desc" style="font-style:italic;">Details: ${m.notes}</div>` : ''}
                            </div>
                        </li>
                    `;
                });
            }

            this.showModal('asset-details-modal');

        } catch (err) {
            this.showToast('Failed to load asset details', 'error');
        }
    }

    // ==========================================
    // NOTIFICATION POLLING
    // ==========================================
    startNotificationPoller() {
        // Poll for notifications every 60s
        const poll = async () => {
            if (!this.token) return;
            try {
                const notifs = await this.apiCall('/api/notifications', 'GET');
                const unread = notifs.filter(n => !n.is_read);
                const badge = document.getElementById('notif-badge');
                if (badge) {
                    if (unread.length > 0) {
                        badge.classList.remove('hidden');
                        badge.innerText = unread.length;
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            } catch (err) {}
        };
        poll();
        setInterval(poll, 60000);
    }

    // ==========================================
    // INTERACTIVE PANEL TAB TOGGLES
    // ==========================================
    toggleAllocSubView(subView) {
        document.querySelectorAll('#allocations-view .tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.add('text-slate-500');
        });
        document.querySelectorAll('#allocations-view .subview').forEach(view => view.classList.add('hidden'));

        if (subView === 'active-allocs') {
            const btn = document.querySelector('#allocations-view .tab-btn:nth-child(1)');
            btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.remove('text-slate-500');
            document.getElementById('allocs-active-subview').classList.remove('hidden');
            this.loadActiveAllocations();
        } else {
            const btn = document.querySelector('#allocations-view .tab-btn:nth-child(2)');
            btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.remove('text-slate-500');
            document.getElementById('allocs-transfers-subview').classList.remove('hidden');
            this.loadTransferRequests();
        }
    }

    toggleAuditSubView(subView) {
        document.querySelectorAll('#audits-view .tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.add('text-slate-500');
        });
        document.querySelectorAll('#audits-view .subview').forEach(view => view.classList.add('hidden'));

        if (subView === 'audit-cycles') {
            const btn = document.querySelector('#audits-view .tab-btn:nth-child(1)');
            btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.remove('text-slate-500');
            document.getElementById('audit-cycles-subview').classList.remove('hidden');
            document.getElementById('audit-items-tab').classList.add('hidden');
            this.loadAudits();
        } else {
            const btn = document.getElementById('audit-items-tab');
            btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.remove('text-slate-500');
            document.getElementById('audit-items-subview').classList.remove('hidden');
        }
    }

    toggleOrgTab(tabId) {
        document.querySelectorAll('.org-tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.add('text-slate-500');
        });
        document.querySelectorAll('.org-tab-content').forEach(content => content.classList.add('hidden'));

        const btnIndex = tabId === 'departments-tab' ? 1 : (tabId === 'categories-tab' ? 2 : 3);
        const btn = document.querySelector(`.org-tab-btn:nth-child(${btnIndex})`);
        btn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
        btn.classList.remove('text-slate-500');
        document.getElementById(tabId).classList.remove('hidden');
    }

    toggleHistoryTab(tabId) {
        document.querySelectorAll('.hist-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.history-content').forEach(content => content.classList.add('hidden'));

        if (tabId === 'history-allocs') {
            document.querySelector('.hist-tab:nth-child(1)').classList.add('active');
        } else {
            document.querySelector('.hist-tab:nth-child(2)').classList.add('active');
        }
        document.getElementById(tabId).classList.remove('hidden');
    }

    // ==========================================
    // MODAL WINDOW UTILITIES
    // ==========================================
    showModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 200);
        }
    }

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = '<i class="fa-solid fa-circle-info"></i>';
        if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
        if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
        
        toast.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(toast);

        // Slide in
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 4s
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================
    // BASE API FETCH HELPER
    // ==========================================
    async apiCall(endpoint, method = 'GET', body = null, requireAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (requireAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const options = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (response.status === 401 && requireAuth) {
            // Token expired or invalid, force logout
            this.handleLogout();
            throw { detail: "Session expired. Please log in again." };
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw data;
        }

        return data;
    }
}

// Global initialization
const app = new AssetFlowApp();
