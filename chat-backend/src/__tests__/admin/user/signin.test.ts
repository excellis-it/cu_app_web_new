import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Sign-in", () => {
  it("POST /api/admin/users/sign-in → should login admin with valid credentials", async () => {
    const data:any = await signInAdmin();
    console.log("Admin sign-in response data:", data);
    expect(data.data).toHaveProperty("token");
    expect(data.data).toHaveProperty("user");
    expect(data.data.userType).toBe("SuperAdmin");
    expect(typeof data).toBe("object");
    expect(data.data.token.length).toBeGreaterThan(10);
    expect(data.success).toBe(true);
  });
});
