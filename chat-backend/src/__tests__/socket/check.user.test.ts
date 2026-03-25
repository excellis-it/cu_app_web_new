import { setupTestSocket } from '../setup';
import { io, Socket } from "socket.io-client";
import { Server, Socket as ServerSocket } from "socket.io";

// Mock the external dependencies to isolate the socket logic
const socketList: { [key: string]: { userName: string; } } = {};

describe('Socket.io - BE-check-user event', () => {
  let ioServer: Server;
  let httpServer: any;
  let socket1: Socket;
  let socket2: Socket;

  const ROOM_ID = 'test-room-123';
  const EXISTING_USER_NAME = 'existinguser';
  const NEW_USER_NAME = 'newuser';
  const CALL_TYPE = 'video';

  beforeAll(async () => {
    // Set up the server and clients
    const context = await setupTestSocket();
    ioServer = context.io;
    httpServer = context.httpServer;

    // Define the socket event handler for the test
    ioServer.on('connection', (serverSocket: ServerSocket) => {
      serverSocket.on("BE-check-user", async ({ roomId, userName, callType }) => {
        let error = false;
        try {
          // Get all connected clients in the specified room
          const clients = await ioServer.in(roomId).allSockets();
          clients.forEach((client) => {
            // Check if the userName exists in our mock list
            if (socketList[client]?.userName === userName) {
              error = true;
            }
          });
          // Emit the result back to the client
          serverSocket.emit("FE-error-user-exist", { error, roomId, userName, callType });
        } catch (err) {
          console.error("Error checking user:", err);
        }
      });

      // A mock handler to populate the room and socketList for testing
      serverSocket.on('mock-join-room', ({ roomId, userName }) => {
        serverSocket.join(roomId);
        socketList[serverSocket.id] = { userName };
      });
    });

    const port = (httpServer.address() as any).port;
    socket1 = io(`http://localhost:${port}`, { transports: ["websocket"] });
    socket2 = io(`http://localhost:${port}`, { transports: ["websocket"] });

    // Wait for both sockets to connect before running tests
    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      socket1.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
      socket2.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
    });
  });

  afterAll(async () => {
    // Clean up resources after all tests
    if (socket1 && socket1.connected) socket1.disconnect();
    if (socket2 && socket2.connected) socket2.disconnect();
    if (ioServer) await ioServer.close();
    await new Promise((res) => httpServer.close(res));
  });

  it('should return error: false when the userName is unique', async () => {
    // Action: Emit the check for a user that is not in the room
    const resultPromise = new Promise((resolve) => {
      socket1.once('FE-error-user-exist', (data) => {
        expect(data.error).toBe(false);
        expect(data.roomId).toBe(ROOM_ID);
        expect(data.userName).toBe(NEW_USER_NAME);
        resolve(null);
      });
    });

    socket1.emit('BE-check-user', {
      roomId: ROOM_ID,
      userName: NEW_USER_NAME,
      callType: CALL_TYPE,
    });

    await resultPromise;
  });

  it('should return error: true when the userName already exists in the room', async () => {
    // Step 1: Mock a user joining the room
    const joinPromise = new Promise<void>((resolve) => {
      socket2.emit('mock-join-room', { roomId: ROOM_ID, userName: EXISTING_USER_NAME });
      // Use a short delay to ensure the room is populated before checking
      setTimeout(() => resolve(), 50); 
    });
    await joinPromise;

    // Step 2: Have socket1 check for the same userName
    const resultPromise = new Promise((resolve) => {
      socket1.once('FE-error-user-exist', (data) => {
        expect(data.error).toBe(true);
        expect(data.roomId).toBe(ROOM_ID);
        expect(data.userName).toBe(EXISTING_USER_NAME);
        resolve(null);
      });
    });

    socket1.emit('BE-check-user', {
      roomId: ROOM_ID,
      userName: EXISTING_USER_NAME,
      callType: CALL_TYPE,
    });

    await resultPromise;
  });
});