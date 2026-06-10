import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Response, Answer, ResponseSubmission, Question, SkipLogic, SurveySnapshot } from '../types';
import { AppError } from '../middleware/errorHandler';
import { checkSurveyAvailability, getSurveyById } from './surveyService';
import { getQuestionsBySurveyId } from './questionService';
import { getChannelByCode } from './channelService';
import { getVersionById } from './versionService';

export interface ValidationError {
  questionId: string;
  questionTitle: string;
  error: string;
}

function buildQuestionOptionMap(questions: Question[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  questions.forEach(q => {
    if (q.options) {
      const optionIds = new Set(q.options.map(o => o.id));
      map.set(q.id, optionIds);
    }
  });
  return map;
}

function buildOptionSkipMap(questions: Question[]): Map<string, string> {
  const map = new Map<string, string>();
  questions.forEach(q => {
    if (q.options) {
      q.options.forEach(o => {
        if (o.skip_to_question_id) {
          map.set(o.id, o.skip_to_question_id);
        }
      });
    }
  });
  return map;
}

function calculateSkippedQuestions(
  submission: ResponseSubmission,
  questions: Question[]
): Set<string> {
  const skipped = new Set<string>();
  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const answerMap = new Map(submission.answers.map(a => [a.question_id, a]));
  const optionSkipMap = buildOptionSkipMap(questions);

  sortedQuestions.forEach((question, index) => {
    if (skipped.has(question.id)) return;

    const answer = answerMap.get(question.id);
    if (!answer) return;

    const selectedOptionIds = answer.option_ids || [];

    for (const optionId of selectedOptionIds) {
      const skipTarget = optionSkipMap.get(optionId);
      if (skipTarget) {
        const targetIndex = sortedQuestions.findIndex(q => q.id === skipTarget);
        if (targetIndex > index) {
          for (let i = index + 1; i < targetIndex; i++) {
            skipped.add(sortedQuestions[i].id);
          }
        }
      }
    }

    if (question.skip_logic) {
      const skipLogic = question.skip_logic as SkipLogic;
      if (skipLogic.conditions && skipLogic.conditions.length > 0) {
        for (const condition of skipLogic.conditions) {
          if (selectedOptionIds.includes(condition.optionId)) {
            const targetIndex = sortedQuestions.findIndex(q => q.id === condition.targetQuestionId);
            if (targetIndex > index) {
              for (let i = index + 1; i < targetIndex; i++) {
                skipped.add(sortedQuestions[i].id);
              }
            }
            break;
          }
        }

        if (skipLogic.defaultTarget) {
          const hasMatchingCondition = skipLogic.conditions.some(c =>
            selectedOptionIds.includes(c.optionId)
          );
          if (!hasMatchingCondition) {
            const targetIndex = sortedQuestions.findIndex(q => q.id === skipLogic.defaultTarget);
            if (targetIndex > index) {
              for (let i = index + 1; i < targetIndex; i++) {
                skipped.add(sortedQuestions[i].id);
              }
            }
          }
        }
      }
    }
  });

  return skipped;
}

export function validateResponse(
  submission: ResponseSubmission,
  questions: Question[]
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const questionOptionMap = buildQuestionOptionMap(questions);
  const skippedQuestions = calculateSkippedQuestions(submission, questions);

  const questionMap = new Map(questions.map(q => [q.id, q]));
  for (const question of questions) {
    if ((question.type === 'single' || question.type === 'multiple') &&
        (!question.options || question.options.length === 0)) {
      errors.push({
        questionId: question.id,
        questionTitle: question.title,
        error: `Question '${question.title}' (${question.type === 'single' ? 'single' : 'multiple'} choice) has no valid options configured, cannot accept submission`
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  questions.forEach(question => {
    const answer = submission.answers.find(a => a.question_id === question.id);
    const isSkipped = skippedQuestions.has(question.id);

    if (isSkipped) {
      return;
    }

    if (question.is_required && !answer) {
      errors.push({
        questionId: question.id,
        questionTitle: question.title,
        error: `Required question '${question.title}' not answered`
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
            error: `Single choice question '${question.title}' requires exactly one option`
          });
        } else {
          const validOptionIds = questionOptionMap.get(question.id);
          if (!validOptionIds || validOptionIds.size === 0) {
            errors.push({
              questionId: question.id,
              questionTitle: question.title,
              error: `Question '${question.title}' has no valid options configured`
            });
          } else {
            const invalidOptions = answer.option_ids.filter(id => !validOptionIds.has(id));
            if (invalidOptions.length > 0) {
              errors.push({
                questionId: question.id,
                questionTitle: question.title,
                error: `Invalid option ID(s) for question '${question.title}': ${invalidOptions.join(', ')}`
              });
            }
          }
        }
        break;

      case 'multiple':
        if (!answer.option_ids || answer.option_ids.length === 0) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: `Multiple choice question '${question.title}' requires at least one option`
          });
        } else {
          const validOptionIds = questionOptionMap.get(question.id);
          if (!validOptionIds || validOptionIds.size === 0) {
            errors.push({
              questionId: question.id,
              questionTitle: question.title,
              error: `Question '${question.title}' has no valid options configured`
            });
          } else {
            const invalidOptions = answer.option_ids.filter(id => !validOptionIds.has(id));
            if (invalidOptions.length > 0) {
              errors.push({
                questionId: question.id,
                questionTitle: question.title,
                error: `Invalid option ID(s) for question '${question.title}': ${invalidOptions.join(', ')}`
              });
            }
          }
        }
        break;

      case 'text':
        if (!answer.answer_text || answer.answer_text.trim() === '') {
          if (question.is_required) {
            errors.push({
              questionId: question.id,
              questionTitle: question.title,
              error: `Text answer for '${question.title}' is required`
            });
          }
        }
        break;

      case 'rating':
        if (answer.score === undefined || answer.score === null) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: `Rating score for '${question.title}' is required`
          });
        } else if (question.max_score && (answer.score < 0 || answer.score > question.max_score)) {
          errors.push({
            questionId: question.id,
            questionTitle: question.title,
            error: `Rating score for '${question.title}' must be between 0 and ${question.max_score}`
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

async function checkChannelAvailability(channelId: string, isTest: boolean): Promise<{
  available: boolean;
  reason?: string;
  errorCode?: string;
  status: 'normal' | 'quota_exceeded' | 'expired';
}> {
  const channelStmt = db.prepare('SELECT * FROM channels WHERE id = ?');
  const channel = await channelStmt.get(channelId) as any;
  if (!channel) {
    return { available: false, reason: 'Channel not found', errorCode: 'CHANNEL_NOT_FOUND', status: 'normal' };
  }

  const now = new Date();

  if (channel.close_time && new Date(channel.close_time) < now) {
    return {
      available: false,
      reason: `Channel '${channel.name}' has expired, closed at ${channel.close_time}`,
      errorCode: 'CHANNEL_EXPIRED',
      status: 'expired'
    };
  }

  if (channel.quota !== null && channel.quota !== undefined) {
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM responses
      WHERE channel_id = ? AND is_test = ? AND channel_status = 'normal'
    `);
    const countResult = await countStmt.get(channelId, isTest ? 1 : 0) as { count: number };

    if (countResult.count >= channel.quota) {
      return {
        available: false,
        reason: `Channel '${channel.name}' has exceeded its quota (${countResult.count}/${channel.quota})`,
        errorCode: 'CHANNEL_QUOTA_EXCEEDED',
        status: 'quota_exceeded'
      };
    }
  }

  return { available: true, status: 'normal' };
}

async function recordBlockedResponse(
  submission: ResponseSubmission,
  ipAddress: string | undefined,
  channelId: string | undefined,
  versionId: string | undefined,
  channelStatus: 'normal' | 'quota_exceeded' | 'expired' | 'closed',
  blockReason: string
): Promise<string> {
  const responseId = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO responses (
      id, survey_id, channel_id, version_id, user_id, ip_address, submitted_at, is_test, channel_status, block_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(
    responseId,
    submission.survey_id,
    channelId || null,
    versionId || null,
    submission.user_id || null,
    ipAddress || null,
    now,
    submission.is_test ?? false,
    channelStatus,
    blockReason
  );

  return responseId;
}

async function getVersionQuestions(versionId: string): Promise<Question[]> {
  const version = await getVersionById(versionId);
  if (!version || !version.snapshotData) {
    return [];
  }
  const snapshot = version.snapshotData as SurveySnapshot;
  const questions = snapshot.questions.map(q => {
    const options = snapshot.options.filter(o => o.question_id === q.id);
    return { ...q, options };
  });
  return questions;
}

export async function submitResponse(
  submission: ResponseSubmission,
  ipAddress?: string
): Promise<{ responseId: string; submittedAt: string; versionId?: string; version?: number }> {
  const survey = await getSurveyById(submission.survey_id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const isTest = submission.is_test ?? false;

  let channelId: string | undefined;
  let versionId: string | undefined;
  let versionNumber: number | undefined;

  if (submission.channel_code) {
    const channel = await getChannelByCode(submission.channel_code);
    if (!channel || channel.survey_id !== submission.survey_id) {
      throw new AppError('Invalid channel code', 400);
    }
    channelId = channel.id;
    versionId = channel.version_id;
    if (channel.version) {
      versionNumber = channel.version.version;
    }
  }

  if (!versionId) {
    const { getLatestVersion } = await import('./versionService');
    const latestVersion = await getLatestVersion(submission.survey_id);
    if (latestVersion) {
      versionId = latestVersion.id;
      versionNumber = latestVersion.version;
    }
  }

  const availability = await checkSurveyAvailability(submission.survey_id, submission.user_id, isTest);
  if (!availability.available) {
    const statusCode = availability.errorCode === 'MAX_SUBMISSIONS_REACHED' ? 400 : 403;
    const errorMessage = availability.errorCode
      ? `[${availability.errorCode}] ${availability.reason}`
      : availability.reason || 'Survey is not available';

    await recordBlockedResponse(
      submission,
      ipAddress,
      channelId,
      versionId,
      'closed',
      errorMessage
    );

    throw new AppError(errorMessage, statusCode);
  }

  if (!survey.is_anonymous && !submission.user_id) {
    throw new AppError('User ID is required for non-anonymous surveys', 400);
  }

  let channelStatus: 'normal' | 'quota_exceeded' | 'expired' | 'closed' = 'normal';
  if (channelId) {
    const channelCheck = await checkChannelAvailability(channelId, isTest);
    if (!channelCheck.available) {
      const errorMessage = `[${channelCheck.errorCode}] ${channelCheck.reason}`;

      await recordBlockedResponse(
        submission,
        ipAddress,
        channelId,
        versionId,
        channelCheck.status,
        errorMessage
      );

      throw new AppError(errorMessage, 403);
    }
    channelStatus = channelCheck.status;
  }

  let questions: Question[];
  if (versionId) {
    questions = await getVersionQuestions(versionId);
  } else {
    questions = await getQuestionsBySurveyId(submission.survey_id);
  }

  const validation = validateResponse(submission, questions);
  if (!validation.valid) {
    const errorMessage = `Validation failed: ${validation.errors.map(e => e.error).join('; ')}`;

    await recordBlockedResponse(
      submission,
      ipAddress,
      channelId,
      versionId,
      'normal',
      errorMessage
    );

    throw new AppError(errorMessage, 400);
  }

  const responseId = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run('BEGIN TRANSACTION');

    const responseStmt = db.prepare(`
      INSERT INTO responses (
        id, survey_id, channel_id, version_id, user_id, ip_address, submitted_at, is_test, channel_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await responseStmt.run(
      responseId,
      submission.survey_id,
      channelId || null,
      versionId || null,
      submission.user_id || null,
      ipAddress || null,
      now,
      submission.is_test ?? false,
      channelStatus
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

  return { responseId, submittedAt: now, versionId, version: versionNumber };
}

export async function getResponseById(id: string): Promise<(Response & { answers: Answer[] }) | undefined> {
  const responseStmt = db.prepare('SELECT * FROM responses WHERE id = ?');
  const response = await responseStmt.get(id) as Response | undefined;

  if (!response) return undefined;

  response.is_test = Boolean(response.is_test);

  if (response.version_id) {
    const { getVersionById } = await import('./versionService');
    const version = await getVersionById(response.version_id);
    if (version) {
      response.version = version;
    }
  }

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

export async function getUserSubmissionCount(
  surveyId: string,
  userId: string,
  includeTest: boolean = false
): Promise<number> {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM responses
    WHERE survey_id = ? AND user_id = ? ${includeTest ? '' : 'AND is_test = 0'}
  `);
  const result = await stmt.get(surveyId, userId) as { count: number };
  return result.count;
}
