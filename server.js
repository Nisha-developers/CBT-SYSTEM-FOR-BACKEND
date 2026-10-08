require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const db = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const schoolRoutes = require('./src/routes/schoolRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const examRoutes = require('./src/routes/examRoutes');
const resultRoutes = require('./src/routes/resultRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Whether a school has already been set up — drives the
// homepage "Login vs Setup School" decision on the frontend.
app.get('/api/school/exists', async (req, res, next) => {
  try {
    const [schools] = await db.execute('SELECT id FROM schools LIMIT 1');
    res.json({ exists: schools.length > 0 });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/settings', settingsRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {  
    await db.query('SELECT 1');
    console.log('Database connected.');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Unable to start server:', err);
    process.exit(1);
  }
}

start();
