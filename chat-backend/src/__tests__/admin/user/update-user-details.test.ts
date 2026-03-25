import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Create User", () => {

  it("POST /api/admin/users/update-user-details → should update the user details when called by admin", async () => {
    const data:any = await signInAdmin();
    const res:any = await request(app)
      .post("/api/admin/users/create-user")
      .set("access-token", data.data.token)
      .send({
        name: "Created User",
        email: `test+${Date.now()}@example.com`,
        password: "password123",
        userType: "user",
        sl: 2,
      });
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty("_id");
        expect(res.body.data.email).toMatch(/@example.com$/);
        expect(res.body.success).toBe(true);
    const updateResponse:any = await request(app)
      .post("/api/admin/users/update-user-details")
      .set("access-token", data.data.token)
      .send({
        _id: res.body.data._id,
        name: "Updated User",
        email: res.body.data.email,
        accountStatus: res.body.data.accountStatus,
        userType: res.body.data.userType,
        phone: res.body.data.phone,
        userName: res.body.data.userName,
        password: res.body.data.password,
        file: res.body.data.image,        
      });
        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.data).toHaveProperty("_id");
        expect(updateResponse.body.data.name).toBe("Updated User");
        expect(updateResponse.body.success).toBe(true);
  });
  

});
