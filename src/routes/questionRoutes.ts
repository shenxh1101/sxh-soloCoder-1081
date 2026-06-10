import { Router } from 'express';
import * as questionController from '../controllers/questionController';

const router = Router();

router.post('/', questionController.createQuestion);
router.get('/:id', questionController.getQuestion);
router.put('/:id', questionController.updateQuestion);
router.delete('/:id', questionController.deleteQuestion);
router.get('/survey/:surveyId', questionController.getQuestionsBySurvey);
router.get('/survey/:surveyId/full', questionController.getFullSurveyStructure);
router.post('/survey/:surveyId/batch', questionController.batchCreateQuestions);

export default router;
