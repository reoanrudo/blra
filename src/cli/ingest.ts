#!/usr/bin/env tsx
/**
 * 取込パイプラインのCLIエントリ。
 *
 * Usage:
 *   npm run ingest                    # 建築基準法の現行版を取込
 *   npm run ingest -- 325AC0000000201 # law_id 指定
 *
 * M4 で HTTP API（POST /corpus/...）が追加された際は、
 * このスクリプトと同じ ingestSourceVersion() を呼ぶ薄いラッパーになる。
 */

import { db, closeDatabase } from "../db/connection.js";
import { ingestSourceVersion } from "../ingest/pipeline.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lawId = args.find((a) => !a.startsWith("-")) ?? "325AC0000000201";

  console.log(`=== 法令取込パイプライン ===`);
  console.log(`対象 lawId: ${lawId}\n`);

  try {
    const result = await ingestSourceVersion(db, lawId);

    console.log(`\n=== 取込結果 ===`);
    console.log(`  状態: ${result.status}`);
    console.log(`  sourceId: ${result.sourceId}`);
    console.log(`  sourceVersionId: ${result.sourceVersionId}`);
    console.log(`  contentHash: ${result.contentHash}`);
    console.log(`  segment数: ${result.segmentCount}`);
    console.log(`  抽出率: ${(result.extractionRate * 100).toFixed(2)}%`);
    console.log(`  rawObjectKey: ${result.rawObjectKey}`);

    if (result.validationErrors.length > 0) {
      console.log(`\n  Validation エラー・警告 (${result.validationErrors.length}件):`);
      for (const e of result.validationErrors) {
        console.log(`    [${e.level}] ${e.message}`);
      }
    }

    if (result.status === "INGESTED") {
      console.log(`\n✓ 取込完了（公開済み）`);
    } else if (result.status === "SKIPPED") {
      console.log(`\n→ スキップ（既存の同一版）`);
    } else {
      console.log(`\n⚠ Review待ち（公開されません）`);
    }
  } catch (err) {
    console.error("\n✗ 取込エラー:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

main();
