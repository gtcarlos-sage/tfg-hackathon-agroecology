const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const storage = multer.memoryStorage(); // buffer in memory (for MinIO later)
const upload = multer({ storage });

router.post('/reports', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  const { description } = req.body;
  const photo = req.files['photo']?.[0];
  const video = req.files['video']?.[0];

  console.log('Description:', description);
  console.log('Photo:', photo?.originalname);
  console.log('Video:', video?.originalname);

  // TODO: Save to MinIO & MySQL

  res.json({ message: 'Report received' });
});

module.exports = router;

