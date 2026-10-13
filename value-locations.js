// Locate primitive values in strict JSON text without evaluating input.
(function (root) {
  "use strict";

  function locateValues(text) {
    const locations = new Map();
    let pos = 0;
    const space = () => { while (/\s/.test(text[pos] || "") && pos < text.length) pos++; };
    const fail = () => { throw new SyntaxError("Invalid JSON source"); };
    function string() {
      const start = pos;
      if (text[pos++] !== '"') fail();
      while (pos < text.length) {
        if (text[pos] === "\\") { pos += 2; continue; }
        if (text[pos++] === '"') return JSON.parse(text.slice(start, pos));
      }
      fail();
    }
    function visit(segments) {
      space();
      const start = pos;
      if (text[pos] === "{") {
        pos++;
        space();
        if (text[pos] !== "}") {
          while (true) {
            space();
            const key = string();
            space();
            if (text[pos++] !== ":") fail();
            visit([...segments, key]);
            space();
            if (text[pos] !== ",") break;
            pos++;
          }
        }
        if (text[pos++] !== "}") fail();
      } else if (text[pos] === "[") {
        pos++;
        space();
        let index = 0;
        if (text[pos] !== "]") {
          while (true) {
            visit([...segments, index++]);
            space();
            if (text[pos] !== ",") break;
            pos++;
          }
        }
        if (text[pos++] !== "]") fail();
      } else {
        if (text[pos] === '"') string();
        else {
          const token = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(pos));
          if (!token) fail();
          pos += token[0].length;
        }
        locations.set(JSON.stringify(segments), { start, end: pos });
      }
    }
    visit([]);
    space();
    if (pos !== text.length) fail();
    return locations;
  }

  function textPosition(text, offset) {
    const before = text.slice(0, offset);
    const rows = before.split("\n");
    return { row: rows.length - 1, column: rows[rows.length - 1].length };
  }

  const api = { locateValues, textPosition };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.JsonValueLocations = api;
})(typeof window !== "undefined" ? window : null);
