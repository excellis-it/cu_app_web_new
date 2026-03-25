import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Update User endpoints', () => {
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

  it('should update basic fields via /update-user', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/users/update-user')
      .set('access-token', token)
      .send({ name: 'Updated Name', accountStatus: 'Active' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('name', 'Updated Name');
  });

  it('should update details via /update-user-details', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/users/update-user-details')
      .set('access-token', token)
      .send({ name: 'Detail Name', userName: 'detailuser' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('name', 'Detail Name');
    expect(res.body.data).toHaveProperty('userName', 'detailuser');
  });
});


