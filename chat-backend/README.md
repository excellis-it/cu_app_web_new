# Chat Backend

A TypeScript/Node.js backend for a real-time chat application, featuring RESTful APIs, WebSocket support, authentication, file uploads, and more.

## Table of Contents
- [Features](#features)
- [Documentation](#documentation)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

## Features
- Express.js REST API
- Real-time communication with Socket.IO
- MongoDB with Mongoose
- Authentication (JWT, cookies)
- File uploads (AWS S3 support)
- Email notifications
- EJS templating for views
- CORS and security middleware

## Documentation

- **[Server-side screen & call recording](docs/screen-recording.md)** — mediasoup multitrack FFmpeg recording, offline grid merge, timeline alignment for late joiners, and related environment variables.

## Project Structure
```
chat-backend/
├── src/
│   ├── app.ts           # App logic and utilities
│   ├── index.ts         # Entry point
│   ├── controller/      # Route controllers
│   ├── db/              # Database connection
│   ├── helpers/         # Helper functions
│   ├── mail/            # Email templates and logic
│   ├── middleware/      # Express middlewares
│   ├── public/          # Static files
│   ├── routes/          # API route definitions
│   ├── socket/          # Socket.IO logic
│   ├── types/           # TypeScript types
│   └── views/           # EJS views
├── package.json         # Project metadata and scripts
├── tsconfig.json        # TypeScript config
├── generate-vapid.js    # VAPID key generation for web push
└── ...
```

## Prerequisites
- Node.js v16+
- npm v8+
- MongoDB instance (local or remote)
- AWS credentials (for S3 uploads, if used)
- **TypeScript** (install globally if not already):
  ```bash
  npm install -g typescript
  ```

## Installation
```bash
npm install
```

## Usage
- **Development:**
  ```bash
  npm run dev
  ```
- **Production build:**
  ```bash
  npm run build
  npm start
  ```

## Scripts
- `npm run dev` — Start in development mode with hot reload (nodemon, ts-node)
- `npm run build` — Compile TypeScript and copy views
- `npm start` — Build and run in production mode

## Environment Variables
Create a `.env` file in the root with at least:
```
PORT=3000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET=your_bucket_name
```

## Deployment

To deploy the backend to a production server (e.g., Ubuntu, CentOS, or any Linux VPS):

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd chat-backend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment variables:**
   - Create a `.env` file with your production values (see above).
4. **Build the project:**
   ```bash
   npm run build
   ```
5. **Start the server:**
   ```bash
   npm start
   ```
6. **(Optional) Use a process manager for reliability:**
   - Install [PM2](https://pm2.keymetrics.io/):
     ```bash
     npm install -g pm2
     pm2 start dist/index.js --name chat-backend
     pm2 save
     pm2 startup
     ```

**Tip:** Make sure your server allows inbound connections on the port you set (default: 3000). For production, consider using a reverse proxy (like Nginx) and enabling HTTPS.

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](https://choosealicense.com/licenses/mit/)
