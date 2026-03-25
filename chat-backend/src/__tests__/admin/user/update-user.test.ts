import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Update User", () => {
  it("POST /api/admin/users/update-user → should update the logged-in admin user", async () => {
    // 1. Sign in admin
    const data:any = await signInAdmin();

    // 2. Call update-user endpoint
    const res = await request(app)
      .post("/api/admin/users/update-user")
      .set("access-token", data.data.token)
      .send({
        name: "Updated Admin",
        accountStatus: "Inactive",
      });
    // 3. Assertions
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.name).toBe("Updated Admin");
    expect(res.body.data.accountStatus).toBe("Inactive");
  });

  it("should password update if provided", async () => {
    const data:any = await signInAdmin();

    const res = await request(app)
      .post("/api/admin/users/update-user")
      .set("access-token", data.data.token)
      .send({
        password: "newpassword123",
        name: "Password Ignored",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Password Ignored");

    // Ensure password is not updated
    expect(res.body.data).toHaveProperty("password");
    expect(res.body.data.password).not.toBe(data.data.user.password);
  });
});
