// js/app.js - Main Application Controller for Smart Campus Lost & Found System

const state = {
  activeView: 'catalog', // 'catalog', 'matches', 'claims', 'admin', 'profile'
  typeFilter: '',        // '', 'LOST', 'FOUND', 'RECOVERED'
  categoryId: '',
  searchQuery: '',
  locationQuery: '',
  categories: [],
  items: [],
  selectedItem: null,
  notifications: [],
  unreadCount: 0
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFilterListeners();
  setupModalEvents();
  setupDemoLogin();
  setupUploadPreviews();

  // Load initial data
  await loadCategories();
  await loadStats();
  await loadItems();
  updateAuthUI();

  if (window.api.token) {
    loadNotifications();
  }
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// Navigation & Views
// ============================================================
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link[data-view]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      switchView(view);
    });
  });

  // Hero search button
  document.getElementById('heroSearchBtn')?.addEventListener('click', () => {
    const term = document.getElementById('heroSearchInput')?.value;
    const cat = document.getElementById('heroCategorySelect')?.value;
    state.searchQuery = term || '';
    state.categoryId = cat || '';
    switchView('catalog');
    loadItems();
  });

  // Notifications toggle
  const notifBtn = document.getElementById('btnNotif');
  const notifPopover = document.getElementById('notifPopover');
  if (notifBtn && notifPopover) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifPopover.classList.toggle('show');
      if (notifPopover.classList.contains('show')) {
        loadNotifications();
      }
    });

    document.addEventListener('click', (e) => {
      if (!notifPopover.contains(e.target) && e.target !== notifBtn) {
        notifPopover.classList.remove('show');
      }
    });
  }

  // User menu toggle
  const userBtn = document.getElementById('btnUserMenu');
  const userDropdown = document.getElementById('userDropdown');
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && !userBtn.contains(e.target)) {
        userDropdown.classList.remove('show');
      }
    });
  }

  // Logout action
  document.getElementById('btnLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.api.logout();
    updateAuthUI();
    showToast('You have been logged out.', 'info');
    switchView('catalog');
    loadItems();
  });
}

function switchView(viewName) {
  state.activeView = viewName;

  // Update active state in nav links
  document.querySelectorAll('.nav-link').forEach(l => {
    if (l.getAttribute('data-view') === viewName) {
      l.classList.add('active');
    } else {
      l.classList.remove('active');
    }
  });

  // Toggle container sections
  const catalogSection = document.getElementById('catalogView');
  const matchesSection = document.getElementById('matchesView');
  const claimsSection = document.getElementById('claimsView');
  const adminSection = document.getElementById('adminView');

  if (catalogSection) catalogSection.style.display = viewName === 'catalog' ? 'block' : 'none';
  if (matchesSection) matchesSection.style.display = viewName === 'matches' ? 'block' : 'none';
  if (claimsSection) claimsSection.style.display = viewName === 'claims' ? 'block' : 'none';
  if (adminSection) adminSection.style.display = viewName === 'admin' ? 'block' : 'none';

  if (viewName === 'matches') {
    loadSmartMatches();
  } else if (viewName === 'claims') {
    loadClaimsView();
  } else if (viewName === 'admin') {
    loadAdminDashboard();
  } else if (viewName === 'catalog') {
    loadItems();
  }
}

// ============================================================
// Auth State UI
// ============================================================
function updateAuthUI() {
  const loggedIn = !!window.api.token;
  const user = window.api.user;

  const authActions = document.getElementById('navAuthActions');
  const userMenu = document.getElementById('navUserMenu');
  const navAdminLink = document.getElementById('navAdminLink');

  if (loggedIn && user) {
    if (authActions) authActions.style.display = 'none';
    if (userMenu) userMenu.style.display = 'block';

    const userNameEl = document.getElementById('navUserName');
    const userRoleEl = document.getElementById('navUserRole');
    const avatarEl = document.getElementById('navUserAvatar');

    if (userNameEl) userNameEl.textContent = user.full_name.split(' ')[0];
    if (userRoleEl) {
      userRoleEl.textContent = user.role;
      userRoleEl.className = `user-role-tag ${user.role.toLowerCase()}`;
    }
    if (avatarEl) avatarEl.textContent = user.full_name[0].toUpperCase();

    if (navAdminLink) {
      navAdminLink.style.display = user.role === 'ADMIN' ? 'flex' : 'none';
    }
  } else {
    if (authActions) authActions.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
    if (navAdminLink) navAdminLink.style.display = 'none';
  }
}

