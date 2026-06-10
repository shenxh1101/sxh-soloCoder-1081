import db from './database';

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.get(`PRAGMA table_info(${tableName})`);
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    return columns.some((col: any) => col.name === columnName);
  } catch {
    return false;
  }
}

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
      quota INTEGER,
      close_time DATETIME,
      version_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY (version_id) REFERENCES survey_versions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS survey_versions (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_by TEXT,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      channel_id TEXT,
      version_id TEXT,
      user_id TEXT,
      ip_address TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_test BOOLEAN DEFAULT 0,
      channel_status TEXT DEFAULT 'normal',
      block_reason TEXT,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
      FOREIGN KEY (version_id) REFERENCES survey_versions(id) ON DELETE SET NULL
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
    CREATE INDEX IF NOT EXISTS idx_channels_code ON channels(code);
    CREATE INDEX IF NOT EXISTS idx_survey_versions_survey_id ON survey_versions(survey_id);
    CREATE INDEX IF NOT EXISTS idx_survey_versions_version ON survey_versions(survey_id, version);
    CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON responses(survey_id);
    CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id);
    CREATE INDEX IF NOT EXISTS idx_responses_channel_id ON responses(channel_id);
    CREATE INDEX IF NOT EXISTS idx_responses_version_id ON responses(version_id);
    CREATE INDEX IF NOT EXISTS idx_answers_response_id ON answers(response_id);
    CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
  `);

  const hasQuota = await columnExists('channels', 'quota');
  if (!hasQuota) {
    try {
      await db.exec('ALTER TABLE channels ADD COLUMN quota INTEGER');
    } catch (e) {
      console.log('Column quota already exists or alter failed:', e);
    }
  }

  const hasCloseTime = await columnExists('channels', 'close_time');
  if (!hasCloseTime) {
    try {
      await db.exec('ALTER TABLE channels ADD COLUMN close_time DATETIME');
    } catch (e) {
      console.log('Column close_time already exists or alter failed:', e);
    }
  }

  const hasVersionId = await columnExists('responses', 'version_id');
  if (!hasVersionId) {
    try {
      await db.exec('ALTER TABLE responses ADD COLUMN version_id TEXT REFERENCES survey_versions(id) ON DELETE SET NULL');
    } catch (e) {
      console.log('Column version_id already exists or alter failed:', e);
    }
  }

  const hasChannelStatus = await columnExists('responses', 'channel_status');
  if (!hasChannelStatus) {
    try {
      await db.exec("ALTER TABLE responses ADD COLUMN channel_status TEXT DEFAULT 'normal'");
    } catch (e) {
      console.log('Column channel_status already exists or alter failed:', e);
    }
  }

  const hasBlockReason = await columnExists('responses', 'block_reason');
  if (!hasBlockReason) {
    try {
      await db.exec('ALTER TABLE responses ADD COLUMN block_reason TEXT');
    } catch (e) {
      console.log('Column block_reason already exists or alter failed:', e);
    }
  }

  const hasChannelVersionId = await columnExists('channels', 'version_id');
  if (!hasChannelVersionId) {
    try {
      await db.exec('ALTER TABLE channels ADD COLUMN version_id TEXT REFERENCES survey_versions(id) ON DELETE SET NULL');
    } catch (e) {
      console.log('Column version_id already exists or alter failed:', e);
    }
  }

  console.log('Database initialized successfully');
}
