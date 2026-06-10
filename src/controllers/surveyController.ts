import { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/surveyService';
import { validateRequest, surveyCreateSchema, surveyUpdateSchema } from '../validation/schemas';
import { ApiResponse, SurveyStatus } from '../types';

export async function createSurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(surveyCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const survey = await surveyService.createSurvey(req.body);
    res.json({ success: true, data: survey, message: 'Survey created successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getSurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const survey = await surveyService.getSurveyById(id);

    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found' });
      return;
    }

    res.json({ success: true, data: survey });
  } catch (err) {
    next(err);
  }
}

export async function getSurveyList(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as SurveyStatus | undefined;

    const result = await surveyService.getSurveyList(page, pageSize, status);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateSurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateRequest(surveyUpdateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const survey = await surveyService.updateSurvey(id, req.body);
    res.json({ success: true, data: survey, message: 'Survey updated successfully' });
  } catch (err) {
    next(err);
  }
}

export async function closeSurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const survey = await surveyService.closeSurvey(id);
    res.json({ success: true, data: survey, message: 'Survey closed successfully' });
  } catch (err) {
    next(err);
  }
}

export async function deleteSurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await surveyService.deleteSurvey(id);
    res.json({ success: true, message: 'Survey deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function clearTestData(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await surveyService.clearTestData(id);
    res.json({
      success: true,
      data: result,
      message: `Cleared ${result.deletedResponses} test responses and ${result.deletedAnswers} test answers`
    });
  } catch (err) {
    next(err);
  }
}

export async function checkAvailability(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string | undefined;
    const result = await surveyService.checkSurveyAvailability(id, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
