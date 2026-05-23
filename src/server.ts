import { Server } from "http";
import app from "./app";
import config from "./app/config";
import mongoose from "mongoose";

let server: Server;
const port = Number(config.port) || 5000; // fallback port

async function main() {
  try {
    if (!config.jwt_access_secret) {
      throw new Error(
        "❌ JWT_ACCESS_SECRET is not set. Check your .env or PM2 env settings.",
      );
    }

    await mongoose.connect(config.database_url as string);
    console.log("✅ Mongodb database connected successfully");

    server = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 App is listening on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Startup Error:", err);
  }
}
main();

// graceful shutdown
process.on("unhandledRejection", (err) => {
  console.log(`❌ UnhandledRejection detected, shutting down...`, err);
  if (server) {
    server.close(() => process.exit(1));
  }
});

process.on("uncaughtException", () => {
  console.log(`❌ UncaughtException detected, shutting down...`);
  process.exit(1);
});
