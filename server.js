require('dotenv').config();
const express = require('express');
const db = require('./config/db');

const app = express();

//Global middleware 
app.use(express.json());


//Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

//Routes
// app.use('/api/auth', require('./routes/authRoutes'));
 app.use('/api/school', require('./Routes/schoolRoute'));
// add your route files here as you build them

//404 handler 
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

//Global error handler 
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

//Start server
const PORT = process.env.PORT || 5000;

const connectToDatabase = async () => {
  try {
    const connection = await db.getConnection();
    connection.release();
    console.log('MySQL connected');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MySQL:', err.message);
    process.exit(1);
  }
};
connectToDatabase();