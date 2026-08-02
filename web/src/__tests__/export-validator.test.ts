import { describe, it, expect } from "vitest";
import {
  computeChecksum,
  validateChecksum,
  validateBackupVersion,
  validateEnvelope,
  refKey,
  collectArticleRefs,
} from "@/lib/practice/export-validator";

// ─── computeChecksum ───

describe("computeChecksum", () => {
  it("computes a sha256: prefix hex string", () => {
    const cs = computeChecksum({ checksum: "ignored", a: 1, b: 2 });
    expect(cs).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("excludes checksum field from hash input", () => {
    const a = { checksum: "different", a: 1, b: 2 };
    const b = { checksum: "other", a: 1, b: 2 };
    expect(computeChecksum(a)).toBe(computeChecksum(b));
  });

  it("sorts keys so order-invariant hash", () => {
    const a = { checksum: "x", foo: 1, bar: 2 };
    const b = { checksum: "x", bar: 2, foo: 1 };
    expect(computeChecksum(a)).toBe(computeChecksum(b));
  });

  it("produces different hashes for different data", () => {
    const a = computeChecksum({ checksum: "x", value: 1 });
    const b = computeChecksum({ checksum: "x", value: 2 });
    expect(a).not.toBe(b);
  });
});

// ─── validateChecksum ───

describe("validateChecksum", () => {
  it("returns ok for valid checksum", () => {
    const obj = { a: 1, b: "two" };
    const checksum = computeChecksum(obj);
    const signed = { ...obj, checksum };
    expect(validateChecksum(signed)).toEqual({ ok: true });
  });

  it("returns not ok for missing checksum", () => {
    expect(validateChecksum({ a: 1 })).toEqual({
      ok: false,
      error: "checksum is missing or not a string",
    });
  });

  it("returns not ok for non-string checksum", () => {
    const r = validateChecksum({ checksum: 12345 });
    expect(r.ok).toBe(false);
  });

  it("returns not ok for mismatched checksum", () => {
    const signed = {
      a: 1,
      checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    };
    const r = validateChecksum(signed);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("checksum mismatch");
  });
});

// ─── validateBackupVersion ───

describe("validateBackupVersion", () => {
  it("accepts major version 1", () => {
    expect(validateBackupVersion("1.0.0")).toEqual({ ok: true });
    expect(validateBackupVersion("1.2.3")).toEqual({ ok: true });
    expect(validateBackupVersion("1")).toEqual({ ok: true });
  });

  it("rejects missing or non-string", () => {
    expect(validateBackupVersion("").ok).toBe(false);
    expect(validateBackupVersion(undefined as unknown as string).ok).toBe(false);
  });

  it("rejects major version mismatch", () => {
    const r = validateBackupVersion("2.0.0");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("backupVersion major must be 1");
  });
});

// ─── validateEnvelope ───

describe("validateEnvelope", () => {
  const validEnvelope = () => {
    const payload = {
      backupVersion: "1.0.0",
      schemaVersion: "mvp-1",
      exportDate: "2026-05-09T00:00:00Z",
      exportType: "full",
    };
    return { ...payload, checksum: computeChecksum(payload) };
  };

  it("accepts a valid envelope", () => {
    const r = validateEnvelope(validEnvelope());
    expect(r.ok).toBe(true);
    expect(r.fatal).toBe(false);
  });

  it("FATAL when input is not an object", () => {
    const r = validateEnvelope("not an object");
    expect(r.fatal).toBe(true);
    expect(r.errors[0].message).toContain("object");
  });

  it("FATAL when input is an array", () => {
    const r = validateEnvelope([1, 2, 3]);
    expect(r.fatal).toBe(true);
  });

  it("FATAL when required string fields are missing", () => {
    const r = validateEnvelope({});
    expect(r.fatal).toBe(true);
    expect(r.errors.some((e) => e.message.includes("backupVersion"))).toBe(true);
    expect(r.errors.some((e) => e.message.includes("schemaVersion"))).toBe(true);
  });

  it("FATAL when backupVersion major is not 1", () => {
    const env = validEnvelope();
    env.backupVersion = "2.0.0";
    env.checksum = computeChecksum(env);
    const r = validateEnvelope(env);
    expect(r.fatal).toBe(true);
    expect(r.errors.some((e) => e.message.includes("backupVersion"))).toBe(true);
  });

  it("FATAL on checksum mismatch", () => {
    const env = validEnvelope();
    env.checksum = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const r = validateEnvelope(env);
    expect(r.fatal).toBe(true);
    expect(r.errors.some((e) => e.message.includes("checksum"))).toBe(true);
  });

  it("WARNING on unknown exportType (not fatal)", () => {
    const env = validEnvelope();
    env.exportType = "weird";
    env.checksum = computeChecksum(env);
    const r = validateEnvelope(env);
    // WARNING only — not fatal
    expect(r.fatal).toBe(false);
    expect(r.errors.some((e) => e.level === "WARNING")).toBe(true);
  });
});

// ─── refKey ───

describe("refKey", () => {
  it("concatenates lawId and articleNumberNormalized with colon", () => {
    expect(refKey("lawA", "87")).toBe("lawA:87");
    expect(refKey("lawA", "128の3")).toBe("lawA:128の3");
  });
});

// ─── collectArticleRefs ───

describe("collectArticleRefs", () => {
  it("extracts refs from projects → checkItems", () => {
    const refs = collectArticleRefs({
      projects: [
        {
          checkItems: [
            { lawId: "L1", articleNumberNormalized: "1" },
            { lawId: "L1", articleNumberNormalized: "87" },
          ],
        },
      ],
    });
    expect(refs).toHaveLength(2);
    expect(refs.some((r) => r.lawId === "L1" && r.articleNumberNormalized === "87")).toBe(true);
  });

  it("extracts refs from highlights", () => {
    const refs = collectArticleRefs({
      highlights: [
        { lawId: "L1", articleNumberNormalized: "1", color: "red" },
      ],
    });
    expect(refs).toHaveLength(1);
  });

  it("extracts refs from tags", () => {
    const refs = collectArticleRefs({
      tags: [{ lawId: "L1", articleNumberNormalized: "87", tagName: "防火" }],
    });
    expect(refs).toHaveLength(1);
  });

  it("extracts refs from packs → items", () => {
    const refs = collectArticleRefs({
      packs: [
        { items: [{ lawId: "L1", articleNumberNormalized: "10" }] },
      ],
    });
    expect(refs).toHaveLength(1);
  });

  it("extracts refs from drawingNoteTemplates", () => {
    const refs = collectArticleRefs({
      drawingNoteTemplates: [
        { lawId: "L1", articleNumberNormalized: "87" },
      ],
    });
    expect(refs).toHaveLength(1);
  });

  it("extracts refs from practiceTopics → articleRefs", () => {
    const refs = collectArticleRefs({
      practiceTopics: [
        {
          name: "排煙",
          articleRefs: [
            { lawId: "L1", articleNumberNormalized: "35" },
            { lawId: "L1", articleNumberNormalized: "36" },
          ],
        },
      ],
    });
    expect(refs).toHaveLength(2);
  });

  it("deduplicates identical refs", () => {
    const refs = collectArticleRefs({
      highlights: [{ lawId: "L1", articleNumberNormalized: "87" }],
      tags: [{ lawId: "L1", articleNumberNormalized: "87" }],
      projects: [
        { checkItems: [{ lawId: "L1", articleNumberNormalized: "87" }] },
      ],
    });
    expect(refs).toHaveLength(1);
  });

  it("returns empty array for empty/skippable data", () => {
    expect(collectArticleRefs({})).toEqual([]);
    expect(collectArticleRefs({ unknownKey: "nope" })).toEqual([]);
  });
});
