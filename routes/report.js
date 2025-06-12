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

    let photoUrl = null;
    let videoUrl = null;
    let audioUrl = null;

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

      // Destination bucket
      const bucket = "reports";

      // Destination object name
      const destinationObject = file;
      const fileName = `${startTime}_${file.originalname}`;

      // Check if the bucket exists
      // If it doesn't, create it
      const exists = await minioClient.bucketExists(bucket);
      if (exists) {
        console.log("Bucket " + bucket + " exists.");
      } else {
        await minioClient.makeBucket(bucket, "us-east-1");
        console.log("Bucket " + bucket + ' created in "us-east-1".');
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
      console.log(
        "File " +
          file.originalname +
          " uploaded as object " +
          destinationObject +
          " in bucket " +
          bucket
      );

      const expiry = 24 * 60 * 60; // seconds //todo never expired
      const url = await minioClient.presignedGetObject(
        bucket,
        fileName,
        expiry
      );

      return url;
    };

    try {
      if (photo) {
        photoUrl = await saveFileToBucket(photo, "photos");
      }

      if (video) {
        videoUrl = await saveFileToBucket(video, "videos");
      }

      if (audio) {
        audioUrl = await saveFileToBucket(audio, "audio");
      }

      // Save report in DB
      await db.execute(
        "INSERT INTO reports (type, description, photo_url, video_url, audio_url) VALUES (?, ?, ?, ?, ?)",
        [
          type,
          description ?? null,
          photoUrl ?? null,
          videoUrl ?? null,
          audioUrl ?? null,
        ]
      );

      res.json({ message: "Report created", photoUrl, videoUrl, audioUrl });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to upload files and save report." });
    }
  }
);

// http://localhost:3000/api/v1/reports/getAll
router.get("/getAll", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM reports");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports." });
  }
});

// http://localhost:3000/api/v1/reports?type={type}
router.get("/reports", async (req, res) => {
  const type = req.query.type;
  console.log("Type query parameter:", req);

  if (!type) {
    return res.status(400).json({ error: "Type query parameter is required." });
  }

  try {
    const [rows] = await db.execute("SELECT * FROM reports WHERE type = ?", [
      type,
    ]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports by type." });
  }
});

module.exports = router;
