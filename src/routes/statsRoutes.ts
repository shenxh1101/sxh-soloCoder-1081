import { Router } from 'express';
import * as statsController from '../controllers/statsController';

const router = Router();

router.get('/survey/:surveyId', statsController.getSurveyStats);
router.get('/survey/:surveyId/channels', statsController.getChannelStats);
router.get('/survey/:surveyId/questions', statsController.getQuestionStats);
router.get('/survey/:surveyId/trend', statsController.getResponseTrend);
router.get('/survey/:surveyId/export/csv', statsController.exportResponsesCSV);
router.get('/survey/:surveyId/export/json', statsController.exportResponsesJSON);

export default router;
