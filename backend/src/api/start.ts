import cors from "cors";
import express from "express";
import multer from "multer";
import { TokenError } from "passport-oauth2";
import { dataSource } from "../data/dataSource.js";
import { env } from "../env.js";
import { initArchives } from "./archives.js";
import { initAuth } from "./auth.js";
import { initDocs } from "./docs.js";
import { initGuildsAPI } from "./guilds/index.js";
import { clientError, error, notFound } from "./responses.js";
import { initStaff } from "./staff.js";
import { startBackgroundTasks } from "./tasks.js";

const apiPathPrefix = env.API_PATH_PREFIX || (env.NODE_ENV === "development" ? "/api" : "");

const app = express();

app.use(
  cors({
    origin: env.DASHBOARD_URL,
  }),
);
app.use(
  express.json({
    limit: "50mb",
  }),
);
app.use(multer().none());

const rootRouter = express.Router();

initAuth(rootRouter);
initGuildsAPI(rootRouter);
initArchives(rootRouter);
initDocs(rootRouter);
initStaff(rootRouter);

// Default route
rootRouter.get("/", (req, res) => {
  res.json({ status: "cookies", with: "milk" });
});

app.use(apiPathPrefix, rootRouter);

// Error response
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof TokenError) {
    clientError(res, "Invalid code");
  } else {
    console.error(err); // tslint:disable-line
    error(res, "Server error", err.status || 500);
  }
});

// 404 response
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((req, res, next) => {
  return notFound(res);
});

const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, "0.0.0.0", () => console.log(`API server listening on port ${port}`)); // tslint:disable-line

startBackgroundTasks();

// Graceful shutdown: stop accepting connections, let in-flight requests finish,
// then close the database pool. Render sends SIGTERM before terminating a
// service (30s grace period by default).
let stopping = false;
function shutdown(signal: string) {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log(`Received ${signal}, shutting down...`); // tslint:disable-line

  // Force-exit if connections or the pool don't close in time
  setTimeout(() => process.exit(1), 10_000).unref();

  server.close(() => {
    void dataSource.destroy().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
