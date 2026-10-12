// Parse JSON and a deliberately limited subset of Python literal syntax.
// Never evaluate user input as JavaScript.
(function (root) {
  "use strict";

  const MAX_DEPTH = 128;
  const MAX_LENGTH = 5_000_000;

  function parseInput(text) {
    if (!text.trim()) return { value: {}, repaired: false, multiple: false };
    if (text.length > MAX_LENGTH) throw new SyntaxError("Input is too large to parse safely.");
    try {
      return { value: JSON.parse(text), repaired: false, multiple: false };
    } catch (strictError) {
      const parser = new LiteralParser(text);
      try {
        const values = parser.parseDocuments();
        return {
          value: values.length === 1 ? values[0] : values,
          repaired: true,
          multiple: values.length > 1
        };
      } catch (error) {
        throw new SyntaxError(`Cannot safely correct input: ${error.message}`);
      }
    }
  }

  class LiteralParser {
    constructor(text) {
      this.text = text;
      this.pos = 0;
    }

    fail(message) {
      throw new SyntaxError(`${message} at position ${this.pos + 1}`);
    }

    skipSpace() {
      while (/\s/.test(this.text[this.pos] || "") && this.pos < this.text.length) this.pos++;
    }

    parseDocuments() {
      const values = [];
      this.skipSpace();
      while (this.pos < this.text.length) {
        values.push(this.parseValue(0));
        const end = this.pos;
        this.skipSpace();
        if (this.text[this.pos] === ",") {
          this.pos++;
          this.skipSpace();
          if (this.pos === this.text.length) this.fail("Trailing document separator");
        } else if (this.pos < this.text.length && end === this.pos) {
          this.fail("Expected whitespace or comma between documents");
        }
      }
      return values;
    }

    parseValue(depth) {
      this.skipSpace();
      if (depth > MAX_DEPTH) this.fail("Maximum nesting depth exceeded");
      const char = this.text[this.pos];
      if (char === "{") return this.parseObject(depth + 1);
      if (char === "[") return this.parseArray(depth + 1);
      if (char === "'" || char === '"') return this.parseString();
      if (char === "-" || /[0-9]/.test(char || "")) return this.parseNumber();
      const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(this.text.slice(this.pos));
      if (name) {
        this.pos += name[0].length;
        if (name[0] === "None" || name[0] === "null") return null;
        if (name[0] === "True" || name[0] === "true") return true;
        if (name[0] === "False" || name[0] === "false") return false;
        this.fail(`Unsupported identifier ${name[0]}`);
      }
      this.fail("Expected a JSON value or Python literal");
    }

    parseObject(depth) {
      this.pos++;
      const entries = [];
      this.skipSpace();
      if (this.text[this.pos] === "}") {
        this.pos++;
        return {};
      }
      while (true) {
        if (!['"', "'"].includes(this.text[this.pos])) this.fail("Object keys must be quoted strings");
        const key = this.parseString();
        this.skipSpace();
        if (this.text[this.pos++] !== ":") this.fail("Expected colon after key");
        entries.push([key, this.parseValue(depth)]);
        this.skipSpace();
        const next = this.text[this.pos++];
        if (next === "}") return Object.fromEntries(entries);
        if (next !== ",") this.fail("Expected comma or closing brace");
        this.skipSpace();
        if (this.text[this.pos] === "}") {
          this.pos++;
          return Object.fromEntries(entries);
        }
      }
    }

    parseArray(depth) {
      this.pos++;
      const values = [];
      this.skipSpace();
      if (this.text[this.pos] === "]") {
        this.pos++;
        return values;
      }
      while (true) {
        values.push(this.parseValue(depth));
        this.skipSpace();
        const next = this.text[this.pos++];
        if (next === "]") return values;
        if (next !== ",") this.fail("Expected comma or closing bracket");
        this.skipSpace();
        if (this.text[this.pos] === "]") {
          this.pos++;
          return values;
        }
      }
    }

    parseString() {
      const quote = this.text[this.pos++];
      let result = "";
      while (this.pos < this.text.length) {
        const char = this.text[this.pos++];
        if (char === quote) return result;
        if (char === "\n" || char === "\r") this.fail("Unescaped newline in string");
        if (char !== "\\") {
          result += char;
          continue;
        }
        if (this.pos >= this.text.length) this.fail("Incomplete string escape");
        const escape = this.text[this.pos++];
        const common = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "/": "/", "'": "'", '"': '"' };
        if (Object.hasOwn(common, escape)) {
          result += common[escape];
        } else if (escape === "u" || escape === "x" || escape === "U") {
          const length = escape === "x" ? 2 : escape === "u" ? 4 : 8;
          const code = this.text.slice(this.pos, this.pos + length);
          if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(code)) this.fail("Invalid unicode escape");
          const number = parseInt(code, 16);
          if (number > 0x10ffff) this.fail("Invalid unicode code point");
          result += String.fromCodePoint(number);
          this.pos += length;
        } else {
          this.fail(`Unsupported string escape \\${escape}`);
        }
      }
      this.fail("Unterminated string");
    }

    parseNumber() {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.pos));
      if (!match) this.fail("Invalid number");
      this.pos += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) this.fail("Number out of range");
      return value;
    }
  }

  function splitItems(value) {
    const items = [];
    function visit(item, path) {
      if (Array.isArray(item)) {
        item.forEach((child, index) => visit(child, `${path}[${index}]`));
      } else if (typeof item === "string" && /^[\s]*[\[{]/.test(item)) {
        // Lists copied from logs sometimes contain serialized JSON strings.
        try {
          const parsed = parseInput(item).value;
          if (Array.isArray(parsed) || (parsed !== null && typeof parsed === "object")) {
            visit(parsed, path);
            return;
          }
        } catch (error) {
          // Keep ordinary strings unchanged if they are not valid data documents.
        }
        items.push({ path: path || "root", value: item });
      } else {
        items.push({ path: path || "root", value: item });
      }
    }
    visit(value, "");
    return items;
  }

  const api = { parseInput, splitItems };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.JsonInputParser = api;
})(typeof window !== "undefined" ? window : null);
