import { startServer } from './app.js';

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
