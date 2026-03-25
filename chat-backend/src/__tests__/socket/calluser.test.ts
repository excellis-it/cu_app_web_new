import { setupTestSocket } from '../setup';
import { io, Socket } from "socket.io-client";
import { Server } from "socket.io";

describe('Socket.io - BE-call-user event', () => {
  let ioServer: Server;
  let httpServer: any;
  let socket1: Socket;
  let socket2: Socket;
  const testInfo = { name: "Test User 1" };

  beforeAll(async () => {
    const context = await setupTestSocket();
    ioServer = context.io;
    httpServer = context.httpServer;

    ioServer.on('connection', (serverSocket) => {
      // Mock the server-side logic for the 'BE-call-user' event.
      serverSocket.on('BE-call-user', (data) => {
        const recipientSocket = ioServer.sockets.sockets.get(data.userToCall);
        
        if (recipientSocket) {
          recipientSocket.emit('FE-receive-call', {
            signal: data.signal,
            from: serverSocket.id,
            info: testInfo,
          });
        }
      });
    });

    const port = (httpServer.address() as any).port;
    
    socket1 = io(`http://localhost:${port}`, { transports: ["websocket"] });
    socket2 = io(`http://localhost:${port}`, { transports: ["websocket"] });

    await new Promise<void>((resolve) => {
      let connectedCount = 0;
      socket1.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
      socket2.on("connect", () => { connectedCount++; if (connectedCount === 2) resolve(); });
    });
  });

  afterAll(async () => {
    if (socket1 && socket1.connected) socket1.disconnect();
    if (socket2 && socket2.connected) socket2.disconnect();
    if (ioServer) await ioServer.close();
    await new Promise((res) => httpServer.close(res));
  });

  it('should emit FE-receive-call to the right client with correct data', (done) => {
    const testSignal = 'test-signal-data';

    socket2.once('FE-receive-call', (data: any) => {
      try {
        expect(data).toHaveProperty('signal', testSignal);
        expect(data).toHaveProperty('from', socket1.id);
        expect(data).toHaveProperty('info', testInfo);
        done();
      } catch (err) {
        done(err);
      }
    });

    socket1.emit('BE-call-user', {
      userToCall: socket2.id,
      signal: testSignal,
    });
  }, 20000);
});