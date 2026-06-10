import { Router } from 'express';
import * as surveyController from '../controllers/surveyController';

const router = Router();

router.post('/', surveyController.createSurvey);
router.get('/', surveyController.getSurveyList);
router.get('/:id', surveyController.getSurvey);
router.put('/:id', surveyController.updateSurvey);
router.delete('/:id', surveyController.deleteSurvey);
router.post('/:id/close', surveyController.closeSurvey);
router.post('/:id/clear-test-data', surveyController.clearTestData);
router.get('/:id/availability', surveyController.checkAvailability);
router.get('/:id/publish-readiness', surveyController.checkPublishReadiness);
router.post('/:id/publish', surveyController.publishSurvey);
router.get('/:id/versions', surveyController.getSurveyVersions);
router.get('/:id/versions/:versionId', surveyController.getSurveyVersion);

export default router;
