import multer from "multer";
import path from "path";

const allowedFormats = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const extname = allowedFormats.includes(
      path.extname(file.originalname).toLowerCase().slice(1),
    );
    const mimetype = allowedFormats.includes(file.mimetype.split("/")[1]);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        `Error: Only images of type ${allowedFormats.join(", ")} are allowed!`,
      ),
    );
  },
});

export { upload };
