// tests/integration/api.test.js
const axios = require('axios');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('API Integration Tests', () => {
    test('Health endpoint returns 200', async () => {
        const response = await axios.get(`${API_URL}/health`);
        expect(response.status).toBe(200);
        expect(response.data.status).toBe('UP');
    });

    // Add more integration tests
});