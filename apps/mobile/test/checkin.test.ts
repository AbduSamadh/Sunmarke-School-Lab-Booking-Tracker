import { describe, expect, it } from "vitest";
import { codeFromScan } from "../src/checkin";

describe("codeFromScan", () => {
  it("takes the code from a check-in link", () => {
    expect(codeFromScan("https://labs.sunmarke.example/checkin/qtm-7f3a")).toBe("qtm-7f3a");
    expect(codeFromScan("https://labs.sunmarke.example/checkin/qtm-7f3a/")).toBe("qtm-7f3a");
  });
  it("accepts a typed code", () => expect(codeFromScan("  qtm-7f3a ")).toBe("qtm-7f3a"));
  it("rejects junk", () => {
    expect(codeFromScan("hi")).toBeNull();
    expect(codeFromScan("not a code!")).toBeNull();
  });
});
