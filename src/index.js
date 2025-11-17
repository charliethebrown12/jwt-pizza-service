const app = require('./service.js');
require('./metrics');
const logger = require('./logger');

const port = process.argv[2] || 3000;
app.use(logger.httpLogger);
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
