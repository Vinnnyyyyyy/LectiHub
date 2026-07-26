require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  console.error(
    [
      'Missing JWT_SECRET in LectiHub-server/.env',
      'Fix: run  npm run setup:env  (or copy .env.example to .env), then restart.',
    ].join('\n'),
  );
  process.exit(1);
}

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const classRoutes = require('./routes/classRoutes');
const calendarRoutes = require('./routes/calendarRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/schedule-requests', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/lesson-reports', require('./routes/lessonReportRoutes'));
app.use('/api/student-feedback', require('./routes/studentFeedbackRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/calendar', calendarRoutes);
app.use('/api/availability', require('./routes/availabilityRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/trial-requests', require('./routes/trialRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});