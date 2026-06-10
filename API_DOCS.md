# 在线调研后端服务 API 文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`
- **响应格式**: 统一响应格式 `{ success: boolean, data?: any, message?: string, error?: string }`

---

## 一、问卷管理模块 `/api/surveys`

### 1. 创建问卷
**POST** `/api/surveys`

请求体：
```json
{
  "title": "用户满意度调研",
  "description": "了解用户对产品的使用体验",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-12-31T23:59:59Z",
  "max_submissions_per_user": 1,
  "is_anonymous": true,
  "is_test": false
}
```

### 2. 获取问卷列表
**GET** `/api/surveys?page=1&pageSize=20&status=active`

查询参数：
- `page`: 页码，默认 1
- `pageSize`: 每页数量，默认 20
- `status`: 状态筛选 (draft/active/closed)

### 3. 获取问卷详情
**GET** `/api/surveys/:id`

### 4. 更新问卷
**PUT** `/api/surveys/:id`

请求体（字段可选）：
```json
{
  "title": "新标题",
  "status": "active",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-12-31T23:59:59Z"
}
```

### 5. 关闭问卷
**POST** `/api/surveys/:id/close`

### 6. 删除问卷
**DELETE** `/api/surveys/:id`

### 7. 清空测试数据
**POST** `/api/surveys/:id/clear-test-data`

### 8. 检查问卷可用性
**GET** `/api/surveys/:id/availability?userId=user123`

---

## 二、题目配置模块 `/api/questions`

### 1. 创建题目
**POST** `/api/questions`

请求体（单选题）：
```json
{
  "survey_id": "survey-uuid",
  "type": "single",
  "title": "您的性别是？",
  "sort_order": 1,
  "is_required": true,
  "options": [
    { "label": "男", "value": "male", "sort_order": 1 },
    { "label": "女", "value": "female", "sort_order": 2 }
  ]
}
```

请求体（多选题）：
```json
{
  "survey_id": "survey-uuid",
  "type": "multiple",
  "title": "您喜欢我们产品的哪些方面？",
  "sort_order": 2,
  "is_required": true,
  "options": [
    { "label": "界面美观", "value": "ui", "sort_order": 1 },
    { "label": "功能丰富", "value": "features", "sort_order": 2 },
    { "label": "性能流畅", "value": "performance", "sort_order": 3 }
  ]
}
```

请求体（填空题）：
```json
{
  "survey_id": "survey-uuid",
  "type": "text",
  "title": "请留下您的宝贵建议",
  "sort_order": 3,
  "is_required": false
}
```

请求体（评分题）：
```json
{
  "survey_id": "survey-uuid",
  "type": "rating",
  "title": "请为我们的服务打分",
  "sort_order": 4,
  "is_required": true,
  "max_score": 5
}
```

### 2. 批量创建题目
**POST** `/api/questions/survey/:surveyId/batch`

请求体：
```json
{
  "questions": [
    { "type": "single", "title": "问题1", "sort_order": 1, "options": [...] },
    { "type": "text", "title": "问题2", "sort_order": 2 }
  ]
}
```

### 3. 获取题目详情
**GET** `/api/questions/:id`

### 4. 获取问卷所有题目
**GET** `/api/questions/survey/:surveyId`

### 5. 获取完整问卷结构（含题目和选项）
**GET** `/api/questions/survey/:surveyId/full`

### 6. 更新题目
**PUT** `/api/questions/:id`

### 7. 删除题目
**DELETE** `/api/questions/:id`

### 跳题规则说明

在题目或选项中配置 `skip_logic` 实现跳题：

```json
{
  "skip_logic": {
    "conditions": [
      { "optionId": "option-uuid-1", "targetQuestionId": "question-uuid-5" },
      { "optionId": "option-uuid-2", "targetQuestionId": "question-uuid-3" }
    ],
    "defaultTarget": "question-uuid-next"
  }
}
```

---

## 三、投放控制模块 `/api/channels`

### 1. 创建投放渠道
**POST** `/api/channels`

请求体：
```json
{
  "survey_id": "survey-uuid",
  "name": "微信朋友圈"
}
```

### 2. 获取渠道详情
**GET** `/api/channels/:id`

### 3. 获取问卷所有渠道
**GET** `/api/channels/survey/:surveyId?includeStats=true`

