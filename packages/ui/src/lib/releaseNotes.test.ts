import { describe, it, expect } from "vitest";
import { parseReleaseNotes } from "./releaseNotes";

const BODY = `## What's Changed

### Features
- **ui**: Agents, Rules, and Activity tabs
- plain item

### Fixes
- **apps**: wait for the app before proxying

### Empty

---
**Full changelog**: [\`v0.0.74...v0.0.75\`](https://github.com/cbabil/tomo/compare/v0.0.74...v0.0.75)
`;

describe("parseReleaseNotes", () => {
  it("keeps sections with items, splits the scope, and drops the rest", () => {
    expect(parseReleaseNotes(BODY)).toEqual([
      { title: "Features", items: [{ scope: "ui", text: "Agents, Rules, and Activity tabs" }, { text: "Plain item" }] },
      { title: "Fixes", items: [{ scope: "apps", text: "Wait for the app before proxying" }] },
    ]);
  });

  it("handles empty notes and items before any heading", () => {
    expect(parseReleaseNotes("")).toEqual([]);
    expect(parseReleaseNotes("- first")).toEqual([{ title: "", items: [{ text: "First" }] }]);
  });
});
