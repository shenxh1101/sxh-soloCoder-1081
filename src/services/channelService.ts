import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Channel, ChannelStats, BlockRecord } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSurveyById } from './surveyService';
import { getLatestVersion } from './versionService';

export interface ChannelCreateData {
  survey_id: string;
  name: string;
  quota?: number;
  close_time?: string;
}

export interface ChannelUpdateData {
  name?: string;
  quota?: number | null;
  close_time?: string | null;
}

function generateChannelCode(): string {
  return `CH_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export async function createChannel(data: ChannelCreateData): Promise<Channel> {
  const survey = await getSurveyById(data.survey_id);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const latestVersion = await getLatestVersion(data.survey_id);
  if (!latestVersion) {
    throw new AppError('Survey has not been published yet, please publish first', 400);
  }

  const id = uuidv4();
  const code = generateChannelCode();
  const now = new Date().toISOString();

  if (data.quota !== undefined && data.quota !== null && data.quota <= 0) {
    throw new AppError('Channel quota must be a positive number', 400);
  }

  if (data.close_time && new Date(data.close_time) < new Date()) {
    throw new AppError('Channel close time cannot be in the past', 400);
  }

  const stmt = db.prepare(`
    INSERT INTO channels (id, survey_id, name, code, quota, close_time, version_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(
    id,
    data.survey_id,
    data.name,
    code,
    data.quota !== undefined ? data.quota : null,
    data.close_time || null,
    latestVersion.id,
    now
  );

  return (await getChannelById(id)) as Channel;
}

async function populateChannelVersion(channel: Channel): Promise<Channel> {
  if (channel.version_id) {
    const { getVersionById } = await import('./versionService');
    const version = await getVersionById(channel.version_id);
    if (version) {
      channel.version = version;
    }
  }
  return channel;
}

export async function getChannelById(id: string): Promise<Channel | undefined> {
  const stmt = db.prepare('SELECT * FROM channels WHERE id = ?');
  const channel = await stmt.get(id) as Channel | undefined;
  if (channel) {
    return await populateChannelVersion(channel);
  }
  return channel;
}

export async function getChannelByCode(code: string): Promise<Channel | undefined> {
  const stmt = db.prepare('SELECT * FROM channels WHERE code = ?');
  const channel = await stmt.get(code) as Channel | undefined;
  if (channel) {
    return await populateChannelVersion(channel);
  }
  return channel;
}

export async function getChannelsBySurveyId(surveyId: string): Promise<Channel[]> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new AppError('Survey not found', 404);
  }

  const stmt = db.prepare('SELECT * FROM channels WHERE survey_id = ? ORDER BY created_at DESC');
  const channels = await stmt.all(surveyId) as Channel[];
  return await Promise.all(channels.map(populateChannelVersion));
}

export async function getChannelWithStats(surveyId: string, versionId?: string): Promise<ChannelStats[]> {
  let channels = await getChannelsBySurveyId(surveyId);

  if (versionId) {
    channels = channels.filter(c => c.version_id === versionId);
  }

  const joinConditions: string[] = ['c.id = r.channel_id'];
  const params: any[] = [];

  if (versionId) {
    joinConditions.push('r.version_id = ?');
    params.push(versionId);
  }

  const joinClause = joinConditions.length > 1 ? `AND ${joinConditions.slice(1).join(' AND ')}` : '';
  const whereConditions = ['c.survey_id = ?'];
  params.push(surveyId);

  if (versionId) {
    whereConditions.push('c.version_id = ?');
    params.push(versionId);
  }

  const whereClause = whereConditions.join(' AND ');

  const stmt = db.prepare(`
    SELECT 
      c.id as channel_id,
      c.name as channel_name,
      c.code as channel_code,
      c.quota,
      c.close_time,
      c.version_id,
      COUNT(DISTINCT r.id) as response_count,
      COUNT(DISTINCT CASE WHEN r.is_test = 0 AND r.channel_status = 'normal' THEN r.id END) as valid_submissions,
      COUNT(DISTINCT CASE WHEN r.is_test = 1 AND r.channel_status = 'normal' THEN r.id END) as test_submissions,
      COUNT(DISTINCT CASE WHEN r.channel_status != 'normal' THEN r.id END) as blocked_submissions
    FROM channels c
    LEFT JOIN responses r ON c.id = r.channel_id ${joinClause}
    WHERE ${whereClause}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);

  const stats = await stmt.all(...params) as ChannelStats[];

  for (const stat of stats) {
    if (stat.quota && stat.quota > 0) {
      stat.percentage = Math.round((stat.valid_submissions / stat.quota) * 100);
    } else {
      stat.percentage = 0;
    }

    const channel = channels.find(c => c.id === stat.channel_id);
    if (channel?.version) {
      stat.version = channel.version.version;
    }

    const blockParams: any[] = [stat.channel_id];
    const blockWhere: string[] = ['channel_id = ?', 'channel_status != \'normal\''];
    
    if (versionId) {
      blockWhere.push('version_id = ?');
      blockParams.push(versionId);
    }

    const blocksStmt = db.prepare(`
      SELECT id, submitted_at, channel_status, block_reason, is_test, user_id, ip_address
      FROM responses
      WHERE ${blockWhere.join(' AND ')}
      ORDER BY submitted_at DESC
      LIMIT 10
    `);
    stat.recent_blocks = await blocksStmt.all(...blockParams) as BlockRecord[];

    const distParams: any[] = [stat.channel_id];
    const distWhere: string[] = ['channel_id = ?', 'channel_status != \'normal\''];
    
    if (versionId) {
      distWhere.push('version_id = ?');
      distParams.push(versionId);
    }

    const distStmt = db.prepare(`
      SELECT 
        COALESCE(block_reason, channel_status) as reason,
        COUNT(*) as count
      FROM responses
      WHERE ${distWhere.join(' AND ')}
      GROUP BY COALESCE(block_reason, channel_status)
      ORDER BY count DESC
    `);
    stat.block_reason_distribution = await distStmt.all(...distParams) as Array<{ reason: string; count: number }>;
  }

  return stats;
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

export async function updateChannel(id: string, data: ChannelUpdateData): Promise<Channel> {
  const channel = await getChannelById(id);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  if (data.quota !== undefined && data.quota !== null && data.quota <= 0) {
    throw new AppError('Channel quota must be a positive number', 400);
  }

  if (data.close_time !== undefined && data.close_time !== null && new Date(data.close_time) < new Date()) {
    throw new AppError('Channel close time cannot be in the past', 400);
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.quota !== undefined) {
    updates.push('quota = ?');
    params.push(data.quota);
  }
  if (data.close_time !== undefined) {
    updates.push('close_time = ?');
    params.push(data.close_time);
  }

  if (updates.length === 0) {
    return channel;
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`);
  await stmt.run(...params);

  return (await getChannelById(id)) as Channel;
}
