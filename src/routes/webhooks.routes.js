const router = require("express").Router();
const controller = require("../controllers/webhooks.controller");
router.post("/mail", controller.receive.bind(controller));
module.exports = router;
