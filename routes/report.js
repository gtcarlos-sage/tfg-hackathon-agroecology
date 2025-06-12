const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const db = require("../db/connection.js"); // or "./Connection" if that's the file name

const storage = multer.memoryStorage(); // use memory storage to get file buffer
const upload = multer({ storage });
require("dotenv").config();
const Minio = require("minio");

const minioClient = new Minio.Client({
  endPoint: "minio",
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
});

router.post(
  "/reports",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    const { type, description } = req.body;
    const photo = req.files["photo"]?.[0];
    const video = req.files["video"]?.[0];
    const audio = req.files["audio"]?.[0];

    let photoFileName = null;
    let videoFileName = null;
    let audioFileName = null;

    // Helper function to save file and return its path
    const saveFile = (file, folder, timestamp) => {
      return new Promise((resolve, reject) => {
        const newFilename = `${timestamp}_${file.originalname}`;
        const uploadPath = path.join(__dirname, "uploads", folder, newFilename);

        // Make sure the directory exists
        fs.mkdir(path.dirname(uploadPath), { recursive: true }, (err) => {
          if (err) return reject(err);

          // Save the file buffer to disk
          fs.writeFile(uploadPath, file.buffer, (err) => {
            if (err) return reject(err);

            // File saved successfully
            resolve(`/uploads/${folder}/${newFilename}`); // file URL (Will use to transfer to bucket later)
          });
        });
      });
    };

    const saveFileToBucket = async (file, folder) => {
      const startTime = Date.now();

      saveFile(file, folder, startTime); //Make sure the file exists on the server.

      const bucket = process.env.MINIO_BUCKET || "reports";

      // Destination object name
      const fileName = `${startTime}_${file.originalname}`;

      // Check if the bucket exists
      // If it doesn't, create it
      const exists = await minioClient.bucketExists(bucket);
      if (exists) {
        console.log(`Bucket ${bucket} exists.`);
      } else {
        await minioClient.makeBucket(bucket, "us-east-1");
        console.log(`Bucket ${bucket} created in "us-east-1.`);
      }

      // Set the object metadata
      var metaData = {
        "Content-Type": "text/plain",
        "X-Amz-Meta-Testing": 1234,
        example: 5678,
      };

      // Upload the file with fPutObject
      // If an object with the same name exists,
      // it is updated with new data
      await minioClient.fPutObject(
        bucket,
        fileName,
        path.join(__dirname, `/uploads/${folder}/${fileName}`),
        metaData
      );
      console.log(`File ${fileName} uploaded successfully to bucket ${bucket}`);

      // You can get the object from minIO bucket
      // const res = await minioClient.getObject(bucket, fileName);

      return fileName;
    };

    try {
      if (photo) {
        photoFileName = await saveFileToBucket(photo, "photos");
      }

      if (video) {
        videoFileName = await saveFileToBucket(video, "videos");
      }

      if (audio) {
        audioFileName = await saveFileToBucket(audio, "audio");
      }

      // Save report in DB
      await db.execute(
        "INSERT INTO reports (type, description, photo_filename, video_filename, audio_filename) VALUES (?, ?, ?, ?, ?)",
        [
          type,
          description ?? null,
          photoFileName ?? null,
          videoFileName ?? null,
          audioFileName ?? null,
        ]
      );

      res.json({
        message: "Report created",
        photoFilename: photoFileName,
        videoFilename: videoFileName,
        audioFilename: audioFileName,
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to upload files and save report." });
    }
  }
);

module.exports = router;
