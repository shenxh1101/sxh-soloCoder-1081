import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   📊 Survey Backend API is running!                        ║
║                                                            ║
║   🌐 Server:    http://${HOST}:${PORT}                     ║
║   🔗 API Root:  http://${HOST}:${PORT}/api                 ║
║   💚 Health:    http://${HOST}:${PORT}/api/health          ║
║                                                            ║
║   📋 Available Modules:                                    ║
║      • /api/surveys    - 问卷管理                          ║
║      • /api/questions  - 题目配置                          ║
║      • /api/channels   - 投放控制                          ║
║      • /api/responses - 答卷接收                          ║
║      • /api/stats     - 统计报告                          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default server;
