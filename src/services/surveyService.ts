import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Survey, SurveyStatus, PublishCheckResult, PublishCheckError, Question, Option, SkipLogic } from '../types';
import { AppError } from '../middleware/errorHandler';
import { createVersion, getLatestVersion } from './versionService';

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
      AND channel_status = 'normal'
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

export async function checkPublishReadiness(surveyId: string): Promise<PublishCheckResult> {
  const errors: PublishCheckError[] = [];
  const warnings: PublishCheckError[] = [];

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const questionsStmt = db.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order');
  const questions = await questionsStmt.all(surveyId) as Question[];

  if (questions.length === 0) {
    errors.push({
      code: 'NO_QUESTIONS',
      message: '问卷没有任何题目，请至少添加一道题目后再发布'
    });
    return { canPublish: false, errors, warnings };
  }

  const questionIdMap = new Map(questions.map(q => [q.id, q]));
  const questionIndexMap = new Map(questions.map((q, i) => [q.id, i]));

  for (const question of questions) {
    if (question.type === 'single' || question.type === 'multiple') {
      const optionsStmt = db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY sort_order');
      const options = await optionsStmt.all(question.id) as Option[];

      if (options.length === 0) {
        errors.push({
          code: 'NO_OPTIONS',
          message: `题目「${question.title}」（${question.type === 'single' ? '单选' : '多选'}）没有配置任何选项`,
          questionId: question.id
        });
      }

      for (const option of options) {
        if (option.skip_to_question_id) {
          if (!questionIdMap.has(option.skip_to_question_id)) {
            errors.push({
              code: 'INVALID_SKIP_TARGET',
              message: `题目「${question.title}」的选项「${option.label}」配置的跳题目标不存在`,
              questionId: question.id,
              optionId: option.id
            });
          } else {
            const currentIndex = questionIndexMap.get(question.id)!;
            const targetIndex = questionIndexMap.get(option.skip_to_question_id)!;
            if (targetIndex <= currentIndex) {
              errors.push({
                code: 'SKIP_TARGET_BEFORE_CURRENT',
                message: `题目「${question.title}」的选项「${option.label}」配置的跳题目标指向了当前题目或之前的题目（只能向后跳）`,
                questionId: question.id,
                optionId: option.id
              });
            }
          }
        }
      }
    }

    if (question.skip_logic) {
      let skipLogic: SkipLogic;
      try {
        skipLogic = typeof question.skip_logic === 'string'
          ? JSON.parse(question.skip_logic)
          : question.skip_logic as SkipLogic;
      } catch (e) {
        errors.push({
          code: 'INVALID_SKIP_LOGIC',
          message: `题目「${question.title}」的跳题规则配置格式错误`,
          questionId: question.id
        });
        continue;
      }

      const currentIndex = questionIndexMap.get(question.id)!;

      for (const condition of skipLogic.conditions) {
        if (!questionIdMap.has(condition.targetQuestionId)) {
          errors.push({
            code: 'INVALID_SKIP_TARGET',
            message: `题目「${question.title}」的跳题规则中，选项「${condition.optionId}」的跳转目标不存在`,
            questionId: question.id
          });
        } else {
          const targetIndex = questionIndexMap.get(condition.targetQuestionId)!;
          if (targetIndex <= currentIndex) {
            errors.push({
              code: 'SKIP_TARGET_BEFORE_CURRENT',
              message: `题目「${question.title}」的跳题规则中，选项「${condition.optionId}」的跳转目标指向了当前题目或之前的题目（只能向后跳）`,
              questionId: question.id
            });
          }
        }
      }

      if (skipLogic.defaultTarget) {
        if (!questionIdMap.has(skipLogic.defaultTarget)) {
          errors.push({
            code: 'INVALID_SKIP_TARGET',
            message: `题目「${question.title}」的跳题规则中，默认跳转目标不存在`,
            questionId: question.id
          });
        } else {
          const targetIndex = questionIndexMap.get(skipLogic.defaultTarget)!;
          if (targetIndex <= currentIndex) {
            errors.push({
              code: 'SKIP_TARGET_BEFORE_CURRENT',
              message: `题目「${question.title}」的跳题规则中，默认跳转目标指向了当前题目或之前的题目（只能向后跳）`,
              questionId: question.id
            });
          }
        }
      }
    }

    if (question.type === 'rating' && (!question.max_score || question.max_score <= 0)) {
      warnings.push({
        code: 'NO_MAX_SCORE',
        message: `评分题「${question.title}」没有配置最高分，默认使用 5 分制`,
        questionId: question.id
      });
    }

    if (question.type === 'text' && question.is_required) {
      warnings.push({
        code: 'REQUIRED_TEXT_QUESTION',
        message: `填空题「${question.title}」设置为必答，可能会降低用户完成率`,
        questionId: question.id
      });
    }
  }

  if (questions.every(q => !q.is_required)) {
    warnings.push({
      code: 'NO_REQUIRED_QUESTIONS',
      message: '问卷中没有设置任何必答题，用户可以直接提交空答卷'
    });
  }

  if (!survey.start_time || !survey.end_time) {
    warnings.push({
      code: 'NO_TIME_LIMIT',
      message: '问卷没有设置有效期，发布后将长期有效直到手动关闭'
    });
  }

  return {
    canPublish: errors.length === 0,
    errors,
    warnings
  };
}

export async function publishSurvey(surveyId: string, publishedBy?: string): Promise<{
  survey: Survey;
  version: { id: string; version: number };
}> {
  const checkResult = await checkPublishReadiness(surveyId);
  if (!checkResult.canPublish) {
    const errorMessages = checkResult.errors.map(e => `[${e.code}] ${e.message}`).join('; ');
    throw new AppError(`发布预检不通过: ${errorMessages}`, 400);
  }

  const version = await createVersion(surveyId, publishedBy);

  const stmt = db.prepare(`
    UPDATE surveys SET status = 'active', updated_at = ? WHERE id = ?
  `);
  await stmt.run(new Date().toISOString(), surveyId);

  const updatedSurvey = await getSurveyById(surveyId);

  return {
    survey: updatedSurvey as Survey,
    version: { id: version.id, version: version.version }
  };
}
