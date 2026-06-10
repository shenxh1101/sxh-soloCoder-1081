import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Channel } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSurveyById } from './surveyService';

export interface ChannelCreateData {
  survey_id: string;
  name: string;
}

function generateChannelCode(): string {
  return `CH_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export async function createChannel(data: ChannelCreateData): Promise<Channel> {
  const survey = await getSurveyById(data.survey_id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const id = uuidv4();
  const code = generateChannelCode();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO channels (id, survey_id, name, code, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  await stmt.run(id, data.survey_id, data.name, code, now);

  return (await getChannelById(id)) as Channel;
}

export async function getChannelById(id: string): Promise<Channel | undefined> {
  const stmt = db.prepare('SELECT * FROM channels WHERE id = ?');
  return await stmt.get(id) as Channel | undefined;
}

export async function getChannelByCode(code: string): Promise<Channel | undefined> {
  const stmt = db.prepare('SELECT * FROM channels WHERE code = ?');
  return await stmt.get(code) as Channel | undefined;
}

export async function getChannelsBySurveyId(surveyId: string): Promise<Channel[]> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const stmt = db.prepare('SELECT * FROM channels WHERE survey_id = ? ORDER BY created_at DESC');
  return await stmt.all(surveyId) as Channel[];
}

export async function getChannelWithStats(surveyId: string): Promise<Array<Channel & { response_count: number }>> {
  await getChannelsBySurveyId(surveyId);

  const stmt = db.prepare(`
    SELECT c.*, COUNT(r.id) as response_count
    FROM channels c
    LEFT JOIN responses r ON c.id = r.channel_id AND r.is_test = 0
    WHERE c.survey_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);

  return await stmt.all(surveyId) as Array<Channel & { response_count: number }>;
}

export async function generateSurveyLink(surveyId: string, baseUrl: string, channelCode?: string): Promise<string> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  if (channelCode) {
    const channel = await getChannelByCode(channelCode);
    if (!channel || channel.survey_id !== surveyId) {
      throw new AppError('Invalid channel code for this survey', 400);
    }
    return `${baseUrl}/survey/${surveyId}?channel=${channelCode}`;
  }

  return `${baseUrl}/survey/${surveyId}`;
}

export async function generateChannelLink(channelId: string, baseUrl: string): Promise<string> {
  const channel = await getChannelById(channelId);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  return `${baseUrl}/survey/${channel.survey_id}?channel=${channel.code}`;
}

export async function deleteChannel(id: string): Promise<void> {
  const channel = await getChannelById(id);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  const stmt = db.prepare('DELETE FROM channels WHERE id = ?');
  await stmt.run(id);
}

export async function updateChannel(id: string, name: string): Promise<Channel> {
  const channel = await getChannelById(id);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  const stmt = db.prepare('UPDATE channels SET name = ? WHERE id = ?');
  await stmt.run(name, id);

  return (await getChannelById(id)) as Channel;
}
