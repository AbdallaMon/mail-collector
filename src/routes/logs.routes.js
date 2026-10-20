const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");

const controller = require("../controllers/logs.controller");

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/logs
 * @desc    Get email forwarding logs (MailMessageLog)
 */
router.get("/", asyncHandler(controller.list.bind(controller)));

/**
 * @route   GET /api/logs/:id
 * @desc    Get single log details
 */
router.get("/:id", asyncHandler(controller.getById.bind(controller)));

/**
 * @route   POST /api/logs/:id/retry
 * @desc    Retry forwarding a failed message
 */
router.post("/:id/retry", asyncHandler(controller.retry.bind(controller)));

/**
 * @route   DELETE /api/logs/cleanup
 * @desc    Clear old logs
 */
router.delete("/cleanup", asyncHandler(controller.cleanup.bind(controller)));

module.exports = router;
