import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createServer } from "http";
import { Server } from "socket.io";
import Client, { Socket } from "socket.io-client";

export interface TestSocketContext {
  io: Server;
  httpServer: any;
  serverSocket: any;
  clientSocket: Socket;
}

let mongod: MongoMemoryServer;
let socketContext: TestSocketContext;

export async function setupTestSocket(): Promise<TestSocketContext> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const io = new Server(httpServer, { cors: { origin: "*" } });

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      const clientSocket = Client(`http://localhost:${port}`, {
        transports: ["websocket"],
      });

      io.on("connection", (socket) => {
        resolve({ io, httpServer, serverSocket: socket, clientSocket });
      });
    });
  });
}

export async function cleanupTestSocket(ctx: TestSocketContext) {
  if (ctx.clientSocket.connected) {
    ctx.clientSocket.disconnect();
  }
  await ctx.io.close();
  await new Promise((res) => ctx.httpServer.close(res));
}

// ✅ Global hooks
beforeAll(async () => {
  // Start in-memory Mongo
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Start socket server
  socketContext = await setupTestSocket();
});

afterEach(async () => {
  // Clear DB between tests
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();

  if (socketContext) {
    await cleanupTestSocket(socketContext);
  }
});

// Export the socket context for use in tests
export { socketContext };
// ✅ Add this helper
export async function teardownTestSocket(
  io: Server,
  httpServer: any,
  clientSocket: Socket
) {
  if (clientSocket.connected) {
    clientSocket.disconnect();
  }
  await io.close();
  await new Promise((res) => httpServer.close(res));
}