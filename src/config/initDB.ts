import db from './database';

export async function initDatabase(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      start_time DATETIME,
      end_time DATETIME,
      max_submissions_per_user INTEGER DEFAULT 1,
      is_anonymous BOOLEAN DEFAULT 1,
      is_test BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL,
      is_required BOOLEAN DEFAULT 1,
      skip_logic TEXT,
      max_score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      score INTEGER,
      skip_to_question_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      channel_id TEXT,
      user_id TEXT,
      ip_address TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_test BOOLEAN DEFAULT 0,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer_text TEXT,
      option_ids TEXT,
      score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_survey_id ON questions(survey_id);
    CREATE INDEX IF NOT EXISTS idx_options_question_id ON options(question_id);
    CREATE INDEX IF NOT EXISTS idx_channels_survey_id ON channels(survey_id);
    CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON responses(survey_id);
    CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id);
    CREATE INDEX IF NOT EXISTS idx_answers_response_id ON answers(response_id);
    CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
  `);

  console.log('Database initialized successfully');
}
