import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState(null); // Shop session from resolveSession
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'jewelcore', public_settings: { auth_required: true } });

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setAuthError(null);
      const token = base44.auth.getToken() || appParams.token;
      if (token) {
        await checkUserAuth();
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
      }
    } catch (error) {
      console.error('App state check failed:', error);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      // Resolve shop session for multi-tenant role + onboarding status
      let sessionData = null;
      try {
        const res = await base44.functions.invoke("resolveSession");
        sessionData = res.data;
      } catch (e) { console.error("Session resolution failed:", e); }
      if (sessionData?.authenticated) {
        setSession(sessionData);
        setUser({ ...currentUser, ...sessionData.user });
        if (sessionData.shop?.id) {
          base44.shops.setActiveShopId(sessionData.shop.id);
        }
      } else {
        setUser(currentUser);
      }
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const switchShop = async (shopId) => {
    try {
      setIsLoadingAuth(true);
      await base44.shops.switchShop(shopId);
      base44.shops.setActiveShopId(shopId);
      await checkUserAuth();
      // Reload active route data
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch shop:', err);
      setIsLoadingAuth(false);
      throw err;
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setSession(null);
    base44.shops.setActiveShopId(null);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      session,
      activeShop: session?.shop || null,
      shops: session?.shops || [],
      switchShop,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};