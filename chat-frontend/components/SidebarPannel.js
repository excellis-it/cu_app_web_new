import React, { useState } from 'react';

import GroupsIcon from '@mui/icons-material/Groups';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CallIcon from '@mui/icons-material/Call';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import PeopleIcon from '@mui/icons-material/People';
import { useAppContext } from "./../appContext/appContext";
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { Height } from '@mui/icons-material';
import SiteSettingsModal from './SiteSettingsModal';
import axios from 'axios';

const SidebarPanel = ({ onSelect, handleShow2, handleLogout, activeIndex, setActiveIndex, className = "" }) => {

  const { globalUser, setGlobalUser } = useAppContext();
  const [showSettings, setShowSettings] = useState(false);

  let menuItems = globalUser?.data?.user?.userType !== 'user' ? [
    { id: 0, label: 'Chats', icon: <GroupsIcon />, name: 'all_groups' },
    { id: 1, label: 'Calls', icon: <CallIcon />, name: 'call_history' },
    { id: 2, label: 'Meetings', icon: <CalendarMonthIcon />, name: 'meetings' },
    { id: 3, label: 'Add Group', icon: <GroupAddIcon />, name: 'add_group' },
    { id: 4, label: 'Add Member', icon: <PersonAddIcon />, name: 'add_member' },
    // { id: 5, label: 'Create Meeting', icon: <VideoCallIcon />, name: 'create_meeting' },
    { id: 6, label: 'All Members', icon: <PeopleIcon />, name: 'all_members' },
    // { id: 7, label: 'Create Guest Meeting', icon: <VideoCallIcon />, name: 'create_guest_meeting' },
    // { id: 8, label: 'Guest Meetings', icon: <GroupsIcon />, name: 'list_guest_meeting' },

  ] : [
    { id: 0, label: 'Chats', icon: <GroupsIcon />, name: 'all_groups' },
    { id: 1, label: 'Calls', icon: <CallIcon />, name: 'call_history' },
    { id: 2, label: 'Meetings', icon: <CalendarMonthIcon />, name: 'meetings' },
  ]

  const handleClick = (name, index) => {
    if (activeIndex === index) return; // Prevent re-clicking active tab
    if (typeof setActiveIndex === 'function') setActiveIndex(index);
    if (onSelect) onSelect(name); // optional callback
  };

  /* Reverting: User wants separate button for site settings */
  /* const openSettings = () => { ... } - REMOVED */

  const { siteSettings, setSiteSettings } = useAppContext();
  const [siteDetailsFetched, setSiteDetailsFetched] = useState(false);

  React.useEffect(() => {
    const fetchSiteDetails = async () => {
      if (globalUser?.data?.token && !siteDetailsFetched) { // Avoid re-fetching if already done? Or just fetch on mount
        try {
          const response = await axios.get('/api/admin/site/get-site-details', {
            headers: {
              'Authorization': `Bearer ${globalUser?.data?.token}`
            }
          });
          if (response.data?.data) {
            const data = response.data.data;
            setSiteSettings(prev => ({
              ...prev,
              siteName: data.siteName || prev.siteName,
              siteLogo: data.siteLogo || prev.siteLogo,
              siteDescription: data.siteDescription || prev.siteDescription,
              siteMainImage: data.siteMainImage || prev.siteMainImage
            }));
            setSiteDetailsFetched(true);
          }
        } catch (error) {
          console.error("Failed to fetch site details for sidebar:", error);
        }
      }
    };
    fetchSiteDetails();
  }, [globalUser?.data?.token]); // Dependency on token

  return (
    <div className={`sidebar ${className}`} onClick={(e) => e.stopPropagation()}>
      <div className="sidebar-header" onClick={() => onSelect('logo_click')} style={{ cursor: "pointer", display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
        <img
          src={siteSettings?.siteLogo || "extalk.png"}
          alt={siteSettings?.siteName || "Logo"}
          style={{ maxHeight: '40px', objectFit: 'contain' }}
        />
      </div>
      <ul className="sidebar-menu">
        {menuItems.map((item, index) => (
          <li
            key={item.id}
            className={`sidebar-item ${activeIndex === index ? 'active' : ''}`}
            onClick={() => handleClick(item.name, index)}
          >
            <div className="sidebar-content">
              <span className="sidebar-icon">{item.icon}</span>
              <span className={`sidebar-label ${activeIndex === index ? 'active' : ''}`}>{item.label}</span>
            </div>
          </li>
        ))}
      </ul>
      <ul className="sidebar-menu mt-auto">
        {/* Site Settings for SuperAdmin Only */}
        {(globalUser?.data?.user?.userType === 'SuperAdmin') && (
          <li className="sidebar-item" onClick={() => setShowSettings(true)}>
            <div className="sidebar-content text-center">
              <span className="sidebar-icon m-0">
                <SettingsIcon sx={{ color: '#f37e20' }} /> {/* Distinct color */}
              </span>
              <span className="sidebar-label">Site Settings</span>
            </div>
          </li>
        )}

        <li className="sidebar-item" onClick={handleShow2}>
          <div className="sidebar-content text-center">
            <span className="sidebar-icon m-0"><SettingsIcon /></span>
            <span className="sidebar-label" >Settings</span>
          </div>
        </li>
        <li className="sidebar-item" onClick={handleLogout}>
          <div className="sidebar-content text-center">
            <span className="sidebar-icon m-0"><LogoutIcon /></span>
            <span className="sidebar-label" >Logout</span>
          </div>
        </li>

      </ul>

      {/* Admin Site Settings Modal */}
      {showSettings && (
        <SiteSettingsModal
          show={showSettings}
          onHide={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default SidebarPanel;
