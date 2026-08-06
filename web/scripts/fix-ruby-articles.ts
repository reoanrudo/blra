/**
 * ルビ処理バグ修正後のデータ反映スクリプト（テキスト内容マッチング版）
 *
 * 戦略: 修正後パーサーで生成した正しいテキストから、ルビ親字を含む
 * 特徴的な部分文字列を抜き出し、DB内でその部分文字列を含まない行
 * （＝親字が欠落した旧テキスト）を特定して UPDATE する。
 *
 * 例: 新テキスト「跨線橋」→ DB内で「線橋」を含み「跨線橋」を含まない行
 *
 * 使用法: npx tsx scripts/fix-ruby-articles.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseLawXml } from "../src/lib/law-refresh/parse-law-xml";

const DATABASE_URL = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const REVISION_ID = "rev_325AC0000000201_20251201_507AC0000000035";
const XML_PATH =
  "spikes/001-xml-parse/data/law-book-2026/325AC0000000201.xml";

/**
 * ルビ親字を含む新テキストノードから、DB検索用の
 * {正しい文字列, 欠落時に現れる文字列} のペアを生成する。
 */
function findRubyReplacements(
  newText: string,
): { correct: string; broken: string }[] {
  const pairs: { correct: string; broken: string }[] = [];
  const checks: [string, string][] = [
    // [正しい文字列, 親字欠落時に現れる文字列]
    ["跨線橋", "線橋"],
    ["屎尿浄化槽", "尿浄化槽"],
    ["消火栓、", "消火、"],
    ["貯水槽其", "貯水其"],
    ["撚糸", "糸、"],
    ["砥石", "石、"],
    ["弗化", "化"],
    ["燐酸", "酸、"],
    ["蒼鉛", "鉛、"],
    ["砒素", "素化"],
    ["蒸溜産", "産物"],
    ["石膏", "膏、"],
    ["孔埋", "埋作"],
  ];
  for (const [correct, broken] of checks) {
    if (newText.includes(correct)) {
      pairs.push({ correct, broken });
    }
  }
  return pairs;
}

async function main() {
  console.log("=== ルビ修正データ反映スクリプト ===");

  const xml = readFileSync(XML_PATH, "utf-8");
  const doc = parseLawXml(xml, {
    lawId: "cms8p9kek0000jgn98cvenllv",
    egovLawId: "325AC0000000201",
    revisionId: REVISION_ID,
  });
  console.log(`再パース完了: ${doc.nodes.length}ノード`);

  // ルビ親字を含むノードと、その正しいテキストを抽出
  const rubyNodes = doc.nodes.filter((n) => {
    if (!n.text) return false;
    return findRubyReplacements(n.text).length > 0;
  });
  console.log(`ルビ親字を含むノード: ${rubyNodes.length}件`);

  let updated = 0;

  for (const node of rubyNodes) {
    const newText = node.text!;
    const replacements = findRubyReplacements(newText);

    for (const { correct, broken } of replacements) {
      // DB内で「broken」を含み「correct」を含まない行を検索
      // = 親字が欠落している行
      const rows = await prisma.$queryRaw<
        { id: string; text: string | null; stableNodeKey: string }[]
      >`
        SELECT id, text, "stableNodeKey"
        FROM "Article"
        WHERE "lawRevisionId" = ${REVISION_ID}
          AND "deletedAt" IS NULL
          AND text LIKE ${`%${broken}%`}
          AND text NOT LIKE ${`%${correct}%`}
      `;

      for (const row of rows) {
        if (!row.text) continue;
        // 旧テキストを新テキストで置換
        // 周辺の文脈で一意に特定できるか確認
        const oldText = row.text;
        // 新テキストの全体で UPDATE（同じ stableNodeKey のノードの正しいテキスト）
        // ただし、stableNodeKey が合わないので、テキスト内容で判断

        console.log(`\n更新対象: ${row.stableNodeKey}`);
        console.log(`  旧: ${oldText.slice(0, 120)}`);

        // 新テキスト全体で UPDATE
        // （新テキストは正しいルビ親字を含む完全な条文）
        // ただし、新旧で全く異なる行の誤爆を防ぐため、
        // 旧テキストの前後10文字と新テキストの対応部分が一致することを確認
        const brokenIdx = oldText.indexOf(broken);
        const before10 = oldText.slice(Math.max(0, brokenIdx - 10), brokenIdx);
        const after10 = oldText.slice(
          brokenIdx + broken.length,
          brokenIdx + broken.length + 10,
        );

        // 新テキスト内で同じ前後文脈があるか確認
        const correctIdx = newText.indexOf(correct);
        if (correctIdx < 0) continue;
        const newBefore10 = newText.slice(
          Math.max(0, correctIdx - 10),
          correctIdx,
        );
        const newAfter10 = newText.slice(
          correctIdx + correct.length,
          correctIdx + correct.length + 10,
        );

        if (before10 === newBefore10 && after10 === newAfter10) {
          console.log(`  新: ${newText.slice(0, 120)}`);
          await prisma.$executeRaw`
            UPDATE "Article"
            SET text = ${newText},
                "updatedAt" = NOW()
            WHERE id = ${row.id}
          `;
          updated++;
        } else {
          console.log(`  [SKIP] 前後文脈が不一致のため見送り`);
        }
      }
    }
  }

  console.log(`\n更新完了: ${updated}件`);
}

main()
  .catch((err) => {
    console.error("致命的エラー:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
