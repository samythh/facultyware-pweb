var express = require("express");
var router = express.Router();

const receivingController = require("../controllers/receivingController");
const { checkPermission } = require("../middlewares/acl");
const upload = require("../middlewares/upload");

// Semua route Penerimaan Barang diproteksi permission 'manage_receiving'.
// Saat DEV_NO_AUTH=1 (lokal), guard dilewati untuk preview tampilan.
const can =
  process.env.DEV_NO_AUTH === "1"
    ? (req, res, next) => next()
    : checkPermission("manage_receiving");

/* ---- Halaman / aksi penerimaan (mount di /receiving) ---- */

// GET /receiving -> daftar penerimaan barang
router.get("/", can, receivingController.index);

// GET /receiving/:po_id/verify -> form verifikasi
router.get("/:po_id/verify", can, receivingController.verifyForm);

// POST /receiving/:po_id/verify -> simpan verifikasi (dengan upload bukti)
router.post(
  "/:po_id/verify",
  can,
  upload.single("bukti"),
  receivingController.verifyStore
);

// POST /receiving/:po_id/confirm -> konfirmasi final (auto-update stok)
router.post("/:po_id/confirm", can, receivingController.confirm);

// POST /receiving/retur -> catat retur barang ke vendor
router.post("/retur", can, receivingController.retur);

// GET /receiving/:id/detail -> detail penerimaan
router.get("/:id/detail", can, receivingController.detail);

// GET /receiving/:id/export -> export laporan PDF
router.get("/:id/export", can, receivingController.exportPDF);

/* ---- REST API (mount di /api/receiving) ---- */
// Dipisah agar URL final menjadi GET /api/receiving (JSON + pagination).
const apiRouter = express.Router();
apiRouter.get("/", can, receivingController.apiList);

router.apiRouter = apiRouter;

module.exports = router;
