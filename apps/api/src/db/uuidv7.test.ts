import test from "node:test";
import assert from "node:assert/strict";
import { createUuidV7 } from "./uuidv7.js";

test("creates a UUIDv7-compatible MySQL binary identifier", () => {
  const value = createUuidV7();
  assert.equal(value.length, 16);
  assert.equal(value[6] >> 4, 0x7);
  assert.equal(value[8] >> 6, 0x2);
});