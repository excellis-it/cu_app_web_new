# Environment Variables Documentation

This document lists all environment variables required for the ExTalk project.

## 📋 Overview

The project consists of three main services:
1. **chat-backend** - Express/TypeScript backend with Socket.IO
2. **chat-frontend** - Next.js frontend application
3. **chat-admin** - Next.js admin panel

---

## 🔧 chat-backend Environment Variables

Create a `.env` file in `./chat-backend/` directory:

```env
# Server Configuration
NODE_ENV=development
PORT=9000
HOST=0.0.0.0

# Database
MONGO_URI=mongodb://mongo:27017/your_database_name
# Or for local development:
# MONGO_URI=mongodb://localhost:27017/your_database_name

# JWT Authentication
JWT_SECRET=your_jwt_secret_key_here
JWT_SECRET_KEY=your_jwt_secret_key_here

# Email Configuration (for mailer)
email=your_email@gmail.com
password=your_app_password
MAIL_ID=your_email@gmail.com
MAIL_PASSWORD=your_app_password

# AWS S3 Configuration (for file uploads)
S3_ACCESS_KEY=your_aws_access_key
S3_SECRET_ACCESS_KEY=your_aws_secret_key
S3_REGION=your_aws_region
S3_BUCKETS_NAME=your_bucket_name

# Firebase Configuration (for push notifications)
# Option 1: Base64 encoded service account
FIREBASE_SERVICE_ACCOUNT_BASE64=your_base64_encoded_service_account

# Option 2: JSON string
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# Option 3: Individual fields
project_id=your_project_id
private_key_id=your_private_key_id
private_key="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
client_email=your_service_account_email
client_id=your_client_id
auth_uri=https://accounts.google.com/o/oauth2/auth
token_uri=https://oauth2.googleapis.com/token
auth_provider_x509_cert_url=https://www.googleapis.com/oauth2/v1/certs
client_x509_cert_url=your_cert_url
universe_domain=googleapis.com
type=service_account

# Option 4: File path (for local development)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Web Push Notifications
WEB_PUSH_PUBLIC_KEY=your_vapid_public_key
WEB_PUSH_PRIVATE_KEY=your_vapid_private_key

# mediasoup / WebRTC (required for group call in production)
# Public IPv4 of backend host (must be reachable by clients)
MEDIASOUP_ANNOUNCED_IP=your_public_server_ip
# Keep both enabled unless you have a strict network policy
MEDIASOUP_ENABLE_UDP=true
MEDIASOUP_ENABLE_TCP=true
MEDIASOUP_PREFER_TCP=false
# ICE policy returned to browser transports: all | relay
ICE_POLICY=all
# Optional STUN/TURN
STUN_URL=stun:stun.l.google.com:19302
TURN_URL_UDP=turn:your-turn-host:3478?transport=udp
TURN_URL_TCP=turn:your-turn-host:3478?transport=tcp
TURN_USERNAME=your_turn_username
TURN_CREDENTIAL=your_turn_credential
# Server-side call recording orientation:
# Keep default false to avoid accidental 180° flips from unstable mobile metadata.
# Set true only if your deployment consistently requires half-turn correction.
RECORDING_APPLY_180_ROTATION=false
```

---

## 🌐 chat-frontend Environment Variables

Create a `.env` or `.env.local` file in `./chat-frontend/` directory:

```env
# Server Configuration
NODE_ENV=development

# API Configuration
NEXT_PUBLIC_PROXY=http://chat-backend:9000
# For local development:
# NEXT_PUBLIC_PROXY=http://localhost:9000

# Socket.IO Configuration
NEXT_PUBLIC_SOCKET_URL=http://chat-backend:9000
# For local development:
# NEXT_PUBLIC_SOCKET_URL=http://localhost:9000

# Optional: Feature Configuration (as mentioned in README)
NEXT_PUBLIC_API_URL=http://chat-backend:9000
NEXT_PUBLIC_ENABLE_RECORDING=false
NEXT_PUBLIC_MAX_PARTICIPANTS=8
NEXT_PUBLIC_VIDEO_QUALITY=high
```

