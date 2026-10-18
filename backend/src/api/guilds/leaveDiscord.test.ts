import test from "ava";
import { classifyLeaveResponse } from "./leaveDiscord.js";

test("2xx responses count as a successful leave", (t) => {
  for (const status of [200, 204]) {
    t.deepEqual(classifyLeaveResponse(status, ""), {
      left: true,
      alreadyGone: false,
      retryable: false,
      error: null,
    });
  }
});

test("404 counts as already gone", (t) => {
  t.deepEqual(classifyLeaveResponse(404, '{"message": "Unknown Guild", "code": 10004}'), {
    left: true,
    alreadyGone: true,
    retryable: false,
    error: null,
  });
});

test("403 with 50001 Missing Access counts as already gone", (t) => {
  t.deepEqual(classifyLeaveResponse(403, '{"message": "Missing Access", "code": 50001}'), {
    left: true,
    alreadyGone: true,
    retryable: false,
    error: null,
  });
});

test("403 with an unparseable or different error body is a non-retryable failure", (t) => {
  for (const body of ["", "not json", '{"message": "Forbidden", "code": 50013}']) {
    const result = classifyLeaveResponse(403, body);
    t.false(result.left);
    t.false(result.alreadyGone);
    t.false(result.retryable);
    t.true(result.error!.startsWith("Discord API returned status 403"));
  }
});

test("401 is a non-retryable failure", (t) => {
  const result = classifyLeaveResponse(401, '{"message": "401: Unauthorized", "code": 0}');
  t.false(result.left);
  t.false(result.retryable);
  t.true(result.error!.startsWith("Discord API returned status 401"));
});

test("5xx and 429 are retryable failures", (t) => {
  for (const status of [429, 500, 502, 503]) {
    const result = classifyLeaveResponse(status, "upstream error");
    t.false(result.left);
    t.false(result.alreadyGone);
    t.true(result.retryable);
    t.true(result.error!.startsWith(`Discord API returned status ${status}`));
  }
});

test("the error body is truncated to 300 characters", (t) => {
  const result = classifyLeaveResponse(500, "x".repeat(1000));
  t.is(result.error!.length, "Discord API returned status 500: ".length + 300);
});
