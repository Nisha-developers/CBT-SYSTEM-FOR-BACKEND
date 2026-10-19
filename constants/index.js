module.exports = {
  ROLES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', STUDENT: 'student' },
  ADMIN_ROLES: ['super_admin', 'admin'],
  SUBJECT_KINDS: ['compulsory', 'optional'],
  EXAM_TYPES: ['OBJ', 'THEORY'],
  TERM_NAMES: ['First Term', 'Second Term', 'Third Term'],

  PASS_AVERAGE: 50,          // overall average (%) needed for "Passed"
  EXAM_PASS_RATIO: 0.4,      // exam pass mark = 40% of its total
  ANSWER_GRACE_MS: 5000,     // lag tolerated when the exam timer hits zero
  OPTIONS: ['A', 'B', 'C', 'D'],
  SIX_SESSIONS: 6,           // past-results history window
};
