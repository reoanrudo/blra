#!/usr/bin/env npx tsx
/** ビルド済みNext.jsを実起動し、2026年版の主要導線をHTTP境界で検証する。 */

import { spawn } from "child_process";

const PORT = 3127;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface LawResponse {
  id: string;
  name: string;
  displayOrder: number;
  printedTitle: string;
  firstArticleId: string;
}

/** 法令一覧API応答（設計書§4.1: editionKey + laws。Task 14: corpusVersion 追加） */
interface LawListApiResponse {
  editionKey: string;
  corpusVersion: string;
  laws: LawResponse[];
}

interface SearchResponse {
  results: Array<{ lawName: string; caption: string | null }>;
}

interface TocResponse {
  id: string;
  parentId: string | null;
  level: string;
  title: string | null;
  articleNumber: string | null;
}

/** 目次API応答（設計書§4.2: lawRevisionId + nodes） */
interface TocApiResponse {
  lawRevisionId: string | null;
  editionKey: string;
  nodes: TocResponse[];
}

interface LawsExportResponse {
  laws: Array<{ lawId: string; name: string }>;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/laws`);
      if (response.ok) return;
    } catch {
      // 起動中は接続エラーを許容する。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("本番サーバーが30秒以内に起動しませんでした");
}

async function main(): Promise<void> {
  const output: string[] = [];
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  try {
    await waitUntilReady();
    const lawsResponse = await fetch(`${BASE_URL}/api/laws`);
    assert(lawsResponse.status === 200, `/api/laws status=${lawsResponse.status}`);
    const lawsBody = (await lawsResponse.json()) as LawListApiResponse;
    const laws = lawsBody.laws;
    assert(laws.length === 120, `法令一覧が120件ではありません: ${laws.length}`);
    assert(
      typeof lawsBody.corpusVersion === "string" && lawsBody.corpusVersion.length > 0,
      `corpusVersion が空です: ${String(lawsBody.corpusVersion)}`,
    );
    assert(laws[0].displayOrder === 1 && laws[119].displayOrder === 120, "掲載順が不正です");

    const last = laws[119];
    // isCurrent 廃止後: 法令一覧APIは articleId パラメータを受け取らない。
    // 代わりに firstArticleId で第120番法令が正しく解決できることを検証する。
    assert(!!last.firstArticleId, "第120番法令のfirstArticleIdがありません");
    assert(last.displayOrder === 120, `第120番法令のdisplayOrderが不正: ${last.displayOrder}`);

    const articleResponse = await fetch(
      `${BASE_URL}/articles/${encodeURIComponent(last.firstArticleId)}`,
    );
    const articleHtml = await articleResponse.text();
    assert(articleResponse.status === 200, `第120番本文 status=${articleResponse.status}`);
    assert(
      articleHtml.includes("広域的地域活性化のための基盤整備に関する法律"),
      "第120番法令の本文ページに法令名がありません",
    );

    const allowedLawNames = new Set(laws.map((law) => law.name));
    const searchResponse = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent("消防法施行規則")}`);
    assert(searchResponse.status === 200, `/api/search status=${searchResponse.status}`);
    const search = (await searchResponse.json()) as SearchResponse;
    assert(
      search.results.every((result) => allowedLawNames.has(result.lawName)),
      "検索結果に収録台帳外の法令が含まれています",
    );

    const civilCode = laws.find((law) => law.printedTitle === "民法（抄）");
    assert(civilCode !== undefined, "民法（抄）が法令一覧にありません");
    const civilTocResponse = await fetch(
      `${BASE_URL}/api/law-toc?lawId=${encodeURIComponent(civilCode.id)}`,
    );
    assert(civilTocResponse.status === 200, `/api/law-toc 民法 status=${civilTocResponse.status}`);
    const civilTocBody = (await civilTocResponse.json()) as TocApiResponse;
    const civilToc = civilTocBody.nodes;
    assert(civilToc.some((row) => row.articleNumber === "二百九"), "民法（抄）の掲載第209条が目次にありません");
    assert(!civilToc.some((row) => row.articleNumber === "二百八"), "民法（抄）の非掲載第208条が目次に混入しています");

    const architectsAct = laws.find((law) => law.printedTitle === "建築士法");
    assert(architectsAct !== undefined, "建築士法が法令一覧にありません");
    const architectsTocResponse = await fetch(
      `${BASE_URL}/api/law-toc?lawId=${encodeURIComponent(architectsAct.id)}`,
    );
    assert(architectsTocResponse.status === 200, `/api/law-toc 建築士法 status=${architectsTocResponse.status}`);
    const architectsTocBody = (await architectsTocResponse.json()) as TocApiResponse;
    const architectsToc = architectsTocBody.nodes;
    const supplementGroups = architectsToc.filter((row) => row.level === "supplement_group");
    assert(supplementGroups.length === 1, `建築士法の附則グループが1件ではありません: ${supplementGroups.length}`);
    assert(supplementGroups[0].title === "附則・経過措置（44件）", "建築士法の附則グループ名が不正です");
    const supplements = architectsToc.filter(
      (row) => row.level === "suppl_provision" && row.parentId === supplementGroups[0].id,
    );
    assert(supplements.length === 44, `建築士法の附則が44件ではありません: ${supplements.length}`);
    assert(supplements.some((row) => row.title === "制定時附則"), "建築士法の制定時附則が識別できません");
    assert(supplements.some((row) => row.title?.endsWith("・抄）")), "建築士法の改正附則（抄）が識別できません");

    const supplementSearchResponse = await fetch(
      `${BASE_URL}/api/search?q=${encodeURIComponent("昭和二六年六月一日法律第一七八号")}`,
    );
    assert(supplementSearchResponse.status === 200, "建築士法の改正附則検索に失敗しました");
    const supplementSearch = (await supplementSearchResponse.json()) as SearchResponse;
    assert(
      supplementSearch.results.some(
        (result) =>
          result.lawName === "建築士法" &&
          result.caption === "附則（昭和二六年六月一日法律第一七八号・抄）",
      ),
      "建築士法の改正法番号付き附則が検索結果にありません",
    );

    const supplementParagraphResponse = await fetch(
      `${BASE_URL}/articles/art_325ac1000000202_20260101_000678`,
    );
    const supplementParagraphHtml = await supplementParagraphResponse.text();
    assert(supplementParagraphResponse.status === 200, "建築士法の附則項ページにアクセスできません");
    assert(supplementParagraphHtml.includes("第1項"), "附則項の見出しが利用者向け表記ではありません");
    // 章スクロール表示では、附則の文脈（タイトル）と項見出しが別要素としてレンダリングされる。
    // 両方が同一ページに存在することで改正附則の文脈内にあることを検証する。
    assert(
      supplementParagraphHtml.includes("附則（昭和三〇年八月二二日法律第一七三号・抄）"),
      "附則項のページに改正附則の文脈（タイトル）がありません",
    );
    assert(!supplementParagraphHtml.includes(">paragraph<"), "内部階層名paragraphが画面に露出しています");

    const includedCivilSearchResponse = await fetch(
      `${BASE_URL}/api/search?q=${encodeURIComponent("故意又は過失によって他人の権利又は法律上保護される利益を侵害した者")}`,
    );
    assert(includedCivilSearchResponse.status === 200, "民法掲載条文の検索に失敗しました");
    const includedCivilSearch = (await includedCivilSearchResponse.json()) as SearchResponse;
    assert(
      includedCivilSearch.results.some((result) => result.lawName === "民法"),
      "民法（抄）の掲載第709条が検索結果にありません",
    );

    const excludedCivilSearchResponse = await fetch(
      `${BASE_URL}/api/search?q=${encodeURIComponent("胎児は、損害賠償の請求権については")}`,
    );
    assert(excludedCivilSearchResponse.status === 200, "民法非掲載条文の検索に失敗しました");
    const excludedCivilSearch = (await excludedCivilSearchResponse.json()) as SearchResponse;
    assert(
      !excludedCivilSearch.results.some((result) => result.lawName === "民法"),
      "民法（抄）の非掲載第721条が検索結果に混入しています",
    );

    const exportResponse = await fetch(`${BASE_URL}/api/export?type=laws`);
    assert(exportResponse.status === 200, `/api/export?type=laws status=${exportResponse.status}`);
    const lawsExport = (await exportResponse.json()) as LawsExportResponse;
    assert(lawsExport.laws.length === 120, `法令exportが120件ではありません: ${lawsExport.laws.length}`);
    assert(
      lawsExport.laws.every((law) => allowedLawNames.has(law.name)),
      "法令exportに収録台帳外の法令が含まれています",
    );

    console.log("E2E: 2026年版120件一覧・本文・検索・export・民法（抄）61条境界・建築士法44附則 OK");
  } catch (error) {
    console.error(output.slice(-20).join(""));
    throw error;
  } finally {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
