# Chat Admin Panel

A modern, feature-rich admin dashboard for managing your chat application, built with Next.js, TypeScript, Tailwind CSS, and a robust component library.

## Table of Contents
- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Scripts](#scripts)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [License](#license)

## Features
- Next.js 14+ with App Router
- TypeScript support
- Tailwind CSS for rapid UI development
- Analytics dashboard with metrics and stat cards
- Modular component-based architecture
- Authentication (Sign In/Sign Up)
- API integration (REST, WebSocket)
- Responsive and accessible design

## Project Structure
```
admin/
├── src/
│   ├── app/
│   │   ├── (hydrogen)/
│   │   ├── shared/
│   │   ├── signin/
│   │   ├── multi-step/
│   │   ├── auth/
│   │   ├── api/
│   │   ├── (other-pages)/
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   ├── globals.css
│   │   └── fonts.ts
│   ├── components/
│   │   ├── cards/
│   │   ├── ui/
│   │   ├── shape/
│   │   ├── settings/
│   │   ├── search/
│   │   ├── Portal/
│   │   ├── loader/
│   │   ├── icons/
│   │   ├── google-map/
│   │   ├── file-upload/
│   │   ├── dnd-sortable/
│   │   ├── controlled-table/
│   │   ├── charts/
│   │   ├── banners/
│   │   ├── (admin)/
│   │   ├── wishlist-button.tsx
│   │   ├── svg-loader.tsx
│   │   ├── rating.tsx
│   │   ├── no-ssr.tsx
│   │   ├── product-carousel.tsx
│   │   ├── rating-progress-bar.tsx
│   │   ├── next-progress.tsx
│   │   ├── filter-with-search.tsx
│   │   ├── form-footer.tsx
│   │   ├── get-status-badge.tsx
│   │   ├── filter-with-accordion.tsx
│   │   ├── filter-with-group.tsx
│   │   └── edit-profile.tsx
│   ├── config/
│   │   ├── site.config.tsx
│   │   ├── routes.ts
│   │   ├── constants.ts
│   │   ├── enums.ts
│   │   ├── mail.ts
│   │   ├── messages.ts
│   │   └── color-presets.ts
│   ├── context/
│   │   ├── authContext.tsx
│   │   └── appContext.tsx
│   ├── utils/
│   │   ├── validators/
│   │   ├── update-theme-color.ts
│   │   ├── uploadthing.ts
│   │   ├── use-pathname-active.ts
│   │   ├── month-map.ts
│   │   ├── range-map.ts
│   │   ├── recharts-console-error.ts
│   │   ├── to-currency.ts
│   │   ├── get-random-array-element.ts
│   │   ├── get-relative-time.ts
│   │   ├── has-searched-params.ts
│   │   ├── hex-to-rgb.ts
│   │   ├── generate-slug.ts
│   │   ├── get-avatar.ts
│   │   ├── get-formatted-date.ts
│   │   ├── get-option-by-value.ts
│   │   ├── export-to-csv.ts
│   │   ├── filter-data.ts
│   │   ├── format-date.ts
│   │   ├── format-number.ts
│   │   ├── calculate-total-price.ts
│   │   ├── class-names.ts
│   │   ├── color-swatch.tsx
│   │   ├── email.ts
│   │   ├── add-spaces-to-camel-case.ts
│   │   ├── calculate-percentage.ts
│   ├── types/
│   │   ├── Types/
│   │   ├── dateFormats.ts
│   │   ├── encryptDecrypt.ts
│   │   ├── getUser.ts
│   │   ├── callApi.ts
│   │   ├── casesToSentenceCase.ts
│   │   ├── constants.ts
│   │   ├── createDrawName.ts
│   │   ├── OrdinalNumber.ts
│   ├── server/
│   │   ├── actions/
│   │   ├── delete-file.ts
│   │   └── uploadthing.ts
│   ├── layouts/
│   │   ├── nav-menu/
│   │   ├── lithium/
│   │   ├── hydrogen/
│   │   ├── sticky-header.tsx
│   │   ├── notification-dropdown.tsx
│   │   ├── profile-menu.tsx
│   │   ├── messages-dropdown.tsx
│   │   ├── lithium-icon.tsx
│   │   ├── header-menu-right.tsx
│   │   ├── helium-icon.tsx
│   │   ├── hydrogen-icon.tsx
│   │   ├── beryllium-icon.tsx
│   │   ├── boron-icon.tsx
│   │   ├── carbon-icon.tsx
│   │   ├── hamburger-button.tsx
│   ├── hooks/
│   │   ├── use-theme-color.ts
│   │   ├── use-window-scroll.ts
│   │   ├── use-window-size.ts
│   │   ├── useApi.tsx
│   │   ├── use-price.ts
│   │   ├── use-scrollable-slider.ts
│   │   ├── use-table.ts
│   │   ├── use-measure.ts
│   │   ├── use-media.ts
│   │   ├── use-os.ts
│   │   ├── use-pattern-format.ts
│   │   ├── use-hover.ts
│   │   ├── use-is-mounted.ts
│   │   ├── use-layout.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-event-calendar.ts
│   │   ├── use-event-listener.ts
│   │   ├── use-filter-control.ts
│   │   ├── use-horizontal-scroll-availability.ts
│   │   ├── use-create-query-string.ts
│   │   ├── use-direction.ts
│   │   ├── use-element-reposition.ts
│   │   ├── use-element-size.ts
│   │   ├── use-client-width.ts
│   │   ├── use-column.ts
│   │   ├── use-copy-to-clipboard.ts
│   │   ├── use-countdown.ts
│   │   ├── use-click-away.ts
│   ├── helpers/
│   │   ├── index.ts
│   ├── email-templates/
│   │   ├── account-confirmation.tsx
│   │   └── order-confirmation.tsx
│   ├── data/
│   │   ├── forms/
│   │   ├── transactions-data.tsx
│   │   ├── users-data.ts
│   │   ├── website-metrics-data.ts
│   │   ├── tickets-data.ts
│   │   ├── top-customer.ts
│   │   ├── top-products-data.ts
│   │   ├── transaction-history.ts
│   │   ├── support-inbox.ts
│   │   ├── teams-data.tsx
│   │   ├── shipment-data.ts
│   │   ├── shop-products.ts
│   │   ├── similar-products-data.ts
│   │   ├── snippets-and-templates.ts
│   │   ├── profile-data.ts
│   │   ├── recent-customers-data.ts
│   │   ├── roles-permissions.ts
│   │   ├── pos-data.ts
│   │   ├── product-categories.ts
│   │   ├── product-reviews.ts
│   │   ├── products-data.ts
│   │   ├── order-data.ts
│   │   ├── page-metrics-data.ts
│   │   ├── pending-shipments.ts
│   │   ├── notifications.ts
│   │   ├── invoice-data.ts
│   │   ├── logged-in-device.ts
│   │   ├── members-data.ts
│   │   ├── messages.ts
│   │   ├── filter-products-data.ts
│   │   ├── flight-filter-data.ts
│   │   ├── icons-data.ts
│   │   ├── explore-products-data.ts
│   │   ├── file-grid-data.tsx
│   │   ├── filter-nfts-data.ts
│   │   ├── card-widgets-data.tsx
│   │   ├── checkout-data.ts
│   │   ├── customer-with-most-tickets.ts
│   │   ├── event-data.ts
│   │   ├── all-files.tsx
│   │   ├── appointment-data.ts
│   │   ├── billing-history.ts
│   │   └── ...
│   ├── middleware.js
│   └── env.mjs
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
└── ...
```

## Prerequisites
- Node.js v18.15.0 or higher
- npm or pnpm
- (Optional) TypeScript globally: `npm install -g typescript`

## Installation
```bash
npm install
# or
pnpm install
```

## Usage
- **Development:**
  ```bash
  npm run dev
  # or
  pnpm dev
  ```
- **Production build:**
  ```bash
  npm run build
  npm start
  # or
  pnpm build
  pnpm start
  ```

## Scripts
- `dev` — Start the development server on port 3001
- `build` — Build the production app
- `start` — Start the production server
- `lint` — Run ESLint
- `format` — Format code with Prettier
- `clean` — Remove build and cache files
- `generate-icons` — Generate icon data for the UI

## Authentication
The admin panel includes a sign-in page and authentication logic. Social login is supported (can be enabled/disabled). Authentication UI is built with reusable components and supports secure session management.

## Deployment
To deploy the admin panel to a production server:

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd admin
   ```
2. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```
3. **Set up environment variables:**
   - Copy or create a `.env` file with your production values (see `src/env.mjs` for required variables).
4. **Build the project:**
   ```bash
   npm run build
   # or
   pnpm build
   ```
5. **Start the server:**
   ```bash
   npm start
   # or
   pnpm start
   ```
6. **(Optional) Use a process manager for reliability:**
   - Install [PM2](https://pm2.keymetrics.io/):
     ```bash
     npm install -g pm2
     pm2 start npm --name chat-admin -- run start
     pm2 save
     pm2 startup
     ```

**Tip:** For production, consider using a reverse proxy (like Nginx) and enabling HTTPS.

## License
[MIT](https://choosealicense.com/licenses/mit/)
