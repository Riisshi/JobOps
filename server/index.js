const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const appRoutes = require("./routes/applicationRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const automationRoutes = require("./routes/automationRoutes");
const publicRoutes = require("./routes/publicRoutes");


dotenv.config();

// Debug: Log environment variables at startup


connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/applications", appRoutes)
app.use("/api/reminders", reminderRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api/public", publicRoutes);



app.get("/", (req, res) => {
  res.send("API running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
