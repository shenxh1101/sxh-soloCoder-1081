import Joi from 'joi';

export const surveyCreateSchema = Joi.object({
  title: Joi.string().required().max(200),
  description: Joi.string().max(2000).allow('').optional(),
  start_time: Joi.string().isoDate().optional(),
  end_time: Joi.string().isoDate().optional(),
  max_submissions_per_user: Joi.number().integer().min(0).default(1),
  is_anonymous: Joi.boolean().default(true),
  is_test: Joi.boolean().default(false)
});

export const surveyUpdateSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  description: Joi.string().max(2000).allow('').optional(),
  status: Joi.string().valid('draft', 'active', 'closed').optional(),
  start_time: Joi.string().isoDate().optional().allow(null),
  end_time: Joi.string().isoDate().optional().allow(null),
  max_submissions_per_user: Joi.number().integer().min(0).optional(),
  is_anonymous: Joi.boolean().optional(),
  is_test: Joi.boolean().optional()
});

export const questionCreateSchema = Joi.object({
  survey_id: Joi.string().required(),
  type: Joi.string().valid('single', 'multiple', 'text', 'rating').required(),
  title: Joi.string().required().max(500),
  description: Joi.string().max(1000).allow('').optional(),
  sort_order: Joi.number().integer().min(0).required(),
  is_required: Joi.boolean().default(true),
  skip_logic: Joi.object({
    conditions: Joi.array().items(
      Joi.object({
        optionId: Joi.string().required(),
        targetQuestionId: Joi.string().required()
      })
    ).required(),
    defaultTarget: Joi.string().optional()
  }).optional(),
  max_score: Joi.number().integer().min(1).when('type', {
    is: 'rating',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  options: Joi.array().items(
    Joi.object({
      label: Joi.string().required().max(200),
      value: Joi.string().required().max(200),
      sort_order: Joi.number().integer().min(0).required(),
      score: Joi.number().integer().optional(),
      skip_to_question_id: Joi.string().optional()
    })
  ).when('type', {
    is: Joi.string().valid('single', 'multiple'),
    then: Joi.array().min(1).required(),
    otherwise: Joi.optional()
  })
});

export const questionUpdateSchema = Joi.object({
  type: Joi.string().valid('single', 'multiple', 'text', 'rating').optional(),
  title: Joi.string().max(500).optional(),
  description: Joi.string().max(1000).allow('').optional(),
  sort_order: Joi.number().integer().min(0).optional(),
  is_required: Joi.boolean().optional(),
  skip_logic: Joi.object({
    conditions: Joi.array().items(
      Joi.object({
        optionId: Joi.string().required(),
        targetQuestionId: Joi.string().required()
      })
    ).required(),
    defaultTarget: Joi.string().optional()
  }).optional().allow(null),
  max_score: Joi.number().integer().min(1).optional(),
  options: Joi.array().items(
    Joi.object({
      id: Joi.string().optional(),
      label: Joi.string().required().max(200),
      value: Joi.string().required().max(200),
      sort_order: Joi.number().integer().min(0).required(),
      score: Joi.number().integer().optional(),
      skip_to_question_id: Joi.string().optional()
    })
  ).optional()
});

export const channelCreateSchema = Joi.object({
  survey_id: Joi.string().required(),
  name: Joi.string().required().max(100)
});

export const responseSubmissionSchema = Joi.object({
  survey_id: Joi.string().required(),
  channel_code: Joi.string().optional(),
  user_id: Joi.string().optional(),
  is_test: Joi.boolean().default(false),
  answers: Joi.array().items(
    Joi.object({
      question_id: Joi.string().required(),
      answer_text: Joi.string().max(5000).optional(),
      option_ids: Joi.array().items(Joi.string()).optional(),
      score: Joi.number().integer().min(0).optional()
    })
  ).required()
});

export function validateRequest(schema: Joi.ObjectSchema, data: any): { error?: string } {
  const { error } = schema.validate(data, { abortEarly: false });
  if (error) {
    const messages = error.details.map(d => d.message).join('; ');
    return { error: messages };
  }
  return {};
}
