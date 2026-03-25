import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { app } from "../../../app";
import User from "../../../db/schemas/users.schema";

let adminToken: string;
let createdUserId: string;

// increase default timeout for slower CI environments
jest.setTimeout(20000);

beforeAll(async () => {
  // Using global setup (src/__tests__/setup.ts) to manage in-memory mongo lifecycle

  // Seed admin with a bcrypt-hashed password to match production logic
  const hashed = bcrypt.hashSync("password123", 10);
  await User.create({
    name: "Admin",
    email: "admin@test.com",
    password: hashed,
    userType: "admin",
    sl: 1,
    accountStatus: "Active",
  });
});

afterAll(async () => {
  // Let global teardown handle disconnect; attempt to drop the database if the
  // connection is active, but guard against hanging if the connection is closed
  // or already being torn down by the global setup.
  if (mongoose.connection.readyState === 1) {
    try {
      // set a small timeout so this hook doesn't hang indefinitely
      const dropPromise = mongoose.connection.dropDatabase();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('dropDatabase timeout')), 3000)
      );
      await Promise.race([dropPromise, timeout]);
    } catch (e) {
      // swallow errors - global teardown will stop the memory server
    }
  }
});

describe("Admin User Routes", () => {
  it("POST /api/admin/users/sign-in \u2192 should login admin with valid credentials", async () => {
    const res = await request(app)
      .post("/api/admin/users/sign-in")
      .send({ email: "admin@test.com", password: "password123" });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data).toHaveProperty("user");
    adminToken = res.body.data.token;
  });

  // it("POST /api/v1/admin/create-user → should create a new user when called by admin", async () => {
  //   const res = await request(app)
  //     .post("/api/v1/admin/create-user")
  //     .set("Authorization", `Bearer ${adminToken}`)
  //     .send({
  //       name: "Created User",
  //       email: "test@example.com",
  //       password: "password123",
  //       userType: "user",
  //       sl: 2,
  //     });

  //   expect(res.status).toBe(200); // your API returns 200, not 201
  //   expect(res.body).toHaveProperty("user");
  //   expect(res.body.user.email).toBe("test@example.com");
  //   createdUserId = res.body.user._id;
  // });

  // it("POST /api/v1/admin/get-all-users → should return all users", async () => {
  //   const res = await request(app)
  //     .post("/api/v1/admin/get-all-users")
  //     .set("Authorization", `Bearer ${adminToken}`);

  //   expect(res.status).toBe(200);
  //   expect(Array.isArray(res.body.users)).toBe(true);
  //   expect(res.body.users.length).toBeGreaterThanOrEqual(2);
  // });

  // it("GET /api/v1/admin/get-single-user → should return one user by id", async () => {
  //   const res = await request(app)
  //     .get(`/api/v1/admin/get-single-user/${createdUserId}`)
  //     .set("Authorization", `Bearer ${adminToken}`);

  //   expect(res.status).toBe(200);
  //   expect(res.body.user.email).toBe("test@example.com");
  // });

  // it("DELETE /api/v1/admin/delete-user → should delete a user by id", async () => {
  //   const res = await request(app)
  //     .delete(`/api/v1/admin/delete-user/${createdUserId}`)
  //     .set("Authorization", `Bearer ${adminToken}`);

  //   expect(res.status).toBe(200);
  //   expect(res.body).toHaveProperty("message");
  // });

  it("POST /api/admin/users/logout → should logout admin and clear cookie", async () => {
    const res = await request(app)
      .post("/api/admin/users/logout")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
  });
});
