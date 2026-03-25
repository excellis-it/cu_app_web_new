/**
 * Color Configuration
 * Centralized color palette for the application
 * Update these values to change the color scheme across the entire app
 */

const colors = {
  // Primary Colors
  primary: '#f37e20',        // Main orange color
  primaryDark: '#d66a1a',    // Darker shade of primary
  primaryLight: '#ff8f40',   // Lighter shade of primary
  
  // Secondary Colors
  secondary: '#ad1e23',      // Red accent color
  secondaryDark: '#8a181c',  // Darker shade of secondary
  secondaryLight: '#c42a2f', // Lighter shade of secondary
  
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
  
  // Gradient
  gradient: 'linear-gradient(268deg, #f37e20 38%, #ad1e23 93.09%)',
  
  // Utility Colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

/**
 * Get gradient with custom colors
 * @param {string} startColor - Start color for gradient
 * @param {string} endColor - End color for gradient
 * @param {number} startPercent - Start percentage (default: 38)
 * @param {number} endPercent - End percentage (default: 93.09)
 * @returns {string} CSS gradient string
 */
const getGradient = (startColor = colors.primary, endColor = colors.secondary, startPercent = 38, endPercent = 93.09) => {
  return `linear-gradient(268deg, ${startColor} ${startPercent}%, ${endColor} ${endPercent}%)`;
};

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

