const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const storage = multer.memoryStorage(); // buffer in memory (for MinIO later)
const upload = multer({ storage });

router.post('/reports', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), async (req, res) => {
  const { type, description } = req.body;
  const photo = req.files['photo']?.[0];
  const video = req.files['video']?.[0];
  const audio = req.files['audio']?.[0];

  let photoUrl = null;
  let videoUrl = null;
  let audioUrl = null;

  if (photo) {
    photoUrl = await uploadFile(photo, `photos/${Date.now()}_${photo.originalname}`);
  }

  if (video) {
    videoUrl = await uploadFile(video, `videos/${Date.now()}_${video.originalname}`);
  }

  if (audio) {
    audioUrl = await uploadFile(audio, `audio/${Date.now()}_${audio.originalname}`);
  }

  await db.execute(
    'INSERT INTO reports (type, description, photo_url, video_url, audio_url) VALUES (?, ?, ?, ?, ?)',
    [type, description, photoUrl, videoUrl, audioUrl]
  );

  res.json({ message: 'Report created', photoUrl, videoUrl, audioUrl });
});

module.exports = router;

