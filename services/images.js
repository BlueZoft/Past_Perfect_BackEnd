const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
sharp.concurrency(2);
sharp.cache({ memory: 32, files: 0, items: 32 });
let active = 0;
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
exports.driver = driver;
exports.validate = async (file) => {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length > 5 * 1024 * 1024
  )
    throw fail(400, "Image must be at most 5 MB");
  let type;
  try {
    type = await FileType.fromBuffer(file.buffer);
  } catch {
    throw fail(400, "Image is invalid, animated or too large");
  }
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime))
    throw fail(400, "Only JPEG, PNG and WebP images are supported");
  try {
    const meta = await sharp(file.buffer, {
      limitInputPixels: 20000000,
      failOn: "warning",
      animated: true,
    }).metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > 10000 ||
      meta.height > 10000 ||
      (meta.pages || 1) > 1
    )
      throw new Error("Unsupported dimensions");
    return meta;
  } catch {
    throw fail(400, "Image is invalid, animated or too large");
  }
};
exports.save = async (file, options = {}) => {
  if (active >= 2)
    throw fail(429, "Image processing is busy. Please try again.");
  active++;
  try {
    await exports.validate(file);
    let output;
    try {
      output = await sharp(file.buffer, {
        limitInputPixels: 20000000,
        failOn: "warning",
      })
        .rotate()
        .resize({
          width: options.avatar ? 512 : 1920,
          height: options.avatar ? 512 : 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw fail(400, "Image is invalid, animated or too large");
    }
    const metadata = {
      driver,
      width: output.info.width,
      height: output.info.height,
      bytes: output.data.length,
    };
    if (driver === "cloudinary")
      return await new Promise((resolve, reject) =>
        cloudinary.uploader
          .upload_stream(
            {
              folder:
                "pastperfect/" + (options.avatar ? "avatars" : "listings"),
              resource_type: "image",
            },
            (err, result) =>
              err
                ? reject(err)
                : resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    ...metadata,
                  }),
          )
          .end(output.data),
      );
    await fs.mkdir(directory, { recursive: true });
    const publicId = crypto.randomUUID() + ".webp";
    await fs.writeFile(path.join(directory, publicId), output.data, {
      flag: "wx",
    });
    return { url: "/uploads/" + publicId, publicId, ...metadata };
  } finally {
    active--;
  }
};
exports.remove = async (image) => {
  if (image.driver && image.driver !== driver)
    throw new Error("Run cleanup with the original storage driver");
  if (driver === "cloudinary")
    await cloudinary.uploader.destroy(image.publicId);
  else
    await fs
      .unlink(path.join(directory, path.basename(image.publicId)))
      .catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });
};
