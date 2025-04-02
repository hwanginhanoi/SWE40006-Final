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

// Add after the health endpoint test
describe('Items API', () => {
    let testItemId;
    const testItem = {
        name: 'Test Item',
        description: 'Created during automated testing'
    };

    test('GET /items returns list of items', async () => {
        const response = await axios.get(`${API_URL}/items/api`);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
    });

    test('POST /items creates a new item', async () => {
        const response = await axios.post(`${API_URL}/items/api`, testItem);
        expect(response.status).toBe(201);
        expect(response.data.id).toBeDefined();
        expect(response.data.name).toBe(testItem.name);

        // Save ID for later tests
        testItemId = response.data.id;
    });

    test('GET /items/:id returns specific item', async () => {
        const response = await axios.get(`${API_URL}/items/api/${testItemId}`);
        expect(response.status).toBe(200);
        expect(response.data.id).toBe(testItemId);
        expect(response.data.name).toBe(testItem.name);
    });

    test('PUT /items/:id updates an item', async () => {
        const updatedItem = {
            name: 'Updated Test Item',
            description: 'This item was updated'
        };

        const response = await axios.put(`${API_URL}/items/api/${testItemId}`, updatedItem);
        expect(response.status).toBe(200);
        expect(response.data.name).toBe(updatedItem.name);
    });

    test('DELETE /items/:id removes an item', async () => {
        const response = await axios.delete(`${API_URL}/items/api/${testItemId}`);
        expect(response.status).toBe(200);
        expect(response.data.success).toBeTruthy();

        // Verify item is gone
        try {
            await axios.get(`${API_URL}/items/api/${testItemId}`);
            fail('Item should have been deleted');
        } catch (error) {
            expect(error.response.status).toBe(404);
        }
    });

    test('GET /items/:id returns 404 for non-existent item', async () => {
        try {
            await axios.get(`${API_URL}/items/api/nonexistentid`);
            fail('Should have thrown 404 error');
        } catch (error) {
            expect(error.response.status).toBe(404);
        }
    });
});