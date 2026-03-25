# Color Configuration Guide

This directory contains the centralized color configuration for the chat frontend application.

## Files

- `colors.js` - CommonJS module (for Tailwind config and Node.js)
- `colors.mjs` - ES6 module (for React components)

## Usage

### In React Components

```javascript
// Import colors
import colors from '../config/colors.mjs';
// or
import { colors, getGradient } from '../config/colors.mjs';

// Use in inline styles
<div style={{ backgroundColor: colors.primary, color: colors.textPrimary }}>
  Hello World
</div>

// Use in style objects
const buttonStyle = {
  background: colors.primary,
  color: colors.textPrimary,
  border: `2px solid ${colors.primary}`,
};

// Use gradients
<div style={{ background: colors.gradient }}>
  Gradient Background
</div>

// Custom gradient
<div style={{ background: getGradient(colors.primary, colors.secondary) }}>
  Custom Gradient
</div>
```

### In CSS Files

Use CSS variables defined in `src/styles/globals.css`:

```css
.my-button {
  background-color: var(--color-primary);
  color: var(--color-text-primary);
  border: 2px solid var(--color-primary);
}

.my-gradient {
  background: var(--gradient-primary);
}
```

### In Tailwind Classes

Colors are available as Tailwind utility classes:

```jsx
<div className="bg-primary text-text-primary border-border-gray">
  Using Tailwind colors
</div>
```

Available Tailwind color classes:
- `bg-primary`, `bg-primary-dark`, `bg-primary-light`
- `bg-secondary`, `bg-secondary-dark`, `bg-secondary-light`
- `bg-background-dark`, `bg-background-light`, `bg-background-gray`
- `text-text-primary`, `text-text-secondary`, `text-text-dark`
- `border-border-gray`
- `bg-success`, `bg-error`, `bg-warning`, `bg-info`
- `bg-gradient-primary` (for gradient background)

## Color Palette

### Primary Colors
- **Primary**: `#f37e20` - Main orange color
- **Primary Dark**: `#d66a1a` - Darker shade
- **Primary Light**: `#ff8f40` - Lighter shade

### Secondary Colors
- **Secondary**: `#ad1e23` - Red accent color
- **Secondary Dark**: `#8a181c` - Darker shade
- **Secondary Light**: `#c42a2f` - Lighter shade

### Background Colors
- **Background Dark**: `#ffffff` - Dark background
- **Background Light**: `#ffffff` - Light background
- **Background Gray**: `#f2f2f2` - Gray background (sidebar)

### Text Colors
- **Text Primary**: `#ffffff` - Primary text color
- **Text Secondary**: `#000000` - Secondary text color
- **Text Dark**: `#000000` - Dark text color

### Status Colors
- **Success**: `#28a745` - Green for success
- **Error**: `#d63030` - Red for errors
- **Warning**: `#ffc107` - Yellow for warnings
- **Info**: `#3085d6` - Blue for info

## Customizing Colors

To change the color scheme across the entire application:

1. **Update `config/colors.js`** - Modify the color values in the `colors` object
2. **Update `config/colors.mjs`** - Keep it in sync with `colors.js`
3. **Update `src/styles/globals.css`** - Update the CSS variables in `:root`
4. **Rebuild** - Restart your development server for changes to take effect

## Example: Changing Primary Color

To change the primary color from orange to blue:

1. In `config/colors.js` and `config/colors.mjs`:
   ```javascript
   primary: '#3b82f6',  // Changed from #f37e20
   ```

2. In `src/styles/globals.css`:
   ```css
   --color-primary: #3b82f6;
   ```

3. Restart the dev server

All components using the primary color will automatically update!

