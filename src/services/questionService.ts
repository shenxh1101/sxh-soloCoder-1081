import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Question, Option, QuestionType, SkipLogic } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSurveyById } from './surveyService';

export interface QuestionCreateData {
  survey_id: string;
  type: QuestionType;
  title: string;
  description?: string;
  sort_order: number;
  is_required?: boolean;
  skip_logic?: SkipLogic;
  max_score?: number;
  options?: Array<{
    label: string;
    value: string;
    sort_order: number;
    score?: number;
    skip_to_question_id?: string;
  }>;
}

export interface QuestionUpdateData {
  type?: QuestionType;
  title?: string;
  description?: string;
  sort_order?: number;
  is_required?: boolean;
  skip_logic?: SkipLogic | null;
  max_score?: number;
  options?: Array<{
    id?: string;
    label: string;
    value: string;
    sort_order: number;
    score?: number;
    skip_to_question_id?: string;
  }>;
}

function parseSkipLogic(skipLogicStr: string | null): SkipLogic | undefined {
  if (!skipLogicStr) return undefined;
  try {
    return JSON.parse(skipLogicStr);
  } catch {
    return undefined;
  }
}

function serializeSkipLogic(skipLogic?: SkipLogic | null): string | null {
  if (!skipLogic) return null;
  return JSON.stringify(skipLogic);
}

export async function createQuestion(data: QuestionCreateData): Promise<Question> {
  const survey = await getSurveyById(data.survey_id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const questionId = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run('BEGIN TRANSACTION');

    const questionStmt = db.prepare(`
      INSERT INTO questions (
        id, survey_id, type, title, description, sort_order,
        is_required, skip_logic, max_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await questionStmt.run(
      questionId,
      data.survey_id,
      data.type,
      data.title,
      data.description || null,
      data.sort_order,
      data.is_required ?? true,
      serializeSkipLogic(data.skip_logic),
      data.max_score || null,
      now,
      now
    );

    if (data.options && data.options.length > 0) {
      const optionStmt = db.prepare(`
        INSERT INTO options (
          id, question_id, label, value, sort_order, score, skip_to_question_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const opt of data.options) {
        await optionStmt.run(
          uuidv4(),
          questionId,
          opt.label,
          opt.value,
          opt.sort_order,
          opt.score || null,
          opt.skip_to_question_id || null,
          now
        );
      }
    }

    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }

  return (await getQuestionById(questionId)) as Question;
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  const questionStmt = db.prepare('SELECT * FROM questions WHERE id = ?');
  const question = await questionStmt.get(id) as Question | undefined;

  if (!question) return undefined;

  question.is_required = Boolean(question.is_required);
  question.skip_logic = parseSkipLogic(question.skip_logic as unknown as string | null);

  const optionStmt = db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY sort_order ASC');
  const options = await optionStmt.all(id) as Option[];

  if (options.length > 0) {
    question.options = options;
  }

  return question;
}

export async function getQuestionsBySurveyId(surveyId: string): Promise<Question[]> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const stmt = db.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY sort_order ASC');
  const questions = await stmt.all(surveyId) as Question[];

  for (const q of questions) {
    q.is_required = Boolean(q.is_required);
    q.skip_logic = parseSkipLogic(q.skip_logic as unknown as string | null);

    const optionStmt = db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY sort_order ASC');
    const options = await optionStmt.all(q.id) as Option[];
    if (options.length > 0) {
      q.options = options;
    }
  }

  return questions;
}

export async function getFullSurveyStructure(surveyId: string): Promise<{
  survey: Awaited<ReturnType<typeof getSurveyById>>;
  questions: Question[];
}> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const questions = await getQuestionsBySurveyId(surveyId);

  return { survey, questions };
}

export async function updateQuestion(id: string, data: QuestionUpdateData): Promise<Question> {
  const question = await getQuestionById(id);
  if (!question) {
    throw new AppError('Question not found', 404);
  }

  try {
    await db.run('BEGIN TRANSACTION');

    const updates: string[] = [];
    const params: any[] = [];

    const fields: Array<keyof QuestionUpdateData> = [
      'type', 'title', 'description', 'sort_order', 'is_required', 'max_score'
    ];

    fields.forEach(key => {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (data.skip_logic !== undefined) {
      updates.push('skip_logic = ?');
      params.push(serializeSkipLogic(data.skip_logic));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      const stmt = db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = ?`);
      await stmt.run(...params);
    }

    if (data.options !== undefined) {
      const deleteOptionsStmt = db.prepare('DELETE FROM options WHERE question_id = ?');
      await deleteOptionsStmt.run(id);

      if (data.options.length > 0) {
        const optionStmt = db.prepare(`
          INSERT INTO options (
            id, question_id, label, value, sort_order, score, skip_to_question_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        for (const opt of data.options) {
          await optionStmt.run(
            opt.id || uuidv4(),
            id,
            opt.label,
            opt.value,
            opt.sort_order,
            opt.score || null,
            opt.skip_to_question_id || null,
            now
          );
        }
      }
    }

    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }

  return (await getQuestionById(id)) as Question;
}

export async function deleteQuestion(id: string): Promise<void> {
  const question = await getQuestionById(id);
  if (!question) {
    throw new AppError('Question not found', 404);
  }

  const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
  await stmt.run(id);
}

export async function deleteQuestionsBySurveyId(surveyId: string): Promise<void> {
  const stmt = db.prepare('DELETE FROM questions WHERE survey_id = ?');
  await stmt.run(surveyId);
}
