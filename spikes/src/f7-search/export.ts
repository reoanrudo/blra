/**
 * F-7 の準備: 実コーパスを TSV へ書き出して PostgreSQL へ投入する。
 *
 *   npm run f7:export
 *   psql -d blra_f7 -f spikes/sql/f7-search.sql
 */

import { writeFile, mkdir } from "node:fs/promises";
import { getLawData, getRevisions, findFirst } from "../lib/egov.js";
import { segment } from "../lib/segment.js";

const TARGETS = [
  { id: "325AC0000000201", name: "建築基準法" },
  { id: "325CO0000000338", name: "建築基準法施行令" },
  { id: "325M50004000040", name: "建築基準法施行規則" },
];

/** TSV 用のエスケープ。改行とタブを潰す。 */
function esc(s: string): string {
  return s.replace(/[\t\r\n]/g, " ").replace(/\\/g, "\\\\");
}

const rows: string[] = [];

for (const t of TARGETS) {
  const revs = await getRevisions(t.id);
  const fixed = revs.revisions
    .filter((r) => r.amendment_enforcement_date)
    .sort((a, b) =>
      (a.amendment_enforcement_date ?? "").localeCompare(
        b.amendment_enforcement_date ?? "",
      ),
    );
  const latest = fixed.at(-1)!;
  const data = await getLawData(latest.law_revision_id);
  const body = findFirst(data.law_full_text, "LawBody")!;
  const { provisions } = segment(body);

  for (const p of provisions) {
    if (!p.body && !p.heading) continue;
    rows.push(
      [
        t.id,
        esc(t.name),
        esc(p.canonicalPath),
        esc(p.stableLabel),
        p.provisionType,
        esc(p.heading),
        esc(p.body),
        latest.amendment_enforcement_date ?? "",
      ].join("\t"),
    );
  }
  console.log(`${t.name}: ${provisions.length} 条項`);
}

await mkdir("out", { recursive: true });
await writeFile("out/provisions.tsv", rows.join("\n") + "\n");
console.log(`\n出力: spikes/out/provisions.tsv（${rows.length} 行）`);
