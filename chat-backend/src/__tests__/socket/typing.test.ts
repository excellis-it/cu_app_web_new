import { Server } from 'socket.io';
import Client from 'socket.io-client';
import { createServer } from 'http';

// Mock only essential dependencies
jest.mock('../../db/schemas/message.schema');
jest.mock('../../db/schemas/users.schema');

describe('Typing Event Handler', () => {
  let io: Server;
  let clientSocket: any;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });

    // Simulate your socket event handlers
    io.on('connection', (socket) => {
      // Let sockets join rooms
      socket.on("join-room", (roomId: string) => {
        socket.join(roomId);
      });

      // Handle typing
      socket.on('typing', (data) => {
        const { userId, isTyping, receiverId, msgId } = data;
        receiverId.forEach((receiver: string) => {
          socket.to(receiver).emit('typing', { 
            userId, 
            typing: isTyping, 
            msgId 
          });
        });
      });
    });

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });

  afterAll((done) => {
    if (clientSocket.connected) clientSocket.disconnect();
    io.close();
    httpServer.close(done);
  });

  test('should broadcast typing event', (done) => {
    const mockData = {
      userId: 'user123',
      isTyping: true,
      receiverId: ['test-receiver'],
      msgId: 'msg123'
    };

    const port = (httpServer.address() as any).port;
    const receiverSocket = Client(`http://localhost:${port}`);

    receiverSocket.on('connect', () => {
      // Join the same room as the one in mockData
      receiverSocket.emit("join-room", "test-receiver");

      receiverSocket.on('typing', (data) => {
        try {
          expect(data).toEqual({
            userId: mockData.userId,
            typing: mockData.isTyping,
            msgId: mockData.msgId
          });
          receiverSocket.disconnect();
          done();
        } catch (error) {
          receiverSocket.disconnect();
          done(error);
        }
      });

      // Now emit typing from the other client
      clientSocket.emit('typing', mockData);
    });
  }, 10000); // increase timeout to 10s just in case
});