**Note:** In Docker, use service names (`chat-backend`) instead of `localhost`.

---

## 👨‍💼 chat-admin Environment Variables

Create a `.env.local` file in `./admin/` directory:

```env
# Server Configuration
NODE_ENV=development

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:5001
NEXTAUTH_SECRET=your_nextauth_secret_key_here

# API Configuration
NEXT_PUBLIC_PROXY=http://chat-backend:9000
# For local development:
# NEXT_PUBLIC_PROXY=http://localhost:9000

# Optional: Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com

# Optional: Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Optional: Client-side variables
NEXT_PUBLIC_APP_NAME=ExTalk Admin
NEXT_PUBLIC_GOOGLE_MAP_API_KEY=your_google_maps_api_key
```

---

## 🐳 Docker Compose Environment Variables

The `docker-compose.yaml` file automatically sets some environment variables, but you still need to create the `.env` files for each service.

### Current Docker Compose Configuration:

**chat-backend:**
- `NODE_ENV=development` ✅ (set in docker-compose)
- `PORT=9000` ✅ (set in docker-compose)
- `HOST=0.0.0.0` ✅ (set in docker-compose)
- Other variables should be in `./chat-backend/.env` file

**chat-frontend:**
- `NODE_ENV=development` ✅ (set in docker-compose)
- `NEXT_PUBLIC_PROXY=http://chat-backend:9000` ✅ (set in docker-compose)
- `NEXT_PUBLIC_SOCKET_URL=http://chat-backend:9000` ✅ (set in docker-compose)
- Other variables should be in `./chat-frontend/.env` file

**chat-admin:**
- `NODE_ENV=development` ✅ (set in docker-compose)
- `NEXTAUTH_URL=http://localhost:5001` ✅ (set in docker-compose)
- `NEXT_PUBLIC_PROXY=http://chat-backend:9000` ✅ (set in docker-compose)
- Other variables should be in `./admin/.env.local` file

---

## ✅ Environment Variable Status

### Currently Configured in Docker:
- ✅ `NEXT_PUBLIC_PROXY` - Set in docker-compose.yaml
- ✅ `NEXT_PUBLIC_SOCKET_URL` - Set in docker-compose.yaml (recently added)
- ✅ `NEXTAUTH_URL` - Set in docker-compose.yaml (for admin)

### Required but Not in Docker (should be in .env files):
- ⚠️ `MONGO_URI` - Required for backend
- ⚠️ `JWT_SECRET` / `JWT_SECRET_KEY` - Required for authentication
- ⚠️ Email credentials - Required for sending emails
- ⚠️ S3 credentials - Required for file uploads
- ⚠️ Firebase credentials - Required for push notifications
- ⚠️ `NEXTAUTH_SECRET` - Required for admin authentication
- ⚠️ `MEDIASOUP_ANNOUNCED_IP` - Required for mediasoup calls from external clients
- ⚠️ TURN credentials (`TURN_*`) - Strongly recommended for restricted networks

---

## 🔍 Quick Check Commands

To verify your environment variables are set correctly:

```bash
# Check if .env files exist
ls -la chat-backend/.env
ls -la chat-frontend/.env
ls -la admin/.env.local

# For Docker, check environment variables in running containers
docker-compose exec chat-backend env | grep -E "MONGO_URI|JWT_SECRET"
docker-compose exec chat-frontend env | grep NEXT_PUBLIC
docker-compose exec chat-admin env | grep -E "NEXTAUTH|NEXT_PUBLIC"
```

---

## 📝 Notes

1. **Never commit `.env` files** - They should be in `.gitignore`
2. **Use different values for development and production**
3. **For Docker networking**, use service names (`chat-backend`) instead of `localhost`
4. **For local development**, use `localhost` or `127.0.0.1`
5. **Socket.IO URLs** should use `http://` or `https://`, not `ws://` (Socket.IO handles protocol upgrade automatically)

---

## 🚀 Next Steps

1. Create the `.env` files for each service with the required variables
2. Ensure sensitive values are not committed to version control
3. For production, use a secrets management system (AWS Secrets Manager, HashiCorp Vault, etc.)
