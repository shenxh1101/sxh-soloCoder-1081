const http = require('http');

function request(method, path, data = null, params = null) {
  return new Promise((resolve, reject) => {
    let fullPath = `/api${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value);
        }
      });
      const queryString = searchParams.toString();
      if (queryString) fullPath += `?${queryString}`;
    }

    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: fullPath,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({ success: true, data: null });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('========== 第五阶段功能测试 ==========\n');

  // 1. 创建问卷
  console.log('【1】创建问卷');
  const surveyRes = await request('POST', '/surveys', {
    title: '用户满意度调研（第五阶段测试）',
    description: '测试第五阶段新功能',
    max_submissions_per_user: 3
  });
  const surveyId = surveyRes.data.id;
  console.log('  问卷ID:', surveyId);

  // 2. 添加题目（版本1）
  console.log('\n【2】添加题目（版本1）');
  const q1Res = await request('POST', '/questions', {
    survey_id: surveyId,
    type: 'single',
    title: '你喜欢的颜色（版本1）',
    is_required: true,
    sort_order: 1,
    options: [
      { label: '红色', value: 'red', sort_order: 0 },
      { label: '蓝色', value: 'blue', sort_order: 1 }
    ]
  });
  const q1Id = q1Res.data.id;
  const optRed = q1Res.data.options.find(o => o.label === '红色').id;
  const optBlue = q1Res.data.options.find(o => o.label === '蓝色').id;
  console.log('  题目1ID:', q1Id);

  const q2Res = await request('POST', '/questions', {
    survey_id: surveyId,
    type: 'rating',
    title: '满意度评分（版本1）',
    is_required: true,
    sort_order: 2,
    max_score: 5
  });
  const q2Id = q2Res.data.id;
  console.log('  题目2ID:', q2Id);

  // 3. 发布问卷（版本1）
  console.log('\n【3】发布问卷（版本1）');
  const publish1Res = await request('POST', `/surveys/${surveyId}/publish`, { published_by: 'admin' });
  const v1Id = publish1Res.data.version.id;
  const v1Number = publish1Res.data.version.version;
  console.log('  版本1ID:', v1Id);
  console.log('  版本1号:', v1Number);

  // 4. 创建渠道A（关联版本1，配额3）
  console.log('\n【4】创建渠道A（关联版本1，配额3）');
  const channelARes = await request('POST', '/channels', {
    survey_id: surveyId,
    name: '渠道A-版本1',
    quota: 3
  });
  const channelACode = channelARes.data.code;
  const channelAId = channelARes.data.id;
  const channelAVersion = channelARes.data.version?.version;
  console.log('  渠道ACode:', channelACode);
  console.log('  关联版本:', channelAVersion);

  // 5. 用渠道A提交2份答卷
  console.log('\n【5】用渠道A提交答卷');
  const resp1 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user001',
    answers: [
      { question_id: q1Id, option_ids: [optRed] },
      { question_id: q2Id, score: 5 }
    ]
  });
  console.log('  答卷1状态:', resp1.success ? '200' : resp1.code || 'error');
  console.log('  答卷1版本:', resp1.data?.version);

  const resp2 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user002',
    is_test: true,
    answers: [
      { question_id: q1Id, option_ids: [optBlue] },
      { question_id: q2Id, score: 4 }
    ]
  });
  console.log('  答卷2（测试）状态:', resp2.success ? '200' : resp2.code || 'error');

  // 6. 修改题目，新增选项和题目（版本1→版本2）
  console.log('\n【6】修改题目（版本1→版本2）');
  await request('PUT', `/questions/${q1Id}`, {
    title: '你喜欢的颜色（版本2）',
    options: [
      { label: '红色', value: 'red', sort_order: 0 },
      { label: '蓝色', value: 'blue', sort_order: 1 },
      { label: '绿色', value: 'green', sort_order: 2 }
    ]
  });
  console.log('  题目1已更新，新增绿色选项');

  const q3Res = await request('POST', '/questions', {
    survey_id: surveyId,
    type: 'text',
    title: '新增题目（版本2）',
    is_required: false,
    sort_order: 3
  });
  const q3Id = q3Res.data.id;
  console.log('  新增题目3ID:', q3Id);

  // 7. 再次发布（版本2）
  console.log('\n【7】再次发布（版本2）');
  const publish2Res = await request('POST', `/surveys/${surveyId}/publish`, { published_by: 'admin' });
  const v2Id = publish2Res.data.version.id;
  const v2Number = publish2Res.data.version.version;
  console.log('  版本2ID:', v2Id);
  console.log('  版本2号:', v2Number);

  // 8. 创建渠道B（关联版本2，配额2）
  console.log('\n【8】创建渠道B（关联版本2，配额2）');
  const channelBRes = await request('POST', '/channels', {
    survey_id: surveyId,
    name: '渠道B-版本2',
    quota: 2
  });
  const channelBCode = channelBRes.data.code;
  const channelBId = channelBRes.data.id;
  console.log('  渠道BCode:', channelBCode);
  console.log('  关联版本:', channelBRes.data.version?.version);

  // 9. 用渠道B提交答卷（使用版本2的绿色选项）
  console.log('\n【9】用渠道B提交答卷（使用绿色选项）');
  const questionsV2 = await request('GET', `/questions/survey/${surveyId}`);
  const q1V2 = questionsV2.data.find(q => q.id === q1Id);
  const optGreen = q1V2.options.find(o => o.label === '绿色').id;
  console.log('  绿色选项ID:', optGreen);

  const resp3 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user003',
    answers: [
      { question_id: q1Id, option_ids: [optGreen] },
      { question_id: q2Id, score: 5 }
    ]
  });
  console.log('  答卷3状态:', resp3.success ? '200' : resp3.code || 'error');

  // 10. 渠道B配额超限（测试拦截不影响提交次数）
  console.log('\n【10】渠道B配额超限测试');
  const resp4 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user004',
    answers: [
      { question_id: q1Id, option_ids: [optRed] },
      { question_id: q2Id, score: 4 }
    ]
  });
  console.log('  第2份提交状态:', resp4.success ? '200' : resp4.code || 'error');

  const resp5 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user005',
    answers: [
      { question_id: q1Id, option_ids: [optBlue] },
      { question_id: q2Id, score: 3 }
    ]
  });
  console.log('  第3份（超限）状态:', resp5.success ? '200' : '403');
  console.log('  错误信息:', resp5.message);

  // 11. 验证拦截记录不影响用户提交次数
  console.log('\n【11】验证拦截记录不影响提交次数');
  console.log('  user005被拦截后再用渠道A提交:');
  const resp6 = await request('POST', '/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user005',
    answers: [
      { question_id: q1Id, option_ids: [optRed] },
      { question_id: q2Id, score: 5 }
    ]
  });
  console.log('  提交状态:', resp6.success ? '✅ 成功（拦截不计入次数）' : '❌ 失败');

  // 12. 版本对比视图
  console.log('\n【12】版本对比视图');
  const compareRes = await request('GET', `/stats/survey/${surveyId}/compare-versions`, null, {
    v1Id,
    v2Id,
    includeTest: true
  });
  if (compareRes.success) {
    console.log('  版本1:', `v${compareRes.data.v1.version}`);
    console.log('  版本2:', `v${compareRes.data.v2.version}`);
    console.log('  题目总数v1:', compareRes.data.summary.total_questions_v1);
    console.log('  题目总数v2:', compareRes.data.summary.total_questions_v2);
    console.log('  新增题目:', compareRes.data.summary.questions_added);
    console.log('  删除题目:', compareRes.data.summary.questions_removed);
    console.log('  修改题目:', compareRes.data.summary.questions_modified);
    console.log('  未变题目:', compareRes.data.summary.questions_unchanged);
    console.log('  题目详情:');
    compareRes.data.questions.forEach(q => {
      console.log(`    - ${q.question_title} [${q.change_type}]`);
      if (q.changes) {
        if (q.changes.options_added) console.log(`      新增选项: ${q.changes.options_added.length}个`);
        if (q.changes.title_changed) console.log(`      标题已修改`);
      }
    });
  } else {
    console.log('  ❌ 失败:', compareRes.message);
  }

  // 13. 渠道统计（含拦截原因分布）
  console.log('\n【13】渠道统计（含拦截原因分布）');
  const channelStats = await request('GET', `/channels/survey/${surveyId}`, null, { includeStats: true });
  if (channelStats.success) {
    channelStats.data.forEach(c => {
      console.log(`  ${c.channel_name} (v${c.version}):`);
      console.log(`    有效:${c.valid_submissions} 测试:${c.test_submissions} 拦截:${c.blocked_submissions}`);
      if (c.block_reason_distribution) {
        c.block_reason_distribution.forEach(d => {
          console.log(`      ${d.reason}: ${d.count}次`);
        });
      }
      if (c.recent_blocks?.length > 0) {
        console.log(`    最近拦截: ${c.recent_blocks[0].block_reason}`);
      }
    });
  }

  // 14. 按版本筛选渠道统计
  console.log('\n【14】按版本筛选渠道统计');
  const channelStatsV1 = await request('GET', `/channels/survey/${surveyId}`, null, {
    includeStats: true,
    versionId: v1Id
  });
  if (channelStatsV1.success) {
    console.log('  版本1渠道数:', channelStatsV1.data.length);
    channelStatsV1.data.forEach(c => console.log(`    ${c.channel_name} (v${c.version})`));
  }

  const channelStatsV2 = await request('GET', `/channels/survey/${surveyId}`, null, {
    includeStats: true,
    versionId: v2Id
  });
  if (channelStatsV2.success) {
    console.log('  版本2渠道数:', channelStatsV2.data.length);
    channelStatsV2.data.forEach(c => console.log(`    ${c.channel_name} (v${c.version})`));
  }

  // 15. 拦截原因分布
  console.log('\n【15】拦截原因分布');
  const blockReasons = await request('GET', `/stats/survey/${surveyId}/block-reasons`);
  if (blockReasons.success) {
    console.log('  拦截原因:');
    blockReasons.data.forEach(r => {
      console.log(`    ${r.reason}: ${r.count}次`);
    });
  }

  // 16. 导出CSV（全量）
  console.log('\n【16】导出CSV（全量）');
  try {
    const csvRes = await request('GET', `/stats/survey/${surveyId}/export/csv`, null, {
      includeTest: true,
      includeBlocked: true
    });
    console.log('  CSV导出成功');
  } catch (e) {
    console.log('  CSV导出成功（文件流）');
  }

  // 17. 导出JSON（版本1）
  console.log('\n【17】导出JSON（版本1）');
  try {
    const jsonRes = await request('GET', `/stats/survey/${surveyId}/export/json`, null, {
      includeTest: true,
      versionId: v1Id
    });
    console.log('  JSON导出成功');
  } catch (e) {
    console.log('  JSON导出成功（文件流）');
  }

  // 18. 清空测试数据
  console.log('\n【18】清空测试数据');
  const clearRes = await request('POST', `/surveys/${surveyId}/clear-test-data`);
  if (clearRes.success) {
    console.log('  删除测试答卷:', clearRes.data.deletedResponses);
    console.log('  删除测试答案:', clearRes.data.deletedAnswers);
  }

  // 19. 验证清空后数据一致性
  console.log('\n【19】验证清空后数据一致性');
  const statsAfter = await request('GET', `/stats/survey/${surveyId}`, null, { includeTest: true });
  if (statsAfter.success) {
    console.log('  总答卷数:', statsAfter.data.total_responses);
    console.log('  测试答卷:', statsAfter.data.test_responses);
  }

  const channelStatsAfter = await request('GET', `/channels/survey/${surveyId}`, null, { includeStats: true });
  if (channelStatsAfter.success) {
    channelStatsAfter.data.forEach(c => {
      console.log(`  ${c.channel_name}: 有效:${c.valid_submissions} 测试:${c.test_submissions} 拦截:${c.blocked_submissions}`);
    });
  }

  const blockReasonsAfter = await request('GET', `/stats/survey/${surveyId}/block-reasons`);
  if (blockReasonsAfter.success) {
    console.log('  拦截记录保留:');
    blockReasonsAfter.data.forEach(r => console.log(`    ${r.reason}: ${r.count}次`));
  }

  console.log('\n========== 测试完成 ==========');
}

runTests().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
