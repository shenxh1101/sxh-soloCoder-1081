import { Request, Response, NextFunction } from 'express';
import * as statsService from '../services/statsService';
import { ApiResponse } from '../types';
import path from 'path';
import fs from 'fs';

export async function getSurveyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const versionId = req.query.versionId as string | undefined;

    const stats = await statsService.getSurveyStats(surveyId, includeTest, versionId);
    const response: ApiResponse = { success: true, data: stats };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getChannelStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const versionId = req.query.versionId as string | undefined;

    const stats = await statsService.getChannelStats(surveyId, includeTest, versionId);
    const response: ApiResponse = { success: true, data: stats };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getQuestionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const versionId = req.query.versionId as string | undefined;

    const stats = await statsService.getQuestionStats(surveyId, includeTest, versionId);
    const response: ApiResponse = { success: true, data: stats };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getResponseTrend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const versionId = req.query.versionId as string | undefined;

    const trend = await statsService.getResponseTrend(surveyId, includeTest, versionId);
    const response: ApiResponse = { success: true, data: trend };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function exportResponsesCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const channelId = req.query.channelId as string | undefined;
    const versionId = req.query.versionId as string | undefined;

    const filePath = await statsService.exportResponsesToCSV(surveyId, {
      includeTest,
      channelId,
      versionId
    });

    const fileName = path.basename(filePath);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fs.statSync(filePath).size);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function exportResponsesJSON(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const { getResponsesBySurveyId } = await import('../services/responseService');

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 1000;
    const includeTest = req.query.includeTest === 'true';
    const channelId = req.query.channelId as string | undefined;

    const result = await getResponsesBySurveyId(surveyId, {
      page,
      pageSize,
      includeTest,
      channelId
    });

    const fileName = `survey_${surveyId}_${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const response: ApiResponse = {
      success: true,
      data: result
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
