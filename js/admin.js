/**
 * JingJang Store - Admin Portal Logic
 * Modularized Script: js/admin.js
 */

const ORDER_API_URL = CONFIG.API_BASE + '/order';
const USER_API_URL = CONFIG.API_BASE + '/user';
const PRODUCT_API_URL = CONFIG.API_BASE + '/products';
const CATEGORY_API_URL = CONFIG.API_BASE + '/categories';

let rawOrders = [];
let rawProducts = [];
try {
    const cachedAdminProds = localStorage.getItem('jj_admin_raw_products');
    if (cachedAdminProds) {
        const parsed = JSON.parse(cachedAdminProds);
        if (Array.isArray(parsed) && parsed.length > 0) rawProducts = parsed;
    }
} catch (e) { }

let rawUsers = [];
let rawCategories = [];
let currentSection = 'overview';
let currentStatusFilter = 'ALL';
let currentCategoryFilter = 'ALL';
let selectedColors = [];
let selectedPhotos = [];
let cartNameManuallyEdited = false;

// State for Edit Product Modal
let editingProductId = null;
let editSelectedColors = [];
let editExistingImages = [];
let editNewPhotos = [];

const SECTION_TITLES = {
    'overview': { title: 'Dashboard', subtitle: 'Overview metrics and latest transactions' },
    'orders': { title: 'Orders', subtitle: 'Track and manage customer orders' },
    'products': { title: 'Products', subtitle: 'Manage active catalog inventory' },
    'add-product': { title: 'Add Product', subtitle: 'Upload photos & create new product' },
    'categories': { title: 'Categories', subtitle: 'Organize store collections' },
    'users': { title: 'Customers', subtitle: 'Registered customer directory' }
};

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <span style="cursor:pointer; font-size:16px; margin-left:12px;" onclick="this.parentElement.remove()">&times;</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 3500);
}

// ============================================================
// NAVIGATION & SIDEBAR
// ============================================================
function switchSection(sectionId) {
    currentSection = sectionId;

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + sectionId);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.section-view').forEach(sec => sec.classList.remove('active'));
    const targetSec = document.getElementById('sec-' + sectionId);
    if (targetSec) targetSec.classList.add('active');

    const meta = SECTION_TITLES[sectionId] || { title: 'Admin', subtitle: '' };
    const titleEl = document.getElementById('topbar-title');
    const subtitleEl = document.getElementById('topbar-subtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subtitleEl) subtitleEl.textContent = meta.subtitle;

    // Clear search
    const searchDesktop = document.getElementById('global-search-input');
    const searchMobile = document.getElementById('mobile-search-input');
    if (searchDesktop) searchDesktop.value = '';
    if (searchMobile) searchMobile.value = '';

    // Close mobile sidebar
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.style.display = 'none';

    // Fetch data for section
    if (sectionId === 'overview') { fetchAllData(); }
    if (sectionId === 'orders') { fetchOrders(); }
    if (sectionId === 'products') { fetchProducts(); }
    if (sectionId === 'categories') { fetchCategories(); }
    if (sectionId === 'users') { fetchUsers(); }
    if (sectionId === 'add-product') { loadCategoriesDropdown(); }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
        sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.style.display = 'none';
    } else {
        sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.style.display = 'block';
    }
}

function refreshCurrentSection() {
    fetchAllData();
    showToast('🔄 Store data updated', 'info');
}

// ============================================================
// KPIS & ALL DATA REFRESH
// ============================================================
async function fetchAllData() {
    await Promise.allSettled([
        fetchOrders(),
        fetchProducts(),
        fetchUsers(),
        fetchCategories()
    ]);
    updateKPIs();
}

function updateKPIs() {
    let totalRevenue = 0;
    let pendingCount = 0;

    rawOrders.forEach(o => {
        const status = (o.status || '').toLowerCase();
        if (status !== 'cancelled') {
            totalRevenue += parseFloat(o.total) || 0;
        }
        if (status === 'pending' || status === '') {
            pendingCount++;
        }
    });

    const revEl = document.getElementById('kpi-total-revenue');
    if (revEl) revEl.textContent = '$' + totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const ordersEl = document.getElementById('kpi-total-orders');
    if (ordersEl) ordersEl.textContent = rawOrders.length;

    const subEl = document.getElementById('kpi-orders-subtext');
    if (subEl) subEl.textContent = `${pendingCount} pending`;

    const pendingBadge = document.getElementById('badge-pending-orders');
    if (pendingBadge) {
        if (pendingCount > 0) {
            pendingBadge.style.display = 'inline-block';
            pendingBadge.textContent = pendingCount;
        } else {
            pendingBadge.style.display = 'none';
        }
    }

    const prodsEl = document.getElementById('kpi-total-products');
    if (prodsEl) prodsEl.textContent = rawProducts.length;

    const usersEl = document.getElementById('kpi-total-users');
    if (usersEl) usersEl.textContent = rawUsers.length;
}

