# CU Chat & Video Con#### Security & Reliability
- 🔒 Secure end-to-end communication
- 🌍 Global server network
- 🔄 Automatic reconnection handling
- 🛡️ User authentication & authorization
- 🌐 Network optimization for poor connectionsing Platform

<div align="center">
  <img src="public/logo.svg" alt="CU Logo" width="200"/>
  <p><strong>A modern, secure, and feature-rich communication platform</strong></p>
</div>

## 🌟 Overview

CU is a comprehensive communication platform that combines real-time chat messaging with high-quality video conferencing capabilities. Built with modern web technologies, it offers a seamless and responsive experience across all devices.

### 🎯 Key Features

#### Communication Tools
- 💬 Real-time chat messaging with history
- 📹 HD video conferencing with up to 8 participants
- �️ Crystal-clear audio calls
- 🖥️ One-click screen sharing
- 📱 Mobile-first responsive design

#### Advanced Capabilities
- 🔄 Smart layout switching (Teams-style grid)
- 🎮 Multiple camera/microphone support
- 🔇 Individual participant audio control
- ⚡ Low-latency data transmission
- 🤝 Peer-to-peer connections when possible

#### Security & Reliability
- 🔒 End-to-end secure connections
- 🌍 TURN/STUN server support
- � Automatic reconnection handling
- 🛡️ User authentication & authorization
- � Fallback mechanisms for poor connections

#### User Experience
- � Modern, intuitive interface
- ⌨️ Keyboard shortcuts support
- 🌓 Dark/Light theme support
- 🎯 Minimal UI for distraction-free calls
- 📊 Network quality indicators

## 🚀 Getting Started

### System Requirements

- Node.js v14 or higher
- npm v7+ or yarn v1.22+
- Modern web browser
- Minimum 1Mbps internet connection
- Webcam and microphone (for video calls)

### Development Setup

1. **Clone & Install**
   ```bash
   # Clone the repository
   git clone https://github.com/excellis-it/CU-web.git
   cd CU-web

   # Install dependencies
   npm install
   # or
   yarn install
   ```

2. **Environment Configuration**
   Create a `.env.local` file in the root directory:
   ```env
   # API Configuration
   NEXT_PUBLIC_API_URL=your_backend_url
   NEXT_PUBLIC_SOCKET_URL=your_socket_server_url

   # Feature Configuration
   NEXT_PUBLIC_ENABLE_RECORDING=false
   NEXT_PUBLIC_MAX_PARTICIPANTS=8
   NEXT_PUBLIC_VIDEO_QUALITY=high
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. **Access the Application**
   - Local: [http://localhost:5000](http://localhost:5000)
   - Network: `http://your-local-ip:3000`

### 🔧 Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_PARTICIPANTS` | Maximum participants in a call | 8 |
| `ENABLE_RECORDING` | Enable call recording | false |
| `VIDEO_QUALITY` | Video quality preset | "balanced" |
| `AUDIO_CODEC` | Preferred audio codec | "opus" |

### 📱 Supported Platforms

| Platform | Minimum Version |
|----------|----------------|
| Chrome | 80+ |
| Firefox | 78+ |
| Safari | 13+ |
| Edge | 80+ |
| iOS Safari | 13+ |
| Chrome Android | 80+ |

## 📁 Project Structure

