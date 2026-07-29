/**
 * F-2: e-Gov Parser Spike
 *
 * 合格条件（設計書 §15.2）: 法令標準XML から条・項・号の抽出率 99% 以上。
 *
 * 使い方:
 *   npm run f2                      … 建築基準法・施行令・施行規則を検証
 *   npm run f2 -- --law 325AC0000000201
 */

import { writeFile, mkdir } from "node:fs/promises";
import { getLawData, getRevisions, findFirst } from "../lib/egov.js";
import { segment, validate } from "../lib/segment.js";

const TARGETS = [
  { id: "325AC0000000201", name: "建築基準法" },
  { id: "325CO0000000338", name: "建築基準法施行令" },
  { id: "325M50004000040", name: "建築基準法施行規則" },
];

const PASS_RATE = 0.99;

async function run(lawId: string, name: string) {
  const revs = await getRevisions(lawId);

  // 施行日が確定している版のうち最新（設計書 §4.2: valid_from_status = FIXED）
  const fixed = revs.revisions.filter((r) => r.amendment_enforcement_date);
  const latest = fixed.sort((a, b) =>
    (a.amendment_enforcement_date ?? "").localeCompare(
      b.amendment_enforcement_date ?? "",
    ),
  ).at(-1);
  if (!latest) throw new Error(`${name}: 施行日確定版が存在しない`);

  const data = await getLawData(latest.law_revision_id);
  const body = findFirst(data.law_full_text, "LawBody");
  if (!body) throw new Error(`${name}: LawBody が見つからない`);

  const result = segment(body);
  const errors = validate(result.provisions);

  const rate = result.capturedChars / result.totalChars;
  const byType = new Map<string, number>();
  for (const p of result.provisions) {
    byType.set(p.provisionType, (byType.get(p.provisionType) ?? 0) + 1);
  }

  console.log(`\n━━━ ${name} (${lawId}) ━━━`);
  console.log(`版: ${latest.law_revision_id}`);
  console.log(`施行日: ${latest.amendment_enforcement_date}`);
  console.log(
    `条項数: ${result.provisions.length}  ` +
      [...byType].map(([k, v]) => `${k}=${v}`).join(" "),
  );
  console.log(
    `抽出率: ${(rate * 100).toFixed(2)}% ` +
      `(${result.capturedChars.toLocaleString()} / ${result.totalChars.toLocaleString()} 文字)` +
      `  ${rate >= PASS_RATE ? "PASS" : "FAIL"}`,
  );

  if (result.uncaptured.length > 0) {
    console.log("未取込テキスト（多い順・上位5件）:");
    for (const u of result.uncaptured.slice(0, 5)) {
      console.log(`  ${u.tag.padEnd(22)} ${String(u.chars).padStart(7)} 文字  "${u.sample}"`);
    }
  }

  if (errors.length > 0) {
    console.log("Validation エラー:");
    for (const e of errors) console.log(`  - ${e}`);
  } else {
    console.log("Validation: エラーなし");
  }

  return {
    lawId,
    name,
    revisionId: latest.law_revision_id,
    enforcementDate: latest.amendment_enforcement_date,
    provisionCount: result.provisions.length,
    byType: Object.fromEntries(byType),
    extractionRate: rate,
    pass: rate >= PASS_RATE && errors.length === 0,
    uncaptured: result.uncaptured.slice(0, 10),
    errors,
  };
}

const argLaw = process.argv.indexOf("--law");
const targets =
  argLaw >= 0 && process.argv[argLaw + 1]
    ? [{ id: process.argv[argLaw + 1]!, name: process.argv[argLaw + 1]! }]
    : TARGETS;

const results = [];
for (const t of targets) {
  try {
    results.push(await run(t.id, t.name));
  } catch (e) {
    console.error(`\n${t.name}: 失敗 — ${(e as Error).message}`);
    results.push({ lawId: t.id, name: t.name, pass: false, error: String(e) });
  }
}

await mkdir("out", { recursive: true });
await writeFile("out/f2-result.json", JSON.stringify(results, null, 2));

const passed = results.filter((r) => r.pass).length;
console.log(`\n━━━ F-2 判定: ${passed}/${results.length} PASS ━━━`);
console.log("詳細: spikes/out/f2-result.json");
process.exit(passed === results.length ? 0 : 1);
