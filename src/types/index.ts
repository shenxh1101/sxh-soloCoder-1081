export type QuestionType = 'single' | 'multiple' | 'text' | 'rating';

export type SurveyStatus = 'draft' | 'active' | 'closed';

export type ChannelStatus = 'normal' | 'quota_exceeded' | 'expired' | 'closed';

export interface Survey {
  id: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  start_time?: string;
  end_time?: string;
  max_submissions_per_user: number;
  is_anonymous: boolean;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  survey_id: string;
  type: QuestionType;
  title: string;
  description?: string;
  sort_order: number;
  is_required: boolean;
  skip_logic?: SkipLogic;
  max_score?: number;
  created_at: string;
  updated_at: string;
  options?: Option[];
}

export interface Option {
  id: string;
  question_id: string;
  label: string;
  value: string;
  sort_order: number;
  score?: number;
  skip_to_question_id?: string;
  created_at: string;
}

export interface SkipLogic {
  conditions: SkipCondition[];
  defaultTarget?: string;
}

export interface SkipCondition {
  optionId: string;
  targetQuestionId: string;
}

export interface Channel {
  id: string;
  survey_id: string;
  name: string;
  code: string;
  quota?: number;
  close_time?: string;
  created_at: string;
}

export interface SurveyVersion {
  id: string;
  survey_id: string;
  version: number;
  snapshot: string;
  published_at: string;
  published_by?: string;
  snapshotData?: SurveySnapshot;
}

export interface SurveySnapshot {
  survey: Survey;
  questions: Question[];
  options: Option[];
}

export interface PublishCheckError {
  code: string;
  message: string;
  questionId?: string;
  optionId?: string;
}

export interface PublishCheckResult {
  canPublish: boolean;
  errors: PublishCheckError[];
  warnings: PublishCheckError[];
}

export interface Response {
  id: string;
  survey_id: string;
  channel_id?: string;
  version_id?: string;
  user_id?: string;
  ip_address?: string;
  submitted_at: string;
  is_test: boolean;
  channel_status: ChannelStatus;
  answers?: Answer[];
  version?: SurveyVersion;
}

export interface Answer {
  id: string;
  response_id: string;
  question_id: string;
  answer_text?: string;
  option_ids?: string[];
  score?: number;
  created_at: string;
}

export interface AnswerSubmission {
  question_id: string;
  answer_text?: string;
  option_ids?: string[];
  score?: number;
}

export interface ResponseSubmission {
  survey_id: string;
  channel_code?: string;
  user_id?: string;
  is_test?: boolean;
  answers: AnswerSubmission[];
}

export interface ChannelStats {
  id: string;
  name: string;
  code: string;
  quota?: number;
  close_time?: string;
  totalSubmissions: number;
  validSubmissions: number;
  testSubmissions: number;
  blockedSubmissions: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
