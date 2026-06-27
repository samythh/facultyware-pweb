const express = require("express");
const router = express.Router();
const supplierController = require("../controllers/supplierController");
const { isAuthenticated } = require("../middlewares/auth");
const { checkPermission } = require("../middlewares/acl");

router.use(isAuthenticated);
router.use(checkPermission("manage_vendor"));

router.get("/api/list", supplierController.apiList);

router.get("/", supplierController.index);
router.get("/create", supplierController.create);
router.post("/create", supplierController.store);
router.get("/:id/edit", supplierController.edit);
router.post("/:id/edit", supplierController.update);
router.post("/:id/delete", supplierController.destroy);

module.exports = router;
