const express = require("express");
const router = express.Router();
const { getPublicPipeline } = require("../controllers/automationController");

router.get("/pipeline/:token", getPublicPipeline);

module.exports = router;
