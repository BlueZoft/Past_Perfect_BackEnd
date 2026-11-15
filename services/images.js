const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const FileType = require("file-type");
const cloudinary = require("cloudinary").v2;
const { fail } = require("../lib/http");
const directory = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const driver = process.env.IMAGE_DRIVER || "local";
if (!["local", "cloudinary"].includes(driver))
  throw new Error("Invalid IMAGE_DRIVER");
if (driver === "local" && process.env.NODE_ENV === "production")
  throw new Error("Configure Cloudinary for production");
if (driver === "cloudinary") {
  for (const key of [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_APIKEY",
    "CLOUDINARY_APISECRET",
  ])
    if (!process.env[key] || process.env[key].startsWith("REPLACE_"))
      throw new Error("Configure " + key);
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_APIKEY,
    api_secret: process.env.CLOUDINARY_APISECRET,
    secure: true,
  });
}
exports.directory = directory;
exports.validate = async (file) => {
  const type = await FileType.fromBuffer(file.buffer);
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime))
    throw fail(400, "Only JPEG, PNG and WebP images are supported");
  return type;
};
exports.save = async (file) => {
  const type = await exports.validate(file);
  if (driver === "cloudinary")
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: "pastperfect/listings", resource_type: "image" },
          (err, result) =>
            err
              ? reject(err)
              : resolve({ url: result.secure_url, publicId: result.public_id }),
        )
        .end(file.buffer);
    });
  await fs.mkdir(directory, { recursive: true });
  const publicId = crypto.randomUUID() + "." + type.ext;
  await fs.writeFile(path.join(directory, publicId), file.buffer);
  return { url: "/uploads/" + publicId, publicId };
};
exports.remove = async (image) => {
  if (driver === "cloudinary")
    await cloudinary.uploader.destroy(image.publicId);
  else
    await fs
      .unlink(path.join(directory, path.basename(image.publicId)))
      .catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });
};
