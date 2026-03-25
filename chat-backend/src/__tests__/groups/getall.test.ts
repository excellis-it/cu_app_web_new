import supertest from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('GET /api/groups/getall', () => {
  beforeEach(async () => {
    await USERS.deleteMany({});
    await USERS.create({ sl: 0, name: 'Super Admin', email: 'superadmin@example.com', password: await hashPassword('password123'), phone: '+000', userType: 'SuperAdmin', accountStatus: 'Active' });
    await USERS.create({ sl: 1, name: 'Member', email: 'member@example.com', password: await hashPassword('password123'), phone: '+111', userType: 'user', accountStatus: 'Active' });
  });

  it('lists groups', async () => {
    const signIn = await supertest(app).post('/api/users/sign-in').send({ id: 'member@example.com', password: 'password123' }).expect(200);
    const token = signIn.body.data.token;
    const res = await supertest(app)
      .get('/api/groups/getall')
      .set('access-token', token)
      .query({ searchQuery: '', limit: 10, skip: 0 })
      .expect(200);
    expect(res.body.success).toBe(true);
  });
});


