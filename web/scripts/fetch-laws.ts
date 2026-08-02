#!/usr/bin/env npx tsx
/**
 * e-Gov 法令API v2 から取込対象法令のXMLを一括取得するスクリプト
 *
 * Usage:
 *   npx tsx scripts/fetch-laws.ts            # 全法令取得
 *   npx tsx scripts/fetch-laws.ts <lawId>    # 指定法令のみ取得
 *   npx tsx scripts/fetch-laws.ts --force    # 既存ファイルを上書き
 *
 * 出力先: spikes/001-xml-parse/data/law-book-2026/<egovLawId>.xml
 *
 * e-Govのダウンロード原本を変換せず保存し、SHA-256はseed時に記録する。
 */

import * as fs from "fs";
import * as path from "path";
import { LAWS } from "./laws-config";
import { officialLawDataUrl } from "./law-book-2026";

export const DATA_DIR = path.join(
  __dirname,
  "..",
  "spikes",
  "001-xml-parse",
  "data",
  "law-book-2026",
);

interface FetchResult {
  lawId: string;
  status: "ok" | "skip" | "error";
  size?: number;
  error?: string;
}

/**
 * e-Gov API v2の法令本文ファイル取得APIから公式XMLを取得する。
 * asof=2026-01-01を固定し、最新版への意図しない追従を防ぐ。
 */
async function fetchLawXml(lawId: string): Promise<string> {
  const url = officialLawDataUrl(lawId);
  const resp = await fetch(url, {
    headers: { Accept: "application/xml" },
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const rawXml = await resp.text();

  // バリデーション: e-Gov法令標準XMLのルートと本文が含まれること
  if (!rawXml.includes("<Law ") || !rawXml.includes("<MainProvision")) {
    throw new Error("Invalid XML structure (Law/MainProvision missing)");
  }
  return rawXml;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const specificLawId = args.find((a) => !a.startsWith("--"));

  // 出力ディレクトリ確保
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const targets = specificLawId
    ? LAWS.filter((l) => l.egovLawId === specificLawId)
    : LAWS;

  if (targets.length === 0) {
    console.error(`ERROR: lawId ${specificLawId} が見つかりません`);
    process.exit(1);
  }

  console.log(`=== e-Gov 法令XML取得 ===`);
  console.log(`対象: ${targets.length} 法令${force ? " (強制上書き)" : ""}\n`);

  const results: FetchResult[] = [];

  for (const law of targets) {
    const filePath = path.join(DATA_DIR, `${law.egovLawId}.xml`);
    const shortName = law.shortName.padEnd(12);

    // 既存チェック
    if (!force && fs.existsSync(filePath)) {
      const size = fs.statSync(filePath).size;
      console.log(`  SKIP  ${shortName} ${law.egovLawId}  (既存: ${(size / 1024).toFixed(1)}KB)`);
      results.push({ lawId: law.egovLawId, status: "skip", size });
      continue;
    }

    // 取得
    process.stdout.write(`  FETCH ${shortName} ${law.egovLawId} ... `);
    try {
      const xml = await fetchLawXml(law.egovLawId);
      fs.writeFileSync(filePath, xml, "utf-8");
      const sizeKB = (xml.length / 1024).toFixed(1);
      console.log(`OK (${sizeKB}KB)`);
      results.push({ lawId: law.egovLawId, status: "ok", size: xml.length });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERROR: ${msg}`);
      results.push({ lawId: law.egovLawId, status: "error", error: msg });
    }

    // e-Gov API への負荷を避けるため少し待つ
    await new Promise((r) => setTimeout(r, 500));
  }

  // サマリ
  const ok = results.filter((r) => r.status === "ok").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const err = results.filter((r) => r.status === "error").length;
  const totalSize = results.reduce((sum, r) => sum + (r.size ?? 0), 0);

  console.log(`\n=== サマリ ===`);
  console.log(`  OK: ${ok} / SKIP: ${skip} / ERROR: ${err}`);
  console.log(`  総サイズ: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  出力先: ${DATA_DIR}`);

  if (err > 0) {
    console.log(`\n⚠ ${err} 件のエラー:`);
    results.filter((r) => r.status === "error").forEach((r) => {
      console.log(`  - ${r.lawId}: ${r.error}`);
    });
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
