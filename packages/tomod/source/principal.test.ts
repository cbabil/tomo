import { describe, it, expect } from "vitest";
import { hasScope, isPrivateAddress, type Principal } from "./principal.js";

const user: Principal = { kind: "user", name: "admin" };
const manage: Principal = { kind: "token", id: "a", name: "t", scope: "manage" };
const admin: Principal = { kind: "token", id: "b", name: "t", scope: "admin" };

describe("hasScope", () => {
  it("lets a signed-in user do everything", () => {
    expect(hasScope(user, "manage")).toBe(true);
    expect(hasScope(user, "admin")).toBe(true);
    expect(hasScope(user, "user")).toBe(true);
  });

  it("nests token scopes and keeps user-only actions away from tokens", () => {
    expect(hasScope(manage, "manage")).toBe(true);
    expect(hasScope(manage, "admin")).toBe(false);
    expect(hasScope(admin, "manage")).toBe(true);
    expect(hasScope(admin, "admin")).toBe(true);
    expect(hasScope(admin, "user")).toBe(false);
  });

  it("denies everything to no principal", () => {
    expect(hasScope(null, "manage")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("accepts LAN, loopback, and link-local addresses", () => {
    for (const ip of ["10.2.0.6", "192.168.1.50", "172.16.0.1", "172.31.255.255", "127.0.0.1", "::1", "::ffff:192.168.0.2", "fe80::1", "fd12::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("rejects public addresses and junk", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "2001:db8::1", "", "not-an-ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
