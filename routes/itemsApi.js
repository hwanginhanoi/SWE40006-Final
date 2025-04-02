// routes/itemsApi.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const createError = require('http-errors');

// Create PostgreSQL connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppassword',
  database: process.env.DB_NAME || 'items_db'
});

// Check database connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');

    // Ensure table exists
    pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT
      )
    `).catch(err => console.error('Error creating items table:', err));
  }
});

// GET /items/api - get all items
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching items:', err);
    next(createError(500, 'Database error while fetching items'));
  }
});

// POST /items/api - create new item
router.post('/', async (req, res, next) => {
  const { name, description } = req.body;

  if (!name) {
    return next(createError(400, 'Item name is required'));
  }

  const id = uuidv4();

  try {
    const result = await pool.query(
        'INSERT INTO items (id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [id, name, description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating item:', err);
    next(createError(500, 'Database error while creating item'));
  }
});

// GET /items/api/:id - get specific item
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return next(createError(404, 'Item not found'));
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching item ${req.params.id}:`, err);
    next(createError(500, 'Database error while fetching item'));
  }
});

// PUT /items/api/:id - update item
router.put('/:id', async (req, res, next) => {
  const { name, description } = req.body;

  if (!name) {
    return next(createError(400, 'Item name is required'));
  }

  try {
    const result = await pool.query(
        'UPDATE items SET name = $1, description = $2 WHERE id = $3 RETURNING *',
        [name, description || '', req.params.id]
    );

    if (result.rows.length === 0) {
      return next(createError(404, 'Item not found'));
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating item ${req.params.id}:`, err);
    next(createError(500, 'Database error while updating item'));
  }
});

// DELETE /items/api/:id - delete item
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      return next(createError(404, 'Item not found'));
    }

    res.json({ success: true, deletedItem: result.rows[0] });
  } catch (err) {
    console.error(`Error deleting item ${req.params.id}:`, err);
    next(createError(500, 'Database error while deleting item'));
  }
});

module.exports = router;