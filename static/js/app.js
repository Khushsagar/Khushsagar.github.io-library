/**
 * College Library Management System - Frontend Engine
 * Handles SPA navigation, real-time data fetching, CRUD operations, and security notifications.
 */

let currentTab = 'overview';
let activeLoansFilter = 'ALL';
let categoryChartInstance = null;

// Cached State
let cachedStudents = [];
let cachedBooks = [];
let cachedLoans = [];

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMobileSidebar();
    
    // Check initial tab from server template or hash
    const hash = window.location.hash.replace('#', '');
    const tabToLoad = hash || window.INITIAL_TAB || 'overview';
    switchTab(tabToLoad);
});

// ----------------- TOAST SYSTEM -----------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    const isError = type === 'danger' || type === 'error';
    
    toast.className = `pointer-events-auto p-4 rounded-xl shadow-2xl flex items-start gap-3 text-xs sm:text-sm toast-enter transition-all ${
        isSuccess 
            ? 'bg-slate-900 border border-emerald-500/40 text-emerald-300' 
            : isError 
                ? 'bg-slate-900 border border-rose-500/40 text-rose-300' 
                : 'bg-slate-900 border border-sky-500/40 text-sky-300'
    }`;

    const iconName = isSuccess ? 'check-circle-2' : isError ? 'alert-octagon' : 'info';
    toast.innerHTML = `
        <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
        <div class="flex-1 font-medium leading-relaxed">${message}</div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white p-0.5">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 250);
    }, 4500);
}

// ----------------- MODAL CONTROLS -----------------
function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        lucide.createIcons();
    }
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

// Close modals when clicking backdrop
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fixed') && e.target.id.endsWith('Modal')) {
        closeModal(e.target.id);
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('[id$="Modal"]:not(.hidden)');
        modals.forEach(m => closeModal(m.id));
    }
});

// ----------------- TAB NAVIGATION -----------------
function initNavigation() {
    // Setup student search debounce
    const studentSearch = document.getElementById('studentSearchInput');
    if (studentSearch) {
        studentSearch.addEventListener('input', debounce(() => loadStudents(), 300));
    }

    // Setup book search debounce
    const bookSearch = document.getElementById('bookSearchInput');
    if (bookSearch) {
        bookSearch.addEventListener('input', debounce(() => loadBooks(), 300));
    }

    // Setup loan search debounce
    const loanSearch = document.getElementById('loanSearchInput');
    if (loanSearch) {
        loanSearch.addEventListener('input', debounce(() => loadLoans(), 300));
    }
}

function switchTab(tabName, subFilter = null) {
    currentTab = tabName;
    window.location.hash = tabName;

    // Update Titles
    const titleEl = document.getElementById('currentTabTitle');
    const subTitleEl = document.getElementById('currentTabSubtitle');

    const meta = {
        'overview': { title: 'Overview', sub: 'College library circulation status, inventory metrics & real-time alerts' },
        'student-manage': { title: 'Student Management', sub: 'Maintain registered students, contact info & verify borrowing eligibility' },
        'catalog-manage': { title: 'Catalog Management', sub: 'Manage book inventory, categories, total copies & shelf locations' },
        'loan-return': { title: 'Loan & Return (Circulation)', sub: 'Issue books, process returns, calculate late fines & send reminders' }
    };

    if (meta[tabName]) {
        titleEl.textContent = meta[tabName].title;
        subTitleEl.textContent = meta[tabName].sub;
    }

    // Update Sidebar Navigation classes
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
        btn.classList.remove('active-tab');
    });
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) activeNav.classList.add('active-tab');

    // Show/Hide Sections
    document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
    const targetSection = document.getElementById(`section-${tabName}`);
    if (targetSection) targetSection.classList.remove('hidden');

    // Close mobile sidebar if open
    closeMobileSidebar();

    // Load data for section
    if (tabName === 'overview') {
        loadOverview();
    } else if (tabName === 'student-manage') {
        loadStudents();
    } else if (tabName === 'catalog-manage') {
        loadBooks();
    } else if (tabName === 'loan-return') {
        if (subFilter) {
            filterLoans(subFilter);
        } else {
            loadLoans();
        }
    }

    lucide.createIcons();
}

function initMobileSidebar() {
    const btn = document.getElementById('mobileMenuBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    if (btn) {
        btn.addEventListener('click', () => {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        });
    }

    const closeHandler = () => {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    };

    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

// ----------------- 1. OVERVIEW LOGIC -----------------
async function loadOverview() {
    try {
        const res = await fetch('/api/overview');
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const data = json.data;

        // Counters
        document.getElementById('statTotalTitles').textContent = data.total_titles || 0;
        document.getElementById('statTotalCopies').textContent = `(${data.total_book_copies || 0} copies)`;
        document.getElementById('statAvailableCopies').textContent = `${data.available_book_copies || 0} available`;
        document.getElementById('statIssuedCopies').textContent = `${data.issued_book_copies || 0} checked out`;

        document.getElementById('statTotalStudents').textContent = data.total_students || 0;
        document.getElementById('statActiveLoans').textContent = data.active_loans || 0;
        document.getElementById('statReturnedLoans').textContent = data.returned_loans || 0;
        document.getElementById('statOverdueLoans').textContent = data.overdue_loans || 0;

        // Update Nav badges
        document.getElementById('badgeStudentCount').textContent = data.total_students || 0;
        document.getElementById('badgeBookCount').textContent = data.total_titles || 0;
        document.getElementById('badgeActiveLoanCount').textContent = data.active_loans || 0;

        // Alert Banner
        const alertBanner = document.getElementById('overviewAlertBanner');
        const alertMsg = document.getElementById('overviewAlertMessage');
        if (data.overdue_loans > 0 || (data.due_alerts && data.due_alerts.length > 0)) {
            alertBanner.classList.remove('hidden');
            let txt = '';
            if (data.overdue_loans > 0) {
                txt += `${data.overdue_loans} book loan(s) are currently OVERDUE and require immediate return. `;
            }
            if (data.due_alerts && data.due_alerts.length > 0) {
                txt += `${data.due_alerts.length} item(s) due within the next 3 days.`;
            }
            alertMsg.textContent = txt;
        } else {
            alertBanner.classList.add('hidden');
        }

        // Render Category Chart
        renderCategoryChart(data.categories || []);

        // Render Recent Activity
        renderRecentActivity(data.recent_loans || []);

    } catch (err) {
        console.error("Overview error:", err);
        showToast("Error loading overview metrics: " + err.message, "danger");
    }
}

function renderCategoryChart(categories) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    const labels = categories.map(c => c.category);
    const counts = categories.map(c => c.total_copies);

    // Modern academic palette
    const colors = [
        '#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', 
        '#ec4899', '#14b8a6', '#6366f1', '#84cc16'
    ];

    categoryChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                label: 'Copies in Library',
                data: counts.length ? counts : [0],
                backgroundColor: colors.slice(0, Math.max(1, labels.length)),
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    boxPadding: 4
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#1e293b' },
                    ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 }
                }
            }
        }
    });
}

function renderRecentActivity(recent) {
    const container = document.getElementById('recentActivityList');
    if (!container) return;

    if (!recent.length) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No circulation history yet.</div>`;
        return;
    }

    container.innerHTML = recent.map(item => {
        const isReturned = item.status === 'RETURNED';
        return `
            <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-start gap-3 text-xs">
                <div class="w-7 h-7 rounded-lg ${isReturned ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/10 text-emerald-400'} flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i data-lucide="${isReturned ? 'check-circle' : 'arrow-right-circle'}" class="w-4 h-4"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-white truncate">${item.book_title}</p>
                    <p class="text-slate-400 text-[11px]">${item.student_name} (${item.student_roll})</p>
                    <div class="mt-1 flex items-center gap-2 text-[10px]">
                        <span class="${isReturned ? 'text-slate-400' : 'text-emerald-400'} font-semibold">${item.status}</span>
                        <span class="text-slate-400">&bull;</span>
                        <span class="text-slate-400 font-mono">Due: ${item.due_date}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

// ----------------- 2. STUDENT MANAGE LOGIC -----------------
async function loadStudents() {
    const tbody = document.getElementById('studentTableBody');
    const countEl = document.getElementById('studentTableCount');
    const searchVal = document.getElementById('studentSearchInput')?.value || '';

    tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Loading student directory...</td></tr>`;

    try {
        const url = searchVal ? `/api/students?q=${encodeURIComponent(searchVal)}` : '/api/students';
        const res = await fetch(url);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        cachedStudents = json.students || [];
        countEl.textContent = `Showing ${cachedStudents.length} students`;
        document.getElementById('badgeStudentCount').textContent = cachedStudents.length;

        if (cachedStudents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                        No students found matching your criteria. Click "Add New Student" to enroll one.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = cachedStudents.map(s => {
            const hasLoans = s.active_loans_count > 0;
            return `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="px-5 py-3.5 font-mono text-sky-400 font-medium">
                        ${s.roll_number}
                    </td>
                    <td class="px-5 py-3.5 font-medium text-white">
                        <button onclick="viewStudentDetails(${s.id})" class="text-left hover:text-sky-400 transition-colors">
                            ${s.name}
                        </button>
                    </td>
                    <td class="px-5 py-3.5">
                        <div class="text-slate-300">${s.email}</div>
                        <div class="text-xs text-slate-400">${s.phone ? s.phone : '<span class="italic text-slate-400">No phone provided</span>'}</div>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">${s.department}</span>
                        <span class="text-xs text-slate-400 block mt-0.5">${s.semester}</span>
                    </td>
                    <td class="px-5 py-3.5 text-center">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${
                            hasLoans 
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' 
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }">
                            ${s.active_loans_count} book(s)
                        </span>
                    </td>
                    <td class="px-5 py-3.5 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="viewStudentDetails(${s.id})" title="View Profile & Borrow History"
                                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            <button onclick="openEditStudentModal(${s.id})" title="Edit Student Details"
                                class="p-1.5 rounded-lg text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="confirmDeleteStudent(${s.id}, '${s.name}', '${s.roll_number}', ${s.active_loans_count})" title="Delete Student"
                                class="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-6 text-center text-rose-400 font-semibold">${err.message}</td></tr>`;
    }
}

function openAddStudentModal() {
    document.getElementById('studentFormId').value = '';
    document.getElementById('studentModalTitle').textContent = 'Add New Student';
    document.getElementById('studentFormSubmitBtn').textContent = 'Save Student';
    document.getElementById('studentForm').reset();
    openModal('studentModal');
}

function openEditStudentModal(id) {
    const student = cachedStudents.find(s => s.id === id);
    if (!student) return;

    document.getElementById('studentFormId').value = student.id;
    document.getElementById('studentModalTitle').textContent = `Edit Student: ${student.roll_number}`;
    document.getElementById('studentFormSubmitBtn').textContent = 'Update Student';
    document.getElementById('studentFormName').value = student.name;
    document.getElementById('studentFormRoll').value = student.roll_number;
    document.getElementById('studentFormEmail').value = student.email;
    document.getElementById('studentFormPhone').value = student.phone || '';
    document.getElementById('studentFormDept').value = student.department || 'Computer Science';
    document.getElementById('studentFormSem').value = student.semester || '1st Year (1st Sem)';

    openModal('studentModal');
}

async function handleStudentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('studentFormId').value;
    const isEdit = !!id;

    const payload = {
        name: document.getElementById('studentFormName').value.trim(),
        roll_number: document.getElementById('studentFormRoll').value.trim().toUpperCase(),
        email: document.getElementById('studentFormEmail').value.trim(),
        phone: document.getElementById('studentFormPhone').value.trim() || null,
        department: document.getElementById('studentFormDept').value,
        semester: document.getElementById('studentFormSem').value
    };

    try {
        const url = isEdit ? `/api/students/${id}` : '/api/students';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        closeModal('studentModal');
        showToast(isEdit ? "Student details updated successfully." : `Student ${payload.name} enrolled successfully!`);
        loadStudents();
        loadOverview();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function confirmDeleteStudent(id, name, roll, activeLoansCount) {
    // Client-side instant safety alert
    if (activeLoansCount > 0) {
        showToast(`Security Rule Blocked: Cannot delete ${name} (${roll}). They currently have ${activeLoansCount} active book loan(s). Please return the books first.`, "danger");
        return;
    }

    if (!confirm(`Are you sure you want to delete student: ${name} (${roll})?\n\nThis will permanently remove their records.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        showToast(`Student ${name} deleted successfully.`);
        loadStudents();
        loadOverview();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function viewStudentDetails(studentId) {
    try {
        const res = await fetch(`/api/students/${studentId}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const s = json.student;
        document.getElementById('studentDetailName').textContent = s.name;
        document.getElementById('studentDetailRoll').textContent = `Roll No: ${s.roll_number}`;
        document.getElementById('studentDetailDept').textContent = s.department || 'General';
        document.getElementById('studentDetailSem').textContent = s.semester || 'N/A';
        document.getElementById('studentDetailEmail').textContent = s.email;
        document.getElementById('studentDetailPhone').textContent = s.phone || 'Not provided';

        const loansContainer = document.getElementById('studentDetailLoans');
        if (!s.loans || s.loans.length === 0) {
            loansContainer.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-slate-800/40 rounded-xl">No loan history for this student.</div>`;
        } else {
            loansContainer.innerHTML = s.loans.map(l => {
                const isActive = l.status === 'ACTIVE';
                return `
                    <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between text-xs">
                        <div>
                            <strong class="text-white block">${l.book_title}</strong>
                            <span class="text-slate-400 font-mono text-[11px]">ISBN: ${l.book_isbn} &bull; Issued: ${l.issue_date}</span>
                        </div>
                        <div class="text-right">
                            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-700 text-slate-300'}">
                                ${l.status}
                            </span>
                            <span class="block text-[11px] text-slate-400 mt-0.5 font-mono">Due: ${l.due_date}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        openModal('studentDetailModal');
    } catch (err) {
        showToast("Error retrieving student profile: " + err.message, "danger");
    }
}

// ----------------- 3. CATALOG MANAGEMENT LOGIC -----------------
async function loadBooks() {
    const tbody = document.getElementById('bookTableBody');
    const countEl = document.getElementById('bookTableCount');
    const searchVal = document.getElementById('bookSearchInput')?.value || '';
    const categoryVal = document.getElementById('bookCategoryFilter')?.value || 'All';

    tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Loading catalog items...</td></tr>`;

    try {
        let url = `/api/books?q=${encodeURIComponent(searchVal)}`;
        if (categoryVal && categoryVal !== 'All') {
            url += `&category=${encodeURIComponent(categoryVal)}`;
        }

        const res = await fetch(url);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        cachedBooks = json.books || [];
        countEl.textContent = `Showing ${cachedBooks.length} catalog titles`;
        document.getElementById('badgeBookCount').textContent = cachedBooks.length;

        // Populate Category Filter dropdown dynamically
        populateCategoryDropdown(cachedBooks);

        if (cachedBooks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                        No catalog items found. Click "Add Catalog Item" to expand library inventory.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = cachedBooks.map(b => {
            const isOutOfStock = b.available_copies <= 0;
            const isLowStock = b.available_copies === 1;

            return `
                <tr class="hover:bg-slate-800/40 transition-colors">
                    <td class="px-5 py-3.5">
                        <button onclick="viewBookDetails(${b.id})" class="text-left font-semibold text-white hover:text-amber-400 transition-colors block">
                            ${b.title}
                        </button>
                        <div class="text-xs text-slate-400">By ${b.author} ${b.published_year ? `(${b.published_year})` : ''}</div>
                    </td>
                    <td class="px-5 py-3.5 font-mono text-amber-400 text-xs font-medium">
                        ${b.isbn}
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">${b.category}</span>
                    </td>
                    <td class="px-5 py-3.5 text-xs text-slate-300 font-mono">
                        ${b.shelf_location || 'General Section'}
                    </td>
                    <td class="px-5 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                isOutOfStock 
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' 
                                    : isLowStock 
                                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' 
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            }">
                                ${b.available_copies} of ${b.total_copies} Avail
                            </span>
                        </div>
                    </td>
                    <td class="px-5 py-3.5 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="viewBookDetails(${b.id})" title="View Details & Borrowers"
                                class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            <button onclick="openEditBookModal(${b.id})" title="Edit Catalog Entry"
                                class="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="confirmDeleteBook(${b.id}, '${b.title.replace(/'/g, "\\'")}', ${b.loaned_copies})" title="Delete Book"
                                class="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-6 text-center text-rose-400 font-semibold">${err.message}</td></tr>`;
    }
}

function populateCategoryDropdown(books) {
    const select = document.getElementById('bookCategoryFilter');
    if (!select) return;
    const currentVal = select.value;

    const categories = Array.from(new Set(books.map(b => b.category).filter(Boolean))).sort();
    let html = `<option value="All">All Categories (${books.length})</option>`;
    categories.forEach(cat => {
        const count = books.filter(b => b.category === cat).length;
        html += `<option value="${cat}" ${currentVal === cat ? 'selected' : ''}>${cat} (${count})</option>`;
    });
    select.innerHTML = html;
}

function openAddBookModal() {
    document.getElementById('bookFormId').value = '';
    document.getElementById('bookModalTitle').textContent = 'Add New Catalog Item';
    document.getElementById('bookFormSubmitBtn').textContent = 'Save Book';
    document.getElementById('bookForm').reset();
    document.getElementById('bookFormCopies').value = '1';
    openModal('bookModal');
}

function openEditBookModal(id) {
    const book = cachedBooks.find(b => b.id === id);
    if (!book) return;

    document.getElementById('bookFormId').value = book.id;
    document.getElementById('bookModalTitle').textContent = `Edit Catalog Item: ${book.isbn}`;
    document.getElementById('bookFormSubmitBtn').textContent = 'Update Book';
    document.getElementById('bookFormTitle').value = book.title;
    document.getElementById('bookFormAuthor').value = book.author;
    document.getElementById('bookFormIsbn').value = book.isbn;
    document.getElementById('bookFormCategory').value = book.category;
    document.getElementById('bookFormCopies').value = book.total_copies;
    document.getElementById('bookFormShelf').value = book.shelf_location || '';
    document.getElementById('bookFormYear').value = book.published_year || '';
    document.getElementById('bookFormDesc').value = book.description || '';

    openModal('bookModal');
}

async function handleBookSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('bookFormId').value;
    const isEdit = !!id;

    const payload = {
        title: document.getElementById('bookFormTitle').value.trim(),
        author: document.getElementById('bookFormAuthor').value.trim(),
        isbn: document.getElementById('bookFormIsbn').value.trim().toUpperCase(),
        category: document.getElementById('bookFormCategory').value.trim(),
        total_copies: parseInt(document.getElementById('bookFormCopies').value, 10),
        shelf_location: document.getElementById('bookFormShelf').value.trim() || 'General Section',
        published_year: document.getElementById('bookFormYear').value ? parseInt(document.getElementById('bookFormYear').value, 10) : null,
        description: document.getElementById('bookFormDesc').value.trim()
    };

    try {
        const url = isEdit ? `/api/books/${id}` : '/api/books';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        closeModal('bookModal');
        showToast(isEdit ? "Catalog item updated." : `Book "${payload.title}" added to catalog!`);
        loadBooks();
        loadOverview();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function confirmDeleteBook(id, title, loanedCopies) {
    // Client-side safety rule reminder
    if (loanedCopies > 0) {
        showToast(`Security Safeguard: Cannot delete "${title}". There are ${loanedCopies} copy/copies currently borrowed by students. Process returns before removing this title.`, "danger");
        return;
    }

    if (!confirm(`Are you sure you want to delete catalog book:\n"${title}"?\n\nThis will remove it from the catalog permanently.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        showToast(`Catalog item "${title}" removed successfully.`);
        loadBooks();
        loadOverview();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function viewBookDetails(bookId) {
    try {
        const res = await fetch(`/api/books/${bookId}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const b = json.book;
        document.getElementById('bookDetailTitle').textContent = b.title;
        document.getElementById('bookDetailAuthor').textContent = `By ${b.author}`;
        document.getElementById('bookDetailIsbn').textContent = b.isbn;
        document.getElementById('bookDetailCategory').textContent = b.category;
        document.getElementById('bookDetailShelf').textContent = b.shelf_location || 'General';
        document.getElementById('bookDetailStock').textContent = `${b.available_copies} of ${b.total_copies} copies available`;
        document.getElementById('bookDetailDesc').textContent = b.description || 'No additional summary registered.';

        const loansContainer = document.getElementById('bookDetailLoans');
        if (!b.active_loans || b.active_loans.length === 0) {
            loansContainer.innerHTML = `<div class="p-3 text-center text-xs text-slate-400 bg-slate-800/40 rounded-xl">No active borrowers. All copies available on shelf.</div>`;
        } else {
            loansContainer.innerHTML = b.active_loans.map(l => `
                <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                        <strong class="text-white block">${l.student_name}</strong>
                        <span class="text-sky-400 font-mono text-[11px]">${l.student_roll}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-slate-400 font-mono text-[11px]">Due Date:</span>
                        <strong class="text-amber-300 block font-mono">${l.due_date}</strong>
                    </div>
                </div>
            `).join('');
        }

        openModal('bookDetailModal');
    } catch (err) {
        showToast("Error retrieving book details: " + err.message, "danger");
    }
}

// ----------------- 4. LOAN AND RETURN (CIRCULATION) LOGIC -----------------
function filterLoans(status) {
    activeLoansFilter = status;

    // Update filter button visuals
    document.querySelectorAll('.loan-filter-btn').forEach(b => b.classList.remove('active-filter'));
    const target = document.getElementById(`filter-loan-${status}`);
    if (target) target.classList.add('active-filter');

    loadLoans();
}

async function loadLoans() {
    const tbody = document.getElementById('loanTableBody');
    const countEl = document.getElementById('loanTableCount');
    const searchVal = document.getElementById('loanSearchInput')?.value || '';

    tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Loading circulation records...</td></tr>`;

    try {
        const url = `/api/loans?status=${activeLoansFilter}&q=${encodeURIComponent(searchVal)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        cachedLoans = json.loans || [];
        countEl.textContent = `Showing ${cachedLoans.length} loan records (${activeLoansFilter})`;

        const overdueCount = cachedLoans.filter(l => l.is_overdue && l.status === 'ACTIVE').length;
        const pillDot = document.getElementById('loanPillOverdueCount');
        if (pillDot) {
            pillDot.classList.toggle('hidden', overdueCount === 0);
        }

        if (cachedLoans.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                        No loans found in category "${activeLoansFilter}". Click "Issue Book" to start checkout.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = cachedLoans.map(l => {
            const isReturned = l.status === 'RETURNED';
            const isOverdue = l.is_overdue && !isReturned;

            return `
                <tr class="hover:bg-slate-800/40 transition-colors ${isOverdue ? 'bg-rose-950/10' : ''}">
                    <td class="px-5 py-3.5">
                        <strong class="text-white block">${l.student_name}</strong>
                        <span class="text-sky-400 font-mono text-xs">${l.student_roll}</span>
                    </td>
                    <td class="px-5 py-3.5">
                        <strong class="text-white block">${l.book_title}</strong>
                        <span class="text-slate-400 font-mono text-xs">ISBN: ${l.book_isbn}</span>
                    </td>
                    <td class="px-5 py-3.5 font-mono text-xs text-slate-300">
                        ${l.issue_date}
                    </td>
                    <td class="px-5 py-3.5 font-mono text-xs">
                        <span class="${isOverdue ? 'text-rose-400 font-bold' : 'text-slate-300'}">${l.due_date}</span>
                    </td>
                    <td class="px-5 py-3.5">
                        ${
                            isReturned 
                                ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold badge-returned">Returned (${l.return_date})</span>` 
                                : isOverdue 
                                    ? `<div class="space-y-1">
                                         <span class="px-2.5 py-1 rounded-full text-xs font-bold badge-overdue animate-pulse flex items-center gap-1 w-max">
                                             <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
                                             ${l.overdue_days} Day(s) Overdue
                                         </span>
                                         <span class="text-[11px] text-rose-300/80 block">Fine: ₹${l.estimated_fine.toFixed(2)}</span>
                                       </div>` 
                                    : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold badge-active">Active (On Schedule)</span>`
                        }
                    </td>
                    <td class="px-5 py-3.5 text-right whitespace-nowrap">
                        <div class="flex items-center justify-end gap-1.5">
                            ${
                                !isReturned 
                                    ? `
                                      <button onclick="openReturnModal(${l.id})" 
                                          class="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all flex items-center gap-1">
                                          <i data-lucide="corner-down-left" class="w-3.5 h-3.5"></i>
                                          <span>Return</span>
                                      </button>
                                      <button onclick="extendLoan(${l.id})" title="Renew for 14 Days"
                                          class="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition-colors">
                                          <i data-lucide="calendar-plus" class="w-4 h-4"></i>
                                      </button>
                                      ${
                                          isOverdue 
                                              ? `
                                                <button onclick="openReminderModal(${l.id})" title="Send Asset Reminder / Notice"
                                                    class="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600 transition-colors">
                                                    <i data-lucide="mail-warning" class="w-4 h-4"></i>
                                                </button>
                                              `
                                              : ''
                                      }
                                    `
                                    : `
                                      <span class="text-xs text-slate-400 italic">Completed</span>
                                    `
                            }
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-6 text-center text-rose-400 font-semibold">${err.message}</td></tr>`;
    }
}

// Open Issue Book Modal & load available students and available books
async function openIssueBookModal() {
    try {
        // Fetch current students
        const resStudents = await fetch('/api/students');
        const jsonStudents = await resStudents.json();

        // Fetch current in-stock books
        const resBooks = await fetch('/api/books');
        const jsonBooks = await resBooks.json();

        const studentSelect = document.getElementById('issueStudentSelect');
        const bookSelect = document.getElementById('issueBookSelect');

        // Populate students
        let studentOpts = '<option value="">-- Choose Registered Student --</option>';
        (jsonStudents.students || []).forEach(s => {
            studentOpts += `<option value="${s.id}">${s.roll_number} - ${s.name} (${s.department})</option>`;
        });
        studentSelect.innerHTML = studentOpts;

        // Populate available books
        let bookOpts = '<option value="">-- Choose Available Book --</option>';
        const availableBooks = (jsonBooks.books || []).filter(b => b.available_copies > 0);
        if (availableBooks.length === 0) {
            bookOpts = '<option value="">-- No Books Currently in Stock --</option>';
        } else {
            availableBooks.forEach(b => {
                bookOpts += `<option value="${b.id}">${b.title} (${b.available_copies} available - Shelf ${b.shelf_location || 'General'})</option>`;
            });
        }
        bookSelect.innerHTML = bookOpts;

        // Reset default dates (14 days from today)
        setDueDuration(14);
        document.getElementById('issueNotes').value = '';

        openModal('issueBookModal');
    } catch (err) {
        showToast("Error preparing issue modal: " + err.message, "danger");
    }
}

function setDueDuration(days) {
    const today = new Date();
    today.setDate(today.getDate() + days);
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('issueDueDate').value = dateStr;
}

async function handleIssueSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('issueStudentSelect').value;
    const bookId = document.getElementById('issueBookSelect').value;
    const dueDate = document.getElementById('issueDueDate').value;
    const notes = document.getElementById('issueNotes').value.trim();

    if (!studentId || !bookId) {
        showToast("Please choose both a student and a book.", "danger");
        return;
    }

    try {
        const res = await fetch('/api/loans/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentId,
                book_id: bookId,
                due_date: dueDate,
                notes: notes
            })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        closeModal('issueBookModal');
        showToast(json.result.message || "Book successfully issued to student.");
        loadLoans();
        loadOverview();
        if (currentTab === 'catalog-manage') loadBooks();
        if (currentTab === 'student-manage') loadStudents();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// Return Modal
function openReturnModal(loanId) {
    const loan = cachedLoans.find(l => l.id === loanId);
    if (!loan) return;

    document.getElementById('returnLoanId').value = loan.id;
    document.getElementById('returnStudentInfo').textContent = `${loan.student_name} (${loan.student_roll})`;
    document.getElementById('returnBookInfo').textContent = `${loan.book_title} (ISBN: ${loan.book_isbn})`;
    document.getElementById('returnDueDateInfo').textContent = loan.due_date;

    const fineSection = document.getElementById('returnFineSection');
    const overdueBadge = document.getElementById('returnOverdueBadge');
    document.getElementById('returnWaiveFine').checked = false;
    document.getElementById('returnNotes').value = '';

    if (loan.is_overdue) {
        fineSection.classList.remove('hidden');
        document.getElementById('returnFineAmount').textContent = `₹${loan.estimated_fine.toFixed(2)}`;
        overdueBadge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-400 border border-rose-800';
        overdueBadge.textContent = `${loan.overdue_days} Days Late`;
    } else {
        fineSection.classList.add('hidden');
        overdueBadge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800';
        overdueBadge.textContent = 'On Time';
    }

    openModal('returnBookModal');
}

async function handleReturnSubmit(e) {
    e.preventDefault();
    const loanId = document.getElementById('returnLoanId').value;
    const waiveFine = document.getElementById('returnWaiveFine').checked;
    const notes = document.getElementById('returnNotes').value.trim();

    try {
        const res = await fetch(`/api/loans/${loanId}/return`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fine_waived: waiveFine,
                notes: notes
            })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        closeModal('returnBookModal');
        showToast("Book returned and restocked in catalog inventory!");
        loadLoans();
        loadOverview();
        if (currentTab === 'catalog-manage') loadBooks();
        if (currentTab === 'student-manage') loadStudents();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function extendLoan(loanId) {
    if (!confirm("Renew this book loan for an additional 14 days?")) return;

    try {
        const res = await fetch(`/api/loans/${loanId}/extend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extra_days: 14 })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        showToast("Loan renewal successful! " + json.message);
        loadLoans();
        loadOverview();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ----------------- OVERDUE ASSET REMINDER MODAL -----------------
function openReminderModal(loanId) {
    const loan = cachedLoans.find(l => l.id === loanId);
    if (!loan) return;

    document.getElementById('reminderStudentName').textContent = loan.student_name;
    document.getElementById('reminderStudentEmail').textContent = loan.student_email || 'No email';
    document.getElementById('reminderBookTitle').textContent = loan.book_title;
    document.getElementById('reminderDaysOverdue').textContent = `${loan.overdue_days} Day(s) (Fine: ₹${loan.estimated_fine.toFixed(2)})`;

    const noticeTemplate = 
`OFFICIAL NOTICE: OVERDUE LIBRARY ASSET RETURN
College Central Library Administration

Dear ${loan.student_name} (Roll No: ${loan.student_roll}),

According to college library records, the following book borrowed by you is overdue:
- Book Title: ${loan.book_title}
- ISBN / Code: ${loan.book_isbn}
- Due Date: ${loan.due_date}
- Days Overdue: ${loan.overdue_days} days
- Accumulated Fine: ₹${loan.estimated_fine.toFixed(2)}

SECURITY POLICY NOTICE:
All college library books are protected university assets. Unreturned items freeze library checkout privileges and may result in academic hold during semester clearance.

Please visit the central library circulation desk promptly to return the volume and clear your record.

Sincerely,
Head Librarian, College Library Administration`;

    document.getElementById('reminderMessageText').value = noticeTemplate;

    // Setup mailto link
    const subject = encodeURIComponent(`URGENT: Overdue Library Book Notice - ${loan.book_title}`);
    const body = encodeURIComponent(noticeTemplate);
    const emailLink = document.getElementById('reminderEmailLink');
    if (loan.student_email) {
        emailLink.href = `mailto:${loan.student_email}?subject=${subject}&body=${body}`;
        emailLink.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        emailLink.href = "#";
        emailLink.classList.add('opacity-50', 'pointer-events-none');
    }

    openModal('reminderModal');
}

function copyReminderText() {
    const textEl = document.getElementById('reminderMessageText');
    textEl.select();
    navigator.clipboard.writeText(textEl.value);
    showToast("Reminder notice copied to clipboard!");
}

// ----------------- ADMIN SECURITY: CHANGE PASSWORD -----------------
function openChangePasswordModal() {
    document.getElementById('passwordForm').reset();
    openModal('passwordModal');
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (newPassword !== confirmPassword) {
        showToast("New password and confirm password do not match.", "danger");
        return;
    }

    if (newPassword.length < 6) {
        showToast("New password must be at least 6 characters.", "danger");
        return;
    }

    try {
        const res = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword
            })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        closeModal('passwordModal');
        showToast("Librarian password successfully updated!");
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ----------------- HELPER: DEBOUNCE -----------------
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
