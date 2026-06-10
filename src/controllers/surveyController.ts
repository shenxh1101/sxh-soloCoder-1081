import { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/surveyService';
import { validateRequest, surveyCreateSchema, surveyUpdateSchema, publishSurveySchema } from '../validation/schemas';
import { ApiResponse, SurveyStatus } from '../types';
import * as versionService from '../services/versionService';

export async function createSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(surveyCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const survey = await surveyService.createSurvey(req.body);
    const response: ApiResponse = { success: true, data: survey, message: 'Survey created successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const survey = await surveyService.getSurveyById(id);

    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found' });
      return;
    }

    const response: ApiResponse = { success: true, data: survey };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getSurveyList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as SurveyStatus | undefined;

    const result = await surveyService.getSurveyList(page, pageSize, status);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function updateSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateRequest(surveyUpdateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const survey = await surveyService.updateSurvey(id, req.body);
    const response: ApiResponse = { success: true, data: survey, message: 'Survey updated successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function closeSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const survey = await surveyService.closeSurvey(id);
    const response: ApiResponse = { success: true, data: survey, message: 'Survey closed successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function deleteSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await surveyService.deleteSurvey(id);
    const response: ApiResponse = { success: true, message: 'Survey deleted successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function clearTestData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await surveyService.clearTestData(id);
    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Cleared ${result.deletedResponses} test responses and ${result.deletedAnswers} test answers`
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function checkAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string | undefined;
    const isTest = req.query.isTest === 'true';
    const result = await surveyService.checkSurveyAvailability(id, userId, isTest);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function checkPublishReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await surveyService.checkPublishReadiness(id);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function publishSurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateRequest(publishSurveySchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const result = await surveyService.publishSurvey(id, req.body?.published_by);
    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Survey published successfully as version ${result.version.version}`
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getSurveyVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const versions = await versionService.getVersionsBySurveyId(id);
    const response: ApiResponse = { success: true, data: versions };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getSurveyVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, versionId } = req.params;
    const version = await versionService.getVersionById(versionId);

    if (!version || version.survey_id !== id) {
      res.status(404).json({ success: false, message: 'Version not found for this survey' });
      return;
    }

    const response: ApiResponse = { success: true, data: version };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
