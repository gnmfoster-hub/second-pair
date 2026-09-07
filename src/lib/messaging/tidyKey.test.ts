import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyKey } from "./email.ts";

const KEY = "re_123abc";

test("a clean key is left exactly as it is", () => {
  assert.equal(tidyKey(KEY), KEY);
});

test("the newline that came with the copy", () => {
  assert.equal(tidyKey(`${KEY}\n`), KEY);
  assert.equal(tidyKey(` ${KEY} `), KEY);
  assert.equal(tidyKey(`\r\n${KEY}\r\n`), KEY);
});

test("the quotes every environment-variable example puts round a value", () => {
  assert.equal(tidyKey(`"${KEY}"`), KEY);
  assert.equal(tidyKey(`'${KEY}'`), KEY);
  assert.equal(tidyKey(` "${KEY}" `), KEY);
});

test("a quote on one side only is not a paste, and is left alone", () => {
  assert.equal(tidyKey(`"${KEY}`), `"${KEY}`);
  assert.equal(tidyKey(`${KEY}"`), `${KEY}"`);
});

test("mismatched quotes are left alone too", () => {
  assert.equal(tidyKey(`"${KEY}'`), `"${KEY}'`);
});

test("nothing stays nothing, rather than becoming something", () => {
  assert.equal(tidyKey(""), "");
  assert.equal(tidyKey("   "), "");
  assert.equal(tidyKey('"'), '"');
  assert.equal(tidyKey('""'), "");
});
