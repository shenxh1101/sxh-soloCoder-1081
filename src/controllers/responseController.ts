import { Request, Response, NextFunction } from 'express';
import * as responseService from '../services/responseService';
import { validateRequest, responseSubmissionSchema } from '../validation/schemas';
import { ApiResponse, ResponseSubmission } from '../types';

export async function submitResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(responseSubmissionSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await responseService.submitResponse(req.body as ResponseSubmission, ipAddress);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Response submitted successfully'
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const response = await responseService.getResponseById(id);

    if (!response) {
      res.status(404).json({ success: false, message: 'Response not found' });
      return;
    }

    const apiResponse: ApiResponse = { success: true, data: response };
    res.json(apiResponse);
  } catch (err) {
    next(err);
  }
}

export async function getResponsesBySurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const includeTest = req.query.includeTest === 'true';
    const channelId = req.query.channelId as string | undefined;

    const result = await responseService.getResponsesBySurveyId(surveyId, {
      page,
      pageSize,
      includeTest,
      channelId
    });

    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function deleteResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await responseService.deleteResponse(id);
    const response: ApiResponse = { success: true, message: 'Response deleted successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getUserSubmissionCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId, userId } = req.params;
    const includeTest = req.query.includeTest === 'true';
    const count = await responseService.getUserSubmissionCount(surveyId, userId, includeTest);
    const response: ApiResponse = {
      success: true,
      data: { surveyId, userId, count, includeTest }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function validateResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const validation = validateRequest(responseSubmissionSchema, { ...req.body, survey_id: surveyId });
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const { getQuestionsBySurveyId } = await import('../services/questionService');
    const questions = await getQuestionsBySurveyId(surveyId);
    const result = responseService.validateResponse(
      { ...req.body, survey_id: surveyId } as ResponseSubmission,
      questions
    );

    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
