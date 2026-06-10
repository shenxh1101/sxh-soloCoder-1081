const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function put(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: 3000, path }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    }).on('error', reject);
  });
}

async function test() {
  console.log('========== 完整功能端到端测试 ==========\n');

  // 1. 创建问卷
  console.log('【1】创建问卷');
  const surveyRes = await post('/api/surveys', {
    title: '版本锁定测试问卷',
    description: '测试渠道版本锁定和按版本统计',
    max_submissions_per_user: 10
  });
  const surveyId = surveyRes.data.data.id;
  console.log('  问卷ID:', surveyId);

  // 2. 添加题目
  console.log('\n【2】添加题目（版本1）');
  const q1v1 = await post('/api/questions', {
    survey_id: surveyId,
    title: '你喜欢的颜色（版本1）',
    type: 'single',
    sort_order: 1,
    is_required: true,
    options: [
      { label: '红色', value: 'red', sort_order: 1 },
      { label: '蓝色', value: 'blue', sort_order: 2 }
    ]
  });
  console.log('  题目1ID:', q1v1.data.data.id);
  const q1OptsV1 = q1v1.data.data.options;

  const q2v1 = await post('/api/questions', {
    survey_id: surveyId,
    title: '你喜欢的水果（版本1）',
    type: 'multiple',
    sort_order: 2,
    is_required: true,
    options: [
      { label: '苹果', value: 'apple', sort_order: 1 },
      { label: '香蕉', value: 'banana', sort_order: 2 }
    ]
  });
  console.log('  题目2ID:', q2v1.data.data.id);
  const q2OptsV1 = q2v1.data.data.options;

  // 3. 发布问卷（版本1）
  console.log('\n【3】发布问卷（创建版本1）');
  const publish1 = await post('/api/surveys/' + surveyId + '/publish', { published_by: 'admin' });
  console.log('  版本号:', publish1.data.data.version.version);
  const version1Id = publish1.data.data.version.id;

  // 4. 创建渠道A（关联版本1）
  console.log('\n【4】创建渠道A（关联版本1，配额=3）');
  const channelA = await post('/api/channels', {
    survey_id: surveyId,
    name: '渠道A-版本1',
    quota: 3
  });
  console.log('  渠道Code:', channelA.data.data.code);
  console.log('  关联版本ID:', channelA.data.data.version_id);
  console.log('  关联版本号:', channelA.data.data.version?.version);
  const channelACode = channelA.data.data.code;

  // 5. 用渠道A提交2份答卷
  console.log('\n【5】用渠道A提交2份答卷');
  const submitA1 = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user_a1',
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [q1OptsV1[0].id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[0].id] }
    ]
  });
  console.log('  答卷1版本:', submitA1.data.data.version);
  const responseA1Id = submitA1.data.data.responseId;

  const submitA2 = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user_a2',
    is_test: true,
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [q1OptsV1[1].id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[0].id, q2OptsV1[1].id] }
    ]
  });
  console.log('  答卷2（测试）版本:', submitA2.data.data.version);

  // 6. 修改题目
  console.log('\n【6】修改题目（版本1→版本2）');
  const updateQ1 = await put('/api/questions/' + q1v1.data.data.id, {
    title: '你喜欢的颜色（版本2）',
    options: [
      { id: q1OptsV1[0].id, label: '红色', value: 'red', sort_order: 1 },
      { id: q1OptsV1[1].id, label: '蓝色', value: 'blue', sort_order: 2 },
      { label: '绿色', value: 'green', sort_order: 3 }
    ]
  });
  console.log('  题目1已更新，新增绿色选项');

  const q3v2 = await post('/api/questions', {
    survey_id: surveyId,
    title: '你喜欢的运动（版本2新增）',
    type: 'text',
    sort_order: 3,
    is_required: false
  });
  console.log('  新增题目3ID:', q3v2.data.data.id);

  // 7. 再次发布（版本2）
  console.log('\n【7】再次发布（创建版本2）');
  const publish2 = await post('/api/surveys/' + surveyId + '/publish', { published_by: 'admin' });
  console.log('  版本号:', publish2.data.data.version.version);
  const version2Id = publish2.data.data.version.id;

  // 8. 创建渠道B（关联版本2）
  console.log('\n【8】创建渠道B（关联版本2，配额=2）');
  const channelB = await post('/api/channels', {
    survey_id: surveyId,
    name: '渠道B-版本2',
    quota: 2
  });
  console.log('  渠道Code:', channelB.data.data.code);
  console.log('  关联版本号:', channelB.data.data.version?.version);
  const channelBCode = channelB.data.data.code;

  // 9. 用渠道B提交答卷（使用版本2的新选项）
  console.log('\n【9】用渠道B提交答卷（使用版本2的绿色选项）');
  const q1OptsV2 = updateQ1.data.data.options;
  const greenOption = q1OptsV2.find(o => o.value === 'green');
  console.log('  绿色选项ID:', greenOption.id);

  const submitB1 = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user_b1',
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [greenOption.id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[0].id] },
      { question_id: q3v2.data.data.id, answer_text: '跑步' }
    ]
  });
  console.log('  提交状态:', submitB1.status);
  console.log('  答卷版本:', submitB1.data.data.version);

  // 10. 验证渠道A仍然使用版本1（不能选绿色）
  console.log('\n【10】验证渠道A按版本1校验（选绿色应该被拒）');
  const submitAInvalid = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelACode,
    user_id: 'user_a3',
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [greenOption.id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[0].id] }
    ]
  });
  console.log('  提交状态:', submitAInvalid.status);
  console.log('  错误信息:', submitAInvalid.data.message);

  // 11. 渠道B配额超限测试
  console.log('\n【11】渠道B配额超限测试（配额=2）');
  const submitB2 = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user_b2',
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [q1OptsV2[0].id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[1].id] }
    ]
  });
  console.log('  第2份提交:', submitB2.status);

  const submitB3 = await post('/api/responses', {
    survey_id: surveyId,
    channel_code: channelBCode,
    user_id: 'user_b3',
    answers: [
      { question_id: q1v1.data.data.id, option_ids: [q1OptsV2[0].id] },
      { question_id: q2v1.data.data.id, option_ids: [q2OptsV1[0].id] }
    ]
  });
  console.log('  第3份提交（超限）:', submitB3.status);
  console.log('  错误信息:', submitB3.data.message);

  // 12. 查看全量统计
  console.log('\n【12】查看全量统计');
  const statsAll = await get('/api/stats/survey/' + surveyId + '?includeTest=true');
  console.log('  总答卷数:', statsAll.data.data.total_responses);
  console.log('  测试答卷:', statsAll.data.data.test_responses);
  console.log('  有效答卷:', statsAll.data.data.valid_responses);
  console.log('  可用版本:', statsAll.data.data.versions?.map(v => `v${v.version}`).join(', '));

  // 13. 查看版本1统计
  console.log('\n【13】查看版本1统计');
  const statsV1 = await get('/api/stats/survey/' + surveyId + '?includeTest=true&versionId=' + version1Id);
  console.log('  版本号:', statsV1.data.data.version);
  console.log('  版本1答卷数:', statsV1.data.data.total_responses);
  const q1StatsV1 = statsV1.data.data.question_stats.find(q => q.question_id === q1v1.data.data.id);
  console.log('  题目1选项统计:', q1StatsV1?.options?.map(o => `${o.option_label}:${o.count}`).join(', '));

  // 14. 查看版本2统计
  console.log('\n【14】查看版本2统计');
  const statsV2 = await get('/api/stats/survey/' + surveyId + '?includeTest=true&versionId=' + version2Id);
  console.log('  版本号:', statsV2.data.data.version);
  console.log('  版本2答卷数:', statsV2.data.data.total_responses);
  const q1StatsV2 = statsV2.data.data.question_stats.find(q => q.question_id === q1v1.data.data.id);
  console.log('  题目1选项统计:', q1StatsV2?.options?.map(o => `${o.option_label}:${o.count}`).join(', '));

  // 15. 查看渠道统计（含拦截记录）
  console.log('\n【15】查看渠道统计（含拦截记录）');
  const channelStats = await get('/api/stats/survey/' + surveyId + '/channels?includeTest=true');
  channelStats.data.data.forEach(cs => {
    console.log(`  ${cs.channel_name} (v${cs.version}):`);
    console.log(`    有效:${cs.valid_submissions} 测试:${cs.test_submissions} 拦截:${cs.blocked_submissions}`);
    if (cs.recent_blocks && cs.recent_blocks.length > 0) {
      console.log(`    最近拦截:`);
      cs.recent_blocks.slice(0, 3).forEach(b => {
        console.log(`      - [${b.channel_status}] ${b.block_reason.substring(0, 60)}...`);
      });
    }
  });

  // 16. 查看答卷详情（含版本快照）
  console.log('\n【16】查看答卷详情（含版本快照）');
  const respDetail = await get('/api/responses/' + responseA1Id);
  console.log('  答卷ID:', respDetail.data.data.id);
  console.log('  关联版本ID:', respDetail.data.data.version_id);
  console.log('  版本号:', respDetail.data.data.version?.version);
  console.log('  快照题目数:', respDetail.data.data.version?.snapshotData?.questions?.length);
  console.log('  快照选项数:', respDetail.data.data.version?.snapshotData?.options?.length);

  // 17. 查看版本列表
  console.log('\n【17】查看版本列表');
  const versions = await get('/api/surveys/' + surveyId + '/versions');
  console.log('  版本数:', versions.data.data.length);
  versions.data.data.forEach(v => {
    console.log(`    v${v.version}: ${v.published_at} by ${v.published_by || 'unknown'}`);
  });

  // 18. 清空测试数据
  console.log('\n【18】清空测试数据');
  const clearTest = await post('/api/surveys/' + surveyId + '/clear-test-data', {});
  console.log('  删除测试答卷:', clearTest.data.data.deletedResponses);
  console.log('  删除测试答案:', clearTest.data.data.deletedAnswers);

  // 19. 验证清空后正式数据保留
  console.log('\n【19】验证清空后正式数据和拦截记录保留');
  const statsAfterClear = await get('/api/stats/survey/' + surveyId + '?includeTest=true');
  console.log('  总答卷数:', statsAfterClear.data.data.total_responses);
  console.log('  测试答卷:', statsAfterClear.data.data.test_responses);
  console.log('  有效答卷:', statsAfterClear.data.data.valid_responses);

  const channelStatsAfter = await get('/api/stats/survey/' + surveyId + '/channels?includeTest=true');
  channelStatsAfter.data.data.forEach(cs => {
    console.log(`  ${cs.channel_name}: 有效:${cs.valid_submissions} 测试:${cs.test_submissions} 拦截:${cs.blocked_submissions}`);
  });

  console.log('\n========== 测试完成 ==========');
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
