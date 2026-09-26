import { describe, it, expect } from "vitest";
import { parseCsv, csvRecords, csvCell, toCsv } from "./csv";

describe("parseCsv — what other CRMs actually export", () => {
  it("keeps a quoted comma inside its cell", () => {
    expect(parseCsv('name,phone\n"Al Mansoori, Sarah",0501000001')).toEqual([
      ["name", "phone"], ["Al Mansoori, Sarah", "0501000001"],
    ]);
  });
  it("keeps a line break inside a quoted note", () => {
    const rows = parseCsv('name,notes\nOmar,"line one\nline two"\nAisha,x');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["Omar", "line one\nline two"]);
  });
  it("reads doubled quotes, Windows line ends and a byte-order mark", () => {
    expect(parseCsv('﻿a,b\r\n"say ""hi""",2\r\n')).toEqual([["a", "b"], ['say "hi"', "2"]]);
  });
  it("reads semicolon files from Excel in other locales", () => {
    expect(parseCsv("name;phone\nSara;050")).toEqual([["name", "phone"], ["Sara", "050"]]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a\n\n1\n\n")).toEqual([["a"], ["1"]]);
  });
  it("maps rows to the header, blanks as null", () => {
    const r = csvRecords("name,email\nSara,\n");
    expect(r.headers).toEqual(["name", "email"]);
    expect(r.rows).toEqual([{ name: "Sara", email: null }]);
  });
});

describe("csvCell — safe to open in a spreadsheet", () => {
  it("neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });
  it("leaves a phone number alone", () => {
    expect(csvCell("+971501000001")).toBe("+971501000001");
    expect(csvCell("-5")).toBe("-5");
  });
  it("round-trips through the parser", () => {
    const out = toCsv(["name", "notes"], [["Al Mansoori, Sarah", 'said "cash"\nsoon']]);
    expect(parseCsv(out)).toEqual([["name", "notes"], ["Al Mansoori, Sarah", 'said "cash"\nsoon']]);
  });
});
