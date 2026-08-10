/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildInactivityStorageKey,
  isValidTimestamp,
  writeLastActivityAt,
} from "./inactivityStorage";

afterEach(() => {
  window.localStorage.clear();
});

describe("buildInactivityStorageKey", () => {
  it("gera uma chave escopada por usuário, diferente entre usuários", () => {
    expect(buildInactivityStorageKey("user-1")).toContain("user-1");
    expect(buildInactivityStorageKey("user-1")).not.toBe(
      buildInactivityStorageKey("user-2"),
    );
  });
});

describe("isValidTimestamp", () => {
  const now = 1_000_000;

  it("aceita número finito, positivo, até o presente", () => {
    expect(isValidTimestamp(now - 1000, now)).toBe(true);
    expect(isValidTimestamp(now, now)).toBe(true);
  });

  it("aceita pequena tolerância de relógio no futuro, rejeita futuro distante", () => {
    expect(isValidTimestamp(now + 30_000, now)).toBe(true);
    expect(isValidTimestamp(now + 61_000, now)).toBe(false);
  });

  it("rejeita NaN, negativo, zero e valores que não são número", () => {
    expect(isValidTimestamp(NaN, now)).toBe(false);
    expect(isValidTimestamp(Infinity, now)).toBe(false);
    expect(isValidTimestamp(-1, now)).toBe(false);
    expect(isValidTimestamp(0, now)).toBe(false);
    expect(isValidTimestamp("123", now)).toBe(false);
    expect(isValidTimestamp(undefined, now)).toBe(false);
    expect(isValidTimestamp(null, now)).toBe(false);
  });
});

describe("writeLastActivityAt", () => {
  it("grava no localStorage sob a chave escopada por usuário", () => {
    writeLastActivityAt("user-1", 12345);
    expect(window.localStorage.getItem(buildInactivityStorageKey("user-1"))).toBe(
      "12345",
    );
  });
});
