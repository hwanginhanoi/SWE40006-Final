// tests/app.test.js
const request = require('supertest');
const app = require('../app');

describe('Express App', () => {
    test('GET / returns 200 status', async () => {
        const response = await request(app).get('/');
        expect(response.statusCode).toBe(200);
    });
});