const fs = require('fs');
const path = require('path');

// Auto-detect admin.js path whether running from root or inside Admin-JingJang
let adminJsPath = path.join(__dirname, 'js/admin.js');
if (!fs.existsSync(adminJsPath)) {
    adminJsPath = path.join(__dirname, 'Admin-JingJang/js/admin.js');
}
if (!fs.existsSync(adminJsPath)) {
    adminJsPath = path.join(__dirname, '../Admin-JingJang/js/admin.js');
}

if (!fs.existsSync(adminJsPath)) {
    console.error('❌ Could not find admin.js at:', adminJsPath);
    process.exit(1);
}

let adminJs = fs.readFileSync(adminJsPath, 'utf8');

// 1. Add PROMOTION_API_URL
if (!adminJs.includes('PROMOTION_API_URL')) {
    adminJs = adminJs.replace(
        "const CATEGORY_API_URL = CONFIG.API_BASE + '/categories';",
        "const CATEGORY_API_URL = CONFIG.API_BASE + '/categories';\nconst PROMOTION_API_URL = CONFIG.API_BASE + '/promotion';"
    );
}

// 2. Add Section title
if (!adminJs.includes("'promotions':")) {
    adminJs = adminJs.replace(
        "'categories': { title: 'Categories', subtitle: 'Organize store collections' },",
        "'categories': { title: 'Categories', subtitle: 'Organize store collections' },\n    'promotions': { title: 'Promotions & Coupons', subtitle: 'Manage discount codes and special customer offers' },"
    );
}

// 3. Add to switchSection
if (!adminJs.includes("if (sectionId === 'promotions')")) {
    adminJs = adminJs.replace(
        "if (sectionId === 'categories') { fetchCategories(); }",
        "if (sectionId === 'categories') { fetchCategories(); }\n    if (sectionId === 'promotions') { fetchPromotions(); }"
    );
}

// 4. Update order row to display promo code and discount if applied
if (!adminJs.includes('order.promoCode')) {
    const oldRow = '<td style="font-weight: 800; color: #16a34a;">$${parseFloat(order.total || 0).toFixed(2)}</td>';
    const newRow = '<td style="font-weight: 800; color: #16a34a;">' +
        '\n                    $${parseFloat(order.total || 0).toFixed(2)}' +
        '\n                    ${order.promoCode ? `<div style="font-size:11px; color:#059669; font-weight:600; margin-top:2px;">🎟️ ${escapeHTML(order.promoCode)} (-$${parseFloat(order.discountAmount || 0).toFixed(2)})</div>` : \'\'}' +
        '\n                </td>';
    if (adminJs.includes(oldRow)) {
        adminJs = adminJs.replace(oldRow, newRow);
    }
}

