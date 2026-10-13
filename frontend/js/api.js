// js/api.js - Frontend API Client for Smart Campus Lost & Found System

const API_BASE = window.location.origin.includes('localhost')
  ? `${window.location.origin}/api`
  : '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('sclf_token') || null;
    this.user = JSON.parse(localStorage.getItem('sclf_user') || 'null');
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    if (token) {
      localStorage.setItem('sclf_token', token);
      localStorage.setItem('sclf_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sclf_token');
      localStorage.removeItem('sclf_user');
    }
  }

  logout() {
    this.setSession(null, null);
  }

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({
        success: false,
        message: `HTTP ${response.status}: Failed to parse JSON response`
      }));

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // Auth Endpoints
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.success && data.token) {
      this.setSession(data.token, data.user);
    }
    return data;
  }

  async register(payload) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.success && data.token) {
      this.setSession(data.token, data.user);
    }
    return data;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async getDemoAccounts() {
    return this.request('/auth/demo-accounts');
  }

  // Items Endpoints
  async getItems(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    return this.request(`/items?${query.toString()}`);
  }

  async getItemById(id) {
    return this.request(`/items/${id}`);
  }

  async getCategories() {
    return this.request('/items/categories');
  }

  async getItemStats() {
    return this.request('/items/stats');
  }

  async getMyItems() {
    return this.request('/items/my');
  }

  async createItem(formData) {
    return this.request('/items', {
      method: 'POST',
      body: formData
    });
  }

  async updateItem(id, formData) {
    return this.request(`/items/${id}`, {
      method: 'PUT',
      body: formData
    });
  }

  async deleteItem(id) {
    return this.request(`/items/${id}`, {
      method: 'DELETE'
    });
  }

  // Matches Endpoints
  async getMyMatches() {
    return this.request('/matches/my');
  }

  async getMatchesForItem(itemId) {
    return this.request(`/matches/item/${itemId}`);
  }

  async updateMatchStatus(matchId, status) {
    return this.request(`/matches/${matchId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  async triggerReMatch(itemId = null) {
    return this.request('/matches/re-match', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    });
  }

  // Claims Endpoints
  async createClaim(payload) {
    return this.request('/claims', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getMyClaims() {
    return this.request('/claims/my');
  }

  async getAllClaims(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/claims/all?${query}`);
  }

  async reviewClaim(claimId, status, adminComment = '') {
    return this.request(`/claims/${claimId}/review`, {
      method: 'PUT',
      body: JSON.stringify({ status, admin_comment: adminComment })
    });
  }

  // Notifications Endpoints
  async getNotifications() {
    return this.request('/notifications');
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', {
      method: 'PUT'
    });
  }

  async markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, {
      method: 'PUT'
    });
  }

  // Admin Endpoints
  async getAdminStats() {
    return this.request('/admin/stats');
  }

  async getAdminUsers() {
    return this.request('/admin/users');
  }

  async updateUserRole(userId, role) {
    return this.request(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  async getActivityLogs(page = 1) {
    return this.request(`/admin/activity-logs?page=${page}`);
  }
}

window.api = new ApiService();
