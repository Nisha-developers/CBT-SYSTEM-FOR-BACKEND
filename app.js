const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.set('trust proxy', env.TRUST_PROXY);          // set to 1 when running behind nginx / a load balancer
app.disable('x-powered-by');
app.use(helmet());



const allowedOrigins = [
  ...env.CLIENT_ORIGIN,
  ...env.VERCEL_ORIGIN
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }

    console.error('Blocked CORS origin:', origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.use(cookieParser());
// Small JSON bodies everywhere; only the school routes may carry a logo (base64 image).
const smallJson = express.json({ limit: '100kb' });
const logoJson = express.json({ limit: '3mb' });
app.use((req, res, next) => (req.path.startsWith('/api/school') ? logoJson : smallJson)(req, res, next));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
