import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const isOperational = 'isOperational' in err ? err.isOperational : false;

  const response: ApiResponse = {
    success: false,
    message: isOperational ? err.message : 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };

  if (!isOperational) {
    console.error('ERROR:', err);
  }

  res.status(statusCode).json(response);
}