// 5. Append Promo management logic
if (!adminJs.includes('function fetchPromotions()')) {
    const promoLogic = `

// ============================================================
// PROMOTIONS & COUPONS MANAGEMENT
// ============================================================
let rawPromotions = [];

async function fetchPromotions() {
    try {
        const response = await fetch(PROMOTION_API_URL);
        const result = await response.json();
        rawPromotions = result.promotions || [];
        renderPromotionsTable();
    } catch (err) {
        console.error('Error fetching promotions:', err);
        const tbody = document.getElementById('promotions-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Failed to load promotions</td></tr>';
    }
}

function renderPromotionsTable() {
    const tbody = document.getElementById('promotions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (rawPromotions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:25px; color:#94a3b8;">No promotion codes created yet. Click "+ New Coupon" to create one.</td></tr>';
        return;
    }

    const now = new Date();

    rawPromotions.forEach(promo => {
        const isExpired = promo.end_date && new Date(promo.end_date) < now;
        let statusBadge = '<span style="background:#dcfce7; color:#15803d; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">Active</span>';
        if (!promo.is_active) {
            statusBadge = '<span style="background:#f1f5f9; color:#64748b; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">Disabled</span>';
        } else if (isExpired) {
            statusBadge = '<span style="background:#fee2e2; color:#dc2626; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">Expired</span>';
        }

        const discountDisplay = promo.discount_type === 'percentage'
            ? \`\${promo.discount_value}% OFF\`
            : \`$\${promo.discount_value.toFixed(2)} OFF\`;

        const minOrderDisplay = promo.min_order_amount > 0 ? \`$\${promo.min_order_amount.toFixed(2)}\` : 'None';
        const usageDisplay = promo.usage_limit ? \`\${promo.used_count} / \${promo.usage_limit}\` : \`\${promo.used_count} / ∞\`;
        
        let expiryDisplay = 'Never';
        if (promo.end_date) {
            const expDate = new Date(promo.end_date);
            expiryDisplay = expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        tbody.innerHTML += \`
            <tr>
                <td><strong style="color:#2563eb; letter-spacing:0.5px;">\${escapeHTML(promo.code)}</strong></td>
                <td style="font-size:12px; color:#64748b;">\${escapeHTML(promo.description || '-')}</td>
                <td><strong style="color:#16a34a;">\${discountDisplay}</strong></td>
                <td style="font-size:12px;">\${minOrderDisplay}</td>
                <td style="font-size:12px; font-weight:600;">\${usageDisplay}</td>
                <td style="font-size:12px;">\${expiryDisplay}</td>
                <td>\${statusBadge}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-blue-action" style="padding:4px 8px; font-size:11px; margin-right:4px;" onclick="togglePromoStatus(\${promo.id})">
                        \${promo.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-delete-sm" onclick="deletePromo(\${promo.id}, '\${escapeHTML(promo.code)}')">
                        Delete
                    </button>
                </td>
            </tr>
        \`;
    });
}

function openPromoModal() {
    const modal = document.getElementById('promo-modal');
    if (modal) modal.style.display = 'flex';
}

function closePromoModal() {
    const modal = document.getElementById('promo-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('create-promo-form');
    if (form) form.reset();
}

async function saveNewPromo(event) {
    event.preventDefault();
    const code = document.getElementById('modal-promo-code')?.value.trim().toUpperCase();
    const description = document.getElementById('modal-promo-desc')?.value.trim();
    const discount_type = document.getElementById('modal-promo-type')?.value;
    const discount_value = parseFloat(document.getElementById('modal-promo-val')?.value);
    const min_order_amount = parseFloat(document.getElementById('modal-promo-min')?.value) || 0;
    const usage_limit = document.getElementById('modal-promo-limit')?.value ? parseInt(document.getElementById('modal-promo-limit')?.value, 10) : null;
    const end_date = document.getElementById('modal-promo-end')?.value || null;

    if (!code || isNaN(discount_value) || discount_value <= 0) {
        showToast('Please provide valid coupon code and discount value', 'error');
        return;
    }

    try {
        const response = await fetch(PROMOTION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                description,
                discount_type,
                discount_value,
                min_order_amount,
                usage_limit,
                end_date,
                is_active: 1
            })
        });

        const result = await response.json();
        if (response.ok && result.status === 'success') {
            showToast(\`✅ Promo code "\${code}" created!\`, 'success');
            closePromoModal();
            fetchPromotions();
        } else {
            showToast(result.message || 'Could not create promo code', 'error');
        }
    } catch (err) {
        console.error('Error creating promo code:', err);
        showToast('Network error creating promo code', 'error');
    }
}

async function togglePromoStatus(id) {
    try {
        const response = await fetch(\`\${PROMOTION_API_URL}/\${id}/toggle\`, { method: 'PATCH' });
        const result = await response.json();
        if (response.ok) {
            showToast(result.message || 'Status updated', 'success');
            fetchPromotions();
        } else {
            showToast(result.message || 'Error updating status', 'error');
        }
    } catch (err) {
        showToast('Failed to toggle status', 'error');
    }
}

async function deletePromo(id, code) {
    if (!confirm(\`Are you sure you want to delete coupon "\${code}"?\`)) return;

    try {
        const response = await fetch(\`\${PROMOTION_API_URL}/\${id}\`, { method: 'DELETE' });
        const result = await response.json();
        if (response.ok) {
            showToast(\`Coupon "\${code}" deleted\`, 'success');
            fetchPromotions();
        } else {
            showToast(result.message || 'Error deleting coupon', 'error');
        }
    } catch (err) {
        showToast('Failed to delete coupon', 'error');
    }
}
`;
    adminJs += promoLogic;
}

fs.writeFileSync(adminJsPath, adminJs, 'utf8');
console.log('✅ Admin-JingJang/js/admin.js updated successfully!');
