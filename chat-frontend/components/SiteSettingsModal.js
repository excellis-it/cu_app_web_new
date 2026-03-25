import React, { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import { Button, TextField, Skeleton, Grid, InputAdornment } from '@mui/material';
import axios from 'axios';
import Swal from 'sweetalert2';
import { useAppContext } from '../appContext/appContext';

// Icons
import SaveIcon from '@mui/icons-material/Save';
import BrandingWatermarkIcon from '@mui/icons-material/BrandingWatermark';
import TitleIcon from '@mui/icons-material/Title';
import DescriptionIcon from '@mui/icons-material/Description';
import LinkIcon from '@mui/icons-material/Link';
import PaletteIcon from '@mui/icons-material/Palette';
import SettingsIcon from '@mui/icons-material/Settings';

const SiteSettingsModal = ({ show, onHide }) => {
    const { globalUser, setSiteSettings } = useAppContext();
    const [settings, setSettings] = useState({
        siteName: '',
        siteDescription: '',
        siteLogo: null, // File or URL
        siteMainImage: null, // File or URL
        primaryColor: '#f37e20',
        secondaryColor: '#35a200',
        accentColor: '#ff6b6b',
        backgroundColor: '#ffffff'
    });
    const [previews, setPreviews] = useState({
        siteLogo: '',
        siteMainImage: ''
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Fetch settings on load
    useEffect(() => {
        if (show) {
            fetchSettings();
        }
    }, [show]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/admin/site/get-site-details', {
                headers: {
                    'Authorization': `Bearer ${globalUser?.data?.token}`
                }
            });

            // Console log to debug response
            console.log("Site Settings Response:", response.data);

            const data = response.data?.data || {};

            // Use defaults if data is empty (first run)
            const siteName = data.siteName || 'ExTalk';
            const siteDescription = data.siteDescription || 'Premium Secure Communication Platform';
            const normalizeSiteLogo = (logo) => {
                if (!logo) return logo;
                if (typeof logo !== 'string') return logo;
                if (logo.toLowerCase().includes('extalk.png')) return 'cu-logo-2.svg';
                return logo;
            };

            const siteLogo = normalizeSiteLogo(data.siteLogo) || 'cu-logo-2.svg';
            const siteMainImage = data.siteMainImage || 'login-bg.png'; // Assuming a default

            setSettings({
                siteName,
                siteDescription,
                siteLogo,
                siteMainImage,
                primaryColor: data.primaryColor || '#f37e20',
                secondaryColor: data.secondaryColor || '#35a200',
                accentColor: data.accentColor || '#ff6b6b',
                backgroundColor: data.backgroundColor || '#ffffff'
            });
            setPreviews({
                siteLogo: siteLogo,
                siteMainImage: siteMainImage
            });

        } catch (error) {
            console.error("Failed to fetch site settings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e, field) => {
        const file = e.target.files[0];
        if (file) {
            setSettings({ ...settings, [field]: file });
            setPreviews({ ...previews, [field]: URL.createObjectURL(file) });
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Simulate form data preparation
            const formData = new FormData();
            formData.append('siteName', settings.siteName);
            formData.append('siteDescription', settings.siteDescription);
            formData.append('primaryColor', settings.primaryColor);
            formData.append('secondaryColor', settings.secondaryColor);
            formData.append('accentColor', settings.accentColor);
            formData.append('backgroundColor', settings.backgroundColor);
            if (settings.siteLogo instanceof File) {
                formData.append('siteLogo', settings.siteLogo);
            }
            if (settings.siteMainImage instanceof File) {
                formData.append('siteMainImage', settings.siteMainImage);
            }

            // Simulate API call
            const response = await axios.post('/api/admin/site/update-site-details', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${globalUser?.data?.token}`
                }
            });

            // await new Promise(resolve => setTimeout(resolve, 1500));

            // Update global context immediately with returned data
            if (response.data?.success && setSiteSettings) {
                const updatedData = response.data.data;
                console.log("Updated Site Data:", updatedData);

                let newLogo = updatedData.siteLogo;
                if (!newLogo && settings.siteLogo instanceof File) {
                    newLogo = previews.siteLogo; // Fallback to blob if backend doesn't return URL
                } else if (!newLogo) {
                    newLogo = settings.siteLogo;
                }

                const normalizeSiteLogo = (logo) => {
                    if (!logo) return logo;
                    if (typeof logo !== 'string') return logo;
                    if (logo.toLowerCase().includes('extalk.png')) return 'cu-logo-2.svg';
                    return logo;
                };

                setSiteSettings(prev => ({
                    ...prev,
                    siteName: updatedData.siteName || prev.siteName || settings.siteName,
                    siteDescription: updatedData.siteDescription || prev.siteDescription || settings.siteDescription,
                    siteLogo: normalizeSiteLogo(newLogo) || prev.siteLogo,
                    siteMainImage: updatedData.siteMainImage || prev.siteMainImage,
                    primaryColor: updatedData.primaryColor || settings.primaryColor,
                    secondaryColor: updatedData.secondaryColor || settings.secondaryColor,
                    accentColor: updatedData.accentColor || settings.accentColor,
                    backgroundColor: updatedData.backgroundColor || settings.backgroundColor
                }));
            }

            Swal.fire({
                title: 'Settings Saved',
                text: 'Site configuration updated successfully',
                timer: 1500,
                showConfirmButton: false
            });
            onHide();
        } catch (error) {
            Swal.fire({
                title: 'Error',
                text: 'Failed to save settings. Please try again.'
            });
        } finally {
            setSaving(false);
        }
    };

    if (globalUser?.data?.user?.userType !== 'SuperAdmin' && globalUser?.data?.user?.userType !== 'admin') {
        return null; // Security check
    }

    return (
        <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
            <Modal.Header closeButton style={{ borderBottom: '1px solid #eee' }}>
                <Modal.Title style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <SettingsIcon sx={{ color: '#f37e20' }} />
                    Site Settings
                </Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ padding: '24px' }}>
                {loading ? (
                    <Grid container spacing={3}>
                        {[1, 2, 3, 4].map((i) => (
                            <Grid item xs={12} key={i}>
                                <Skeleton variant="rectangular" height={56} animation="wave" sx={{ borderRadius: 1 }} />
                            </Grid>
                        ))}
                    </Grid>
                ) : (
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TextField
                                label="Site Name"
                                name="siteName"
                                value={settings.siteName}
                                onChange={handleChange}
                                fullWidth
                                required
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <TitleIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                label="Site Description"
                                name="siteDescription"
                                value={settings.siteDescription}
                                onChange={handleChange}
                                fullWidth
                                multiline
                                rows={3}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                                            <DescriptionIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        {/* Color Customization Section */}
                        <Grid item xs={12}>
                            <div style={{
                                border: '2px solid #f37e20',
                                borderRadius: '8px',
                                padding: '20px',
                                backgroundColor: '#fef9f5'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                    <PaletteIcon sx={{ color: '#f37e20' }} />
                                    <h5 style={{ margin: 0, color: '#333' }}>Theme Customization</h5>
                                </div>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6} md={3}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                            Primary Color
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="color"
                                                name="primaryColor"
                                                value={settings.primaryColor}
                                                onChange={handleChange}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    border: '2px solid #ccc',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <TextField
                                                value={settings.primaryColor}
                                                onChange={handleChange}
                                                name="primaryColor"
                                                size="small"
                                                placeholder="#f37e20"
                                                sx={{ flex: 1 }}
                                            />
                                        </div>
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={3}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                            Secondary Color
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="color"
                                                name="secondaryColor"
                                                value={settings.secondaryColor}
                                                onChange={handleChange}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    border: '2px solid #ccc',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <TextField
                                                value={settings.secondaryColor}
                                                onChange={handleChange}
                                                name="secondaryColor"
                                                size="small"
                                                placeholder="#35a200"
                                                sx={{ flex: 1 }}
                                            />
                                        </div>
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={3}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                            Accent Color
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="color"
                                                name="accentColor"
                                                value={settings.accentColor}
                                                onChange={handleChange}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    border: '2px solid #ccc',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <TextField
                                                value={settings.accentColor}
                                                onChange={handleChange}
                                                name="accentColor"
                                                size="small"
                                                placeholder="#ff6b6b"
                                                sx={{ flex: 1 }}
                                            />
                                        </div>
                                    </Grid>
                                    <Grid item xs={12} sm={6} md={3}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                            Background Color
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="color"
                                                name="backgroundColor"
                                                value={settings.backgroundColor}
                                                onChange={handleChange}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    border: '2px solid #ccc',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <TextField
                                                value={settings.backgroundColor}
                                                onChange={handleChange}
                                                name="backgroundColor"
                                                size="small"
                                                placeholder="#ffffff"
                                                sx={{ flex: 1 }}
                                            />
                                        </div>
                                    </Grid>
                                </Grid>
                            </div>
                        </Grid>

                        {/* Site Logo Upload */}
                        <Grid item xs={12} md={6}>
                            <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Site Logo</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    {previews.siteLogo && (
                                        <img
                                            src={previews.siteLogo}
                                            alt="Logo Preview"
                                            style={{ width: '60px', height: '60px', objectFit: 'contain', border: '1px solid #eee' }}
                                        />
                                    )}
                                    <Button
                                        variant="outlined"
                                        component="label"
                                        startIcon={<BrandingWatermarkIcon />}
                                    >
                                        Upload Logo
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, 'siteLogo')}
                                        />
                                    </Button>
                                </div>
                            </div>
                        </Grid>

                        {/* Main Image Upload */}
                        <Grid item xs={12} md={6}>
                            <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Site Main Image</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    {previews.siteMainImage && (
                                        <img
                                            src={previews.siteMainImage}
                                            alt="Main Image Preview"
                                            style={{ width: '100px', height: '60px', objectFit: 'cover', border: '1px solid #eee' }}
                                        />
                                    )}
                                    <Button
                                        variant="outlined"
                                        component="label"
                                        startIcon={<LinkIcon />} // reusing link icon for image
                                    >
                                        Upload Image
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={(e) => handleFileChange(e, 'siteMainImage')}
                                        />
                                    </Button>
                                </div>
                            </div>
                        </Grid>
                    </Grid>
                )}
            </Modal.Body>
            <Modal.Footer style={{ borderTop: '1px solid #eee', padding: '16px 24px' }}>
                <Button
                    onClick={onHide}
                    style={{ color: '#666', marginRight: '10px', textTransform: 'none' }}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || loading || !settings.siteName}
                    startIcon={saving ? null : <SaveIcon />}
                    style={{
                        backgroundColor: '#f37e20',
                        color: 'white',
                        boxShadow: 'none',
                        textTransform: 'none',
                        minWidth: '120px'
                    }}
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default SiteSettingsModal;
