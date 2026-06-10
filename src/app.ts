import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { initDatabase } from './config/initDB';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import surveyRoutes from './routes/surveyRoutes';
import questionRoutes from './routes/questionRoutes';
import channelRoutes from './routes/channelRoutes';
import responseRoutes from './routes/responseRoutes';
import statsRoutes from './routes/statsRoutes';
import { ApiResponse } from './types';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

app.get('/api/health', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    },
    message: 'Survey Backend API is running'
  };
  res.json(response);
});

app.get('/api', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      name: 'Survey Backend API',
      version: '1.0.0',
      endpoints: {
        surveys: '/api/surveys',
        questions: '/api/questions',
        channels: '/api/channels',
        responses: '/api/responses',
        stats: '/api/stats',
        health: '/api/health'
      }
    }
  };
  res.json(response);
});

app.use('/api/surveys', surveyRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/stats', statsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
