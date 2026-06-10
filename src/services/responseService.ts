import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Response, Answer, ResponseSubmission, Question } from '../types';
import { AppError } from '../middleware/errorHandler';
import { checkSurveyAvailability, getSurveyById } from './surveyService';
import { getQuestionsBySurveyId } from './questionService';
import { getChannelByCode } from './channelService';

export interface ValidationError {
  questionId: string;
  questionTitle: string;
  error: string;
}

export function validateResponse(
  submission: ResponseSubmission,
  questions: Question[]
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  questions.forEach(question => {
    const answer = submission.answers.find(a => a.question_id === question.id);

    if (question.is_required && !answer) {
      errors.push({
        questionId: question.id,
        questionTitle: question.title,
        error: 'Required question not answered'
      });
      return;
    }

    if (!answer) return;

    switch (question.type) {
      case 'single':
        if (!answer.option_ids || answer.option_ids.length !== 1) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: 'Single choice question requires exactly one option'
          });
        }
        break;

      case 'multiple':
        if (!answer.option_ids || answer.option_ids.length === 0) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: 'Multiple choice question requires at least one option'
          });
        }
        break;

      case 'text':
        if (!answer.answer_text || answer.answer_text.trim() === '') {
          if (question.is_required) {
            errors.push({
              questionId: question.id,
              questionTitle: question.title,
              error: 'Text answer is required'
            });
          }
        }
        break;

      case 'rating':
        if (answer.score === undefined || answer.score === null) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: 'Rating score is required'
          });
        } else if (question.max_score && (answer.score < 0 || answer.score > question.max_score)) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: `Rating score must be between 0 and ${question.max_score}`
          });
        }
        break;
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function submitResponse(
  submission: ResponseSubmission,
  ipAddress?: string
): Promise<{ responseId: string; submittedAt: string }> {
  const survey = await getSurveyById(submission.survey_id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const availability = await checkSurveyAvailability(submission.survey_id, submission.user_id);
  if (!availability.available) {
    throw new AppError(availability.reason || 'Survey is not available', 403);
  }

  if (!survey.is_anonymous && !submission.user_id) {
    throw new AppError('User ID is required for non-anonymous surveys', 400);
  }

  const questions = await getQuestionsBySurveyId(submission.survey_id);
  const validation = validateResponse(submission, questions);
  if (!validation.valid) {
    throw new AppError(`Validation failed: ${validation.errors.map(e => e.error).join('; ')}`, 400);
  }

  let channelId: string | undefined;
  if (submission.channel_code) {
    const channel = await getChannelByCode(submission.channel_code);
    if (!channel || channel.survey_id !== submission.survey_id) {
      throw new AppError('Invalid channel code', 400);
    }
    channelId = channel.id;
  }

  const responseId = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run('BEGIN TRANSACTION');

    const responseStmt = db.prepare(`
      INSERT INTO responses (
        id, survey_id, channel_id, user_id, ip_address, submitted_at, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    await responseStmt.run(
      responseId,
      submission.survey_id,
      channelId || null,
      submission.user_id || null,
      ipAddress || null,
      now,
      submission.is_test ?? false
    );

    const answerStmt = db.prepare(`
      INSERT INTO answers (
        id, response_id, question_id, answer_text, option_ids, score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const answer of submission.answers) {
      await answerStmt.run(
        uuidv4(),
        responseId,
        answer.question_id,
        answer.answer_text || null,
        answer.option_ids ? JSON.stringify(answer.option_ids) : null,
        answer.score ?? null,
        now
      );
    }

    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }

  return { responseId, submittedAt: now };
}

export async function getResponseById(id: string): Promise<(Response & { answers: Answer[] }) | undefined> {
  const responseStmt = db.prepare('SELECT * FROM responses WHERE id = ?');
  const response = await responseStmt.get(id) as Response | undefined;

  if (!response) return undefined;

  response.is_test = Boolean(response.is_test);

  const answerStmt = db.prepare('SELECT * FROM answers WHERE response_id = ?');
  const answers = await answerStmt.all(id) as Array<Omit<Answer, 'option_ids'> & { option_ids: string | null }>;

  const parsedAnswers: Answer[] = answers.map(a => ({
    ...a,
    option_ids: a.option_ids ? JSON.parse(a.option_ids) : undefined
  }));

  return { ...response, answers: parsedAnswers };
}

export async function getResponsesBySurveyId(
  surveyId: string,
  options: {
    page?: number;
    pageSize?: number;
    includeTest?: boolean;
    channelId?: string;
  } = {}
): Promise<{
  list: Array<Response & { answers: Answer[] }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const includeTest = options.includeTest ?? false;

  const whereConditions: string[] = ['survey_id = ?'];
  const params: any[] = [surveyId];

  if (!includeTest) {
    whereConditions.push('is_test = 0');
  }

  if (options.channelId) {
    whereConditions.push('channel_id = ?');
    params.push(options.channelId);
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM responses ${whereClause}`);
  const totalResult = await countStmt.get(...params) as { count: number };

  const offset = (page - 1) * pageSize;
  const listStmt = db.prepare(`
    SELECT * FROM responses ${whereClause}
    ORDER BY submitted_at DESC
    LIMIT ? OFFSET ?
  `);

  const responses = await listStmt.all(...params, pageSize, offset) as Response[];

  const list = [];
  for (const r of responses) {
    const fullResponse = await getResponseById(r.id);
    list.push(fullResponse!);
  }

  return {
    list,
    total: totalResult.count,
    page,
    pageSize
  };
}

export async function deleteResponse(id: string): Promise<void> {
  const response = await getResponseById(id);
  if (!response) {
    throw new AppError('Response not found', 404);
  }

  const stmt = db.prepare('DELETE FROM responses WHERE id = ?');
  await stmt.run(id);
}

export async function getUserSubmissionCount(surveyId: string, userId: string): Promise<number> {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM responses
    WHERE survey_id = ? AND user_id = ? AND is_test = 0
  `);
  const result = await stmt.get(surveyId, userId) as { count: number };
  return result.count;
}