// ============================================================
// ORDERS MANAGEMENT
// ============================================================
async function fetchOrders() {
    try {
        const response = await fetch(ORDER_API_URL);
        const result = await response.json();
        rawOrders = Array.isArray(result) ? result : (result.data || []);
        renderOrdersTable();
        renderOverviewRecentOrders();
        updateKPIs();
    } catch (err) {
        console.error('Error fetching orders:', err);
        const tbody = document.getElementById('orders-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Failed to connect to orders API</td></tr>';
    }
}

function filterOrdersByStatus(status) {
    currentStatusFilter = status;
    document.querySelectorAll('#order-status-filters .status-pill').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === status.toLowerCase() || (status === 'ALL' && btn.textContent.trim() === 'All'));
    });
    renderOrdersTable();
}

function getActiveSearchTerm() {
    const searchDesktop = document.getElementById('global-search-input')?.value || '';
    const searchMobile = document.getElementById('mobile-search-input')?.value || '';
    return (searchDesktop || searchMobile).toLowerCase().trim();
}

function renderOrdersTable() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = getActiveSearchTerm();
    let filtered = rawOrders.slice().reverse();

    if (currentStatusFilter !== 'ALL') {
        filtered = filtered.filter(o => (o.status || 'Pending').toLowerCase() === currentStatusFilter.toLowerCase());
    }

    if (searchTerm && currentSection === 'orders') {
        filtered = filtered.filter(o =>
            (o.orderId || '').toLowerCase().includes(searchTerm) ||
            (o.name || '').toLowerCase().includes(searchTerm) ||
            (o.phone || '').toLowerCase().includes(searchTerm) ||
            (o.userId || '').toLowerCase().includes(searchTerm)
        );
    }

    const countEl = document.getElementById('orders-count-indicator');
    if (countEl) countEl.textContent = `${filtered.length} of ${rawOrders.length} orders`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:25px; color:#94a3b8;">No orders found.</td></tr>';
        return;
    }

    filtered.forEach(order => {
        const statusVal = order.status || 'Pending';
        let statusClass = 'status-Pending';
        if (statusVal === 'Confirm order') statusClass = 'status-ConfirmOrder';
        if (statusVal === 'Ordered') statusClass = 'status-Ordered';
        if (statusVal === 'In China') statusClass = 'status-InChina';
        if (statusVal === 'Arrived Khmer') statusClass = 'status-ArrivedKhmer';
        if (statusVal === 'Will be send to you') statusClass = 'status-WillBeSend';
        if (statusVal === 'Cancelled') statusClass = 'status-Cancelled';

        let itemsSummary = '';
        if (order.items) {
            try {
                const parsed = JSON.parse(order.items);
                itemsSummary = parsed.map(it => `<div>• ${it.name} <strong>(x${it.quantity})</strong></div>`).join('');
            } catch (e) {
                itemsSummary = order.items;
            }
        } else {
            itemsSummary = 'No items';
        }

        const receiptBtn = (order.receipt && order.receipt !== 'No Receipt')
            ? `<button class="btn-view-receipt" onclick="viewReceiptModal(\`${order.receipt}\`)">Receipt</button>`
            : '<span style="color:#94a3b8; font-size:12px;">None</span>';

        const mapLink = (order.address && order.address.startsWith('http'))
            ? `<a href="${order.address}" target="_blank" style="color:#2563eb; font-weight:600; text-decoration:none;">🗺️ Map</a>`
            : (order.address || '-');

        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 700; color: #2563eb;">${order.orderId || '-'}</td>
                <td style="font-weight: 600;">${order.name || '-'}</td>
                <td>${order.phone || '-'}</td>
                <td style="max-width: 160px; word-break: break-all; font-size: 12px;">${mapLink}</td>
                <td style="font-size: 12px; line-height: 1.4;">${itemsSummary}</td>
                <td style="color: #ea580c; font-size: 12px;">${order.note || '-'}</td>
                <td style="font-weight: 800; color: #16a34a;">$${parseFloat(order.total || 0).toFixed(2)}</td>
                <td>${receiptBtn}</td>
                <td>
                    <select class="status-select ${statusClass}" onchange="changeOrderStatus('${order.orderId}', this.value)">
                        <option value="Pending" ${statusVal === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Confirm order" ${statusVal === 'Confirm order' ? 'selected' : ''}>Confirm order</option>
                        <option value="Ordered" ${statusVal === 'Ordered' ? 'selected' : ''}>Ordered</option>
                        <option value="In China" ${statusVal === 'In China' ? 'selected' : ''}>In China</option>
                        <option value="Arrived Khmer" ${statusVal === 'Arrived Khmer' ? 'selected' : ''}>Arrived Khmer</option>
                        <option value="Will be send to you" ${statusVal === 'Will be send to you' ? 'selected' : ''}>Will be send to you</option>
                        <option value="Cancelled" ${statusVal === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
                <td>
                    <button class="btn-delete-sm" onclick="deleteOrderConfirm('${order.orderId}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

function renderOverviewRecentOrders() {
    const tbody = document.getElementById('overview-orders-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const recents = rawOrders.slice(-5).reverse();
    if (recents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No recent orders.</td></tr>';
        return;
    }

    recents.forEach(order => {
        const statusVal = order.status || 'Pending';
        let statusClass = 'status-Pending';
        if (statusVal === 'Confirm order') statusClass = 'status-ConfirmOrder';
        if (statusVal === 'Arrived Khmer') statusClass = 'status-ArrivedKhmer';
        if (statusVal === 'Cancelled') statusClass = 'status-Cancelled';

        const receiptBtn = (order.receipt && order.receipt !== 'No Receipt')
            ? `<button class="btn-view-receipt" onclick="viewReceiptModal(\`${order.receipt}\`)">Receipt</button>`
            : '<span style="color:#94a3b8; font-size:12px;">None</span>';

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700; color:#2563eb;">${order.orderId || '-'}</td>
                <td style="font-weight:600;">${order.name || '-'}</td>
                <td>${order.phone || '-'}</td>
                <td style="font-weight:800; color:#16a34a;">$${parseFloat(order.total || 0).toFixed(2)}</td>
                <td>${receiptBtn}</td>
                <td><span class="status-select ${statusClass}">${statusVal}</span></td>
                <td style="color:#64748b; font-size:12px;">${order.date || '-'}</td>
            </tr>
        `;
    });
}

async function changeOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`${ORDER_API_URL}/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ CurrentStatus: newStatus })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`Order #${orderId} updated to "${newStatus}"!`, 'success');
            fetchOrders();
        } else {
            showToast('Failed to update status', 'error');
        }
    } catch (err) {
        showToast('Error updating status', 'error');
    }
}

async function deleteOrderConfirm(orderId) {
    if (!confirm(`Are you sure you want to delete Order #${orderId}?`)) return;

    const pwd = prompt('Enter admin security password:');
    if (pwd !== '15102006') {
        showToast('Incorrect password. Action cancelled.', 'error');
        return;
    }

    try {
        const response = await fetch(`${ORDER_API_URL}/${orderId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`Order #${orderId} deleted.`, 'success');
            fetchOrders();
        } else {
            showToast('Delete failed', 'error');
        }
    } catch (err) {
        showToast('Error deleting order', 'error');
    }
}

function viewReceiptModal(base64Image) {
    const modal = document.getElementById('receipt-modal');
    const container = document.getElementById('receipt-modal-content');
    if (!modal || !container) return;

    container.innerHTML = `<img src="${base64Image}" style="max-width:100%; max-height:60vh; border-radius:10px; object-fit:contain;">`;
    modal.style.display = 'flex';
}

function closeReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// PRODUCTS MANAGEMENT & CATALOG
// ============================================================
async function fetchProducts() {
    try {
        const response = await fetch(PRODUCT_API_URL);
        const result = await response.json();
        const newProducts = result.data || [];
        const oldJson = JSON.stringify(rawProducts);
        const newJson = JSON.stringify(newProducts);
        const tbody = document.getElementById('products-tbody');
        const isAlreadyRendered = tbody && tbody.querySelector('tr[data-product-id]') && !tbody.innerHTML.includes('Loading products catalog');

        rawProducts = newProducts;
        try {
            localStorage.setItem('jj_admin_raw_products', newJson);
        } catch (e) { }

        if (oldJson === newJson && isAlreadyRendered) {
            updateKPIs();
            return;
        }

        renderProductsTable();
        updateKPIs();
    } catch (err) {
        console.error('Error fetching products:', err);
        if (rawProducts.length === 0) {
            const tbody = document.getElementById('products-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Failed to connect to products API</td></tr>';
        }
    }
}

function filterProductsByCategory(categoryName) {
    currentCategoryFilter = categoryName;
    renderProductsTable();
}

function renderProductsTable() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = getActiveSearchTerm();
    let filtered = rawProducts;

    if (currentCategoryFilter !== 'ALL') {
        filtered = filtered.filter(p => (p.type || p.category_name || '').toLowerCase() === currentCategoryFilter.toLowerCase());
    }

    if (searchTerm && currentSection === 'products') {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(searchTerm) ||
            (p.cartName || p.cart_name || '').toLowerCase().includes(searchTerm) ||
            (p.type || p.category_name || '').toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:25px; color:#94a3b8;">No products found.</td></tr>';
        return;
    }

    filtered.forEach(p => {
        const firstImg = (p.images && p.images.length > 0) ? p.images[0] : '';
        const imgHtml = firstImg
            ? `<img src="${firstImg}" style="width:44px; height:44px; border-radius:8px; object-fit:cover; border:1px solid #e2e8f0;">`
            : '<span style="color:#94a3b8; font-size:11px;">No photo</span>';

        const specsCount = p.specs ? p.specs.length : 0;
        const colorsCount = p.colors ? p.colors.length : 0;
        const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';

        let optionBadge = '';
        const pOpts = p.options || (Array.isArray(p.option_values) ? p.option_values : []);
        if (Array.isArray(pOpts) && pOpts.length > 0) {
            optionBadge = '<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">' +
                pOpts.map(o => {
                    if (typeof o === 'object' && o !== null && o.name) {
                        const vals = Array.isArray(o.values) ? o.values.join(', ') : o.values;
                        return `<span style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:2px 7px; border-radius:4px; font-weight:600;">🏷️ ${o.name}: ${vals}</span>`;
                    }
                    return `<span style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:2px 7px; border-radius:4px; font-weight:600;">🏷️ ${o}</span>`;
                }).join('') +
                '</div>';
        }

        tbody.innerHTML += `
            <tr data-product-id="${p.id}">
                <td style="font-weight:700; color:#2563eb;">#${p.id}</td>
                <td>${imgHtml}</td>
                <td style="font-weight:700; color:#0f172a; max-width:200px; white-space:normal;">${p.name}${optionBadge}</td>
                <td><span style="background:#f0fdf4; color:#15803d; padding:4px 10px; border-radius:6px; font-weight:700; font-size:11px;">${p.type || p.category_name || '-'}</span></td>
                <td style="color:#64748b;">${p.cartName || p.cart_name || '-'}</td>
                <td style="font-weight:800; color:#16a34a;">$${parseFloat(p.price || 0).toFixed(2)}</td>
                <td style="color:#64748b; font-size:12px;">${specsCount} spec(s)</td>
                <td style="color:#64748b; font-size:12px;">${colorsCount} variation(s)</td>
                <td style="color:#94a3b8; font-size:12px;">${dateStr}</td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-edit-sm" onclick="openEditProductModal(${p.id})">✏️ Edit</button>
                        <button class="btn-delete-sm" onclick="deleteProductConfirm(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

async function deleteProductConfirm(productId, productName) {
    if (!confirm(`Are you sure you want to delete "${productName}"?`)) return;

    const pwd = prompt('Enter admin security password (default: 15102006):', '15102006');
    if (pwd === null) return;
    if (pwd.trim() !== '15102006') {
        showToast('Incorrect password. Action cancelled.', 'error');
        return;
    }

    try {
        const response = await fetch(`${PRODUCT_API_URL}/${productId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`Product deleted successfully!`, 'success');
            try { localStorage.removeItem('jj_cached_products'); localStorage.removeItem('jj_admin_raw_products'); } catch (e) { }
            fetchProducts();
        } else {
            showToast(result.message || 'Delete failed', 'error');
        }
    } catch (err) {
        showToast('Error deleting product: ' + (err.message || err), 'error');
    }
}

// ============================================================
// CATEGORIES MANAGEMENT
// ============================================================
async function fetchCategories() {
    try {
        const response = await fetch(CATEGORY_API_URL);
        const result = await response.json();
        rawCategories = result.data || [];
        renderCategoriesTable();
        loadCategoriesDropdown();
        loadEditCategoriesDropdown();
        updateCategoryFilterDropdown();
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

function loadCategoriesDropdown() {
    const select = document.getElementById('prod-category');
    if (!select) return;

    const curVal = select.value;
    select.innerHTML = '<option value="">Select a category</option>';

    rawCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        if (String(cat.id) === String(curVal)) opt.selected = true;
        select.appendChild(opt);
    });
}

function loadEditCategoriesDropdown(selectedId = null) {
    const select = document.getElementById('edit-prod-category');
    if (!select) return;

    select.innerHTML = '<option value="">Select a category</option>';
    rawCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        if (selectedId && (String(cat.id) === String(selectedId) || cat.name === selectedId)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function updateCategoryFilterDropdown() {
    const select = document.getElementById('products-cat-filter');
    if (!select) return;

    const cur = select.value;
    select.innerHTML = '<option value="ALL">All Categories</option>';
    rawCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        if (cat.name === cur) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderCategoriesTable() {
    const tbody = document.getElementById('categories-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (rawCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:25px; color:#94a3b8;">No categories found.</td></tr>';
        return;
    }

    rawCategories.forEach(cat => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700; color:#2563eb;">#${cat.id}</td>
                <td style="font-weight:700; color:#0f172a;">${cat.name}</td>
                <td>
                    <button class="btn-delete-sm" onclick="deleteCategoryConfirm(${cat.id}, '${cat.name}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('modal-cat-name-input');
        if (input) { input.value = ''; input.focus(); }
    }
}

function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) modal.style.display = 'none';
}

async function saveNewCategory() {
    const input = document.getElementById('modal-cat-name-input');
    const name = (input ? input.value : '').trim();
    if (!name) {
        showToast('Please enter category name', 'error');
        return;
    }

    try {
        const response = await fetch(CATEGORY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`Category "${name}" created!`, 'success');
            closeCategoryModal();
            await fetchCategories();
            const select = document.getElementById('prod-category');
            if (select && result.data?.id) select.value = result.data.id;
        } else {
            showToast(result.message || 'Failed to add category', 'error');
        }
    } catch (err) {
        showToast('Error saving category', 'error');
    }
}

async function addQuickCategory() {
    const input = document.getElementById('quick-add-cat-name');
    const name = (input ? input.value : '').trim();
    if (!name) {
        showToast('Please enter category name', 'error');
        return;
    }

    try {
        const response = await fetch(CATEGORY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const result = await response.json();
        if (result.status === 'success') {
            input.value = '';
            showToast(`Category "${name}" created!`, 'success');
            fetchCategories();
        } else {
            showToast(result.message || 'Failed to add category', 'error');
        }
    } catch (err) {
        showToast('Error saving category', 'error');
    }
}

async function deleteCategoryConfirm(id, name) {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;

    try {
        const response = await fetch(`${CATEGORY_API_URL}/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(`Category "${name}" deleted.`, 'success');
            fetchCategories();
        } else {
            showToast(result.message || 'Failed to delete category', 'error');
        }
    } catch (err) {
        showToast('Error deleting category', 'error');
    }
}

// ============================================================
// CUSTOMERS MANAGEMENT
// ============================================================
async function fetchUsers() {
    try {
        const response = await fetch(USER_API_URL);
        const result = await response.json();
        rawUsers = result.users || [];
        renderUsersTable();
        updateKPIs();
    } catch (err) {
        console.error('Error fetching users:', err);
        const tbody = document.getElementById('users-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Failed to connect to users API</td></tr>';
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = getActiveSearchTerm();
    let filtered = rawUsers.slice().reverse();

    if (searchTerm && currentSection === 'users') {
        filtered = filtered.filter(u =>
            (u.userId || '').toLowerCase().includes(searchTerm) ||
            (u.username || '').toLowerCase().includes(searchTerm) ||
            (u.email || '').toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:25px; color:#94a3b8;">No customers found.</td></tr>';
        return;
    }

    filtered.forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700; color:#10b981;">${u.userId || '-'}</td>
                <td style="font-weight:700; color:#0f172a;">${u.username || '-'}</td>
                <td style="color:#2563eb;">${u.email || '-'}</td>
                <td style="color:#64748b; font-size:12px;">${u.registerDate || '-'}</td>
            </tr>
        `;
    });
}

// ============================================================
// STUDIO ADD PRODUCT
// ============================================================
function handleNameInput(val) {
    const cartInput = document.getElementById('prod-cart-name');
    if (cartInput && !cartNameManuallyEdited) {
        cartInput.value = val;
    }
    const colorGroupInput = document.getElementById('prod-color-name');
    if (colorGroupInput && !colorGroupInput.value) {
        const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        colorGroupInput.placeholder = `color_${slug || 'item'}`;
    }
}

function addColorChip() {
    const nameInput = document.getElementById('color-name-input');
    const picker = document.getElementById('color-picker-input');
    const colorName = (nameInput ? nameInput.value : '').trim();
    const colorCode = picker ? picker.value : '#000000';

    if (!colorName) {
        showToast('Please type a color name', 'info');
        if (nameInput) nameInput.focus();
        return;
    }

    if (selectedColors.some(c => c.name.toLowerCase() === colorName.toLowerCase())) {
        showToast('Color variation already added', 'info');
        return;
    }

    selectedColors.push({
        name: colorName,
        value: colorName,
        colorCode: colorCode,
        border: isColorCodeLight(colorCode)
    });

    nameInput.value = '';
    renderColorChips();
}

function removeColorChip(index) {
    selectedColors.splice(index, 1);
    renderColorChips();
}

function renderColorChips() {
    const container = document.getElementById('color-chips-container');
    if (!container) return;
    container.innerHTML = '';

    selectedColors.forEach((color, idx) => {
        const chip = document.createElement('div');
        chip.className = 'color-tag-pill';
        chip.innerHTML = `
            <span class="color-tag-dot" style="background-color:${color.colorCode};"></span>
            <span>${color.name}</span>
            <span class="color-tag-x" onclick="removeColorChip(${idx})" title="Remove">&times;</span>
        `;
        container.appendChild(chip);
    });
}

function isColorCodeLight(hex) {
    if (!hex) return false;
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 200;
}

function handlePhotosSelected(input) {
    if (!input.files || input.files.length === 0) return;
    for (let i = 0; i < input.files.length; i++) {
        selectedPhotos.push(input.files[i]);
    }
    input.value = '';
    renderPhotoThumbnails();
}

function removePhoto(index) {
    selectedPhotos.splice(index, 1);
    renderPhotoThumbnails();
}

function renderPhotoThumbnails() {
    const container = document.getElementById('photo-thumbnails-grid');
    if (!container) return;
    container.innerHTML = '';

    selectedPhotos.forEach((file, idx) => {
        const box = document.createElement('div');
        box.className = 'thumb-preview-box';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'thumb-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => removePhoto(idx);

        box.appendChild(img);
        box.appendChild(removeBtn);
        container.appendChild(box);
    });
}

function addAdminOptionRow(name = '', values = '') {
    const container = document.getElementById('admin-options-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'admin-option-row input-row-flex';
    row.style.gap = '8px';
    row.innerHTML = `
        <input type="text" class="field-input opt-group-name" placeholder="Option Name (e.g. Size, Type)" value="${name}" style="flex: 1;">
        <input type="text" class="field-input opt-group-values" placeholder="Choices separated by commas (e.g. S, M, L, XL)" value="${values}" style="flex: 2;">
        <button type="button" class="btn-delete-sm" style="min-height: 44px; padding: 0 14px; border-radius: 8px; font-size: 16px;" onclick="removeAdminOptionRow(this)" title="Remove this option">&times;</button>
    `;
    container.appendChild(row);
}

function removeAdminOptionRow(btn) {
    const container = document.getElementById('admin-options-container');
    if (!container) return;
    const row = btn.closest('.admin-option-row');
    if (row) row.remove();
    if (container.children.length === 0) {
        addAdminOptionRow();
    }
}

function resetAdminOptionRows() {
    const container = document.getElementById('admin-options-container');
    if (container) {
        container.innerHTML = '';
        addAdminOptionRow();
    }
}

async function handleProductSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('prod-name').value.trim();
    const catSelect = document.getElementById('prod-category');
    const categoryId = catSelect ? catSelect.value : '';
    const categoryName = catSelect && catSelect.selectedIndex >= 0 ? catSelect.options[catSelect.selectedIndex].text : '';
    const cartName = document.getElementById('prod-cart-name').value.trim();
    const price = document.getElementById('prod-price').value;
    const colorName = document.getElementById('prod-color-name').value.trim();
    const specsRaw = document.getElementById('prod-specs').value;

    if (!name || !categoryId || !price) {
        showToast('Please fill all required fields (*)', 'error');
        return;
    }

    if (selectedPhotos.length === 0) {
        if (!confirm('No photos uploaded. Publish product without images?')) return;
    }

    const submitBtn = document.getElementById('btn-publish-product');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span><span>Uploading to Cloudinary & Saving...</span>';

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('category_id', categoryId);
        formData.append('type', categoryName);
        formData.append('cart_name', cartName || name);
        formData.append('price', price);
        if (colorName) formData.append('color_name', colorName);

        const specsArr = specsRaw.split('\n').map(s => s.trim()).filter(Boolean);
        formData.append('specs', JSON.stringify(specsArr));
        formData.append('colors', JSON.stringify(selectedColors));

        // Collect multi-option groups (e.g. Size, Type)
        const optionRows = document.querySelectorAll('#admin-options-container .admin-option-row');
        const collectedOptions = [];
        optionRows.forEach(row => {
            const oName = (row.querySelector('.opt-group-name')?.value || '').trim();
            const oValsRaw = (row.querySelector('.opt-group-values')?.value || '').trim();
            if (oName && oValsRaw) {
                const vals = oValsRaw.split(',').map(s => s.trim()).filter(Boolean);
                if (vals.length > 0) {
                    collectedOptions.push({ name: oName, values: vals });
                }
            }
        });

        if (collectedOptions.length > 0) {
            formData.append('option_name', collectedOptions.map(o => o.name).join(', '));
            formData.append('option_values', JSON.stringify(collectedOptions));
        }

        selectedPhotos.forEach(file => {
            formData.append('photos', file);
        });

        const response = await fetch(PRODUCT_API_URL, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast('🎉 Product published to store!', 'success');
            try { localStorage.removeItem('jj_cached_products'); localStorage.removeItem('jj_admin_raw_products'); } catch (e) { }
            document.getElementById('studio-product-form').reset();
            resetAdminOptionRows();
            selectedPhotos = [];
            selectedColors = [];
            cartNameManuallyEdited = false;
            renderPhotoThumbnails();
            renderColorChips();
            
            // Immediately refresh and switch to products section for easy editing
            await fetchAllData();
            switchSection('products');
        } else {
            showToast('Failed to add product: ' + (result.message || ''), 'error');
        }
    } catch (err) {
        console.error('Error submitting product:', err);
        showToast('Network error uploading product', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀</span><span>Publish Product to Store</span>';
    }
}

// ============================================================
// EDIT PRODUCT FEATURE (PUT /products/:id)
// ============================================================
function openEditProductModal(productId) {
    const product = rawProducts.find(p => String(p.id) === String(productId));
    if (!product) {
        showToast('Product not found in local cache. Refreshing...', 'error');
        fetchProducts();
        return;
    }

    editingProductId = product.id;
    document.getElementById('edit-prod-id').value = product.id;
    document.getElementById('edit-prod-name').value = product.name || '';
    document.getElementById('edit-prod-cart-name').value = product.cartName || product.cart_name || product.name || '';
    document.getElementById('edit-prod-price').value = product.price || '';
    document.getElementById('edit-prod-color-name').value = product.colorName || product.color_name || '';

    // Category dropdown
    loadEditCategoriesDropdown(product.categoryId || product.category_id || product.type || product.category_name);

    // Specs
    const specs = Array.isArray(product.specs) ? product.specs : [];
    document.getElementById('edit-prod-specs').value = specs.join('\n');

    // Existing Images
    editExistingImages = Array.isArray(product.images) ? [...product.images] : [];
    renderEditExistingImages();

    // New photos reset
    editNewPhotos = [];
    renderEditNewPhotoThumbnails();

    // Colors
    editSelectedColors = Array.isArray(product.colors) ? JSON.parse(JSON.stringify(product.colors)) : [];
    renderEditColorChips();

    // Options
    const editOptionsContainer = document.getElementById('edit-options-container');
    if (editOptionsContainer) {
        editOptionsContainer.innerHTML = '';
        const opts = product.options || (Array.isArray(product.option_values) ? product.option_values : []);
        if (Array.isArray(opts) && opts.length > 0) {
            opts.forEach(opt => {
                if (typeof opt === 'object' && opt !== null) {
                    const vals = Array.isArray(opt.values) ? opt.values.join(', ') : opt.values;
                    addEditOptionRow(opt.name || '', vals || '');
                } else {
                    addEditOptionRow('Option', String(opt));
                }
            });
        } else {
            addEditOptionRow();
        }
    }

    const modal = document.getElementById('edit-product-modal');
    if (modal) modal.style.display = 'flex';
}

function closeEditProductModal() {
    const modal = document.getElementById('edit-product-modal');
    if (modal) modal.style.display = 'none';
    editingProductId = null;
    editExistingImages = [];
    editNewPhotos = [];
    editSelectedColors = [];
}

function renderEditExistingImages() {
    const container = document.getElementById('edit-existing-images-grid');
    if (!container) return;
    container.innerHTML = '';

    if (editExistingImages.length === 0) {
        container.innerHTML = '<span style="color:#94a3b8; font-size:12px;">No existing photos retained.</span>';
        return;
    }

    editExistingImages.forEach((imgUrl, idx) => {
        const box = document.createElement('div');
        box.className = 'thumb-preview-box';

        const img = document.createElement('img');
        img.src = imgUrl;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'thumb-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove this existing image';
        removeBtn.onclick = () => removeEditExistingImage(idx);

        box.appendChild(img);
        box.appendChild(removeBtn);
        container.appendChild(box);
    });
}

function removeEditExistingImage(idx) {
    editExistingImages.splice(idx, 1);
    renderEditExistingImages();
}

function handleEditPhotosSelected(input) {
    if (!input.files || input.files.length === 0) return;
    for (let i = 0; i < input.files.length; i++) {
        editNewPhotos.push(input.files[i]);
    }
    input.value = '';
    renderEditNewPhotoThumbnails();
}

function removeEditNewPhoto(idx) {
    editNewPhotos.splice(idx, 1);
    renderEditNewPhotoThumbnails();
}

function renderEditNewPhotoThumbnails() {
    const container = document.getElementById('edit-new-photos-grid');
    if (!container) return;
    container.innerHTML = '';

    editNewPhotos.forEach((file, idx) => {
        const box = document.createElement('div');
        box.className = 'thumb-preview-box';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'thumb-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => removeEditNewPhoto(idx);

        box.appendChild(img);
        box.appendChild(removeBtn);
        container.appendChild(box);
    });
}

function addEditColorChip() {
    const nameInput = document.getElementById('edit-color-name-input');
    const picker = document.getElementById('edit-color-picker-input');
    const colorName = (nameInput ? nameInput.value : '').trim();
    const colorCode = picker ? picker.value : '#000000';

    if (!colorName) {
        showToast('Please type a color name', 'info');
        if (nameInput) nameInput.focus();
        return;
    }

    if (editSelectedColors.some(c => c.name.toLowerCase() === colorName.toLowerCase())) {
        showToast('Color variation already added', 'info');
        return;
    }

    editSelectedColors.push({
        name: colorName,
        value: colorName,
        colorCode: colorCode,
        border: isColorCodeLight(colorCode)
    });

    nameInput.value = '';
    renderEditColorChips();
}

function removeEditColorChip(idx) {
    editSelectedColors.splice(idx, 1);
    renderEditColorChips();
}

function renderEditColorChips() {
    const container = document.getElementById('edit-color-chips-container');
    if (!container) return;
    container.innerHTML = '';

    editSelectedColors.forEach((color, idx) => {
        const chip = document.createElement('div');
        chip.className = 'color-tag-pill';
        chip.innerHTML = `
            <span class="color-tag-dot" style="background-color:${color.colorCode};"></span>
            <span>${color.name}</span>
            <span class="color-tag-x" onclick="removeEditColorChip(${idx})" title="Remove">&times;</span>
        `;
        container.appendChild(chip);
    });
}

function addEditOptionRow(name = '', values = '') {
    const container = document.getElementById('edit-options-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'admin-option-row input-row-flex';
    row.style.gap = '8px';
    row.innerHTML = `
        <input type="text" class="field-input opt-group-name" placeholder="Option Name (e.g. Size, Type)" value="${name}" style="flex: 1;">
        <input type="text" class="field-input opt-group-values" placeholder="Choices separated by commas (e.g. S, M, L, XL)" value="${values}" style="flex: 2;">
        <button type="button" class="btn-delete-sm" style="min-height: 44px; padding: 0 14px; border-radius: 8px; font-size: 16px;" onclick="removeEditOptionRow(this)" title="Remove this option">&times;</button>
    `;
    container.appendChild(row);
}

function removeEditOptionRow(btn) {
    const container = document.getElementById('edit-options-container');
    if (!container) return;
    const row = btn.closest('.admin-option-row');
    if (row) row.remove();
    if (container.children.length === 0) {
        addEditOptionRow();
    }
}

async function handleEditProductSubmit(e) {
    e.preventDefault();
    if (!editingProductId) return;

    const name = document.getElementById('edit-prod-name').value.trim();
    const catSelect = document.getElementById('edit-prod-category');
    const categoryId = catSelect ? catSelect.value : '';
    const categoryName = catSelect && catSelect.selectedIndex >= 0 ? catSelect.options[catSelect.selectedIndex].text : '';
    const cartName = document.getElementById('edit-prod-cart-name').value.trim();
    const price = document.getElementById('edit-prod-price').value;
    const colorName = document.getElementById('edit-prod-color-name').value.trim();
    const specsRaw = document.getElementById('edit-prod-specs').value;

    if (!name || !categoryId || !price) {
        showToast('Please fill all required fields (*)', 'error');
        return;
    }

    const saveBtn = document.getElementById('btn-save-edit-product');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span><span>Saving Changes...</span>';

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('category_id', categoryId);
        formData.append('type', categoryName);
        formData.append('cart_name', cartName || name);
        formData.append('price', price);
        if (colorName) formData.append('color_name', colorName);

        const specsArr = specsRaw.split('\n').map(s => s.trim()).filter(Boolean);
        formData.append('specs', JSON.stringify(specsArr));
        formData.append('colors', JSON.stringify(editSelectedColors));

        // Options
        const optionRows = document.querySelectorAll('#edit-options-container .admin-option-row');
        const collectedOptions = [];
        optionRows.forEach(row => {
            const oName = (row.querySelector('.opt-group-name')?.value || '').trim();
            const oValsRaw = (row.querySelector('.opt-group-values')?.value || '').trim();
            if (oName && oValsRaw) {
                const vals = oValsRaw.split(',').map(s => s.trim()).filter(Boolean);
                if (vals.length > 0) {
                    collectedOptions.push({ name: oName, values: vals });
                }
            }
        });

        if (collectedOptions.length > 0) {
            formData.append('option_name', collectedOptions.map(o => o.name).join(', '));
            formData.append('option_values', JSON.stringify(collectedOptions));
        }

        // Retained existing images
        formData.append('existing_images', JSON.stringify(editExistingImages));

        // New photos
        editNewPhotos.forEach(file => {
            formData.append('photos', file);
        });

        const response = await fetch(`${PRODUCT_API_URL}/${editingProductId}`, {
            method: 'PUT',
            body: formData
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast('✅ Product updated successfully!', 'success');
            try { localStorage.removeItem('jj_cached_products'); localStorage.removeItem('jj_admin_raw_products'); } catch (e) { }
            closeEditProductModal();
            fetchProducts();
        } else {
            showToast('Failed to update product: ' + (result.message || ''), 'error');
        }
    } catch (err) {
        console.error('Error updating product:', err);
        showToast('Network error updating product', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾</span><span>Save Product Changes</span>';
    }
}

// ============================================================
// SEARCH & EVENT LISTENERS
// ============================================================
function handleTableSearch(term) {
    const searchDesktop = document.getElementById('global-search-input');
    const searchMobile = document.getElementById('mobile-search-input');
    if (searchDesktop && searchDesktop.value !== term) searchDesktop.value = term;
    if (searchMobile && searchMobile.value !== term) searchMobile.value = term;

    if (currentSection === 'orders') renderOrdersTable();
    if (currentSection === 'products') renderProductsTable();
    if (currentSection === 'users') renderUsersTable();
}

window.addEventListener('DOMContentLoaded', () => {
    // Form submission listener
    const form = document.getElementById('studio-product-form');
    if (form) form.addEventListener('submit', handleProductSubmit);

    const editForm = document.getElementById('edit-product-form');
    if (editForm) editForm.addEventListener('submit', handleEditProductSubmit);

    // Dynamic product name input listener
    const cartInput = document.getElementById('prod-cart-name');
    if (cartInput) {
        cartInput.addEventListener('input', function () {
            cartNameManuallyEdited = (this.value.trim().length > 0);
        });
    }

    // Initialize first option row in add product form
    addAdminOptionRow();

    // Render initial cached products if available
    if (rawProducts.length > 0) {
        renderProductsTable();
    }

    // Fetch initial live data
    fetchAllData();
});
