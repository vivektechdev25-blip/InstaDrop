import express from "express";
import helmet from "helmet";
import cors from "cors";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { closeBrowser } from "./services/scrapers/browserManager";

const app = express();

app.use(helmet());
// Defaults to localhost, not a wildcard - an unset CORS_ORIGIN in
// production fails safe (blocks the real frontend, loudly and
// immediately obvious) rather than failing open (silently allowing any
// origin).
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

app.use("/api/v1", apiRouter);

app.use(errorHandler);

const port = process.env.PORT ?? 4000;
const server = app.listen(port, () => {
  console.log(`Instadrop API listening on port ${port}`);
});

async function shutdown(): Promise<void> {
  await closeBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
