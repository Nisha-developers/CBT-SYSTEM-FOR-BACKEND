const env = require('../config/env');
const { HttpError } = require('../utils/errors');

const notFound = (req, res) => res.status(404).json({ success: false, message: 'Route not found' });

// The one place that turns any thrown error into JSON. Never leaks stack traces or SQL.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const send = (status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

  if (err instanceof HttpError) {
    return send(err.statusCode, err.message, err.details?.code ? { code: err.details.code } : err.details ? { errors: err.details } : {});
  }
  // MySQL
  if (err.code === 'ER_DUP_ENTRY') return send(409, 'That record already exists.');
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return send(409, 'This record is still in use by other data and cannot be removed.');
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return send(400, 'A referenced record does not exist.');
  if (err.sqlState === '45000') return send(400, err.sqlMessage || 'Rejected by a database rule');
  // request parsing / uploads
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') return send(413, 'That request is too large.');
  if (err.type === 'entity.parse.failed') return send(400, 'Malformed JSON body.');
  if (err.name === 'MulterError') return send(400, 'Upload failed. Send one PDF or Word file.');

  console.error(err);
  return send(500, env.isProd ? 'Internal server error' : err.message || 'Internal server error');
};

module.exports = { notFound, errorHandler };
