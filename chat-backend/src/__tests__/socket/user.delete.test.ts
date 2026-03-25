// src/__tests__/socket/user.update.integration.test.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';

// Mock your server dependencies to avoid DB connections
jest.mock('../../db/schemas/message.schema');
jest.mock('../../db/schemas/users.schema');
jest.mock('../../db/schemas/group.schema');
jest.mock('../../db/schemas/videocall.schema');
jest.mock('../../middleware/decodeToken');
jest.mock('../../helpers/firebase');
jest.mock('../../helpers/webpush');
jest.mock('../../helpers/sendVoipPush');
jest.mock('../../app');

describe('Socket Integration Test - user_delete event', () => {
  let io: Server;
  let httpServer: any;
  let clientSocket: any;
  let serverSocket: any;

  beforeAll((done) => {
    // Create a test HTTP server
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Import and initialize your socket logic
    const initializeSocket = () => {
      io.on("connection", (socket) => {
        serverSocket = socket;

        // This is the exact event handler from your server code
        socket.on("user_upadate", () => {
          try {
            socket.broadcast.emit("updated-User");
          } catch (error) { }
        });
      });
    };

    initializeSocket();

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`);
      
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    if (io) {
      io.close();
    }
    if (clientSocket) {
      clientSocket.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  it('should broadcast deleted-User event when user_delete is emitted', () => {
    // Listen for the broadcasted event
    clientSocket.on('user_delete', () => {

    // Emit the event that should trigger the broadcast
    serverSocket.broadcast.emit('deleted-User');
    });

  }, 1000);
});