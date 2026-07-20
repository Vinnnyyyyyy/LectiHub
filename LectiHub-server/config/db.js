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

  CREATE TABLE IF NOT EXISTS calendar_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT CHECK(provider IN ('google', 'calendly')) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    external_account TEXT,
    calendar_id TEXT,
    scheduling_url TEXT,
    is_active INTEGER DEFAULT 1,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    class_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INTEGER,
    meeting_info TEXT,
    meeting_link TEXT,
    provider TEXT CHECK(provider IN ('lectihub', 'google', 'calendly')) NOT NULL DEFAULT 'lectihub',
    external_event_id TEXT,
    sync_status TEXT CHECK(sync_status IN ('pending', 'synced', 'failed', 'local_only')) NOT NULL DEFAULT 'local_only',
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lesson_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL UNIQUE,
    teacher_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    report_time TEXT NOT NULL,
    lesson_topic TEXT NOT NULL,
    pages_discussed TEXT,
    attendance_status TEXT NOT NULL,
    homework_assigned TEXT,
    remarks TEXT,
    student_progress TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS student_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_report_id INTEGER NOT NULL UNIQUE,
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    overall_rating INTEGER NOT NULL CHECK(overall_rating BETWEEN 1 AND 5),
    comments TEXT,
    suggestions TEXT,
    learning_experience TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_report_id) REFERENCES lesson_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
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
ensureColumn('classes', 'meeting_provider', "TEXT DEFAULT 'jitsi'");
ensureColumn('classes', 'status', "TEXT DEFAULT 'scheduled'");
ensureColumn('classes', 'started_at', 'DATETIME');
ensureColumn('classes', 'subject', 'TEXT');
ensureColumn('classes', 'curriculum_plan', 'TEXT');
ensureColumn('classes', 'attendance_status', "TEXT DEFAULT 'not_recorded'");
ensureColumn('classes', 'attendance_recorded_at', 'DATETIME');
ensureColumn('classes', 'participation_level', "TEXT DEFAULT 'not_recorded'");
ensureColumn('classes', 'participation_notes', 'TEXT');
ensureColumn('classes', 'recording_url', 'TEXT');
ensureColumn('classes', 'completed_at', 'DATETIME');
ensureColumn('classes', 'archived_at', 'DATETIME');
ensureColumn('notifications', 'related_class_id', 'INTEGER');
ensureColumn('notifications', 'details', 'TEXT');
ensureColumn('notifications', 'deliver_at', 'DATETIME');

// Migrate legacy "confirmed" status → "scheduled" (join flow uses Scheduled → In Progress)
db.exec(`
  UPDATE classes
  SET status = 'scheduled'
  WHERE status IS NULL OR TRIM(status) = '' OR LOWER(TRIM(status)) = 'confirmed'
`);
db.exec(`
  UPDATE classes
  SET meeting_provider = 'jitsi'
  WHERE meeting_provider IS NULL OR TRIM(meeting_provider) = ''
`);
db.exec(`
  UPDATE classes
  SET attendance_status = 'not_recorded'
  WHERE attendance_status IS NULL OR TRIM(attendance_status) = ''
`);
db.exec(`
  UPDATE classes
  SET participation_level = 'not_recorded'
  WHERE participation_level IS NULL OR TRIM(participation_level) = ''
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_lesson_reports_student ON lesson_reports(student_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lesson_reports_teacher ON lesson_reports(teacher_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lesson_reports_submitted ON lesson_reports(submitted_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_student_feedback_student ON student_feedback(student_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_student_feedback_teacher ON student_feedback(teacher_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_student_feedback_submitted ON student_feedback(submitted_at)`);

module.exports = db;
