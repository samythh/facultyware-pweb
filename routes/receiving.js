var express = require("express");
var router = express.Router();

const receivingController = require("../controllers/receivingController");
const { checkPermission } = require("../middlewares/acl");
const upload = require("../middlewares/upload");

const can =
  process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production"
    ? (req, res, next) => next()
    : checkPermission("manage_receiving");

router.get("/", can, receivingController.index);

router.get("/:po_id/verify", can, receivingController.verifyForm);

router.post(
  "/:po_id/verify",
  can,
  upload.array("bukti", 5),
  receivingController.verifyStore
);

router.post("/:po_id/confirm", can, receivingController.confirm);

router.post("/retur", can, receivingController.retur);

router.post("/replacement", can, receivingController.replacement);

router.get("/:id/detail", can, receivingController.detail);

router.get("/:id/export", can, receivingController.exportPDF);

const apiRouter = express.Router();
apiRouter.get("/", can, receivingController.apiList);

router.apiRouter = apiRouter;

module.exports = router;
