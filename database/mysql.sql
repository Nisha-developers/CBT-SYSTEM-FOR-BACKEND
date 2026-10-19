-- ============================================================
-- CBT SYSTEM — COMPLETE SCHEMA (MySQL 8 / MariaDB 10.5+)
-- Run once:  mysql -u root -p < mysql.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS cbt_system;
USE cbt_system;

-- ============================================================
-- 1. SCHOOL (one school per installation)
-- ============================================================
CREATE TABLE IF NOT EXISTS schools (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(50)  NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  motto       VARCHAR(255) NOT NULL,
  logo        MEDIUMTEXT   NULL,            -- URL or base64 data URL
  description TEXT         NOT NULL,
  headline    VARCHAR(255) NOT NULL,
  address     TEXT         NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. ADMINS + ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS admin (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  full_name     VARCHAR(150) NOT NULL,
  username      VARCHAR(100) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('super_admin','admin') NOT NULL DEFAULT 'admin',
  status        ENUM('active','inactive')   NOT NULL DEFAULT 'active',
  last_login    TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT NULL,                       -- NULL = system / student action
  type        VARCHAR(30) NOT NULL DEFAULT 'general',
  activity    TEXT NOT NULL,
  description TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activities_admin
    FOREIGN KEY (admin_id) REFERENCES admin(id) ON DELETE SET NULL
);
CREATE INDEX idx_activities_admin   ON activities(admin_id);
CREATE INDEX idx_activities_created ON activities(created_at);

-- ============================================================
-- 3. CLASS / ARM / CLASS_ARM
-- ============================================================
CREATE TABLE IF NOT EXISTS class (
  class_id   INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  class_name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arm (
  arm_id     INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  arm_name   VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_arm (
  class_arm_id    INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  arm_id          INT NOT NULL,
  class_id        INT NOT NULL,
  full_class_name VARCHAR(150) NOT NULL UNIQUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_class_arm UNIQUE (arm_id, class_id),
  CONSTRAINT fk_ca_arm   FOREIGN KEY (arm_id)   REFERENCES arm(arm_id)     ON DELETE RESTRICT,
  CONSTRAINT fk_ca_class FOREIGN KEY (class_id) REFERENCES class(class_id) ON DELETE RESTRICT
);
CREATE INDEX idx_class_arm_class ON class_arm(class_id);

-- ============================================================
-- 4. SUBJECTS (compulsory + optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  subject_name VARCHAR(150) NOT NULL UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subject_class_junction (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  subject_id   INT NOT NULL,
  class_arm_id INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_subject_class_arm UNIQUE (subject_id, class_arm_id),
  CONSTRAINT fk_scj_subject   FOREIGN KEY (subject_id)   REFERENCES subjects(id)             ON DELETE CASCADE,
  CONSTRAINT fk_scj_class_arm FOREIGN KEY (class_arm_id) REFERENCES class_arm(class_arm_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS optional_subjects (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  subject_name VARCHAR(150) NOT NULL UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS optional_subject_class_junction (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  subject_id   INT NOT NULL,
  class_arm_id INT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_optional_subject_class_arm UNIQUE (subject_id, class_arm_id),
  CONSTRAINT fk_oscj_subject   FOREIGN KEY (subject_id)   REFERENCES optional_subjects(id)   ON DELETE CASCADE,
  CONSTRAINT fk_oscj_class_arm FOREIGN KEY (class_arm_id) REFERENCES class_arm(class_arm_id) ON DELETE CASCADE
);

-- ============================================================
-- 5. STUDENTS
--    student_id = the school's unique/admission number (login id)
--    default password = last name (lower-case) until the student changes it
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  student_id       VARCHAR(50)  NOT NULL UNIQUE,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  gender           ENUM('Male','Female') NULL,
  class_arm_id     INT NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  password_changed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_class_arm FOREIGN KEY (class_arm_id)
    REFERENCES class_arm(class_arm_id) ON DELETE RESTRICT
);
CREATE INDEX idx_students_class_arm ON students(class_arm_id);

-- optional subjects a student has chosen to offer
CREATE TABLE IF NOT EXISTS student_optional_subjects (
  student_id          INT NOT NULL,
  optional_subject_id INT NOT NULL,
  PRIMARY KEY (student_id, optional_subject_id),
  CONSTRAINT fk_sos_student FOREIGN KEY (student_id)          REFERENCES students(id)          ON DELETE CASCADE,
  CONSTRAINT fk_sos_subject FOREIGN KEY (optional_subject_id) REFERENCES optional_subjects(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. ACADEMIC SESSION / TERM  (is_current marks the active term)
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_sessions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(20) NOT NULL UNIQUE,      -- e.g. 2025/2026
  start_date DATE NULL,
  end_date   DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_session_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS terms (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(50) NOT NULL,    -- First Term / Second Term / Third Term
  academic_session_id INT NOT NULL,
  is_current          BOOLEAN NOT NULL DEFAULT FALSE,
  start_date          DATE NULL,
  end_date            DATE NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_term_per_session UNIQUE (name, academic_session_id),
  CONSTRAINT chk_term_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_terms_session FOREIGN KEY (academic_session_id)
    REFERENCES academic_sessions(id) ON DELETE CASCADE
);

-- ============================================================
-- 7. QUESTION BANK
-- ============================================================
CREATE TABLE IF NOT EXISTS obj_questions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  question       TEXT NOT NULL,
  passage        TEXT NULL,
  option_a       VARCHAR(500) NOT NULL,
  option_b       VARCHAR(500) NOT NULL,
  option_c       VARCHAR(500) NULL,            -- NULL for true/false questions
  option_d       VARCHAR(500) NULL,
  correct_option ENUM('A','B','C','D') NOT NULL,
  subject_kind   ENUM('compulsory','optional') NOT NULL DEFAULT 'compulsory',
  subject_id     INT NOT NULL,
  class_id       INT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_obj_q_class   FOREIGN KEY (class_id)   REFERENCES class(class_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS theory_questions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  question   TEXT NOT NULL,
  subject_kind ENUM('compulsory','optional') NOT NULL DEFAULT 'compulsory',
  subject_id INT NOT NULL,
  class_id   INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_theory_q_class   FOREIGN KEY (class_id)   REFERENCES class(class_id) ON DELETE CASCADE
);

-- ============================================================
-- 8. EXAM CONFIGURATION
--    mark = total mark the exam is scored out of
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_config_obj (
  exam_config_id     INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  title              VARCHAR(255) NOT NULL,
  instructions       TEXT NULL,
  total_question_set INT NOT NULL,             -- questions the teacher must upload
  question_display   INT NOT NULL,             -- questions each student receives
  mark_per_question  DECIMAL(6,2) NOT NULL,
  passage            BOOLEAN NOT NULL DEFAULT FALSE,
  true_or_false      BOOLEAN NOT NULL DEFAULT FALSE,
  open_exam          BOOLEAN NOT NULL DEFAULT FALSE,
  duration           INT NOT NULL,             -- minutes
  time_of_exam       TIME NOT NULL,
  date_of_exam       DATE NOT NULL,
  mark               DECIMAL(6,2) NOT NULL,
  pass_mark          DECIMAL(6,2) NOT NULL,
  subject_kind       ENUM('compulsory','optional') NOT NULL DEFAULT 'compulsory',
  subject_id         INT NOT NULL,          -- subjects.id or optional_subjects.id (see subject_kind)
  class_arm_id       INT NOT NULL,
  term_id            INT NOT NULL,
  created_by         INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_config_obj UNIQUE (subject_kind, subject_id, class_arm_id, term_id),
  CONSTRAINT chk_total_qs CHECK (total_question_set > 0),
  CONSTRAINT chk_display  CHECK (question_display > 0 AND question_display <= total_question_set),
  CONSTRAINT chk_eco_duration CHECK (duration > 0),
  CONSTRAINT chk_eco_mark CHECK (mark > 0),
  CONSTRAINT fk_eco_class_arm FOREIGN KEY (class_arm_id) REFERENCES class_arm(class_arm_id) ON DELETE RESTRICT,
  CONSTRAINT fk_eco_term      FOREIGN KEY (term_id)      REFERENCES terms(id)                ON DELETE RESTRICT,
  CONSTRAINT fk_eco_admin     FOREIGN KEY (created_by)   REFERENCES admin(id)                ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_config_theory (
  exam_config_id     INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  title              VARCHAR(255) NOT NULL,
  instructions       TEXT NULL,
  total_question_set INT NOT NULL,
  mark_per_question  DECIMAL(6,2) NOT NULL,
  open_exam          BOOLEAN NOT NULL DEFAULT FALSE,
  duration           INT NOT NULL,
  time_of_exam       TIME NOT NULL,
  date_of_exam       DATE NOT NULL,
  mark               DECIMAL(6,2) NOT NULL,
  pass_mark          DECIMAL(6,2) NOT NULL,
  subject_kind       ENUM('compulsory','optional') NOT NULL DEFAULT 'compulsory',
  subject_id         INT NOT NULL,          -- subjects.id or optional_subjects.id (see subject_kind)
  class_arm_id       INT NOT NULL,
  term_id            INT NOT NULL,
  created_by         INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_config_theory UNIQUE (subject_kind, subject_id, class_arm_id, term_id),
  CONSTRAINT chk_ect_total    CHECK (total_question_set > 0),
  CONSTRAINT chk_ect_duration CHECK (duration > 0),
  CONSTRAINT chk_ect_mark     CHECK (mark > 0),
  CONSTRAINT fk_ect_class_arm FOREIGN KEY (class_arm_id) REFERENCES class_arm(class_arm_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ect_term      FOREIGN KEY (term_id)      REFERENCES terms(id)                ON DELETE RESTRICT,
  CONSTRAINT fk_ect_admin     FOREIGN KEY (created_by)   REFERENCES admin(id)                ON DELETE SET NULL
);

-- Questions assigned to each exam
CREATE TABLE IF NOT EXISTS exam_obj_questions (
  exam_config_id INT NOT NULL,
  question_id    INT NOT NULL,
  PRIMARY KEY (exam_config_id, question_id),
  CONSTRAINT fk_eoq_exam     FOREIGN KEY (exam_config_id) REFERENCES exam_config_obj(exam_config_id) ON DELETE CASCADE,
  CONSTRAINT fk_eoq_question FOREIGN KEY (question_id)    REFERENCES obj_questions(id)               ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_theory_questions (
  exam_config_id INT NOT NULL,
  question_id    INT NOT NULL,
  marks          DECIMAL(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (exam_config_id, question_id),
  CONSTRAINT fk_etq_exam     FOREIGN KEY (exam_config_id) REFERENCES exam_config_theory(exam_config_id) ON DELETE CASCADE,
  CONSTRAINT fk_etq_question FOREIGN KEY (question_id)    REFERENCES theory_questions(id)               ON DELETE CASCADE
);

-- ============================================================
-- 9. EXAM ATTEMPTS (students taking exams)
--    answers are saved server-side on every click, so a refresh
--    or dropped connection never loses work
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_attempts (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  uid                CHAR(36) NOT NULL UNIQUE,   -- public id used by the API (edit/delete)
  student_id     INT NOT NULL,
  exam_type      ENUM('OBJ','THEORY') NOT NULL,
  exam_config_id INT NOT NULL,
  started_at     DATETIME NOT NULL,
  ends_at        DATETIME NOT NULL,
  submitted_at   DATETIME NULL,
  status         ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
  CONSTRAINT uq_attempt UNIQUE (student_id, exam_type, exam_config_id),
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- the (randomised) subset + order of questions this student received
CREATE TABLE IF NOT EXISTS attempt_questions (
  attempt_id  INT NOT NULL,
  question_id INT NOT NULL,
  position    INT NOT NULL,
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT fk_aq_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id  INT NOT NULL,
  question_id INT NOT NULL,
  answer      TEXT NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT fk_aa_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE
);

-- ============================================================
-- 10. RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS results_obj (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  student_id     INT NOT NULL,
  exam_config_id INT NOT NULL,
  score          DECIMAL(6,2) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_result_obj UNIQUE (student_id, exam_config_id),
  CONSTRAINT chk_res_obj_score CHECK (score >= 0),
  CONSTRAINT fk_res_obj_student FOREIGN KEY (student_id)     REFERENCES students(id)                    ON DELETE CASCADE,
  CONSTRAINT fk_res_obj_exam    FOREIGN KEY (exam_config_id) REFERENCES exam_config_obj(exam_config_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS results_theory (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  student_id     INT NOT NULL,
  exam_config_id INT NOT NULL,
  score          DECIMAL(6,2) NOT NULL,
  remarks        TEXT NULL,
  recorded_by    INT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_result_theory UNIQUE (student_id, exam_config_id),
  CONSTRAINT chk_res_theory_score CHECK (score >= 0),
  CONSTRAINT fk_res_theory_student FOREIGN KEY (student_id)     REFERENCES students(id)                       ON DELETE CASCADE,
  CONSTRAINT fk_res_theory_exam    FOREIGN KEY (exam_config_id) REFERENCES exam_config_theory(exam_config_id) ON DELETE CASCADE,
  CONSTRAINT fk_res_theory_admin   FOREIGN KEY (recorded_by)    REFERENCES admin(id)                          ON DELETE SET NULL
);

-- "Result exists" is not the same as "result is visible":
-- students only see a term's results once the admin releases them for their class arm.
CREATE TABLE IF NOT EXISTS result_releases (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  class_arm_id INT NOT NULL,
  term_id      INT NOT NULL,
  released_by  INT NULL,
  released_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_release UNIQUE (class_arm_id, term_id),
  CONSTRAINT fk_rr_class_arm FOREIGN KEY (class_arm_id) REFERENCES class_arm(class_arm_id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_term      FOREIGN KEY (term_id)      REFERENCES terms(id)               ON DELETE CASCADE,
  CONSTRAINT fk_rr_admin     FOREIGN KEY (released_by)  REFERENCES admin(id)               ON DELETE SET NULL
);

-- Teacher review: cognitive / behavioural ratings + remarks, per student per term
CREATE TABLE IF NOT EXISTS student_reviews (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  student_id        INT NOT NULL,
  term_id           INT NOT NULL,
  cognitive         TEXT NOT NULL,             -- JSON { memory: 1-5, ... }
  behavioral        TEXT NOT NULL,             -- JSON { punctuality: 1-5, ... }
  academic_remark   TEXT NULL,
  cognitive_remark  TEXT NULL,
  behavioral_remark TEXT NULL,
  teacher_remark    TEXT NULL,
  reviewed_by       INT NULL,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_review UNIQUE (student_id, term_id),
  CONSTRAINT fk_rev_student FOREIGN KEY (student_id)  REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_term    FOREIGN KEY (term_id)     REFERENCES terms(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rev_admin   FOREIGN KEY (reviewed_by) REFERENCES admin(id)    ON DELETE SET NULL
);

-- ============================================================
-- 10b. REFRESH TOKENS (sessions)
--    Only a SHA-256 hash of each refresh token is stored. Every use rotates the token
--    (old one is revoked, new one issued in the same family). Presenting an already-used
--    token revokes the whole family — that is how a stolen token is detected.
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  token_hash       CHAR(64)  NOT NULL UNIQUE,
  family_id        CHAR(36)  NOT NULL,
  subject_type     ENUM('admin','student') NOT NULL,
  subject_id       INT       NOT NULL,
  expires_at       DATETIME  NOT NULL,
  revoked_at       DATETIME  NULL,
  replaced_by_hash CHAR(64)  NULL,
  user_agent       VARCHAR(255) NULL,
  ip               VARCHAR(45)  NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rt_family  ON refresh_tokens(family_id);
CREATE INDEX idx_rt_subject ON refresh_tokens(subject_type, subject_id);
CREATE INDEX idx_rt_expires ON refresh_tokens(expires_at);

-- ============================================================
-- 11. TRIGGERS: SCORE MUST NOT EXCEED EXAM MAXIMUM
-- ============================================================
DROP TRIGGER IF EXISTS trg_check_obj_score_insert;
DROP TRIGGER IF EXISTS trg_check_obj_score_update;
DROP TRIGGER IF EXISTS trg_check_theory_score_insert;
DROP TRIGGER IF EXISTS trg_check_theory_score_update;

DELIMITER $$

CREATE TRIGGER trg_check_obj_score_insert BEFORE INSERT ON results_obj FOR EACH ROW
BEGIN
  DECLARE max_mark DECIMAL(6,2);
  SELECT mark INTO max_mark FROM exam_config_obj WHERE exam_config_id = NEW.exam_config_id;
  IF NEW.score > max_mark THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Score exceeds exam maximum mark';
  END IF;
END$$

CREATE TRIGGER trg_check_obj_score_update BEFORE UPDATE ON results_obj FOR EACH ROW
BEGIN
  DECLARE max_mark DECIMAL(6,2);
  SELECT mark INTO max_mark FROM exam_config_obj WHERE exam_config_id = NEW.exam_config_id;
  IF NEW.score > max_mark THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Score exceeds exam maximum mark';
  END IF;
END$$

CREATE TRIGGER trg_check_theory_score_insert BEFORE INSERT ON results_theory FOR EACH ROW
BEGIN
  DECLARE max_mark DECIMAL(6,2);
  SELECT mark INTO max_mark FROM exam_config_theory WHERE exam_config_id = NEW.exam_config_id;
  IF NEW.score > max_mark THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Score exceeds exam maximum mark';
  END IF;
END$$

CREATE TRIGGER trg_check_theory_score_update BEFORE UPDATE ON results_theory FOR EACH ROW
BEGIN
  DECLARE max_mark DECIMAL(6,2);
  SELECT mark INTO max_mark FROM exam_config_theory WHERE exam_config_id = NEW.exam_config_id;
  IF NEW.score > max_mark THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Score exceeds exam maximum mark';
  END IF;
END$$

DELIMITER ;
