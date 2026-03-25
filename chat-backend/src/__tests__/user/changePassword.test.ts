import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Change Password', () => {
  beforeEach(async () => {
    await USERS.deleteMany({});
    await USERS.create({
      sl: 1,
      name: 'Test User',
      lastName: 'L',
      email: 'test@example.com',
      password: await hashPassword('password123'),
      phone: '+1234567890',
      userType: 'user',
      accountStatus: 'Active'
    });
  });

  async function getToken() {
    const loginData = { id: 'test@example.com', password: 'password123' };
    const signInRes = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);
    return signInRes.body.data.token;
  }

  it('should change password with correct old password', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/users/change-password')
      .set('access-token', token)
      .send({ oldPassword: 'password123', password: 'newPass123' })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should fail with incorrect old password', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/users/change-password')
      .set('access-token', token)
      .send({ oldPassword: 'wrong', password: 'newPass123' })
      .expect(200);

    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('error');
  });
});


