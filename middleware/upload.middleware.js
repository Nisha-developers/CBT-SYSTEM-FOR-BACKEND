const multer = require('multer');
const { badRequest } = require('../utils/errors');

const ALLOWED = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.mimetype)) return cb(badRequest('Only PDF and Word (.docx) files are supported.'));
    return cb(null, true);
  },
});

module.exports = { uploadSingle: upload.single('file') };
