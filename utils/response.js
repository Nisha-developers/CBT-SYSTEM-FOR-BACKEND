// Consistent JSON envelope: { success: true, ...data } / { success: false, message }.
const send = (res, status, data = {}) => res.status(status).json({ success: true, ...data });

module.exports = {
  ok: (res, data) => send(res, 200, data),
  created: (res, data) => send(res, 201, data),
  message: (res, text, status = 200) => send(res, status, { message: text }),
};
