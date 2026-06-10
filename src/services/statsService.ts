import db from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getSurveyById } from './surveyService';
import { getQuestionsBySurveyId } from './questionService';
import { getChannelWithStats } from './channelService';
import { getVersionById, getVersionsBySurveyId } from './versionService';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';
import { Question, SurveySnapshot } from '../types';

export interface ChannelStats {
  channel_id: string;
  channel_name: string;
  channel_code: string;
  response_count: number;
  valid_submissions: number;
  test_submissions: number;
  blocked_submissions: number;
  percentage: number;
  quota?: number;
  close_time?: string;
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

async function getQuestionsForStats(surveyId: string, versionId?: string): Promise<Question[]> {
  if (versionId) {
    const version = await getVersionById(versionId);
    if (!version || !version.snapshotData) {
      return [];
    }
    const snapshot = version.snapshotData as SurveySnapshot;
    return snapshot.questions.map(q => {
      const options = snapshot.options.filter(o => o.question_id === q.id);
      return { ...q, options };
    });
  }
  return await getQuestionsBySurveyId(surveyId);
}

function buildVersionFilter(versionId?: string, tableAlias: string = 'r'): { clause: string; params: string[] } {
  if (versionId) {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return { clause: `AND ${prefix}version_id = ?`, params: [versionId] };
  }
  return { clause: '', params: [] };
}

export async function getSurveyStats(
  surveyId: string,
  includeTest: boolean = false,
  versionId?: string
): Promise<SurveyOverview & { version_id?: string; version?: number; versions?: Array<{ id: string; version: number; published_at: string }> }> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const versionFilter = buildVersionFilter(versionId, '');
  const allVersions = await getVersionsBySurveyId(surveyId);
  const versionList = allVersions.map(v => ({
    id: v.id,
    version: v.version,
    published_at: v.published_at
  }));

