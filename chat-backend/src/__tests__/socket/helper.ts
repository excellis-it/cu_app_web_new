// test/socket/socketHelpers.ts
import { createTestUser, generateTestToken } from "../helpers";
import { setupTestSocket, TestSocketContext } from "../setup";

export const connectWithAuth = async (): Promise<TestSocketContext> => {
  const user = await createTestUser();
  const token = generateTestToken(user._id.toString());

  const ctx = await setupTestSocket();

  // inject auth header into client
  ctx.clientSocket.io.opts.extraHeaders = {
    Authorization: `Bearer ${token}`,
  };

  return ctx;
};
