/**
 * Color Configuration - ES6 Module
 * Use this import in React components: import colors from '../config/colors.mjs'
 */

export const colors = {
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
  
  // Gradient
  gradient: 'linear-gradient(268deg, #1da678 38%, #145c4b 93.09%)',
  
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
export const getGradient = (startColor = colors.primary, endColor = colors.secondary, startPercent = 38, endPercent = 93.09) => {
  return `linear-gradient(268deg, ${startColor} ${startPercent}%, ${endColor} ${endPercent}%)`;
};

export default colors;

