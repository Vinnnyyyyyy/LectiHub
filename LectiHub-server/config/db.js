const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../lectihub.db'));

// Enable foreign key constraints (off by default in SQLite)
db.pragma('foreign_keys = ON');

// Create users table if it doesn't exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
    full_name TEXT,
    must_change_password INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

module.exports = db;