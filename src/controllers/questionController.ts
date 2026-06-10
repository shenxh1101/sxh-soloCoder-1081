import { Request, Response, NextFunction } from 'express';
import * as questionService from '../services/questionService';
import { validateRequest, questionCreateSchema, questionUpdateSchema } from '../validation/schemas';
import { ApiResponse } from '../types';

export async function createQuestion(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const validation = validateRequest(questionCreateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const question = await questionService.createQuestion(req.body);
    res.json({ success: true, data: question, message: 'Question created successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getQuestion(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const question = await questionService.getQuestionById(id);

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    res.json({ success: true, data: question });
  } catch (err) {
    next(err);
  }
}

export async function getQuestionsBySurvey(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const questions = await questionService.getQuestionsBySurveyId(surveyId);
    res.json({ success: true, data: questions });
  } catch (err) {
    next(err);
  }
}

export async function getFullSurveyStructure(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { surveyId } = req.params;
    const result = await questionService.getFullSurveyStructure(surveyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateQuestion(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const validation = validateRequest(questionUpdateSchema, req.body);
    if (validation.error) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const question = await questionService.updateQuestion(id, req.body);
    res.json({ success: true, data: question, message: 'Question updated successfully' });
  } catch (err) {
    next(err);
  }
}

export async function deleteQuestion(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await questionService.deleteQuestion(id);
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function batchCreateQuestions(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
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

    res.json({ success: true, data: results, message: 'Questions created successfully' });
  } catch (err) {
    next(err);
  }
}
