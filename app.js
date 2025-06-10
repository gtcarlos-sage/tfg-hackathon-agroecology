const express = require('express');
const reportRoutes = require('./routes/report');
const app = express();

app.use(express.static('public'));
app.use('/api/v1', reportRoutes);

app.listen(3000, () => {
  console.log('Listening on http://localhost:3000');
});

