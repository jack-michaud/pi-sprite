import assert from "node:assert/strict";
import extension from "./extensions/sprite.ts";

assert.equal(typeof extension, "function");
console.log("extension import test passed");
