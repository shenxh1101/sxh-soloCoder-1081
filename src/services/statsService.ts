import db from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getSurveyById } from './surveyService';
import { getQuestionsBySurveyId } from './questionService';
import { getChannelWithStats } from './channelService';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';

export interface ChannelStats {
  channel_id: string;
  channel_name: string;
  channel_code: string;
  response_count: number;
  percentage: number;
}

export interface OptionStats {
  option_id: string;
  option_label: string;
  option_value: string;
  count: number;
  percentage: number;
}

export interface QuestionStats {
  question_id: string;
  question_title: string;
  question_type: string;
  total_responses: number;
  average_score?: number;
  options?: OptionStats[];
  text_answers_count?: number;
}

export interface SurveyOverview {
  survey_id: string;
  survey_title: string;
  total_responses: number;
  test_responses: number;
  valid_responses: number;
  channel_stats: ChannelStats[];
  question_stats: QuestionStats[];
  start_time?: string;
  end_time?: string;
  created_at: string;
}

export async function getSurveyStats(surveyId: string, includeTest: boolean = false): Promise<SurveyOverview> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const responseCountStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count
    FROM responses WHERE survey_id = ?
  `);
  const counts = await responseCountStmt.get(surveyId) as { total: number; test_count: number };

  const totalResponses = counts.total || 0;
  const testResponses = counts.test_count || 0;
  const validResponses = includeTest ? totalResponses : totalResponses - testResponses;

  const channelStats = await getChannelStats(surveyId, includeTest);
  const questionStats = await getQuestionStats(surveyId, includeTest);

  return {
    survey_id: survey.id,
    survey_title: survey.title,
    total_responses: totalResponses,
    test_responses: testResponses,
    valid_responses: validResponses,
    channel_stats: channelStats,
    question_stats: questionStats,
    start_time: survey.start_time,
    end_time: survey.end_time,
    created_at: survey.created_at
  };
}

export async function getChannelStats(surveyId: string, includeTest: boolean = false): Promise<ChannelStats[]> {
  await getChannelWithStats(surveyId);

  const testFilter = includeTest ? '' : 'AND r.is_test = 0';
  const stmt = db.prepare(`
    SELECT c.id, c.name, c.code, COUNT(r.id) as count
    FROM channels c
    LEFT JOIN responses r ON c.id = r.channel_id ${testFilter}
    WHERE c.survey_id = ?
    GROUP BY c.id
    ORDER BY count DESC
  `);

  const results = await stmt.all(surveyId) as Array<{ id: string; name: string; code: string; count: number }>;

  const total = results.reduce((sum, r) => sum + r.count, 0);

  return results.map(r => ({
    channel_id: r.id,
    channel_name: r.name,
    channel_code: r.code,
    response_count: r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 10000) / 100 : 0
  }));
}

export async function getQuestionStats(surveyId: string, includeTest: boolean = false): Promise<QuestionStats[]> {
  const questions = await getQuestionsBySurveyId(surveyId);
  const testFilter = includeTest ? '' : 'AND r.is_test = 0';

  const stats: QuestionStats[] = [];

  for (const question of questions) {
    const baseStats: QuestionStats = {
      question_id: question.id,
      question_title: question.title,
      question_type: question.type,
      total_responses: 0
    };

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM answers a
      JOIN responses r ON a.response_id = r.id
      WHERE a.question_id = ? ${testFilter}
    `);
    const countResult = await countStmt.get(question.id) as { count: number };
    baseStats.total_responses = countResult.count || 0;

    if (question.type === 'single' || question.type === 'multiple') {
      const optionStats: OptionStats[] = [];

      if (question.options) {
        for (const option of question.options) {
          const optionCountStmt = db.prepare(`
            SELECT COUNT(*) as count FROM answers a
            JOIN responses r ON a.response_id = r.id
            WHERE a.question_id = ? ${testFilter}
            AND a.option_ids LIKE ?
          `);
          const optionCount = await optionCountStmt.get(
            question.id,
            `%${option.id}%`
          ) as { count: number };

          const count = optionCount.count || 0;
          optionStats.push({
            option_id: option.id,
            option_label: option.label,
            option_value: option.value,
            count,
            percentage: baseStats.total_responses > 0
              ? Math.round((count / baseStats.total_responses) * 10000) / 100
              : 0
          });
        }
      }

      baseStats.options = optionStats;
    } else if (question.type === 'rating') {
      const avgStmt = db.prepare(`
        SELECT AVG(a.score) as avg_score FROM answers a
        JOIN responses r ON a.response_id = r.id
        WHERE a.question_id = ? AND a.score IS NOT NULL ${testFilter}
      `);
      const avgResult = await avgStmt.get(question.id) as { avg_score: number | null };
      baseStats.average_score = avgResult.avg_score
        ? Math.round(avgResult.avg_score * 100) / 100
        : 0;
    } else if (question.type === 'text') {
      baseStats.text_answers_count = baseStats.total_responses;
    }

    stats.push(baseStats);
  }

  return stats;
}

