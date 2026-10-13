const test = require("node:test");
const assert = require("node:assert/strict");
const { locateValues, textPosition } = require("./value-locations.js");

test("locates repeated values by structural path, not first matching text", () => {
  const text = '{"doctor_name":"普通号","doctor":{"doctor_name":"普通号"},"items":["普通号",null]}';
  const locations = locateValues(text);
  for (const [segments, expected] of [
    [["doctor_name"], '"普通号"'],
    [["doctor", "doctor_name"], '"普通号"'],
    [["items", 0], '"普通号"'],
    [["items", 1], "null"]
  ]) {
    const range = locations.get(JSON.stringify(segments));
    assert.equal(text.slice(range.start, range.end), expected);
  }
  assert.ok(locations.get('["doctor","doctor_name"]').start > locations.get('["doctor_name"]').start);
});

test("handles escaped keys and strings, nested arrays, and primitive root", () => {
  const text = '{"a\\\"b":[{"x":"line\\nend"}]}';
  const range = locateValues(text).get(JSON.stringify(['a"b', 0, "x"]));
  assert.equal(text.slice(range.start, range.end), '"line\\nend"');
  assert.deepEqual(locateValues('"value"').get("[]"), { start: 0, end: 7 });
});

test("maps offsets to Ace rows and columns", () => {
  assert.deepEqual(textPosition('a\n普通号', 2), { row: 1, column: 0 });
  assert.deepEqual(textPosition('a\n普通号', 5), { row: 1, column: 3 });
});
