const multer = require("multer");
const { fail } = require("./http");
module.exports = (name, count, fields = 1) => {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: count,
      fields,
      fieldSize: 16000,
    },
  }).array(name, count);
  return (req, res, next) =>
    parse(req, res, (err) =>
      next(
        err
          ? fail(400, `Upload rejected: at most ${count} image(s), 5 MB each`)
          : undefined,
      ),
    );
};