  const countParams = [surveyId, ...versionFilter.params];
  const responseCountStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) as test_count
    FROM responses WHERE survey_id = ? ${versionFilter.clause}
  `);
  const counts = await responseCountStmt.get(...countParams) as { total: number; test_count: number };

  const totalResponses = counts.total || 0;
  const testResponses = counts.test_count || 0;
  const validResponses = includeTest ? totalResponses : totalResponses - testResponses;

  const channelStats = await getChannelStats(surveyId, includeTest, versionId);
  const questionStats = await getQuestionStats(surveyId, includeTest, versionId);

  let versionNumber: number | undefined;
  if (versionId) {
    const version = allVersions.find(v => v.id === versionId);
    if (version) {
      versionNumber = version.version;
    }
  }

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
    created_at: survey.created_at,
    version_id: versionId,
    version: versionNumber,
    versions: versionList
  };
}

export async function getChannelStats(
  surveyId: string,
  includeTest: boolean = false,
  versionId?: string
): Promise<ChannelStats[]> {
  const joinConditions: string[] = ['c.id = r.channel_id'];
  const params: any[] = [surveyId];
  
  if (!includeTest) {
    joinConditions.push('r.is_test = 0');
  }
  
  if (versionId) {
    joinConditions.push('r.version_id = ?');
    params.push(versionId);
  }
  
  const joinClause = joinConditions.join(' AND ');
  
  const stmt = db.prepare(`
    SELECT 
      c.id,
      c.name,
      c.code,
      c.quota,
      c.close_time,
      c.version_id,
      COUNT(DISTINCT r.id) as total_count,
      COUNT(DISTINCT CASE WHEN r.is_test = 0 AND r.channel_status = 'normal' THEN r.id END) as valid_count,
      COUNT(DISTINCT CASE WHEN r.is_test = 1 AND r.channel_status = 'normal' THEN r.id END) as test_count,
      COUNT(DISTINCT CASE WHEN r.channel_status != 'normal' THEN r.id END) as blocked_count
    FROM channels c
    LEFT JOIN responses r ON ${joinClause}
    WHERE c.survey_id = ?
    GROUP BY c.id
    ORDER BY total_count DESC
  `);
  const results = await stmt.all(...params) as Array<{
    id: string; name: string; code: string; quota?: number; close_time?: string; version_id?: string;
    total_count: number; valid_count: number; test_count: number; blocked_count: number;
  }>;

  const total = results.reduce((sum, r) => sum + r.total_count, 0);

  const allVersions = await getVersionsBySurveyId(surveyId);

  return results.map(r => {
    let versionNumber: number | undefined;
    if (r.version_id) {
      const v = allVersions.find(v => v.id === r.version_id);
      if (v) versionNumber = v.version;
    }
    return {
      channel_id: r.id,
      channel_name: r.name,
      channel_code: r.code,
      response_count: r.total_count,
      valid_submissions: r.valid_count,
      test_submissions: r.test_count,
      blocked_submissions: r.blocked_count,
      percentage: total > 0 ? Math.round((r.total_count / total) * 10000) / 100 : 0,
      quota: r.quota ?? undefined,
      close_time: r.close_time ?? undefined,
      version_id: r.version_id,
      version: versionNumber
    };
  });
}

export async function getQuestionStats(
  surveyId: string,
  includeTest: boolean = false,
  versionId?: string
): Promise<QuestionStats[]> {
  const questions = await getQuestionsForStats(surveyId, versionId);
  const testFilter = includeTest ? '' : 'AND r.is_test = 0';
  const versionFilter = buildVersionFilter(versionId);
  const statusFilter = 'AND r.channel_status = \'normal\'';

  const stats: QuestionStats[] = [];

  for (const question of questions) {
    const baseStats: QuestionStats = {
      question_id: question.id,
      question_title: question.title,
      question_type: question.type,
      total_responses: 0
    };

    const countParams = [question.id, ...versionFilter.params];
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM answers a
      JOIN responses r ON a.response_id = r.id
      WHERE a.question_id = ? ${testFilter} ${statusFilter} ${versionFilter.clause}
    `);
    const countResult = await countStmt.get(...countParams) as { count: number };
    baseStats.total_responses = countResult.count || 0;

    if (question.type === 'single' || question.type === 'multiple') {
      const optionStats: OptionStats[] = [];

      if (question.options) {
        for (const option of question.options) {
          const optionCountParams = [question.id, `%${option.id}%`, ...versionFilter.params];
          const optionCountStmt = db.prepare(`
            SELECT COUNT(*) as count FROM answers a
            JOIN responses r ON a.response_id = r.id
            WHERE a.question_id = ? ${testFilter} ${statusFilter} ${versionFilter.clause}
            AND a.option_ids LIKE ?
          `);
          const optionCount = await optionCountStmt.get(...optionCountParams) as { count: number };

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
      const avgParams = [question.id, ...versionFilter.params];
      const avgStmt = db.prepare(`
        SELECT AVG(a.score) as avg_score FROM answers a
        JOIN responses r ON a.response_id = r.id
        WHERE a.question_id = ? AND a.score IS NOT NULL ${testFilter} ${statusFilter} ${versionFilter.clause}
      `);
      const avgResult = await avgStmt.get(...avgParams) as { avg_score: number | null };
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
  options: { includeTest?: boolean; channelId?: string; versionId?: string } = {}
): Promise<string> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const questions = await getQuestionsForStats(surveyId, options.versionId);
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

  if (options.versionId) {
    whereConditions.push('r.version_id = ?');
    params.push(options.versionId);
  }

  whereConditions.push('r.channel_status = \'normal\'');

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

export async function getResponseTrend(
  surveyId: string,
  includeTest: boolean = false,
  versionId?: string
): Promise<Array<{
  date: string;
  count: number;
}>> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const testFilter = includeTest ? '' : 'AND is_test = 0';
  const versionFilter = buildVersionFilter(versionId, '');
  const statusFilter = 'AND channel_status = \'normal\'';
  const params = [surveyId, ...versionFilter.params];

  const stmt = db.prepare(`
    SELECT
      DATE(submitted_at) as date,
      COUNT(*) as count
    FROM responses
    WHERE survey_id = ? ${testFilter} ${statusFilter} ${versionFilter.clause}
    GROUP BY DATE(submitted_at)
    ORDER BY date ASC
  `);

  return await stmt.all(...params) as Array<{ date: string; count: number }>;
}

export async function compareVersions(
  surveyId: string,
  v1Id: string,
  v2Id: string,
  includeTest: boolean = false
): Promise<any> {
  const v1 = await getVersionById(v1Id);
  const v2 = await getVersionById(v2Id);
  
  if (!v1 || !v2) {
    throw new AppError('One or both versions not found', 404);
  }
  
  if (v1.survey_id !== surveyId || v2.survey_id !== surveyId) {
    throw new AppError('Versions do not belong to the specified survey', 400);
  }

  const v1Snapshot = v1.snapshotData as SurveySnapshot;
  const v2Snapshot = v2.snapshotData as SurveySnapshot;
  
  const v1Questions = v1Snapshot.questions.map(q => ({
    ...q,
    options: v1Snapshot.options.filter(o => o.question_id === q.id)
  }));
  const v2Questions = v2Snapshot.questions.map(q => ({
    ...q,
    options: v2Snapshot.options.filter(o => o.question_id === q.id)
  }));

  const v1Stats = await getQuestionStats(surveyId, includeTest, v1Id);
  const v2Stats = await getQuestionStats(surveyId, includeTest, v2Id);

  const allQuestionIds = new Set([
    ...v1Questions.map(q => q.id),
    ...v2Questions.map(q => q.id)
  ]);

  const questions: any[] = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  for (const qId of allQuestionIds) {
    const v1q = v1Questions.find(q => q.id === qId);
    const v2q = v2Questions.find(q => q.id === qId);
    const v1s = v1Stats.find(s => s.question_id === qId);
    const v2s = v2Stats.find(s => s.question_id === qId);

    let change_type: 'added' | 'removed' | 'unchanged' | 'modified';
    const changes: any = {};

    if (!v1q && v2q) {
      change_type = 'added';
      added++;
    } else if (v1q && !v2q) {
      change_type = 'removed';
      removed++;
    } else if (v1q && v2q) {
      let isModified = false;
      
      if (v1q.title !== v2q.title) {
        changes.title_changed = true;
        isModified = true;
      }

      const v1OptionIds = new Set(v1q.options?.map(o => o.id) || []);
      const v2OptionIds = new Set(v2q.options?.map(o => o.id) || []);
      
      const optionsAdded: string[] = [];
      const optionsRemoved: string[] = [];
      const optionsModified: string[] = [];

      for (const oid of v2OptionIds) {
        if (!v1OptionIds.has(oid)) {
          optionsAdded.push(oid);
          isModified = true;
        } else {
          const v1o = v1q.options?.find(o => o.id === oid);
          const v2o = v2q.options?.find(o => o.id === oid);
          if (v1o && v2o && v1o.label !== v2o.label) {
            optionsModified.push(oid);
            isModified = true;
          }
        }
      }

      for (const oid of v1OptionIds) {
        if (!v2OptionIds.has(oid)) {
          optionsRemoved.push(oid);
          isModified = true;
        }
      }

      if (optionsAdded.length > 0) changes.options_added = optionsAdded;
      if (optionsRemoved.length > 0) changes.options_removed = optionsRemoved;
      if (optionsModified.length > 0) changes.options_modified = optionsModified;

      if (isModified) {
        change_type = 'modified';
        modified++;
      } else {
        change_type = 'unchanged';
        unchanged++;
      }
    } else {
      change_type = 'unchanged';
      unchanged++;
    }

    const question: any = {
      question_id: qId,
      question_title: (v2q || v1q)?.title || '',
      question_type: (v2q || v1q)?.type || 'single',
      change_type
    };

    if (Object.keys(changes).length > 0) {
      question.changes = changes;
    }

    if (v1s) {
      question.v1_stats = {
        total_responses: v1s.total_responses,
        option_stats: v1s.options?.map(o => ({
          option_id: o.option_id,
          option_label: o.option_label,
          count: o.count,
          percentage: o.percentage
        })),
        average_score: v1s.average_score
      };
    }

    if (v2s) {
      question.v2_stats = {
        total_responses: v2s.total_responses,
        option_stats: v2s.options?.map(o => ({
          option_id: o.option_id,
          option_label: o.option_label,
          count: o.count,
          percentage: o.percentage
        })),
        average_score: v2s.average_score
      };
    }

    questions.push(question);
  }

  return {
    v1: { id: v1.id, version: v1.version, published_at: v1.published_at },
    v2: { id: v2.id, version: v2.version, published_at: v2.published_at },
    questions,
    summary: {
      total_questions_v1: v1Questions.length,
      total_questions_v2: v2Questions.length,
      questions_added: added,
      questions_removed: removed,
      questions_modified: modified,
      questions_unchanged: unchanged
    }
  };
}

export async function getBlockReasonDistribution(
  surveyId: string,
  channelId?: string,
  versionId?: string
): Promise<Array<{ reason: string; count: number }>> {
  const whereConditions: string[] = ['survey_id = ?', 'channel_status != \'normal\''];
  const params: any[] = [surveyId];

  if (channelId) {
    whereConditions.push('channel_id = ?');
    params.push(channelId);
  }

  if (versionId) {
    whereConditions.push('version_id = ?');
    params.push(versionId);
  }

  const whereClause = whereConditions.join(' AND ');

  const stmt = db.prepare(`
    SELECT 
      COALESCE(block_reason, channel_status) as reason,
      COUNT(*) as count
    FROM responses
    WHERE ${whereClause}
    GROUP BY COALESCE(block_reason, channel_status)
    ORDER BY count DESC
  `);

  return await stmt.all(...params) as Array<{ reason: string; count: number }>;
}

export async function exportResponses(
  surveyId: string,
  options: {
    format: 'csv' | 'json';
    includeTest?: boolean;
    channelId?: string;
    versionId?: string;
    includeBlocked?: boolean;
  }
): Promise<string> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const includeTest = options.includeTest ?? false;
  const includeBlocked = options.includeBlocked ?? false;

  const whereConditions: string[] = ['r.survey_id = ?'];
  const params: any[] = [surveyId];

  if (!includeTest) {
    whereConditions.push('r.is_test = 0');
  }

  if (!includeBlocked) {
    whereConditions.push('r.channel_status = \'normal\'');
  }

  if (options.channelId) {
    whereConditions.push('r.channel_id = ?');
    params.push(options.channelId);
  }

  if (options.versionId) {
    whereConditions.push('r.version_id = ?');
    params.push(options.versionId);
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
  const allVersions = await getVersionsBySurveyId(surveyId);

  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = Date.now();

  if (options.format === 'json') {
    const records = [];
    for (const response of responses) {
      const version = allVersions.find(v => v.id === response.version_id);
      const snapshot = version?.snapshotData as SurveySnapshot;
      const versionQuestions = snapshot ? snapshot.questions.map(q => ({
        ...q,
        options: snapshot.options.filter(o => o.question_id === q.id)
      })) : null;

      const answersStmt = db.prepare('SELECT * FROM answers WHERE response_id = ?');
      const answers = await answersStmt.all(response.id) as Array<any>;

      const questionsToUse = versionQuestions || await getQuestionsForStats(surveyId, response.version_id);
      
      const formattedAnswers: any[] = [];
      for (const q of questionsToUse) {
        const answer = answers.find((a: any) => a.question_id === q.id);
        const ans: any = {
          question_id: q.id,
          question_title: q.title,
          question_type: q.type
        };

        if (answer) {
          if (q.type === 'single' || q.type === 'multiple') {
            if (answer.option_ids) {
              const optionIds = JSON.parse(answer.option_ids);
              const optionLabels = optionIds.map((oid: string) => {
                const option = q.options?.find((o: any) => o.id === oid);
                return option ? option.label : oid;
              });
              ans.option_ids = optionIds;
              ans.option_labels = optionLabels;
            }
          } else if (q.type === 'text') {
            ans.answer_text = answer.answer_text || '';
          } else if (q.type === 'rating') {
            ans.score = answer.score !== null ? answer.score : null;
          }
        }

        formattedAnswers.push(ans);
      }

      records.push({
        response_id: response.id,
        survey_id: response.survey_id,
        channel_id: response.channel_id,
        channel_name: response.channel_name || 'Direct',
        version_id: response.version_id,
        version: version?.version,
        user_id: response.user_id || 'Anonymous',
        ip_address: response.ip_address || '',
        submitted_at: response.submitted_at,
        is_test: response.is_test ? true : false,
        channel_status: response.channel_status,
        block_reason: response.block_reason || null,
        answers: formattedAnswers
      });
    }

    const fileName = `survey_${surveyId}_${timestamp}.json`;
    const filePath = path.join(exportDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify({
      survey: { id: survey.id, title: survey.title },
      export_options: options,
      total_responses: records.length,
      responses: records
    }, null, 2));

    return filePath;
  } else {
    let questions: Question[];
    if (options.versionId) {
      questions = await getQuestionsForStats(surveyId, options.versionId);
    } else {
      const allQuestionIds = new Set<string>();
      for (const v of allVersions) {
        const snapshot = v.snapshotData as SurveySnapshot;
        snapshot.questions.forEach(q => allQuestionIds.add(q.id));
      }
      questions = [];
      const seen = new Set<string>();
      for (const v of allVersions) {
        const snapshot = v.snapshotData as SurveySnapshot;
        for (const q of snapshot.questions) {
          if (!seen.has(q.id)) {
            seen.add(q.id);
            questions.push({
              ...q,
              options: snapshot.options.filter(o => o.question_id === q.id)
            });
          }
        }
      }
    }

    const headerFields = [
      { id: 'response_id', title: 'Response ID' },
      { id: 'submitted_at', title: 'Submitted At' },
      { id: 'channel_name', title: 'Channel' },
      { id: 'version', title: 'Version' },
      { id: 'user_id', title: 'User ID' },
      { id: 'ip_address', title: 'IP Address' },
      { id: 'is_test', title: 'Is Test' },
      { id: 'channel_status', title: 'Status' },
      { id: 'block_reason', title: 'Block Reason' }
    ];

    questions.forEach(q => {
      headerFields.push({ id: `q_${q.id}`, title: `${q.title} (${q.type})` });
    });

    const fileName = `survey_${surveyId}_${timestamp}.csv`;
    const filePath = path.join(exportDir, fileName);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headerFields
    });

    const records = [];
    for (const response of responses) {
      const version = allVersions.find(v => v.id === response.version_id);
      const snapshot = version?.snapshotData as SurveySnapshot;
      const versionQuestions = snapshot ? snapshot.questions.map(q => ({
        ...q,
        options: snapshot.options.filter(o => o.question_id === q.id)
      })) : questions;

      const record: any = {
        response_id: response.id,
        submitted_at: response.submitted_at,
        channel_name: response.channel_name || 'Direct',
        version: version?.version || 'N/A',
        user_id: response.user_id || 'Anonymous',
        ip_address: response.ip_address || '',
        is_test: response.is_test ? 'Yes' : 'No',
        channel_status: response.channel_status,
        block_reason: response.block_reason || ''
      };

      const answersStmt = db.prepare('SELECT * FROM answers WHERE response_id = ?');
      const answers = await answersStmt.all(response.id) as Array<any>;

      questions.forEach(q => {
        const vq = versionQuestions.find(vq => vq.id === q.id);
        const answer = answers.find((a: any) => a.question_id === q.id);
        if (answer && vq) {
          if (q.type === 'single' || q.type === 'multiple') {
            if (answer.option_ids) {
              const optionIds = JSON.parse(answer.option_ids);
              const optionLabels = optionIds.map((oid: string) => {
                const option = vq.options?.find((o: any) => o.id === oid);
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
}
