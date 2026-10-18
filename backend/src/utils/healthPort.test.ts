import test from "ava";
import { resolveHealthPort } from "./healthPort.js";

test("resolveHealthPort() uses BOT_HEALTH_PORT when set", (t) => {
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "1234", NODE_ENV: "production", PORT: "10000" }), 1234);
});

test("resolveHealthPort() treats BOT_HEALTH_PORT=0 as disabled, overriding Render's PORT", (t) => {
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "0", NODE_ENV: "production", PORT: "10000" }), 0);
});

test("resolveHealthPort() trims and validates BOT_HEALTH_PORT", (t) => {
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: " 8080 " }), 8080);
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "abc" }), 0);
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "-1" }), 0);
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "65536" }), 0);
});

test("resolveHealthPort() ignores an empty BOT_HEALTH_PORT", (t) => {
  t.is(resolveHealthPort({ BOT_HEALTH_PORT: "  ", NODE_ENV: "production", PORT: "10000" }), 10000);
});

test("resolveHealthPort() binds Render's PORT in production by default", (t) => {
  t.is(resolveHealthPort({ NODE_ENV: "production", PORT: "10000" }), 10000);
});

test("resolveHealthPort() is disabled outside production without an override", (t) => {
  t.is(resolveHealthPort({ NODE_ENV: "development", PORT: "3000" }), 0);
  t.is(resolveHealthPort({}), 0);
});
