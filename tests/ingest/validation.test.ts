/**
 * validation.ts のユニットテスト。
 * 抽出率・文字化けチェック、Publish 可否判定を検証。
 * 設計書 §8.3 Validation。
 */
import { describe, it, expect } from "vitest";
import { validatePipeline, shouldPublish } from "../../src/ingest/validation.js";
import type { ValidationError } from "../../src/parser/types.js";
import type { ParseStats } from "../../src/parser/types.js";

describe("validatePipeline: 抽出率", () => {
  it("抽出率95%以上は warning 無し", () => {
    const stats: ParseStats = {
      totalChars: 10000,
      capturedChars: 9600,
      extractionRate: 0.96,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings).toHaveLength(0);
  });

  it("抽出率95%未満は warning", () => {
    const stats: ParseStats = {
      totalChars: 10000,
      capturedChars: 9000,
      extractionRate: 0.9,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings.length).toBeGreaterThan(0);
    expect(rateWarnings[0]!.level).toBe("warning");
  });

  it("抽出率0%（totalChars=0）は warning 無し（空データの境界）", () => {
    const stats: ParseStats = {
      totalChars: 0,
      capturedChars: 0,
      extractionRate: 1,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings).toHaveLength(0);
  });
});

describe("validatePipeline: 文字化け検出", () => {
  it("正常な本文は warning 無し", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const bodies = ["建築物の敷地は、道路に二メートル以上接しなければならない。"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings).toHaveLength(0);
  });

  it("C0制御文字の混入は warning", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    // タブ(0x09)・改行(LF)以外の制御文字が混入
    const bodies = ["テスト\x01\x02本文"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings.length).toBeGreaterThan(0);
  });

  it("タブ・改行は文字化け扱いしない", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const bodies = ["テスト\t本文\n次行"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings).toHaveLength(0);
  });
});

describe("validatePipeline: Parser層エラーの集約", () => {
  it("Parser の error がそのまま集約される", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const parserErrors: ValidationError[] = [
      { level: "error", message: "canonical_path 重複: art1" },
      { level: "warning", message: "本文が空: art2/para1" },
    ];
    const errors = validatePipeline(stats, parserErrors, ["正常本文"]);
    // Parser の error + warning が含まれる
    expect(errors.some((e) => e.message.includes("canonical_path 重複"))).toBe(true);
    expect(errors.some((e) => e.message.includes("本文が空"))).toBe(true);
  });
});

describe("shouldPublish", () => {
  it("error無し・warning閾値内は true", () => {
    const errors: ValidationError[] = [
      { level: "warning", message: "軽微な警告1" },
      { level: "warning", message: "軽微な警告2" },
    ];
    expect(shouldPublish(errors)).toBe(true);
  });

  it("error 1件でもあれば false", () => {
    const errors: ValidationError[] = [
      { level: "error", message: "重大エラー" },
    ];
    expect(shouldPublish(errors)).toBe(false);
  });

  it("warning が閾値（10件）超は false", () => {
    const errors: ValidationError[] = Array.from({ length: 11 }, (_, i) => ({
      level: "warning" as const,
      message: `警告${i}`,
    }));
    expect(shouldPublish(errors)).toBe(false);
  });

  it("error無し・warning10件ちょうどは true", () => {
    const errors: ValidationError[] = Array.from({ length: 10 }, (_, i) => ({
      level: "warning" as const,
      message: `警告${i}`,
    }));
    expect(shouldPublish(errors)).toBe(true);
  });

  it("エラー・警告ゼロは true", () => {
    expect(shouldPublish([])).toBe(true);
  });
});
