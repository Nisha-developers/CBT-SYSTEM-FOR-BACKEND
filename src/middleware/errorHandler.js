// Centralized error handler. Throw errors (or call next(err)) from
// anywhere and they land here instead of crashing the process.
module.exports = function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Something went wrong',
  });
};
