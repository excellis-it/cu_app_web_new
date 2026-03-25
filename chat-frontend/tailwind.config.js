const colors = require('./config/colors.js').colors;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './appContext/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: colors.primary,
          dark: colors.primaryDark,
          light: colors.primaryLight,
        },
        secondary: {
          DEFAULT: colors.secondary,
          dark: colors.secondaryDark,
          light: colors.secondaryLight,
        },
        background: {
          dark: colors.backgroundDark,
          light: colors.backgroundLight,
          gray: colors.backgroundGray,
        },
        text: {
          primary: colors.textPrimary,
          secondary: colors.textSecondary,
          dark: colors.textDark,
        },
        border: {
          gray: colors.borderGray,
        },
        success: colors.success,
        error: colors.error,
        warning: colors.warning,
        info: colors.info,
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-primary': colors.gradient,
      },
    },
  },
  plugins: [],
}