export async function exportResponsesToCSV(
  surveyId: string,
  options: { includeTest?: boolean; channelId?: string } = {}
): Promise<string> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const questions = await getQuestionsBySurveyId(surveyId);
  const includeTest = options.includeTest ?? false;

  const whereConditions: string[] = ['r.survey_id = ?'];
  const params: any[] = [surveyId];

  if (!includeTest) {
    whereConditions.push('r.is_test = 0');
  }

  if (options.channelId) {
    whereConditions.push('r.channel_id = ?');
    params.push(options.channelId);
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  const responsesStmt = db.prepare(`
    SELECT r.*, c.name as channel_name
    FROM responses r
    LEFT JOIN channels c ON r.channel_id = c.id
    ${whereClause}
    ORDER BY r.submitted_at DESC
  `);

  const responses = await responsesStmt.all(...params) as Array<any>;

  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const fileName = `survey_${surveyId}_${Date.now()}.csv`;
  const filePath = path.join(exportDir, fileName);

  const headerFields = [
    { id: 'response_id', title: 'Response ID' },
    { id: 'submitted_at', title: 'Submitted At' },
    { id: 'channel_name', title: 'Channel' },
    { id: 'user_id', title: 'User ID' },
    { id: 'ip_address', title: 'IP Address' },
    { id: 'is_test', title: 'Is Test' }
  ];

  questions.forEach(q => {
    headerFields.push({ id: `q_${q.id}`, title: `${q.title} (${q.type})` });
  });

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: headerFields
  });

  const records = [];
  for (const response of responses) {
    const record: any = {
      response_id: response.id,
      submitted_at: response.submitted_at,
      channel_name: response.channel_name || 'Direct',
      user_id: response.user_id || 'Anonymous',
      ip_address: response.ip_address || '',
      is_test: response.is_test ? 'Yes' : 'No'
    };

    const answersStmt = db.prepare('SELECT * FROM answers WHERE response_id = ?');
    const answers = await answersStmt.all(response.id) as Array<any>;

    questions.forEach(q => {
      const answer = answers.find((a: any) => a.question_id === q.id);
      if (answer) {
        if (q.type === 'single' || q.type === 'multiple') {
          if (answer.option_ids) {
            const optionIds = JSON.parse(answer.option_ids);
            const optionLabels = optionIds.map((oid: string) => {
              const option = q.options?.find((o: any) => o.id === oid);
              return option ? option.label : oid;
            });
            record[`q_${q.id}`] = optionLabels.join('; ');
          }
        } else if (q.type === 'text') {
          record[`q_${q.id}`] = answer.answer_text || '';
        } else if (q.type === 'rating') {
          record[`q_${q.id}`] = answer.score !== null ? answer.score : '';
        }
      } else {
        record[`q_${q.id}`] = '';
      }
    });

    records.push(record);
  }

  await csvWriter.writeRecords(records);

  return filePath;
}

export async function getResponseTrend(surveyId: string, includeTest: boolean = false): Promise<Array<{
  date: string;
  count: number;
}>> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const testFilter = includeTest ? '' : 'AND is_test = 0';
  const stmt = db.prepare(`
    SELECT
      DATE(submitted_at) as date,
      COUNT(*) as count
    FROM responses
    WHERE survey_id = ? ${testFilter}
    GROUP BY DATE(submitted_at)
    ORDER BY date ASC
  `);

  return await stmt.all(surveyId) as Array<{ date: string; count: number }>;
}
