import { sanitizeInternalPath, isAuthRoute, buildLoginUrl, DEFAULT_AUTH_LANDING } from '@/lib/authReturnTo';

// JewelCore ERP Self-Hosted API Client
// Independent REST client connecting directly to the local/self-hosted Express server.

const getToken = () => {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem('token') || localStorage.getItem('base44_access_token') || null;
  // Guard against corrupted or oversized storage values
  if (t && (typeof t !== 'string' || t.length > 2048 || t === 'null' || t === 'undefined')) {
    localStorage.removeItem('token');
    localStorage.removeItem('base44_access_token');
    return null;
  }
  return t;
};

const setToken = (token) => {
  if (typeof window === 'undefined') return;
  if (token && typeof token === 'string' && token !== 'null' && token !== 'undefined') {
    localStorage.setItem('token', token);
    localStorage.setItem('base44_access_token', token);
  } else {
    localStorage.removeItem('token');
    localStorage.removeItem('base44_access_token');
    localStorage.removeItem('jewelcore_access_token');
  }
};

const getActiveShopId = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('active_shop_id') || localStorage.getItem('active_tenant_id') || null;
};

const setActiveShopId = (shopId) => {
  if (typeof window === 'undefined') return;
  if (shopId) {
    localStorage.setItem('active_shop_id', shopId);
    localStorage.setItem('active_tenant_id', shopId);
  } else {
    localStorage.removeItem('active_shop_id');
    localStorage.removeItem('active_tenant_id');
  }
};

const request = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  // Financial Safety Lock: Reject mutating requests when offline to prevent duplicate transactions and data corruption
  if (typeof navigator !== 'undefined' && !navigator.onLine && method !== 'GET') {
    const err = new Error('Financial Safety Lock Active: Cannot execute transaction while offline. Live database connection required to prevent duplicate invoices.');
    err.status = 503;
    err.isOffline = true;
    err.response = { status: 503, data: { error: err.message, financial_safety_lock: true } };
    throw err;
  }

  const token = getToken();
  const activeShopId = getActiveShopId();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeShopId ? { 'x-tenant-id': activeShopId, 'x-shop-id': activeShopId } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorData = {};
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: res.statusText };
    }
    const err = new Error(errorData.error || errorData.message || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.data = errorData;
    err.response = { status: res.status, data: errorData };
    throw err;
  }
  return res.json();
};

export const client = {
  auth: {
    setToken: (token) => {
      setToken(token);
    },

    getToken: () => {
      return getToken();
    },

    me: async () => {
      const token = getToken();
      if (!token) throw { status: 401, message: 'Unauthenticated' };
      try {
        return await request('/api/auth/me');
      } catch (err) {
        // Stale or invalid token: clean it up immediately to stop repeated 401 calls
        if (err.status === 401 || err.status === 403) {
          setToken(null);
        }
        throw err;
      }
    },

    register: async ({ email, password, full_name, role, active_shop_role }) => {
      return request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name, role, active_shop_role })
      });
    },

    verifyOtp: async ({ email, otpCode }) => {
      const data = await request('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otpCode })
      });
      if (data.access_token || data.token) {
        setToken(data.access_token || data.token);
      }
      return data;
    },

    resendOtp: async (email) => {
      return request('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },

    resetPasswordRequest: async (email) => {
      return request('/api/auth/reset-password-request', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },

    resetPassword: async ({ resetToken, newPassword }) => {
      return request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword })
      });
    },

    loginViaEmailPassword: async (email, password) => {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.token || data.access_token) {
        setToken(data.token || data.access_token);
      }
      return data.user;
    },

    loginWithProvider: (provider, returnTo = DEFAULT_AUTH_LANDING) => {
      const dest = buildLoginUrl(returnTo);
      window.location.href = dest;
    },

    logout: (redirectUrl = '/login') => {
      setToken(null);
      setActiveShopId(null);
      if (typeof window !== 'undefined') {
        const safe = sanitizeInternalPath(redirectUrl, '/login');
        window.location.href = isAuthRoute(safe) ? '/login' : safe;
      }
    },

    redirectToLogin: (returnTo) => {
      if (typeof window === 'undefined') return;
      // Rule 1: The login page must NEVER redirect to itself
      if (isAuthRoute(window.location.pathname)) {
        return;
      }
      const dest = buildLoginUrl(returnTo);
      const current = window.location.pathname + window.location.search;
      if (current === dest) {
        return;
      }
      window.location.href = dest;
    }
  },

  shops: {
    getActiveShopId,
    setActiveShopId,
    listMyShops: async () => request('/api/auth/my-shops'),
    switchShop: async (shopId) => {
      const res = await request('/api/auth/switch-shop', {
        method: 'POST',
        body: JSON.stringify({ shop_id: shopId })
      });
      if (res.success) {
        setActiveShopId(shopId);
      }
      return res;
    }
  },

  entities: new Proxy({}, {
    get(target, entityName) {
      return {
        list: async (sort = '-created_date', limit = 100) => {
          const params = new URLSearchParams();
          if (sort) params.set('sort', sort);
          if (limit) params.set('limit', limit);
          return request(`/api/entities/${entityName}?${params.toString()}`);
        },

        filter: async (query = {}, sort = '-created_date', limit = 100) => {
          return request(`/api/entities/${entityName}/filter`, {
            method: 'POST',
            body: JSON.stringify({ query, sort, limit })
          });
        },

        get: async (id) => {
          return request(`/api/entities/${entityName}/${id}`);
        },

        create: async (data) => {
          return request(`/api/entities/${entityName}`, {
            method: 'POST',
            body: JSON.stringify(data)
          });
        },

        update: async (id, data) => {
          return request(`/api/entities/${entityName}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
        },

        delete: async (id) => {
          return request(`/api/entities/${entityName}/${id}`, {
            method: 'DELETE'
          });
        }
      };
    }
  }),

  functions: {
    invoke: async (functionName, payload = {}) => {
      const data = await request(`/api/functions/${functionName}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return { data };
    }
  },

  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        const token = getToken();
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        if (!res.ok) {
          throw new Error('File upload failed');
        }
        return res.json();
      },

      UploadPublicFile: async ({ file }) => {
        const formData = new FormData();
        formData.append('file', file);
        const token = getToken();
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        if (!res.ok) {
          throw new Error('File upload failed');
        }
        return res.json();
      }
    }
  }
};

export const api = client;
export const base44 = client;
export default client;
