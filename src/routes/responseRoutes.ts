import { Router } from 'express';
import * as responseController from '../controllers/responseController';

const router = Router();

router.post('/', responseController.submitResponse);
router.get('/:id', responseController.getResponse);
router.delete('/:id', responseController.deleteResponse);
router.get('/survey/:surveyId', responseController.getResponsesBySurvey);
router.get('/survey/:surveyId/user/:userId/count', responseController.getUserSubmissionCount);
router.post('/survey/:surveyId/validate', responseController.validateResponse);

export default router;