```plaintext
CU-web/
├── appContext/                # Application Context
│   └── appContext.js         # Global app state management
├── components/               # React components
│   ├── BottomBar.js         # Call controls bar
│   ├── call.js              # Call handling component
│   ├── CallStatusIndicator.js # Call status display
│   ├── chatinfo.js          # Chat information
│   ├── DeleteGroupModal.js   # Group deletion modal
│   ├── DraggableVideoTile.js # Draggable video component
│   ├── EditGroupModal.js     # Group editing modal
│   ├── ForwardMsg.js        # Message forwarding
│   ├── incomming_call.js    # Incoming call handler
│   ├── Layout.js            # Main layout component
│   ├── MeetingScheduler.js  # Meeting scheduler
│   ├── meetingstatus.js     # Meeting status display
│   ├── MegaMessage.js       # Enhanced message component
│   ├── MinuteStepDateTimePicker.js # Time picker
│   ├── MsgToast.js          # Message notifications
│   ├── reconnectionModalComponant.js # Reconnection modal
│   ├── ReportModal.js       # Report system modal
│   ├── room.js              # Video room component
│   ├── sidebar.js           # Sidebar navigation
│   ├── SidebarPannel.js     # Sidebar panel
│   ├── SingleTodo.js        # Todo item component
│   ├── start_call.js        # Call initialization
│   └── userActivity.js      # User activity tracking
├── config/                  # Configuration files
│   └── config.js           # App configuration
├── public/                 # Static assets
│   ├── images/            # Image assets
│   ├── icons/            # Icon assets
│   └── fonts/            # Font files
└── src/                   # Source files
    ├── styles/           # CSS styles
    ├── pages/           # pages for render apllication
    └── middleware/        # API services

```

### 🔧 Key Components

#### Video Call Components
- `room.js`: Main video room handling and layout
- `DraggableVideoTile.js`: Draggable video interface
- `BottomBar.js`: Call controls and actions
- `start_call.js`: Call initialization and setup
- `incomming_call.js`: Incoming call management

#### Chat Components
- `chatinfo.js`: Chat information and details
- `MegaMessage.js`: Enhanced messaging interface
- `ForwardMsg.js`: Message forwarding functionality
- `MsgToast.js`: Toast notifications for messages

#### Meeting Components
- `MeetingScheduler.js`: Schedule and manage meetings
- `meetingstatus.js`: Meeting status tracking
- `MinuteStepDateTimePicker.js`: Time selection interface

#### UI Components
- `Layout.js`: Main application layout
- `sidebar.js`: Navigation sidebar
- `SidebarPannel.js`: Extended sidebar functionality
- `ReportModal.js`: User reporting system

#### Core Features
- Real-time video and audio streaming
- Instant messaging system
- Dynamic video grid layout
- Responsive design system

## 📜 Available Scripts

```bash
# Development
npm run dev        # Start development server
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm run format     # Format code with Prettier

# Testing
npm run test       # Run Jest tests
npm run test:watch # Run tests in watch mode
npm run e2e        # Run Cypress E2E tests

# Production
npm run build      # Build for production
npm start         # Start production server
npm run analyze   # Analyze bundle size
```

### 🔍 Environment Variables

Development:
```bash
# Start with development settings
npm run dev

# Start with production settings
npm run dev:prod

# Start with specific config
NODE_ENV=staging npm run dev
```

## 🚀 Deployment

### Production Deployment

1. **Build the Application**
   ```bash
   # Install dependencies
   npm install --production

   # Build the application
   npm run build
   ```

2. **Configure Production Environment**
   ```bash
   # Set production environment variables
   export NODE_ENV=production
   export NEXT_PUBLIC_API_URL=https://api.your-domain.com
   ```

3. **Start the Server**
   ```bash
   # Start with PM2
   pm2 start npm --name "CU" -- start

   # Or start directly
   npm start
   ```

### 📊 Performance Monitoring

- Enable performance monitoring:
  ```bash
  # Install monitoring tools
  npm install -g pm2@latest

  # Start with monitoring
  pm2 start npm --name "CU" -- start --monitor
  ```

### 🔒 Security Considerations

1. **Connection Security**
   - Always use HTTPS in production
   - Configure SSL certificates properly
   - Enable HTTP/2 for better performance

2. **Data Security**
   - Secure data transmission
   - End-to-end encryption
   - Protected media streams

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Development Process

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/CU-web.git
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make Changes**
   - Follow our coding standards
   - Add tests for new features
   - Update documentation

4. **Test Your Changes**
   ```bash
   npm run test
   npm run lint
   ```

5. **Submit PR**
   - Create detailed pull request
   - Reference any related issues
   - Wait for review

### Code Style Guide

- Use TypeScript for new components
- Follow ESLint configuration
- Write meaningful commit messages
- Document complex logic
- Add JSDoc comments for functions

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- React team for the UI library
- Socket.IO for real-time capabilities
- All our dedicated contributors

---
Made with ❤️ by the CU Team
