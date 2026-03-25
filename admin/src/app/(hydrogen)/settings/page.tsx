"use client"
import SiteSettings from '@/app/shared/site-settings';
import { useEffect } from 'react';


export default function SettingsPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'Settings';
    }
  }, []);
  return (
    <div className="@container">
      <SiteSettings />
    </div>
  );
}
