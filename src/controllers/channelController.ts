import { Request, Response, NextFunction } from 'express';
import * as channelService from '../services/channelService';
import { validateRequest, channelCreateSchema } from '../validation/schemas';
import { ApiResponse } from '../types';

export async function createChannel(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(channelCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const channel = await channelService.createChannel(req.body);
    res.json({ success: true, data: channel, message: 'Channel created successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const channel = await channelService.getChannelById(id);

    if (!channel) {
      res.status(404).json({ success: false, message: 'Channel not found' });
      return;
    }

    res.json({ success: true, data: channel });
  } catch (err) {
    next(err);
  }
}

export async function getChannelsBySurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeStats = req.query.includeStats === 'true';

    let channels;
    if (includeStats) {
      channels = await channelService.getChannelWithStats(surveyId);
    } else {
      channels = await channelService.getChannelsBySurveyId(surveyId);
    }

    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}

export async function generateSurveyLink(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const { channelCode, baseUrl } = req.body;

    const defaultBaseUrl = `${req.protocol}://${req.get('host')}`;
    const link = await channelService.generateSurveyLink(
      surveyId,
      baseUrl || defaultBaseUrl,
      channelCode
    );

    res.json({
      success: true,
      data: {
        survey_id: surveyId,
        channel_code: channelCode || null,
        link
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function generateChannelLink(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { baseUrl } = req.body;

    const defaultBaseUrl = `${req.protocol}://${req.get('host')}`;
    const link = await channelService.generateChannelLink(id, baseUrl || defaultBaseUrl);

    res.json({
      success: true,
      data: {
        channel_id: id,
        link
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateChannel(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, message: 'Channel name is required' });
      return;
    }

    const channel = await channelService.updateChannel(id, name);
    res.json({ success: true, data: channel, message: 'Channel updated successfully' });
  } catch (err) {
    next(err);
  }
}

export async function deleteChannel(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await channelService.deleteChannel(id);
    res.json({ success: true, message: 'Channel deleted successfully' });
  } catch (err) {
    next(err);
  }
}
