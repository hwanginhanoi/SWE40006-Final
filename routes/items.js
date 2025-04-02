const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const createError = require('http-errors');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD || 'apppassword'
};

const dbName = process.env.DB_NAME || 'items_db';

// Connect and initialize database
async function initializeDatabase() {
    // First connect to postgres database to check if our database exists
    const adminPool = new Pool({
        ...dbConfig,
        database: 'postgres' // Connect to default database
    });

    try {
        // Check if database exists
        const dbCheckResult = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname=$1",
            [dbName]
        );

        // Create database if it doesn't exist
        if (dbCheckResult.rows.length === 0) {
            console.log(`Database ${dbName} does not exist. Creating...`);
            await adminPool.query(`CREATE DATABASE ${dbName}`);
            console.log(`Database ${dbName} created successfully`);
        }
    } catch (err) {
        console.error('Database creation error:', err);
        throw err;
    } finally {
        await adminPool.end();
    }

    // Now connect to the target database to set up tables
    const appPool = new Pool({
        ...dbConfig,
        database: dbName
    });

    const client = await appPool.connect();
    try {
        // Create items table if it doesn't exist
        await client.query(`
        CREATE TABLE IF NOT EXISTS items (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT
        )`);
        console.log('Items table verified/created');
    } catch (err) {
        console.error('Table initialization error:', err);
        throw err;
    } finally {
        client.release();
    }

    return appPool;
}

// Initialize database and get connection pool
let pool;
(async () => {
    try {
        pool = await initializeDatabase();
    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
})();


// GET /items - list all items
router.get('/', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM items ORDER BY name');
        req.logger.info('Fetching all items', { count: result.rows.length });
        res.render('index', {
            title: 'Items Manager',
            items: result.rows
        });
    } catch (err) {
        req.logger.error('Failed to fetch items', { error: err.message });
        next(createError(500, 'Database error while fetching items'));
    }
});

// POST /items - create new item
router.post('/', async (req, res, next) => {
    const { name, description } = req.body;
    const id = require('uuid').v4();

    try {
        await pool.query(
            'INSERT INTO items (id, name, description) VALUES ($1, $2, $3)',
            [id, name, description]
        );
        req.logger.info('Item created', { itemId: id });
        res.redirect('/items');
    } catch (err) {
        req.logger.error('Failed to create item', { error: err.message });
        next(createError(500, 'Database error while creating item'));
    }
});

// GET /items/:id/edit - show edit form
router.get('/:id/edit', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);

        if (result.rows.length === 0) {
            req.logger.warn('Item not found for editing', { itemId: req.params.id });
            return next(createError(404, 'Item not found'));
        }

        res.render('edit-item', {
            title: 'Edit Item',
            item: result.rows[0]
        });
    } catch (err) {
        req.logger.error('Failed to fetch item for editing', { error: err.message });
        next(createError(500, 'Database error while fetching item'));
    }
});

// PUT /items/:id - update item
router.put('/:id', async (req, res, next) => {
    const { name, description } = req.body;

    try {
        const result = await pool.query(
            'UPDATE items SET name = $1, description = $2 WHERE id = $3 RETURNING *',
            [name, description, req.params.id]
        );

        if (result.rows.length === 0) {
            req.logger.warn('Item not found for update', { itemId: req.params.id });
            return next(createError(404, 'Item not found'));
        }

        req.logger.info('Item updated', { itemId: req.params.id });
        res.redirect('/items');
    } catch (err) {
        req.logger.error('Failed to update item', { error: err.message });
        next(createError(500, 'Database error while updating item'));
    }
});

// DELETE /items/:id - delete item
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [req.params.id]);

        if (result.rows.length === 0) {
            req.logger.warn('Item not found for deletion', { itemId: req.params.id });
            return next(createError(404, 'Item not found'));
        }

        req.logger.info('Item deleted', { itemId: req.params.id });
        res.redirect('/items');
    } catch (err) {
        req.logger.error('Failed to delete item', { error: err.message });
        next(createError(500, 'Database error while deleting item'));
    }
});

module.exports = router;