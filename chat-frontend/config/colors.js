/**
 * Color Configuration
 * Centralized color palette for the application
 * Update these values to change the color scheme across the entire app
 */

const colors = {
  // Primary Colors
  // Match CU-Web palette
  primary: '#1da678',        // Primary green
  primaryDark: '#145c4b',    // Darker shade of primary
  primaryLight: '#35a200',   // Lighter shade of primary
  
  // Secondary Colors
  secondary: '#145c4b',      // Use green as secondary
  secondaryDark: '#0f4a3a',  // Darker shade of secondary
  secondaryLight: '#25767b', // Lighter shade of secondary
  
  // Background Colors
  backgroundDark: '#ffffff', // Dark background
  backgroundLight: '#ffffff', // Light background
  backgroundGray: '#f2f2f2',  // Gray background (sidebar)
  
  // Text Colors
  textPrimary: '#ffffff',     // Primary text color
  textSecondary: '#000000',   // Secondary text color
  textDark: '#000000',        // Dark text color
  
  // Border Colors
  borderGray: '#858596',      // Gray border color
  
  // Status Colors
  success: '#28a745',          // Green for success
  error: '#d63030',           // Red for errors
  warning: '#ffc107',          // Yellow for warnings
  info: '#3085d6',             // Blue for info
  
  // Utility Colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

/** @returns {string} Solid fill color (legacy API; extra args ignored) */
const getGradient = (startColor = colors.primary) => startColor;

// CommonJS export for Node.js (Tailwind config)
module.exports = {
  colors,
  getGradient,
};

// ES6 export for React components (if needed)
if (typeof window !== 'undefined') {
  window.colors = colors;
  window.getGradient = getGradient;
}

