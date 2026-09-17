import { describe, expect, it } from "vitest";
import {
  CaisraFileKind,
  caisraFileKind,
  caisraFileLogo,
  caisraFileSize,
  caisraFileWord,
} from "./caisra-files.js";

describe("caisraFileKind", () => {
  it("gives the four office kinds their own mark", () => {
    expect(caisraFileKind("August close.xlsx")).toBe(CaisraFileKind.Excel);
    expect(caisraFileKind("expenses.csv")).toBe(CaisraFileKind.Excel);
    expect(caisraFileKind("Contract.docx")).toBe(CaisraFileKind.Word);
    expect(caisraFileKind("Board update.pptx")).toBe(CaisraFileKind.Slides);
    expect(caisraFileKind("invoice.pdf")).toBe(CaisraFileKind.Pdf);
  });

  it("keeps a drawing apart from a photograph", () => {
    expect(caisraFileKind("logo.svg")).toBe(CaisraFileKind.Vector);
    expect(caisraFileKind("chart.png")).toBe(CaisraFileKind.Image);
  });

  it("reads the extension off a path, not just a name", () => {
    expect(caisraFileKind("/Users/me/Desktop/Q3 review.docx")).toBe(CaisraFileKind.Word);
  });

  it("trusts the name over the media type, because the name is what is read", () => {
    // A spreadsheet sent as a generic stream is still a spreadsheet on screen.
    expect(caisraFileKind("ledger.xlsx", "application/octet-stream")).toBe(CaisraFileKind.Excel);
  });

  it("falls back to the media type only when the extension says nothing", () => {
    expect(caisraFileKind("screenshot", "image/png")).toBe(CaisraFileKind.Image);
    expect(caisraFileKind("drawing", "image/svg+xml")).toBe(CaisraFileKind.Vector);
    expect(caisraFileKind("blob", "application/zip")).toBe(CaisraFileKind.Other);
  });

  it("never guesses an icon for something the design did not draw", () => {
    expect(caisraFileKind("archive.zip")).toBe(CaisraFileKind.Other);
    expect(caisraFileLogo(CaisraFileKind.Other)).toBeUndefined();
    expect(caisraFileLogo(CaisraFileKind.Image)).toBeUndefined();
    expect(caisraFileLogo(CaisraFileKind.Vector)).toBeUndefined();
  });

  it("names a logo for each office kind, PDF included", () => {
    expect(caisraFileLogo(CaisraFileKind.Pdf)).toBe("pdf");
    expect(caisraFileLogo(CaisraFileKind.Word)).toBe("word");
    expect(caisraFileLogo(CaisraFileKind.Excel)).toBe("excel");
    expect(caisraFileLogo(CaisraFileKind.Slides)).toBe("powerpoint");
  });
});

describe("caisraFileWord", () => {
  it("is the extension, upper case — the word on a card with no logo", () => {
    expect(caisraFileWord("logo.svg")).toBe("SVG");
    expect(caisraFileWord("notes")).toBeUndefined();
  });
});

describe("caisraFileSize", () => {
  it("says the size the way a person would", () => {
    expect(caisraFileSize(812)).toBe("812 bytes");
    expect(caisraFileSize(48_211)).toBe("48 KB");
    expect(caisraFileSize(2_400_000)).toBe("2.4 MB");
  });
});
