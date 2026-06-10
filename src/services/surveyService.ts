import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Survey, SurveyStatus } from '../types';
import { AppError } from '../middleware/errorHandler';

export interface SurveyCreateData {
  title: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  max_submissions_per_user?: number;
  is_anonymous?: boolean;
  is_test?: boolean;
}

export interface SurveyUpdateData {
  title?: string;
  description?: string;
  status?: SurveyStatus;
  start_time?: string | null;
  end_time?: string | null;
  max_submissions_per_user?: number;
  is_anonymous?: boolean;
  is_test?: boolean;
}

export async function createSurvey(data: SurveyCreateData): Promise<Survey> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO surveys (
      id, title, description, status, start_time, end_time,
      max_submissions_per_user, is_anonymous, is_test, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(
    id,
    data.title,
    data.description || null,
    'draft',
    data.start_time || null,
    data.end_time || null,
    data.max_submissions_per_user ?? 1,
    data.is_anonymous ?? true,
    data.is_test ?? false,
    now,
    now
  );

  return (await getSurveyById(id)) as Survey;
}

export async function getSurveyById(id: string): Promise<Survey | undefined> {
  const stmt = db.prepare('SELECT * FROM surveys WHERE id = ?');
  const survey = await stmt.get(id) as Survey | undefined;

  if (survey) {
    survey.is_anonymous = Boolean(survey.is_anonymous);
    survey.is_test = Boolean(survey.is_test);
  }

  return survey;
}

export async function getSurveyList(page: number = 1, pageSize: number = 20, status?: SurveyStatus): Promise<{
  list: Survey[];
  total: number;
  page: number;
  pageSize: number;
}> {
  let whereClause = '';
  const params: any[] = [];

  if (status) {
    whereClause = 'WHERE status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM surveys ${whereClause}`);
  const totalResult = await countStmt.get(...params) as { count: number };

  const offset = (page - 1) * pageSize;
  const listStmt = db.prepare(`
    SELECT * FROM surveys ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const list = await listStmt.all(...params, pageSize, offset) as Survey[];

  list.forEach(survey => {
    survey.is_anonymous = Boolean(survey.is_anonymous);
    survey.is_test = Boolean(survey.is_test);
  });

  return {
    list,
    total: totalResult.count,
    page,
    pageSize
  };
}

export async function updateSurvey(id: string, data: SurveyUpdateData): Promise<Survey> {
  const survey = await getSurveyById(id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const updates: string[] = [];
  const params: any[] = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  });

  if (updates.length === 0) {
    return survey;
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  const stmt = db.prepare(`
    UPDATE surveys SET ${updates.join(', ')} WHERE id = ?
  `);

  await stmt.run(...params);

  return (await getSurveyById(id)) as Survey;
}

export async function closeSurvey(id: string): Promise<Survey> {
  const survey = await getSurveyById(id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  return updateSurvey(id, { status: 'closed' });
}

export async function deleteSurvey(id: string): Promise<void> {
  const survey = await getSurveyById(id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const stmt = db.prepare('DELETE FROM surveys WHERE id = ?');
  await stmt.run(id);
}

export async function clearTestData(surveyId: string): Promise<{ deletedResponses: number; deletedAnswers: number }> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  let deletedAnswers = 0;
  let deletedResponses = 0;

  try {
    await db.run('BEGIN TRANSACTION');

    const answerStmt = db.prepare(`
      DELETE FROM answers WHERE response_id IN (
        SELECT id FROM responses WHERE survey_id = ? AND is_test = 1
      )
    `);
    const answerResult = await answerStmt.run(surveyId);
    deletedAnswers = answerResult.changes;

    const responseStmt = db.prepare(`
      DELETE FROM responses WHERE survey_id = ? AND is_test = 1
    `);
    const responseResult = await responseStmt.run(surveyId);
    deletedResponses = responseResult.changes;

    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }

  return { deletedAnswers, deletedResponses };
}

export async function checkSurveyAvailability(
  surveyId: string,
  userId?: string,
  isTest: boolean = false
): Promise<{
  available: boolean;
  reason?: string;
  errorCode?: string;
  survey: Survey;
}> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  if (survey.status !== 'active') {
    return {
      available: false,
      reason: `Survey is currently '${survey.status}', only 'active' surveys accept submissions`,
      errorCode: 'SURVEY_NOT_ACTIVE',
      survey
    };
  }

  const now = new Date();
  if (survey.start_time && new Date(survey.start_time) > now) {
    return {
      available: false,
      reason: `Survey has not started yet, it will open at ${survey.start_time}`,
      errorCode: 'SURVEY_NOT_STARTED',
      survey
    };
  }

  if (survey.end_time && new Date(survey.end_time) < now) {
    return {
      available: false,
      reason: `Survey has ended, it closed at ${survey.end_time}`,
      errorCode: 'SURVEY_ENDED',
      survey
    };
  }

  if (userId && survey.max_submissions_per_user > 0) {
    const countTestSubmissions = isTest;
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM responses
      WHERE survey_id = ? AND user_id = ? ${countTestSubmissions ? '' : 'AND is_test = 0'}
    `);
    const result = await stmt.get(surveyId, userId) as { count: number };

    if (result.count >= survey.max_submissions_per_user) {
      const submissionType = countTestSubmissions ? 'test' : 'formal';
      return {
        available: false,
        reason: `User '${userId}' has exceeded the maximum number of ${submissionType} submissions (${result.count}/${survey.max_submissions_per_user}). Test data ${countTestSubmissions ? 'is' : 'is not'} included in this count.`,
        errorCode: 'MAX_SUBMISSIONS_REACHED',
        survey
      };
    }
  }

  return {
    available: true,
    survey
  };
}
