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
  version_id?: string;
  created_at: string;
  version?: SurveyVersion;
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
  block_reason?: string;
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

export interface BlockRecord {
  id: string;
  submitted_at: string;
  channel_status: ChannelStatus;
  block_reason: string;
  is_test: boolean;
  user_id?: string;
  ip_address?: string;
}

export interface ChannelStats {
  channel_id: string;
  channel_name: string;
  channel_code: string;
  quota?: number;
  close_time?: string;
  version_id?: string;
  version?: number;
  response_count: number;
  valid_submissions: number;
  test_submissions: number;
  blocked_submissions: number;
  percentage: number;
  recent_blocks?: BlockRecord[];
  block_reason_distribution?: Array<{ reason: string; count: number }>;
}

export interface VersionComparisonQuestion {
  question_id: string;
  question_title: string;
  question_type: QuestionType;
  change_type: 'added' | 'removed' | 'unchanged' | 'modified';
  v1_stats?: {
    total_responses: number;
    option_stats?: Array<{ option_id: string; option_label: string; count: number; percentage: number }>;
    average_score?: number;
  };
  v2_stats?: {
    total_responses: number;
    option_stats?: Array<{ option_id: string; option_label: string; count: number; percentage: number }>;
    average_score?: number;
  };
  changes?: {
    title_changed?: boolean;
    options_added?: string[];
    options_removed?: string[];
    options_modified?: string[];
  };
}

export interface VersionComparisonResult {
  v1: { id: string; version: number; published_at: string };
  v2: { id: string; version: number; published_at: string };
  questions: VersionComparisonQuestion[];
  summary: {
    total_questions_v1: number;
    total_questions_v2: number;
    questions_added: number;
    questions_removed: number;
    questions_modified: number;
    questions_unchanged: number;
  };
}

export interface ExportOptions {
  format: 'csv' | 'json';
  versionId?: string;
  channelId?: string;
  includeTest: boolean;
  includeBlocked?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
