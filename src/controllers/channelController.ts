import { Request, Response, NextFunction } from 'express';
import * as channelService from '../services/channelService';
import { validateRequest, channelCreateSchema } from '../validation/schemas';
import { ApiResponse } from '../types';

export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(channelCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const channel = await channelService.createChannel(req.body);
    const response: ApiResponse = { success: true, data: channel, message: 'Channel created successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const channel = await channelService.getChannelById(id);

    if (!channel) {
      res.status(404).json({ success: false, message: 'Channel not found' });
      return;
    }

    const response: ApiResponse = { success: true, data: channel };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getChannelsBySurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeStats = req.query.includeStats === 'true';

    let channels;
    if (includeStats) {
      channels = await channelService.getChannelWithStats(surveyId);
    } else {
      channels = await channelService.getChannelsBySurveyId(surveyId);
    }

    const response: ApiResponse = { success: true, data: channels };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function generateSurveyLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const { channelCode, baseUrl } = req.body;

    const defaultBaseUrl = `${req.protocol}://${req.get('host')}`;
    const link = await channelService.generateSurveyLink(
      surveyId,
      baseUrl || defaultBaseUrl,
      channelCode
    );

    const response: ApiResponse = {
      success: true,
      data: {
        survey_id: surveyId,
        channel_code: channelCode || null,
        link
      }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function generateChannelLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { baseUrl } = req.body;

    const defaultBaseUrl = `${req.protocol}://${req.get('host')}`;
    const link = await channelService.generateChannelLink(id, baseUrl || defaultBaseUrl);

    const response: ApiResponse = {
      success: true,
      data: {
        channel_id: id,
        link
      }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function updateChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, message: 'Channel name is required' });
      return;
    }

    const channel = await channelService.updateChannel(id, name);
    const response: ApiResponse = { success: true, data: channel, message: 'Channel updated successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function deleteChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await channelService.deleteChannel(id);
    const response: ApiResponse = { success: true, message: 'Channel deleted successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
