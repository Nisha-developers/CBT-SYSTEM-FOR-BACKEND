// Table names + public slug for each exam type. Public exam id = "<slug>-<uid>".
module.exports = {
  OBJ:    { type: 'OBJ',    slug: 'obj',    cfg: 'exam_config_obj',    link: 'exam_obj_questions',    q: 'obj_questions',    results: 'results_obj' },
  THEORY: { type: 'THEORY', slug: 'theory', cfg: 'exam_config_theory', link: 'exam_theory_questions', q: 'theory_questions', results: 'results_theory' },
};
