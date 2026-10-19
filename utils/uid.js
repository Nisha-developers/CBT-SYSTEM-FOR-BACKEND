const crypto = require('crypto');

const newUid = () => crypto.randomUUID();
const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = { newUid, UID_RE };
