/**
 * F-6: Citation Resolver Spike
 *
 * 合格条件（設計書 §15.2）: 実引用 200 件で解決率 90% 以上。
 *
 * 解決率の定義:
 *   実コーパスの条文から抽出した明示的引用のうち、
 *   参照先の canonical_path が同一法令内に実在する割合。
 *   コーパス側に正解（実在する path 集合）があるため自己検証できる。
 *
 *   npm run f6
 */

import { writeFile, mkdir } from "node:fs/promises";
import { getLawData, getRevisions, findFirst } from "../lib/egov.js";
import { segment, type Provision } from "../lib/segment.js";
import { resolve, kanjiToNumber, parseQuery } from "../lib/citation.js";

const TARGETS = [
  { id: "325AC0000000201", name: "建築基準法", selfAbbrev: "@法" },
  { id: "325CO0000000338", name: "建築基準法施行令", selfAbbrev: "@令" },
];

const SAMPLE_SIZE = 200;
const PASS_RATE = 0.9;

// ── 単体確認: 漢数字変換 ─────────────────────────────
const kanjiCases: [string, number][] = [
  ["一", 1], ["十", 10], ["十二", 12], ["五十二", 52],
  ["百", 100], ["百十二", 112], ["二百一", 201],
  ["三百三十八", 338], ["千四百", 1400], ["二千", 2000],
];
let kanjiFail = 0;
for (const [input, expected] of kanjiCases) {
  const got = kanjiToNumber(input);
  if (got !== expected) {
    console.log(`  漢数字 NG: ${input} → ${got}（期待 ${expected}）`);
    kanjiFail++;
  }
}
console.log(
  `漢数字変換: ${kanjiCases.length - kanjiFail}/${kanjiCases.length} PASS`,
);

// ── 単体確認: 検索クエリの引用指定（§9.1） ──────────────
const queryCases: [string, string | null][] = [
  ["法35条", "art35"],
  ["令112条9項", "art112/para9"],
  ["建築基準法第35条", "art35"],
  ["第52条の2", "art52-2"],
  ["令第126条の2第1項", "art126-2/para1"],
  ["防火区画", null],
];
let queryFail = 0;
for (const [q, expected] of queryCases) {
  const got = parseQuery(q)?.provisionPath ?? null;
  if (got !== expected) {
    console.log(`  クエリ NG: "${q}" → ${got}（期待 ${expected}）`);
    queryFail++;
  }
}
console.log(
  `検索クエリ解釈: ${queryCases.length - queryFail}/${queryCases.length} PASS`,
);

// ── 実コーパスでの解決率 ────────────────────────────
type Sample = {
  law: string;
  from: string;
  rawText: string;
  path: string;
  resolved: boolean;
};

const samples: Sample[] = [];
const perLaw: Record<string, { total: number; ok: number }> = {};

for (const t of TARGETS) {
  const revs = await getRevisions(t.id);
  const latest = revs.revisions
    .filter((r) => r.amendment_enforcement_date)
    .sort((a, b) =>
      (a.amendment_enforcement_date ?? "").localeCompare(
        b.amendment_enforcement_date ?? "",
      ),
    )
    .at(-1)!;
  const data = await getLawData(latest.law_revision_id);
  const body = findFirst(data.law_full_text, "LawBody")!;
  const { provisions } = segment(body);

  // 同一法令内に実在する path の集合（正解データ）
  const existing = new Set(provisions.map((p) => p.canonicalPath));
  // 条レベルの path も正解に含める（art35 は art35/para1 の親）
  for (const p of provisions) {
    const art = p.canonicalPath.match(/^(art[\d-]+)/);
    if (art) existing.add(art[1]!);
  }

  perLaw[t.name] = { total: 0, ok: 0 };

  // 附則を除いた本則の条項から引用を集める
  const main: Provision[] = provisions.filter(
    (p) => !p.inSupplementary && p.body.length > 20,
  );

  for (const p of main) {
    const refs = resolve(p.body, {
      lawId: t.id,
      provisionPath: p.canonicalPath,
    });
    for (const r of refs) {
      if (r.resolutionMethod === "RELATIVE") continue; // 相対参照は別評価
      if (!r.provisionPath) continue;

      // 他法令への参照は、この法令のコーパスでは正誤を判定できないため除外する。
      // 「法」は施行令から見れば建築基準法であり、自身ではない。
      if (r.lawIdentity) {
        if (r.lawIdentity.startsWith("@")) {
          if (r.lawIdentity !== t.selfAbbrev) continue;
        } else if (r.lawIdentity !== t.id && !r.lawIdentity.includes(t.name)) {
          continue;
        }
      }

      const ok =
        existing.has(r.provisionPath) ||
        r.alternatePaths.some((p) => existing.has(p));
      perLaw[t.name]!.total++;
      if (ok) perLaw[t.name]!.ok++;
      if (samples.length < SAMPLE_SIZE * 3) {
        samples.push({
          law: t.name,
          from: p.canonicalPath,
          rawText: r.rawText,
          path: r.provisionPath,
          resolved: ok,
        });
      }
    }
  }
}

console.log("\n━━━ 実コーパスでの解決率 ━━━");
let total = 0;
let ok = 0;
for (const [name, v] of Object.entries(perLaw)) {
  const rate = v.total ? v.ok / v.total : 0;
  console.log(
    `${name}: ${v.ok}/${v.total} = ${(rate * 100).toFixed(1)}%`,
  );
  total += v.total;
  ok += v.ok;
}
const rate = total ? ok / total : 0;
console.log(
  `\n合計: ${ok}/${total} = ${(rate * 100).toFixed(1)}%  ` +
    `${rate >= PASS_RATE ? "PASS" : "FAIL"}（合格 ${PASS_RATE * 100}% / 標本 ${SAMPLE_SIZE} 件以上）`,
);

const failed = samples.filter((s) => !s.resolved);
if (failed.length > 0) {
  console.log(`\n未解決の例（先頭10件 / 全${failed.length}件）:`);
  for (const f of failed.slice(0, 10)) {
    console.log(`  ${f.law} ${f.from} 「${f.rawText}」→ ${f.path}`);
  }
}

await mkdir("out", { recursive: true });
await writeFile(
  "out/f6-result.json",
  JSON.stringify(
    { kanjiFail, queryFail, perLaw, total, ok, rate, failed: failed.slice(0, 50) },
    null,
    2,
  ),
);
console.log("\n詳細: spikes/out/f6-result.json");

const pass = rate >= PASS_RATE && total >= SAMPLE_SIZE && kanjiFail === 0 && queryFail === 0;
console.log(`━━━ F-6 判定: ${pass ? "PASS" : "FAIL"} ━━━`);
process.exit(pass ? 0 : 1);
