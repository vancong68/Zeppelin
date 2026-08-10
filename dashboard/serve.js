import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const fastify = Fastify({
  // We already get logs from nginx, so disable here
  logger: false,
});

// Inject API_URL at runtime so the dashboard can talk to the separate API service
fastify.get("/env.js", (req, reply) => {
  reply.type("application/javascript; charset=utf-8");
  return reply.send(`window.API_URL = ${JSON.stringify(process.env.API_URL ?? "")};`);
});

fastify.register(fastifyStatic, {
  root: path.join(import.meta.dirname, "dist"),
});

// SPA fallback: serve index.html for any path that isn't a static asset or /env.js
// (a `fastify.get("*")` catch-all route conflicts with the /env.js route)
fastify.setNotFoundHandler((req, reply) => {
  reply.sendFile("index.html");
});

const port = Number(process.env.PORT) || 3002;
fastify.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    throw err;
  }
  console.log(`Server listening on ${address}`);
});

process.on("SIGTERM", () => {
  fastify.close().then(() => {
    process.exit(0);
  });
});
