// appContext.js

import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const AppContext = createContext();

export function useAppContext() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [globalUser, setGlobalUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forgotPassEmail, setforgotPassEmail] = useState()
  const [forgotPassSlug, setforgotPassSlug] = useState()

  const [siteSettings, setSiteSettings] = useState({
    siteLogo: 'extalk.png',
    siteName: 'ExTalk',
    primaryColor: '#f37e20',
    secondaryColor: '#35a200',
    accentColor: '#ff6b6b',
    backgroundColor: '#ffffff'
  });

  // Apply colors as CSS variables whenever siteSettings changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--primary-color', siteSettings.primaryColor);
      root.style.setProperty('--secondary-color', siteSettings.secondaryColor);
      root.style.setProperty('--accent-color', siteSettings.accentColor);
      root.style.setProperty('--background-color', siteSettings.backgroundColor);
    }
  }, [siteSettings]);

  useEffect(() => {
    const initApp = async () => {
      let token = null;
      const user = localStorage.getItem('user');
      if (user) {
        const parsedUser = JSON.parse(user);
        setGlobalUser(parsedUser);
        token = parsedUser?.data?.token;

        if (token) {
          document.cookie = `access-token=${token}; path=/; max-age=86400; SameSite=Lax`;
        }
      }

      // Fetch site settings immediately if token exists (or even if not, if endpoint allows public access - assuming public read is needed for login page logo too?)
      // Since endpoint is protected, we can only fetch if token is present.
      if (token) {
        try {
          const response = await axios.get('/api/admin/site/get-site-details', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.data?.data) {
            const data = response.data.data;
            setSiteSettings(prev => ({
              ...prev,
              siteLogo: data.siteLogo || prev.siteLogo,
              siteName: data.siteName || prev.siteName,
              siteDescription: data.siteDescription || '',
              siteMainImage: data.siteMainImage || '',
              primaryColor: data.primaryColor || prev.primaryColor,
              secondaryColor: data.secondaryColor || prev.secondaryColor,
              accentColor: data.accentColor || prev.accentColor,
              backgroundColor: data.backgroundColor || prev.backgroundColor
            }));
          }
        } catch (error) {
          console.error("Failed to load initial site settings", error);
        }
      }

      setLoading(false);
    };

    initApp();
  }, [])

  return (
    <AppContext.Provider value={{ globalUser, setGlobalUser, loading, forgotPassEmail, setforgotPassEmail, forgotPassSlug, setforgotPassSlug, siteSettings, setSiteSettings }}>
      {children}
    </AppContext.Provider>
  );
}
