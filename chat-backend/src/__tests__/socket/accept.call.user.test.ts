import { setupTestSocket } from '../setup';
import { io, Socket } from "socket.io-client";
import { Server } from "socket.io";

describe('Socket.io - BE-accept-call event', () => {
  let ioServer: Server;
  let httpServer: any;
  let socket1: Socket;
  let socket2: Socket;

  beforeAll(async () => {
    // 1. First, create the Socket.IO server and HTTP server.
    // The setupTestSocket() function should return the server instances without connecting any clients.
    // If your setupTestSocket() function connects a client, you need to modify it.
    const context = await setupTestSocket();
    ioServer = context.io;
    httpServer = context.httpServer;

    // 2. Attach the mock handler to the server's 'connection' event.
    // This is the CRITICAL STEP. It must be done BEFORE any clients connect.
    ioServer.on('connection', (serverSocket) => {
      // Listen for the 'BE-accept-call' event that the test will emit from socket1.
      serverSocket.on('BE-accept-call', (data) => {
        // Find the recipient socket (socket2) using its ID from the event data.
        const recipientSocket = ioServer.sockets.sockets.get(data.to);
        
        if (recipientSocket) {
          // If the recipient is found, emit the expected response event to them.
          recipientSocket.emit('FE-call-accepted', {
            signal: data.signal,
            answerId: serverSocket.id, // The ID of the answering client (socket1)
          });
        }
      });
    });

    // 3. Now, connect the clients. The mock handler is ready.
    const port = (httpServer.address() as any).port;
    
    // Connect socket1 and socket2 to the server.
    socket1 = io(`http://localhost:${port}`, { transports: ["websocket"] });
    socket2 = io(`http://localhost:${port}`, { transports: ["websocket"] });

    // Wait for both sockets to connect before proceeding.
    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      socket1.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
      socket2.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
    });

    // The socket IDs are now available.
    console.log(`Socket1 ID: ${socket1.id}`);
    console.log(`Socket2 ID: ${socket2.id}`);
  });

  afterAll(async () => {
    // Clean up all connections and the server after the tests are done.
    if (socket1 && socket1.connected) socket1.disconnect();
    if (socket2 && socket2.connected) socket2.disconnect();
    if (ioServer) await ioServer.close();
    await new Promise((res) => httpServer.close(res));
  });

  it('should emit FE-call-accepted to the right client', (done) => {
    // Set up a listener on socket2 to wait for the response event.
    socket2.once('FE-call-accepted', (data: any) => {
      try {
        console.log('FE-call-accepted event received on socket2:', data);
        expect(data).toHaveProperty('signal', 'test-signal');
        expect(data).toHaveProperty('answerId');
        expect(data.answerId).toBe(socket1.id);
        
        done();
      } catch (err) {
        done(err);
      }
    });

    // Emit the initial event from socket1 to the server.
    socket1.emit('BE-accept-call', {
      signal: 'test-signal',
      to: socket2.id,
    },() => {
        console.log('BE-accept-call event emitted from socket1');
    });
  }, 20000);
});