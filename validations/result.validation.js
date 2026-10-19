const { z, strict, uid, paragraph, sessionName, termName, label } = require('./common');
const { examId } = require('./exam.validation');

const termPick = { session: sessionName.optional(), term: termName.optional() };

const view = strict({ classArmId: uid.optional(), class: label('Class').optional(), arm: label('Arm', 20).optional(), ...termPick });
const theorySheet = strict({ examId });
const theoryAnswers = strict({ examId, studentId: uid });

const recordTheory = strict({
  examId,
  studentId: uid,
  score: z.coerce.number().min(0, 'Score cannot be negative').max(1000),
  remarks: paragraph('Remarks', 2000).optional().default(''),
});

const release = strict({ classArmId: uid, ...termPick, release: z.boolean().default(true) });
const past = strict({ studentId: uid });

const rating = z.coerce.number().int().min(0).max(5);
const ratings = z.record(z.string().regex(/^[a-zA-Z]{1,30}$/), rating).refine((o) => Object.keys(o).length <= 30, 'Too many ratings');

const saveReview = strict({
  studentId: uid,
  ...termPick,
  cognitiveRatings: ratings.default({}),
  behavioralRatings: ratings.default({}),
  academicRemark: paragraph('Academic remark', 3000).optional().default(''),
  cognitiveRemark: paragraph('Cognitive remark', 3000).optional().default(''),
  behavioralRemark: paragraph('Behavioural remark', 3000).optional().default(''),
  teacherRemark: paragraph('Teacher remark', 3000).optional().default(''),
});

const getReview = strict({ studentId: uid, ...termPick });

module.exports = { view, theorySheet, theoryAnswers, recordTheory, release, past, saveReview, getReview };
