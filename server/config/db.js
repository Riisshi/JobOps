const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI && process.env.MONGO_URI.trim();

  if (!mongoUri) {
    console.error(
      "Missing or empty MONGO_URI environment variable. Set MONGO_URI to a valid MongoDB connection string."
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message || err);
    console.error(
      "Verify the MONGO_URI value, network access, and DNS for your MongoDB host."
    );
    process.exit(1);
  }
};

module.exports = connectDB;