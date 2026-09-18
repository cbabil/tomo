import { describe, it, expect } from "vitest";
import { connectSnippet, CONNECT_CLIENTS } from "./agents";
import { tokenStatus, idleDays } from "./tokenStatus";

describe("connectSnippet", () => {
  it("puts the endpoint and the token into every client's snippet", () => {
    for (const client of CONNECT_CLIENTS) {
      const snippet = connectSnippet(client, "tomo_abc123_secret", "http://10.2.0.6");
      expect(snippet, client).toContain("http://10.2.0.6/mcp");
      expect(snippet, client).toContain("Bearer tomo_abc123_secret");
    }
  });
});

describe("idle tokens", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  it("flags a live token unused for sixty days, but expiry warnings win", () => {
    expect(tokenStatus({ createdAt: "2026-06-01T00:00:00Z" }, now)).toBe("idle");
    expect(tokenStatus({ createdAt: "2026-06-01T00:00:00Z", lastUsedAt: "2026-09-17T00:00:00Z" }, now)).toBe("active");
    expect(tokenStatus({ createdAt: "2026-06-01T00:00:00Z", expiresAt: "2026-09-20T00:00:00Z" }, now)).toBe("expiring");
    expect(idleDays({ createdAt: "2026-09-08T12:00:00Z" }, now)).toBe(10);
  });
});
