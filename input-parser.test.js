const test = require("node:test");
const assert = require("node:assert/strict");
const { parseInput, splitItems } = require("./input-parser.js");

test("standard JSON is unchanged", () => {
  assert.deepEqual(parseInput('{"name":"O\'Brien","flag":null}'), {
    value: { name: "O'Brien", flag: null }, repaired: false, multiple: false
  });
});

test("Python dict with nested objects, None and non-ASCII text", () => {
  const parsed = parseInput("{'schedule_id': '8211-32_2026-10-11_0_0a', 'reg_begin_time': None, 'reg_name': '假日门诊', 'doctor': {'doctor_name': '普通号'}, 'detail': [], 'has_reg_num': 45}");
  assert.equal(parsed.value.reg_begin_time, null);
  assert.equal(parsed.value.doctor.doctor_name, "普通号");
  assert.equal(JSON.parse(JSON.stringify(parsed.value)).reg_name, "假日门诊");
  assert.equal(parsed.repaired, true);
});

test("single quotes, apostrophes, escapes, booleans and trailing commas", () => {
  assert.deepEqual(parseInput("{'name': 'O\\'Brien', 'quoted': 'a" + '"' + "b', 'ok': True, 'no': False, 'value': None, 'line': 'a\\nb',}").value,
    { name: "O'Brien", quoted: 'a"b', ok: true, no: false, value: null, line: "a\nb" });
});

test("multiple arrays and documents are collected in order", () => {
  const parsed = parseInput("[{'id': 1}, {'id': 2}]\n[{\"id\":3}]");
  assert.equal(parsed.multiple, true);
  assert.deepEqual(splitItems(parsed.value), [
    { path: "[0][0]", value: { id: 1 } },
    { path: "[0][1]", value: { id: 2 } },
    { path: "[1][0]", value: { id: 3 } }
  ]);
});

test("one array stays one document and empty array splits to no items", () => {
  assert.equal(parseInput('[{"id":1}]').multiple, false);
  assert.deepEqual(splitItems([]), []);
});

test("serialized objects inside a list are displayed as parsed objects", () => {
  assert.deepEqual(splitItems(['{"a":1}', "{'b': None}", "[not JSON]", "plain"]), [
    { path: "[0]", value: { a: 1 } },
    { path: "[1]", value: { b: null } },
    { path: "[2]", value: "[not JSON]" },
    { path: "[3]", value: "plain" }
  ]);
});

test("untrusted expressions are rejected rather than executed", () => {
  globalThis.__parserPwned = false;
  assert.throws(() => parseInput("{'x': (globalThis.__parserPwned = true)}"), /Cannot safely correct/);
  assert.equal(globalThis.__parserPwned, false);
  delete globalThis.__parserPwned;
});

test("malformed or ambiguous input is not silently repaired", () => {
  for (const text of ["{'x': NaN}", "{'x': 01}", "{'x': 'oops}", "{'x': 1, broken}", "{'x': 1}garbage", "[1,,2]", "{'x': 1e999}"]) {
    assert.throws(() => parseInput(text), SyntaxError, text);
  }
});
