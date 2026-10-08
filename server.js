const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
// Serve the frontend static files
app.use(express.static(path.join(__dirname)));

let db;

async function initDB() {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            password TEXT,
            role TEXT,
            department TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_number TEXT,
            subject TEXT,
            description TEXT,
            category TEXT,
            priority TEXT,
            status TEXT,
            created_by INTEGER,
            assigned_to INTEGER,
            created_at TEXT,
            updated_at TEXT,
            resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER,
            user_id INTEGER,
            comment TEXT,
            is_work_note INTEGER,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER,
            field_changed TEXT,
            old_value TEXT,
            new_value TEXT,
            changed_by INTEGER,
            changed_at TEXT
        );
    `);
    console.log("Database initialized");
}

// Fetch entire DB state for synchronous rendering in frontend
app.get('/api/db', async (req, res) => {
    try {
        const users = await db.all('SELECT * FROM users');
        const tickets = await db.all('SELECT * FROM tickets');
        const comments = await db.all('SELECT * FROM comments');
        const history = await db.all('SELECT * FROM history');
        res.json({ users, tickets, comments, history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Users
app.post('/api/users', async (req, res) => {
    const { name, email, password, role, department, created_at } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO users (name, email, password, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, password, role, department, created_at]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id', async (req, res) => {
    const { role } = req.body;
    try {
        await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tickets
app.post('/api/tickets', async (req, res) => {
    const { ticket_number, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, resolved_at } = req.body;
    try {
        const result = await db.run(
            `INSERT INTO tickets (ticket_number, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, resolved_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ticket_number, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, resolved_at]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/tickets/:id', async (req, res) => {
    const updates = req.body;
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    
    if (fields.length === 0) return res.json({ success: true });
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    try {
        await db.run(`UPDATE tickets SET ${setClause} WHERE id = ?`, [...values, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Comments
app.post('/api/comments', async (req, res) => {
    const { ticket_id, user_id, comment, is_work_note, created_at } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO comments (ticket_id, user_id, comment, is_work_note, created_at) VALUES (?, ?, ?, ?, ?)',
            [ticket_id, user_id, comment, is_work_note, created_at]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// History
app.post('/api/history', async (req, res) => {
    const { ticket_id, field_changed, old_value, new_value, changed_by, changed_at } = req.body;
    try {
        const result = await db.run(
            'INSERT INTO history (ticket_id, field_changed, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
            [ticket_id, field_changed, old_value, new_value, changed_by, changed_at]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear data and seed
app.post('/api/seed', async (req, res) => {
    const { users, tickets, comments, history } = req.body;
    try {
        await db.run('DELETE FROM users');
        await db.run('DELETE FROM tickets');
        await db.run('DELETE FROM comments');
        await db.run('DELETE FROM history');

        for (const u of users) {
            await db.run(
                'INSERT INTO users (id, name, email, password, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [u.id, u.name, u.email, u.password, u.role, u.department, u.created_at]
            );
        }
        for (const t of tickets) {
            await db.run(
                `INSERT INTO tickets (id, ticket_number, subject, description, category, priority, status, created_by, assigned_to, created_at, updated_at, resolved_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [t.id, t.ticket_number, t.subject, t.description, t.category, t.priority, t.status, t.created_by, t.assigned_to, t.created_at, t.updated_at, t.resolved_at]
            );
        }
        for (const c of comments) {
            await db.run(
                'INSERT INTO comments (id, ticket_id, user_id, comment, is_work_note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [c.id, c.ticket_id, c.user_id, c.comment, c.is_work_note, c.created_at]
            );
        }
        for (const h of history) {
            await db.run(
                'INSERT INTO history (id, ticket_id, field_changed, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [h.id, h.ticket_id, h.field_changed, h.old_value, h.new_value, h.changed_by, h.changed_at]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

initDB().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});
