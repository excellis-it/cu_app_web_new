"use client"
import ProfileHeader from '@/app/shared/profile/profile-header';
import { useEffect } from 'react';

export default function ProfilePage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'Profile';
    }
  }, []);
  return (
    <div className="@container">
      <ProfileHeader />
    </div>
  );
}
