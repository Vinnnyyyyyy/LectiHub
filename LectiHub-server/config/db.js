const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../lectihub.db'));

// Enable foreign key constraints (off by default in SQLite)
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Create tables if they don't exist yet
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
  );

  CREATE TABLE IF NOT EXISTS schedule_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    remarks TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS schedule_request_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    preferred_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES schedule_requests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER,
    class_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    title TEXT,
    schedule_request_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (schedule_request_id) REFERENCES schedule_requests(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    related_request_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (related_request_id) REFERENCES schedule_requests(id) ON DELETE SET NULL
  );
`);

ensureColumn('users', 'subject_expertise', 'TEXT');
ensureColumn('schedule_requests', 'assigned_teacher_id', 'INTEGER');
ensureColumn('schedule_requests', 'assigned_slot_id', 'INTEGER');
ensureColumn('schedule_requests', 'assigned_by', 'INTEGER');
ensureColumn('schedule_requests', 'assigned_at', 'DATETIME');
ensureColumn('classes', 'schedule_request_id', 'INTEGER');
ensureColumn('classes', 'start_time', 'TEXT');
ensureColumn('classes', 'end_time', 'TEXT');
ensureColumn('classes', 'duration_minutes', 'INTEGER');
ensureColumn('classes', 'meeting_info', 'TEXT');
ensureColumn('classes', 'meeting_link', 'TEXT');
ensureColumn('classes', 'status', "TEXT DEFAULT 'confirmed'");
ensureColumn('classes', 'subject', 'TEXT');
ensureColumn('notifications', 'related_class_id', 'INTEGER');
ensureColumn('notifications', 'details', 'TEXT');
ensureColumn('notifications', 'deliver_at', 'DATETIME');

module.exports = db;
