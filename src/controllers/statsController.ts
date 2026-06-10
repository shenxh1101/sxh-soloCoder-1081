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
    const includeBlocked = req.query.includeBlocked === 'true';
    const channelId = req.query.channelId as string | undefined;
    const versionId = req.query.versionId as string | undefined;

    const filePath = await statsService.exportResponses(surveyId, {
      format: 'csv',
      includeTest,
      includeBlocked,
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
    const includeTest = req.query.includeTest === 'true';
    const includeBlocked = req.query.includeBlocked === 'true';
    const channelId = req.query.channelId as string | undefined;
    const versionId = req.query.versionId as string | undefined;

    const filePath = await statsService.exportResponses(surveyId, {
      format: 'json',
      includeTest,
      includeBlocked,
      channelId,
      versionId
    });

    const fileName = path.basename(filePath);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fs.statSync(filePath).size);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function compareVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const v1Id = req.query.v1Id as string;
    const v2Id = req.query.v2Id as string;
    const includeTest = req.query.includeTest === 'true';

    if (!v1Id || !v2Id) {
      res.status(400).json({
        success: false,
        message: 'Both v1Id and v2Id are required'
      });
      return;
    }

    const result = await statsService.compareVersions(surveyId, v1Id, v2Id, includeTest);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getBlockReasonDistribution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const channelId = req.query.channelId as string | undefined;
    const versionId = req.query.versionId as string | undefined;

    const result = await statsService.getBlockReasonDistribution(surveyId, channelId, versionId);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
