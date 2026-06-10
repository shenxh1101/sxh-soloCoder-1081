import { Router } from 'express';
import * as channelController from '../controllers/channelController';

const router = Router();

router.post('/', channelController.createChannel);
router.get('/:id', channelController.getChannel);
router.put('/:id', channelController.updateChannel);
router.delete('/:id', channelController.deleteChannel);
router.get('/survey/:surveyId', channelController.getChannelsBySurvey);
router.post('/survey/:surveyId/generate-link', channelController.generateSurveyLink);
router.post('/:id/generate-link', channelController.generateChannelLink);

export default router;
