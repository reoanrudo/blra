/**
 * F-5: Version Diff Spike
 *
 * 合格条件（設計書 §15.2）:
 *   同一法令の2版以上を取得し、Provision 単位の差分を再現できること。
 *   施行日情報の取得可能性を確認すること。
 *
 * あわせて §6.2 の Anchor 移行状態（EXACT / MAPPED / REVIEW_REQUIRED）と
 * 横断テスト T-02（Anchor 安定性）の実データでの成立を確認する。
 *
 *   npm run f5
 */

import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { getLawData, getRevisions, findFirst } from "../lib/egov.js";
import { segment, type Provision } from "../lib/segment.js";

const LAW_ID = "325AC0000000201";
const LAW_NAME = "建築基準法";

/** 設計書 §6.1 の content_fingerprint 相当 */
function fingerprint(body: string): string {
  return createHash("sha256")
    .update(body.replace(/\s/g, ""))
    .digest("hex")
    .slice(0, 16);
}

type DiffResult = {
  from: string;
  to: string;
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
  /** 本文が一致したまま path が変わったもの（条番号繰下げ等）＝ §6.2 の MAPPED */
  moved: { fromPath: string; toPath: string }[];
};

function diff(
  oldPs: Provision[],
  newPs: Provision[],
  fromLabel: string,
  toLabel: string,
): DiffResult {
  const oldMap = new Map(oldPs.map((p) => [p.canonicalPath, p]));
  const newMap = new Map(newPs.map((p) => [p.canonicalPath, p]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const [path, np] of newMap) {
    const op = oldMap.get(path);
    if (!op) {
      added.push(path);
    } else if (fingerprint(op.body) !== fingerprint(np.body)) {
      changed.push(path);
    } else {
      unchanged++;
    }
  }
  for (const path of oldMap.keys()) {
    if (!newMap.has(path)) removed.push(path);
  }

  // 消えた path の本文が、増えた path に同一内容で現れていれば「移動」
  const addedByFp = new Map<string, string>();
  for (const path of added) {
    const body = newMap.get(path)!.body;
    if (body.length > 30) addedByFp.set(fingerprint(body), path);
  }
  const moved: { fromPath: string; toPath: string }[] = [];
  for (const path of removed) {
    const body = oldMap.get(path)!.body;
    if (body.length <= 30) continue;
    const hit = addedByFp.get(fingerprint(body));
    if (hit) moved.push({ fromPath: path, toPath: hit });
  }

  return { from: fromLabel, to: toLabel, added, removed, changed, unchanged, moved };
}

async function load(revisionId: string) {
  const data = await getLawData(revisionId);
  const body = findFirst(data.law_full_text, "LawBody")!;
  return segment(body).provisions;
}

// ── 版一覧の取得と施行日情報の確認 ─────────────────────
const revs = await getRevisions(LAW_ID);
const fixed = revs.revisions
  .filter((r) => r.amendment_enforcement_date)
  .sort((a, b) =>
    (a.amendment_enforcement_date ?? "").localeCompare(
      b.amendment_enforcement_date ?? "",
    ),
  );

console.log(`━━━ ${LAW_NAME}: 版情報 ━━━`);
console.log(`全 ${revs.revisions.length} 版 / 施行日が確定した版 ${fixed.length} 版`);

const undetermined = revs.revisions.filter(
  (r) => !r.amendment_enforcement_date && r.amendment_scheduled_enforcement_date,
);
console.log(
  `施行日未確定の版: ${undetermined.length} 件` +
    (undetermined.length
      ? `（例: ${undetermined[0]!.amendment_scheduled_enforcement_date}）`
      : ""),
);

const today = new Date().toISOString().slice(0, 10);
const future = fixed.filter((r) => (r.amendment_enforcement_date ?? "") > today);
console.log(`未施行の版（${today} 時点）: ${future.length} 件`);
for (const f of future) {
  console.log(`  ${f.amendment_enforcement_date}  ${f.amendment_law_num ?? ""}`);
}

// ── 差分の検証 ───────────────────────────────────
const pairs: [number, number][] = [
  [fixed.length - 3, fixed.length - 2], // 隣接版
  [fixed.length - 2, fixed.length - 1], // 隣接版（最新）
  [0, fixed.length - 1], // 最古 ↔ 最新（Anchor 安定性の負荷試験）
];

const results: DiffResult[] = [];
const cache = new Map<string, Provision[]>();

for (const [i, j] of pairs) {
  const a = fixed[i]!;
  const b = fixed[j]!;
  for (const r of [a, b]) {
    if (!cache.has(r.law_revision_id)) {
      cache.set(r.law_revision_id, await load(r.law_revision_id));
    }
  }
  const d = diff(
    cache.get(a.law_revision_id)!,
    cache.get(b.law_revision_id)!,
    a.amendment_enforcement_date!,
    b.amendment_enforcement_date!,
  );
  results.push(d);

  const total = d.unchanged + d.changed.length + d.added.length;
  const stable = total ? d.unchanged / total : 0;
  console.log(`\n━━━ ${d.from} → ${d.to} ━━━`);
  console.log(
    `変更なし ${d.unchanged} / 変更 ${d.changed.length} / 追加 ${d.added.length} / 削除 ${d.removed.length}`,
  );
  console.log(`Anchor 安定率: ${(stable * 100).toFixed(2)}%`);
  if (d.moved.length > 0) {
    console.log(`本文同一のまま path が移動（§6.2 MAPPED 相当）: ${d.moved.length} 件`);
    for (const m of d.moved.slice(0, 5)) {
      console.log(`  ${m.fromPath} → ${m.toPath}`);
    }
  }
  if (d.changed.length > 0) {
    console.log(`変更された条項の例: ${d.changed.slice(0, 5).join(", ")}`);
  }
  if (d.added.length > 0) {
    console.log(`追加された条項の例: ${d.added.slice(0, 5).join(", ")}`);
  }
}

await mkdir("out", { recursive: true });
await writeFile(
  "out/f5-result.json",
  JSON.stringify(
    {
      totalRevisions: revs.revisions.length,
      fixedRevisions: fixed.length,
      undeterminedCount: undetermined.length,
      futureCount: future.length,
      diffs: results.map((r) => ({
        ...r,
        added: r.added.slice(0, 30),
        removed: r.removed.slice(0, 30),
        changed: r.changed.slice(0, 30),
      })),
    },
    null,
    2,
  ),
);

// 判定: 隣接版で差分が再現でき、全変更が分類できていること
const adjacent = results.slice(0, 2);
const pass = adjacent.every(
  (d) => d.unchanged > 0 && d.changed.length + d.added.length + d.removed.length > 0,
);
console.log(`\n詳細: spikes/out/f5-result.json`);
console.log(`━━━ F-5 判定: ${pass ? "PASS" : "FAIL"} ━━━`);
process.exit(pass ? 0 : 1);
