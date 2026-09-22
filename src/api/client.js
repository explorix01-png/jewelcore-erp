// JewelCore ERP Self-Hosted API Client
// Independent REST client connecting directly to the local/self-hosted Express server.

const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || localStorage.getItem('base44_access_token') || null;
};

const setToken = (token) => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('token', token);
    localStorage.setItem('base44_access_token', token);
  } else {
    localStorage.removeItem('token');
    localStorage.removeItem('base44_access_token');
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
      return request('/api/auth/me');
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

    loginWithProvider: (provider, returnTo = '/') => {
      window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    },

    logout: (redirectUrl) => {
      setToken(null);
      setActiveShopId(null);
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    },

    redirectToLogin: (returnTo) => {
      const dest = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
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