### 4. 更新渠道名称
**PUT** `/api/channels/:id`

请求体：
```json
{
  "name": "新渠道名称"
}
```

### 5. 删除渠道
**DELETE** `/api/channels/:id`

### 6. 生成问卷投放链接
**POST** `/api/channels/survey/:surveyId/generate-link`

请求体：
```json
{
  "channelCode": "CH_XXX",
  "baseUrl": "https://your-frontend.com"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "survey_id": "survey-uuid",
    "channel_code": "CH_XXX",
    "link": "https://your-frontend.com/survey/survey-uuid?channel=CH_XXX"
  }
}
```

### 7. 生成渠道专属链接
**POST** `/api/channels/:id/generate-link`

---

## 四、答卷接收模块 `/api/responses`

### 1. 提交答卷
**POST** `/api/responses`

请求体：
```json
{
  "survey_id": "survey-uuid",
  "channel_code": "CH_XXX",
  "user_id": "user123",
  "is_test": false,
  "answers": [
    {
      "question_id": "question-uuid-1",
      "option_ids": ["option-uuid-1"]
    },
    {
      "question_id": "question-uuid-2",
      "option_ids": ["option-uuid-3", "option-uuid-5"]
    },
    {
      "question_id": "question-uuid-3",
      "answer_text": "这是我的建议..."
    },
    {
      "question_id": "question-uuid-4",
      "score": 5
    }
  ]
}
```

### 2. 预校验答卷
**POST** `/api/responses/survey/:surveyId/validate`

请求体同提交答卷，返回校验结果，不实际保存。

### 3. 获取答卷详情
**GET** `/api/responses/:id`

### 4. 获取问卷答卷列表
**GET** `/api/responses/survey/:surveyId?page=1&pageSize=20&includeTest=false&channelId=channel-uuid`

### 5. 查询用户提交次数
**GET** `/api/responses/survey/:surveyId/user/:userId/count`

### 6. 删除答卷
**DELETE** `/api/responses/:id`

---

## 五、统计报告模块 `/api/stats`

### 1. 获取问卷统计总览
**GET** `/api/stats/survey/:surveyId?includeTest=false`

响应包含：
- 总回收量、测试数据量、有效数据量
- 各渠道回收量及占比
- 各题目统计（选项占比、平均分等）

### 2. 获取渠道统计
**GET** `/api/stats/survey/:surveyId/channels?includeTest=false`

### 3. 获取题目统计
**GET** `/api/stats/survey/:surveyId/questions?includeTest=false`

响应示例：
```json
{
  "success": true,
  "data": [
    {
      "question_id": "q1",
      "question_title": "单选题",
      "question_type": "single",
      "total_responses": 100,
      "options": [
        { "option_id": "o1", "option_label": "选项A", "count": 60, "percentage": 60 },
        { "option_id": "o2", "option_label": "选项B", "count": 40, "percentage": 40 }
      ]
    },
    {
      "question_id": "q2",
      "question_title": "评分题",
      "question_type": "rating",
      "total_responses": 100,
      "average_score": 4.5
    }
  ]
}
```

### 4. 获取回收趋势
**GET** `/api/stats/survey/:surveyId/trend?includeTest=false`

响应：
```json
{
  "success": true,
  "data": [
    { "date": "2026-01-01", "count": 50 },
    { "date": "2026-01-02", "count": 75 }
  ]
}
```

### 5. 导出 CSV 明细
**GET** `/api/stats/survey/:surveyId/export/csv?includeTest=false&channelId=channel-uuid`

直接返回 CSV 文件下载。

### 6. 导出 JSON 明细
**GET** `/api/stats/survey/:surveyId/export/json?page=1&pageSize=1000&includeTest=false`

---

## 通用响应说明

### 成功响应
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

### 失败响应
```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误堆栈（开发环境）"
}
```

### HTTP 状态码
- `200`: 请求成功
- `201`: 创建成功
- `400`: 参数错误
- `403`: 权限不足/不可提交
- `404`: 资源不存在
- `500`: 服务器内部错误

---

## 数据字典

### 问卷状态 (status)
- `draft`: 草稿
- `active`: 进行中
- `closed`: 已关闭

### 题目类型 (type)
- `single`: 单选题
- `multiple`: 多选题
- `text`: 填空题
- `rating`: 评分题