// ============================================================
// Data Loaders
// ============================================================
async function loadCategories() {
  try {
    const data = await window.api.getCategories();
    if (data.success) {
      state.categories = data.categories;

      const heroCatSelect = document.getElementById('heroCategorySelect');
      const filterCatSelect = document.getElementById('filterCategorySelect');
      const itemModalCatSelect = document.getElementById('itemCategorySelect');

      const optionsHtml = '<option value="">All Categories</option>' +
        data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

      if (heroCatSelect) heroCatSelect.innerHTML = optionsHtml;
      if (filterCatSelect) filterCatSelect.innerHTML = optionsHtml;
      if (itemModalCatSelect) {
        itemModalCatSelect.innerHTML = '<option value="" disabled selected>Select category</option>' +
          data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStats() {
  try {
    const data = await window.api.getItemStats();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('statTotalItems').textContent = s.total_items;
      document.getElementById('statRecovered').textContent = `${s.resolution_rate}%`;
      document.getElementById('statActiveLost').textContent = s.active_lost;
      document.getElementById('statActiveFound').textContent = s.active_found;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadItems() {
  const grid = document.getElementById('itemsGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state">
      <div class="pulse-dot" style="margin: 0 auto 12px; width: 14px; height: 14px;"></div>
      <p>Loading campus lost and found items...</p>
    </div>
  `;

  try {
    const params = {
      search: state.searchQuery,
      category_id: state.categoryId,
      location: state.locationQuery
    };

    if (state.typeFilter === 'LOST' || state.typeFilter === 'FOUND') {
      params.type = state.typeFilter;
    } else if (state.typeFilter === 'RECOVERED') {
      params.status = 'CLAIMED';
    }

    const data = await window.api.getItems(params);
    if (data.success) {
      state.items = data.items;
      renderItemsGrid(data.items);
    }
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load items</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

function renderItemsGrid(items) {
  const grid = document.getElementById('itemsGrid');
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No items found</h3>
        <p>No matching campus reports found. Try refining your filters or report an item above!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => {
    const isLost = item.type === 'LOST';
    const typeClass = isLost ? 'lost' : 'found';
    const formattedDate = new Date(item.item_date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    const isMatched = item.status === 'MATCHED';
    const isClaimed = ['CLAIMED', 'RECOVERED'].includes(item.status);

    let statusTag = '';
    if (isMatched) {
      statusTag = `<span class="badge-status matched">⚡ AI MATCHED</span>`;
    } else if (isClaimed) {
      statusTag = `<span class="badge-status claimed">✅ ${item.status}</span>`;
    } else {
      statusTag = `<span class="badge-status">${item.status}</span>`;
    }

    const imgSrc = item.image_url || '';
    const imgHtml = imgSrc
      ? `<img src="${imgSrc}" alt="${item.item_name}" class="card-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
         <div class="card-img-placeholder" style="display:none;">${isLost ? '🔴' : '🟢'}</div>`
      : `<div class="card-img-placeholder">${isLost ? '🎒' : '📦'}</div>`;

    return `
      <div class="item-card" data-id="${item.id}">
        <div class="card-img-wrap">
          ${imgHtml}
          <span class="badge-type ${typeClass}">${item.type}</span>
          ${statusTag}
        </div>
        <div class="card-body">
          <div class="card-category-date">
            <span class="card-category">${item.category_name}</span>
            <span>${formattedDate}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.item_name)}</h3>
          <p class="card-desc">${escapeHtml(item.description || 'No additional details provided.')}</p>
          <div class="card-meta">
            <div class="card-location">📍 ${escapeHtml(item.location)}</div>
            <div class="card-reporter">Reported by: ${escapeHtml(item.poster_name)} (${item.poster_type})</div>
          </div>
          <div class="card-actions">
            <button class="btn-card-view" onclick="openItemDetails(${item.id})">
              Details ${item.matches_count > 0 ? `(${item.matches_count} Matches)` : ''}
            </button>
            ${!isLost && !isClaimed ? `
              <button class="btn-card-claim" onclick="openClaimModal(${item.id}, '${escapeHtml(item.item_name)}')">
                Claim
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Item Details Modal & Smart Match Candidates
// ============================================================
window.openItemDetails = async function(itemId) {
  try {
    const data = await window.api.getItemById(itemId);
    if (!data.success) throw new Error(data.message);

    const item = data.item;
    state.selectedItem = item;

    document.getElementById('detailItemTitle').textContent = item.item_name;
    document.getElementById('detailItemType').textContent = item.type;
    document.getElementById('detailItemType').className = `badge-type ${item.type.toLowerCase()}`;
    document.getElementById('detailItemCategory').textContent = item.category_name;
    document.getElementById('detailItemDate').textContent = new Date(item.item_date).toLocaleDateString();
    document.getElementById('detailItemLocation').textContent = item.location;
    document.getElementById('detailItemStatus').textContent = item.status;
    document.getElementById('detailItemDesc').textContent = item.description || 'No description provided.';
    document.getElementById('detailReporterName').textContent = `${item.poster_name} (${item.poster_type})`;
    document.getElementById('detailReporterContact').textContent = `${item.poster_email || ''} ${item.poster_phone ? '• ' + item.poster_phone : ''}`;

    const imgWrap = document.getElementById('detailImgContainer');
    if (item.image_url) {
      imgWrap.innerHTML = `<img src="${item.image_url}" style="width: 100%; max-height: 300px; object-fit: contain; border-radius: var(--radius-sm);" />`;
      imgWrap.style.display = 'block';
    } else {
      imgWrap.style.display = 'none';
    }

    // Matches Section inside Detail Modal
    const matchesList = document.getElementById('detailMatchesList');
    if (data.matches && data.matches.length > 0) {
      matchesList.innerHTML = `
        <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
          <h4 style="color: #c4b5fd; margin-bottom: 10px; font-size: 15px;">⚡ High-Similarity Potential Matches (${data.matches.length})</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${data.matches.map(m => `
              <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: var(--radius-sm); padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 700; color: #fff; font-size: 13px;">${escapeHtml(m.matched_item_name)} (${m.matched_type})</div>
                  <div style="font-size: 11px; color: var(--text-dim);">Found at: ${escapeHtml(m.matched_location)} • Reported by: ${escapeHtml(m.matched_user_name)}</div>
                </div>
                <div style="text-align: right;">
                  <span class="match-level-badge ${m.match_level.toLowerCase()}">${m.similarity_score}% Match</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      matchesList.innerHTML = '';
    }

    // Claim CTA
    const claimBtn = document.getElementById('detailClaimBtn');
    if (item.type === 'FOUND' && !['CLAIMED', 'RECOVERED'].includes(item.status)) {
      claimBtn.style.display = 'inline-block';
      claimBtn.onclick = () => {
        closeModal('itemDetailModal');
        openClaimModal(item.id, item.item_name);
      };
    } else {
      claimBtn.style.display = 'none';
    }

    openModal('itemDetailModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================
// Smart Matches View
// ============================================================
async function loadSmartMatches() {
  const container = document.getElementById('matchesListContainer');
  if (!container) return;

  if (!window.api.token) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <h3>Authentication Required</h3>
        <p>Please log in with your campus account to view AI matches for your reported items.</p>
        <button class="btn-hero-search" style="margin: 16px auto 0;" onclick="openModal('authModal')">Sign In Now</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="empty-state">
      <div class="pulse-dot" style="margin: 0 auto 12px; width: 14px; height: 14px;"></div>
      <p>Running smart AI matching algorithms...</p>
    </div>
  `;

  try {
    const data = await window.api.getMyMatches();
    if (!data.success) throw new Error(data.message);

    const matches = data.matches;
    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <h3>No Active Matches Yet</h3>
          <p>When someone reports an item that matches your lost or found items, the AI engine will calculate similarity and list it here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = matches.map(m => {
      const score = Math.round(m.similarity_score);
      const isHigh = m.match_level === 'HIGH';

      return `
        <div class="match-pair-card" id="match-card-${m.match_id}">
          <!-- Lost Item Column -->
          <div class="match-item-column">
            <div class="match-item-header">
              <span class="badge-type lost">LOST REPORT</span>
              <span style="font-size: 11px; color: var(--text-dim);">${new Date(m.lost_date).toLocaleDateString()}</span>
            </div>
            <h4 class="match-item-title">${escapeHtml(m.lost_name)}</h4>
            <p class="match-item-desc">${escapeHtml(m.lost_description || 'No description.')}</p>
            <div class="match-item-footer">
              <div>📍 Location: ${escapeHtml(m.lost_location)}</div>
              <div>👤 Owner: ${escapeHtml(m.lost_user_name)}</div>
            </div>
          </div>

          <!-- Similarity Gauge -->
          <div class="match-center-dial">
            <div class="match-score-bubble ${isHigh ? 'high' : ''}">
              <div class="score-number">${score}%</div>
              <div class="score-label">Match</div>
            </div>
            <span class="match-level-badge ${m.match_level.toLowerCase()}">${m.match_level} POTENTIAL</span>
            <div class="match-actions">
              ${m.match_status === 'CONFIRMED' ? `
                <span style="font-size: 11px; color: #34d399; font-weight: 700;">✅ Confirmed Match</span>
              ` : `
                <button class="btn-confirm-match" onclick="updateMatchStatus(${m.match_id}, 'CONFIRMED')">Confirm Match</button>
                <button class="btn-dismiss-match" onclick="updateMatchStatus(${m.match_id}, 'DISMISSED')">Dismiss</button>
              `}
            </div>
          </div>

          <!-- Found Item Column -->
          <div class="match-item-column">
            <div class="match-item-header">
              <span class="badge-type found">FOUND REPORT</span>
              <span style="font-size: 11px; color: var(--text-dim);">${new Date(m.found_date).toLocaleDateString()}</span>
            </div>
            <h4 class="match-item-title">${escapeHtml(m.found_name)}</h4>
            <p class="match-item-desc">${escapeHtml(m.found_description || 'No description.')}</p>
            <div class="match-item-footer">
              <div>📍 Location: ${escapeHtml(m.found_location)}</div>
              <div>👤 Finder: ${escapeHtml(m.found_user_name)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Error loading matches</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

window.updateMatchStatus = async function(matchId, status) {
  try {
    const res = await window.api.updateMatchStatus(matchId, status);
    if (res.success) {
      showToast(`Match marked as ${status}!`, 'success');
      loadSmartMatches();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================
// Claims View (User's Filed Claims)
// ============================================================
async function loadClaimsView() {
  const container = document.getElementById('myClaimsContainer');
  if (!container) return;

  if (!window.api.token) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <h3>Authentication Required</h3>
        <p>Please log in to track your ownership verification claims.</p>
        <button class="btn-hero-search" style="margin: 16px auto 0;" onclick="openModal('authModal')">Sign In</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="empty-state"><p>Loading claims history...</p></div>`;

  try {
    const data = await window.api.getMyClaims();
    if (!data.success) throw new Error(data.message);

    const claims = data.claims;
    if (claims.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No Claims Filed</h3>
          <p>You have not submitted any ownership claims on found items yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = claims.map(c => {
      let badgeClass = 'medium';
      if (c.status === 'APPROVED') badgeClass = 'high';
      if (c.status === 'REJECTED') badgeClass = 'low';

      return `
        <div class="match-pair-card" style="grid-template-columns: 1fr; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <span class="card-category">${c.category_name}</span>
              <h3 style="color: #fff; font-size: 18px; margin-top: 6px;">${escapeHtml(c.item_name)}</h3>
              <div style="font-size: 12px; color: var(--text-dim);">Found at: ${escapeHtml(c.location)} • Finder: ${escapeHtml(c.finder_name)}</div>
            </div>
            <div>
              <span class="match-level-badge ${badgeClass}" style="font-size: 12px; padding: 5px 12px;">${c.status}</span>
            </div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.5); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-bottom: 8px;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Your Proof &amp; Verification Details:</div>
            <div style="font-size: 13px; color: #e2e8f0; margin-top: 4px;">${escapeHtml(c.verification_details)}</div>
          </div>
          ${c.admin_comment ? `
            <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 4px; font-size: 12px; color: #93c5fd;">
              <strong>Admin Note:</strong> ${escapeHtml(c.admin_comment)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

// ============================================================
// Admin Dashboard
// ============================================================
async function loadAdminDashboard() {
  if (!window.api.token || window.api.user?.role !== 'ADMIN') {
    showToast('Admin privilege required.', 'error');
    switchView('catalog');
    return;
  }

  try {
    const data = await window.api.getAdminStats();
    if (!data.success) throw new Error(data.message);

    const stats = data.stats;
    document.getElementById('adminStatItems').textContent = stats.items.total_items;
    document.getElementById('adminStatUsers').textContent = stats.users.total_users;
    document.getElementById('adminStatPendingClaims').textContent = stats.claims.pending_claims;
    document.getElementById('adminStatResolutionRate').textContent = `${stats.resolutionRate}%`;

    // Load Pending Claims Table
    loadAdminClaimsTable();

    // Load Audit Logs Stream
    loadAdminLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminClaimsTable() {
  const tbody = document.getElementById('adminClaimsTableBody');
  if (!tbody) return;

  try {
    const data = await window.api.getAllClaims({ status: 'PENDING' });
    if (!data.success) throw new Error(data.message);

    const claims = data.claims;
    if (claims.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px;">No pending claims awaiting review.</td></tr>`;
      return;
    }

    tbody.innerHTML = claims.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.item_name)}</strong><br><span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(c.location)}</span></td>
        <td>${escapeHtml(c.claimant_name)}<br><span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(c.claimant_department || c.claimant_email)}</span></td>
        <td style="max-width: 260px; font-size: 12px;">${escapeHtml(c.verification_details)}</td>
        <td><span class="badge-status">${c.status}</span></td>
        <td>
          <div class="action-btns-row">
            <button class="btn-approve-sm" onclick="reviewAdminClaim(${c.id}, 'APPROVED')">Approve</button>
            <button class="btn-reject-sm" onclick="reviewAdminClaim(${c.id}, 'REJECT')">Reject</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: #ef4444; padding: 12px;">Error: ${err.message}</td></tr>`;
  }
}

window.reviewAdminClaim = async function(claimId, action) {
  const comment = prompt(`Add administrative comment or notes for this ${action} decision (optional):`);
  const status = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  try {
    const res = await window.api.reviewClaim(claimId, status, comment || '');
    if (res.success) {
      showToast(`Claim successfully ${status.toLowerCase()}!`, 'success');
      loadAdminDashboard();
      loadItems();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function loadAdminLogs() {
  const container = document.getElementById('adminLogsStream');
  if (!container) return;

  try {
    const data = await window.api.getActivityLogs();
    if (!data.success) throw new Error(data.message);

    const logs = data.logs;
    container.innerHTML = logs.map(l => `
      <div class="log-item">
        <div class="log-header">
          <span>${l.action}</span>
          <span style="font-size: 10px; color: var(--text-dim);">${new Date(l.created_at).toLocaleTimeString()}</span>
        </div>
        <div class="log-desc">${escapeHtml(l.description || 'System event recorded.')}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="font-size: 12px; color: #ef4444;">Failed to load logs.</div>`;
  }
}

// Global AI Re-Match trigger from Admin
document.getElementById('btnAdminReMatch')?.addEventListener('click', async () => {
  try {
    showToast('Running AI smart-matching across campus inventory...', 'info');
    const res = await window.api.triggerReMatch();
    showToast(`Matching complete: ${res.result.totalMatchesEvaluated || 0} candidate matches evaluated.`, 'success');
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ============================================================
// Notifications
// ============================================================
async function loadNotifications() {
  try {
    const data = await window.api.getNotifications();
    if (!data.success) return;

    state.notifications = data.notifications;
    state.unreadCount = data.unreadCount;

    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (data.unreadCount > 0) {
        badge.textContent = data.unreadCount;
        badge.classList.add('active');
      } else {
        badge.classList.remove('active');
      }
    }

    const list = document.getElementById('notifList');
    if (list) {
      if (data.notifications.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-dim); font-size: 12px;">No alerts yet.</div>`;
        return;
      }

      list.innerHTML = data.notifications.map(n => `
        <div class="notif-item ${!n.is_read ? 'unread' : ''}" onclick="markNotifRead(${n.id})">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-body">${escapeHtml(n.message)}</div>
          <div class="notif-item-time">${new Date(n.created_at).toLocaleDateString()}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

window.markNotifRead = async function(id) {
  try {
    await window.api.markNotificationRead(id);
    loadNotifications();
  } catch (e) {}
};

document.getElementById('btnMarkAllRead')?.addEventListener('click', async () => {
  try {
    await window.api.markAllNotificationsRead();
    loadNotifications();
  } catch (e) {}
});

// ============================================================
// Claim Submission Modal
// ============================================================
window.openClaimModal = function(itemId, itemName) {
  if (!window.api.token) {
    showToast('Please sign in to submit a claim.', 'info');
    openModal('authModal');
    return;
  }

  document.getElementById('claimItemId').value = itemId;
  document.getElementById('claimItemNameDisplay').textContent = itemName;
  document.getElementById('claimDescription').value = '';
  document.getElementById('claimVerification').value = '';
  openModal('claimModal');
};

document.getElementById('claimForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const itemId = document.getElementById('claimItemId').value;
  const description = document.getElementById('claimDescription').value;
  const verification = document.getElementById('claimVerification').value;

  try {
    const res = await window.api.createClaim({
      item_id: itemId,
      description,
      verification_details: verification
    });

    if (res.success) {
      showToast('Claim submitted! Campus administration and the finder have been notified.', 'success');
      closeModal('claimModal');
      switchView('claims');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ============================================================
// Report Item Form (Lost & Found)
// ============================================================
function openReportItemModal(type) {
  if (!window.api.token) {
    showToast('Please sign in to report items.', 'info');
    openModal('authModal');
    return;
  }

  document.getElementById('itemTypeInput').value = type;
  document.getElementById('reportModalTitle').textContent = type === 'LOST'
    ? 'Report a Lost Item'
    : 'Report a Found Item';

  const typeHeaderBadge = document.getElementById('reportTypeBadge');
  if (typeHeaderBadge) {
    typeHeaderBadge.textContent = type;
    typeHeaderBadge.className = `badge-type ${type.toLowerCase()}`;
  }

  document.getElementById('reportItemForm').reset();
  document.getElementById('uploadPreviewImg').style.display = 'none';

  // Set default date to today
  document.getElementById('itemDateInput').value = new Date().toISOString().slice(0, 10);

  openModal('reportItemModal');
}

document.getElementById('btnOpenReportLost')?.addEventListener('click', () => openReportItemModal('LOST'));
document.getElementById('btnOpenReportFound')?.addEventListener('click', () => openReportItemModal('FOUND'));

document.getElementById('reportItemForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  try {
    showToast('Submitting item report...', 'info');
    const res = await window.api.createItem(formData);

    if (res.success) {
      closeModal('reportItemModal');
      showToast(res.message, 'success');

      if (res.matchesCreated > 0) {
        showToast(`⚡ AI Engine detected ${res.matchesCreated} potential matching items! Check the Smart Matches tab.`, 'info');
      }

      await loadStats();
      await loadItems();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Image dropzone preview
function setupUploadPreviews() {
  const fileInput = document.getElementById('itemImageInput');
  const preview = document.getElementById('uploadPreviewImg');

  if (fileInput && preview) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.src = e.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// ============================================================
// Filter Listeners
// ============================================================
function setupFilterListeners() {
  // Tab buttons (All, Lost, Found, Recovered)
  document.querySelectorAll('.tab-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.typeFilter = btn.getAttribute('data-type');
      loadItems();
    });
  });

  // Secondary filters
  document.getElementById('filterCategorySelect')?.addEventListener('change', (e) => {
    state.categoryId = e.target.value;
    loadItems();
  });

  document.getElementById('filterLocationInput')?.addEventListener('input', (e) => {
    state.locationQuery = e.target.value;
    debounce(() => loadItems(), 300)();
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', () => {
    state.typeFilter = '';
    state.categoryId = '';
    state.searchQuery = '';
    state.locationQuery = '';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-type=""]')?.classList.add('active');
    document.getElementById('filterCategorySelect').value = '';
    document.getElementById('filterLocationInput').value = '';
    document.getElementById('heroSearchInput').value = '';
    loadItems();
  });
}

// ============================================================
// Authentication & 1-Click Demo Logins
// ============================================================
function setupDemoLogin() {
  document.getElementById('btnDemoStudent')?.addEventListener('click', async () => {
    await performLogin('student@campus.edu', 'Student@123');
  });

  document.getElementById('btnDemoAdmin')?.addEventListener('click', async () => {
    await performLogin('admin@campus.edu', 'Admin@123');
  });

  document.getElementById('btnDemoFinder')?.addEventListener('click', async () => {
    await performLogin('sophia@campus.edu', 'Student@123');
  });

  // Form submit for normal login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    await performLogin(email, pass);
  });

  // Registration form
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      full_name: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      phone: document.getElementById('regPhone').value,
      password: document.getElementById('regPassword').value,
      user_type: document.getElementById('regUserType').value,
      department: document.getElementById('regDept').value,
      college: document.getElementById('regCollege').value
    };

    try {
      const res = await window.api.register(payload);
      if (res.success) {
        showToast('Registration successful! Welcome.', 'success');
        closeModal('authModal');
        updateAuthUI();
        loadNotifications();
        loadItems();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Toggle between login and register tabs
  document.getElementById('authTabLogin')?.addEventListener('click', () => {
    document.getElementById('authTabLogin').classList.add('active');
    document.getElementById('authTabRegister').classList.remove('active');
    document.getElementById('loginFormWrapper').style.display = 'block';
    document.getElementById('registerFormWrapper').style.display = 'none';
  });

  document.getElementById('authTabRegister')?.addEventListener('click', () => {
    document.getElementById('authTabRegister').classList.add('active');
    document.getElementById('authTabLogin').classList.remove('active');
    document.getElementById('loginFormWrapper').style.display = 'none';
    document.getElementById('registerFormWrapper').style.display = 'block';
  });
}

async function performLogin(email, password) {
  try {
    const res = await window.api.login(email, password);
    if (res.success) {
      showToast(res.message, 'success');
      closeModal('authModal');
      updateAuthUI();
      loadNotifications();
      loadItems();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// Modal Helpers
// ============================================================
function setupModalEvents() {
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  document.getElementById('btnNavLogin')?.addEventListener('click', () => {
    openModal('authModal');
  });
}

window.openModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
};

window.closeModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
};

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let debounceTimer;
function debounce(fn, delay) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn.apply(this, args), delay);
  };
}
