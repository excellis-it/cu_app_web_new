const { Upload } = require("@aws-sdk/lib-storage");

const { S3 } = require("@aws-sdk/client-s3");

// Example usage:
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION;
const bucketName = process.env.S3_BUCKETS_NAME;

import fs from "fs";
import path from "path";

// Define the base upload directory, change as needed
const BASE_UPLOAD_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "public",
  "uploads"
);

// Ensure the upload directory exists
if (!fs.existsSync(BASE_UPLOAD_DIRECTORY)) {
  fs.mkdirSync(BASE_UPLOAD_DIRECTORY, { recursive: true });
}

export async function upload(file: any) {

  try {
    if (file) {
      const uniqueFileName = Date.now() + "-" + file.originalname;
      const filePath = path.join(BASE_UPLOAD_DIRECTORY, uniqueFileName);
      await fs.promises.writeFile(filePath, file.buffer);
      //======================================for local upload========================================================
      return `https://extalkapi.excellisit.net/uploads/${uniqueFileName}`; // Return relative path

      //======================================for server upload========================================================
      // return `https://extalkfiles.excellisit.net/${uniqueFileName}`; // Return relative path
    }
  } catch (error: any) {
    console.error(`Error uploading file locally: ${error.message}`);
    throw error;
  }
}
