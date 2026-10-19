const { z, strict, uid, personName, studentCode, page, pageSize, label } = require('./common');

const create = strict({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  studentId: studentCode,
  classArmId: uid,
  gender: z.enum(['Male', 'Female']).nullable().optional(),
  optionalSubjectIds: z.array(uid).max(20).default([]),
});

const update = create.partial();

const list = strict({
  classArmId: uid.optional(),
  classId: uid.optional(),
  armId: uid.optional(),
  class: label('Class').optional(),
  arm: label('Arm', 20).optional(),
  search: z.string().trim().max(80).optional(),
  page,
  limit: pageSize(500, 10),
});

module.exports = { create, update, list };
