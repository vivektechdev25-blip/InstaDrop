import { describe, expect, it } from "vitest";
import {
  extractCoverDate,
  extractMediaAssetId,
  matchesCoverDate,
  normalizeDateText,
  parseOgDescription,
  stripByteRangeParams,
} from "../src/services/scrapers/mediaExtractionHelpers";

describe("parseOgDescription", () => {
  it("extracts username and caption from the standard format", () => {
    expect(
      parseOgDescription('1,234 likes, 56 comments - nat.geo on August 9, 2025: "Into the wild."')
    ).toEqual({ username: "nat.geo", caption: "Into the wild." });
  });

  it("strips the trailing quote-and-period Instagram appends", () => {
    expect(parseOgDescription('5 likes, 0 comments - user_1 on May 1, 2026: "hello". ').caption).toBe(
      "hello"
    );
  });

  // Regression (2026-08-06): captionless posts omit the `: "caption"`
  // segment entirely - the old pattern required the colon and lost the
  // username, which PreviewCard rendered as "@unknown".
  it("keeps the username on a captionless post", () => {
    expect(parseOgDescription("10 likes, 2 comments - tchalamet on March 3, 2026")).toEqual({
      username: "tchalamet",
      caption: "",
    });
  });

  it("preserves multi-line captions", () => {
    const { caption } = parseOgDescription('1 likes, 1 comments - a on May 1, 2026: "line one\nline two"');
    expect(caption).toBe("line one\nline two");
  });

  it("falls back to the raw text when the format is unrecognised", () => {
    expect(parseOgDescription("  Something else entirely  ")).toEqual({
      username: "",
      caption: "Something else entirely",
    });
  });

  it("handles a missing description", () => {
    expect(parseOgDescription(null)).toEqual({ username: "", caption: "" });
  });
});

describe("normalizeDateText", () => {
  // Regression (2026-08-04): og:description and <img alt> disagree on
  // zero-padding for the same post ("August 9" vs "August 09"), which
  // silently dropped real carousel slides on an exact match.
  it("normalizes zero-padding, commas and case", () => {
    expect(normalizeDateText("August 09, 2025")).toBe("august 9 2025");
    expect(normalizeDateText("August 9, 2025")).toBe("august 9 2025");
  });

  it("leaves two-digit days alone", () => {
    expect(normalizeDateText("August 19, 2025")).toBe("august 19 2025");
  });
});

describe("extractCoverDate / matchesCoverDate", () => {
  it("pulls the normalized date out of og:description", () => {
    expect(extractCoverDate('1 likes, 0 comments - a on August 09, 2025: "x"')).toBe("august 9 2025");
  });

  it("returns null without a date or description", () => {
    expect(extractCoverDate("no date here")).toBeNull();
    expect(extractCoverDate(null)).toBeNull();
  });

  it("matches slide alt text regardless of padding", () => {
    expect(matchesCoverDate("Photo by A on August 09, 2025.", "august 9 2025")).toBe(true);
    expect(matchesCoverDate("Photo by A on August 10, 2025.", "august 9 2025")).toBe(false);
    expect(matchesCoverDate("No date", "august 9 2025")).toBe(false);
  });
});

describe("extractMediaAssetId", () => {
  it("returns the two leading numeric segments shared across renditions", () => {
    expect(
      extractMediaAssetId(
        "https://scontent.cdninstagram.com/v/t51.29350-15/123456_7890123_998877_n.jpg?stp=dst-jpg_e35"
      )
    ).toBe("123456_7890123");
  });

  it("returns null for filenames without that shape", () => {
    expect(extractMediaAssetId("https://scontent.cdninstagram.com/v/abc.jpg")).toBeNull();
  });
});

describe("stripByteRangeParams", () => {
  it("removes only the byte-range params", () => {
    const stripped = new URL(
      stripByteRangeParams("https://x.fbcdn.net/v.mp4?bytestart=0&byteend=999&efg=keep&oh=sig")
    );
    expect(stripped.searchParams.has("bytestart")).toBe(false);
    expect(stripped.searchParams.has("byteend")).toBe(false);
    expect(stripped.searchParams.get("efg")).toBe("keep");
    expect(stripped.searchParams.get("oh")).toBe("sig");
  });
});
