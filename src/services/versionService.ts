import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { SurveyVersion, SurveySnapshot, Survey, Question, Option } from '../types';

export async function createVersion(surveyId: string, publishedBy?: string): Promise<SurveyVersion> {
  const stmt = db.prepare(`
    SELECT MAX(version) as max_version FROM survey_versions WHERE survey_id = ?
  `);
  const result = await stmt.get(surveyId) as { max_version: number | null };
  const nextVersion = (result.max_version || 0) + 1;

  const surveyStmt = db.prepare('SELECT * FROM surveys WHERE id = ?');
  const survey = await surveyStmt.get(surveyId) as Survey;
  if (!survey) {
    throw new Error('Survey not found');
  }

  const questionsStmt = db.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order');
  const questions = await questionsStmt.all(surveyId) as Question[];

  const questionIds = questions.map(q => q.id);
  const placeholders = questionIds.map(() => '?').join(',');
  const optionsStmt = db.prepare(`SELECT * FROM options WHERE question_id IN (${placeholders}) ORDER BY sort_order`);
  const options = await optionsStmt.all(...questionIds) as Option[];

  const snapshot: SurveySnapshot = {
    survey,
    questions,
    options
  };

  const versionId = uuidv4();
  const insertStmt = db.prepare(`
    INSERT INTO survey_versions (id, survey_id, version, snapshot, published_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  await insertStmt.run(versionId, surveyId, nextVersion, JSON.stringify(snapshot), publishedBy || null);

  return getVersionById(versionId);
}

export async function getVersionById(versionId: string): Promise<SurveyVersion> {
  const stmt = db.prepare('SELECT * FROM survey_versions WHERE id = ?');
  const version = await stmt.get(versionId) as SurveyVersion;
  if (version) {
    try {
      version.snapshotData = JSON.parse(version.snapshot);
    } catch (e) {
      console.error('Failed to parse snapshot:', e);
    }
  }
  return version;
}

export async function getVersionsBySurveyId(surveyId: string): Promise<SurveyVersion[]> {
  const stmt = db.prepare('SELECT * FROM survey_versions WHERE survey_id = ? ORDER BY version DESC');
  const versions = await stmt.all(surveyId) as SurveyVersion[];
  return versions.map(v => {
    try {
      v.snapshotData = JSON.parse(v.snapshot);
    } catch (e) {
      console.error('Failed to parse snapshot:', e);
    }
    return v;
  });
}

export async function getLatestVersion(surveyId: string): Promise<SurveyVersion | null> {
  const stmt = db.prepare(`
    SELECT * FROM survey_versions 
    WHERE survey_id = ? 
    ORDER BY version DESC 
    LIMIT 1
  `);
  const version = await stmt.get(surveyId) as SurveyVersion | undefined;
  if (version) {
    try {
      version.snapshotData = JSON.parse(version.snapshot);
    } catch (e) {
      console.error('Failed to parse snapshot:', e);
    }
  }
  return version || null;
}

export async function parseSnapshot(snapshot: string): Promise<SurveySnapshot> {
  return JSON.parse(snapshot);
}
