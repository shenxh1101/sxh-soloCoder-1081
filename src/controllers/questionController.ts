import { Request, Response, NextFunction } from 'express';
import * as questionService from '../services/questionService';
import { validateRequest, questionCreateSchema, questionUpdateSchema } from '../validation/schemas';
import { ApiResponse } from '../types';

export async function createQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(questionCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const question = await questionService.createQuestion(req.body);
    const response: ApiResponse = { success: true, data: question, message: 'Question created successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const question = await questionService.getQuestionById(id);

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    const response: ApiResponse = { success: true, data: question };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getQuestionsBySurvey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const questions = await questionService.getQuestionsBySurveyId(surveyId);
    const response: ApiResponse = { success: true, data: questions };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function getFullSurveyStructure(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const result = await questionService.getFullSurveyStructure(surveyId);
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function updateQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateRequest(questionUpdateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const question = await questionService.updateQuestion(id, req.body);
    const response: ApiResponse = { success: true, data: question, message: 'Question updated successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function deleteQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await questionService.deleteQuestion(id);
    const response: ApiResponse = { success: true, message: 'Question deleted successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function batchCreateQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      res.status(400).json({ success: false, message: 'Questions must be an array' });
      return;
    }

    const results = [];
    for (const q of questions) {
      const validation = validateRequest(questionCreateSchema, { ...q, survey_id: surveyId });
      if (validation.error) {
        throw new Error(validation.error);
      }
      const result = await questionService.createQuestion({ ...q, survey_id: surveyId });
      results.push(result);
    }

    const response: ApiResponse = { success: true, data: results, message: 'Questions created successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
