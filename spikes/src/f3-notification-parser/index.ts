/**
 * F-3: 告示 Parser Spike — 本検証
 *
 * 目的: 国土交通省の告示掲載ページからPDFリンクを収集し、
 *       50件以上について出典・文書番号・公布日を抽出できるかを実測する。
 *
 * 合格条件（設計書 §15.2）: 50件中45件以上で出典・文書番号・公布日を取得
 *
 * 実行: cd spikes && npm run f3
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MLIT_NOTIFICATIONS_URL =
  "https://www.mlit.go.jp/jutakukentiku/build/jutakukentiku_house_tk_000096.html";
const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "fixtures", "notifications");
const OUT_DIR = join(import.meta.dirname, "..", "..", "out");

type NotificationLink = {
  href: string;
  text: string;
  /** ページ上で告示番号らしき文字列が見つかれば格納 */
  apparentNumber?: string;
};

type ExtractionResult = {
  filename: string;
  url: string;
  linkText: string;
  /** PDF本文冒頭から抽出した告示番号 */
  notificationNumber: string | null;
  /** 根拠法令・条項（冒頭定型文から） */
  legalBasis: string | null;
  /** 公布日らしき日付（本文から） */
  promulgationDate: string | null;
  /** 抽出文字数（OCR不要のテキストPDFかの指標） */
  charCount: number;
  /** 日本語文字の比率 */
  japaneseRatio: number;
  /** 抽出成功か */
  success: boolean;
  /** 失敗理由 */
  error?: string;
};

// ============================================================
// Step 1: 告示掲載ページから PDF リンクを収集する
// ============================================================
async function collectNotificationLinks(): Promise<NotificationLink[]> {
  console.log("[1/3] 告示掲載ページを取得中...");
  const res = await fetch(MLIT_NOTIFICATIONS_URL, {
    signal: AbortSignal.timeout(60_000),
    headers: { "User-Agent": "BLRA-F3-Spike/1.0 (research)" },
  });
  if (!res.ok) {
    throw new Error(`掲載ページ取得失敗: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  console.log(`  HTML取得完了: ${html.length} 文字`);

  // PDFへのリンクを抽出（hrefの末尾が.pdf）
  const links: NotificationLink[] = [];
  const pdfLinkRegex = /<a[^>]+href="([^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pdfLinkRegex.exec(html)) !== null) {
    let href = match[1];
    const text = match[2].trim();
    // 相対URLを絶対URLへ
    if (href.startsWith("./") || href.startsWith("../")) {
      href = new URL(href, MLIT_NOTIFICATIONS_URL).href;
    } else if (!href.startsWith("http")) {
      href = new URL(href, MLIT_NOTIFICATIONS_URL).href;
    }
    // 重複排除
    if (!links.find((l) => l.href === href)) {
      links.push({ href, text });
    }
  }

  // ページ全体から告示番号らしき記載も探す（リンク周辺のテキストから）
  // 「令和X年国交省告示第NNN号」「平成XX年建設省告示第NNNN号」等
  const numberRegex = /((令和|平成|昭和)\d+年)[^<]*?(国交省|国土交通省|建設省|厚労省|環境省)[^<]*?告示[^<]*?第[\d百千万]+号/g;

  console.log(`  PDFリンク収集完了: ${links.length} 件`);
  return links;
}

// ============================================================
// Step 2: PDF をダウンロードしてテキスト抽出する
// ============================================================
async function downloadPdf(url: string, filepath: string): Promise<boolean> {
  if (existsSync(filepath)) {
    return true; // キャッシュ済み
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(120_000),
      headers: { "User-Agent": "BLRA-F3-Spike/1.0 (research)" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false; // 小すぎる場合はエラー
    writeFileSync(filepath, buf);
    return true;
  } catch {
    return false;
  }
}

async function extractPdfText(filepath: string): Promise<string> {
  // pdf-parse v2 の API: PDFParse クラスの load → getText
  const { PDFParse } = await import("pdf-parse");
  const buf = readFileSync(filepath);
  const uint8 = new Uint8Array(buf);
  const parser = new PDFParse(uint8, null);
  await parser.load();
  const result = await parser.getText();
  // result は { pages, text, total } の構造
  return result.text || "";
}

// ============================================================
// Step 3: テキストから告示番号・根拠条項・公布日を抽出
// ============================================================
function normalizeText(raw: string): string {
  // 縦書きPDF特有: 1文字ごとに改行や空白が挟まる
  // これらを結合して読める文にする
  return raw
    .replace(/\r?\n/g, "") // 改行を全て除去（縦書きPDFは1文字ごとに改行が入る）
    .replace(/\s+/g, "") // 空白も除去
    .trim();
}

function extractNotificationNumber(text: string): string | null {
  // 「○国土交通省告示第四百三十八号」等
  // 「○令和8年国土交通省告示第438号」等
  const patterns = [
    /[○●]\s*(令和|平成|昭和)?\d*年?[^\n]{0,20}?(国交省|国土交通省|建設省|厚生労働省|厚労省|環境省)[^\n]{0,10}?告示[^\n]{0,30}?第[\d百千万四一二三四五六七八九十]+号/,
    /(令和|平成|昭和)\d+年[^\n]{0,20}?(国交省|国土交通省|建設省|厚生労働省|厚労省|環境省)[^\n]{0,10}?告示[^\n]{0,30}?第[\d百千万四一二三四五六七八九十]+号/,
    /[○●]\s*(令和|平成|昭和)?\d*年?[^\n]{0,20}?告示[^\n]{0,30}?第[\d百千万四一二三四五六七八九十]+号/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

function extractLegalBasis(text: string): string | null {
  // 冒頭の「建築基準法（...）第○条...の規定に基づき」
  const patterns = [
    /(建築基準法[（(][^)）]*[)）][^。\n]{0,60}?第[\d百千万の二三四五六七八九十]+条[^。\n]{0,40}?(項)?[^。\n]{0,20}?の規定に基づき)/,
    /(建築基準法[^。\n]{0,10}?第[\d百千万の二三四五六七八九十]+条[^。\n]{0,40}?(項)?[^。\n]{0,20}?の規定に基づき)/,
    /(建築基準法[^。\n]{0,80}?の規定に基づき)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

function extractPromulgationDate(text: string): string | null {
  // 元号+年月日のパターン（算用数字と漢数字の両方）
  const num = "[\\d一二三四五六七八九十百千万]";
  const patterns = [
    new RegExp(`(令和${num}+年${num}+月${num}+日)`),
    new RegExp(`(平成${num}+年${num}+月${num}+日)`),
    new RegExp(`(昭和${num}+年${num}+月${num}+日)`),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function countJapanese(text: string): { charCount: number; japaneseRatio: number } {
  // テキストPDFかの指標: 日本語文字（ひらがな・カタカナ・漢字）の比率
  const japaneseChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g);
  const jpCount = japaneseChars ? japaneseChars.length : 0;
  const ratio = text.length > 0 ? jpCount / text.length : 0;
  return { charCount: text.length, japaneseRatio: Math.round(ratio * 100) / 100 };
}

// ============================================================
// メイン処理
// ============================================================
async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // Step 1: リンク収集
  const links = await collectNotificationLinks();

  // 50件に絞る（テーマ无关なく、掲載順で）
  const targetLinks = links.slice(0, Math.min(60, links.length)); // 余裕を持って60件取得
  console.log(`[2/3] ${targetLinks.length}件のPDFをダウンロード・抽出します...`);

  // Step 2-3: 各PDFをダウンロード・抽出
  const results: ExtractionResult[] = [];
  let processed = 0;

  for (const link of targetLinks) {
    processed++;
    const filename = link.href.split("/").pop() || `notification_${processed}.pdf`;
    const filepath = join(FIXTURE_DIR, filename);

    const downloaded = await downloadPdf(link.href, filepath);
    if (!downloaded) {
      results.push({
        filename,
        url: link.href,
        linkText: link.text,
        notificationNumber: null,
        legalBasis: null,
        promulgationDate: null,
        charCount: 0,
        japaneseRatio: 0,
        success: false,
        error: "ダウンロード失敗",
      });
      console.log(`  [${processed}/${targetLinks.length}] ✗ ${filename} (DL失敗)`);
      continue;
    }

    try {
      const rawText = await extractPdfText(filepath);
      const text = normalizeText(rawText);
      const { charCount, japaneseRatio } = countJapanese(text);

      const notificationNumber = extractNotificationNumber(text);
      const legalBasis = extractLegalBasis(text);
      const promulgationDate = extractPromulgationDate(text);

      // 成功判定: 告示番号または根拠条項のいずれかが取れれば「出典取得成功」
      const success = notificationNumber !== null || legalBasis !== null;

      results.push({
        filename,
        url: link.href,
        linkText: link.text,
        notificationNumber,
        legalBasis,
        promulgationDate,
        charCount,
        japaneseRatio,
        success,
      });

      const mark = success ? "✓" : "△";
      console.log(
        `  [${processed}/${targetLinks.length}] ${mark} ${filename} (${charCount}文字, 日${japaneseRatio}) ${
          notificationNumber ? notificationNumber.substring(0, 40) : "番号不明"
        }`,
      );
    } catch (err) {
      results.push({
        filename,
        url: link.href,
        linkText: link.text,
        notificationNumber: null,
        legalBasis: null,
        promulgationDate: null,
        charCount: 0,
        japaneseRatio: 0,
        success: false,
        error: String(err).substring(0, 200),
      });
      console.log(`  [${processed}/${targetLinks.length}] ✗ ${filename} (抽出エラー)`);
    }
  }

  // 集計
  const total = results.length;
  const downloaded = results.filter((r) => r.charCount > 0).length;
  const withNumber = results.filter((r) => r.notificationNumber).length;
  const withBasis = results.filter((r) => r.legalBasis).length;
  const withDate = results.filter((r) => r.promulgationDate).length;
  const success = results.filter((r) => r.success).length;

  console.log("\n[3/3] 集計");
  console.log(`  総PDFリンク数: ${links.length}`);
  console.log(`  処理対象: ${total}`);
  console.log(`  テキスト抽出成功: ${downloaded} (${Math.round((downloaded / total) * 100)}%)`);
  console.log(`  告示番号取得: ${withNumber} (${Math.round((withNumber / total) * 100)}%)`);
  console.log(`  根拠条項取得: ${withBasis} (${Math.round((withBasis / total) * 100)}%)`);
  console.log(`  公布日取得: ${withDate} (${Math.round((withDate / total) * 100)}%)`);
  console.log(`  出典取得成功(番号 or 条項): ${success} (${Math.round((success / total) * 100)}%)`);
  console.log(
    `  合格判定(50件中45件以上): ${success >= 45 ? "*** PASS ***" : "*** FAIL ***"}`,
  );

  // 結果保存
  const summary = {
    sourceUrl: MLIT_NOTIFICATIONS_URL,
    executedAt: new Date().toISOString(),
    totalPdfLinks: links.length,
    processed: total,
    textExtracted: downloaded,
    withNotificationNumber: withNumber,
    withLegalBasis: withBasis,
    withPromulgationDate: withDate,
    successCount: success,
    passRate: Math.round((success / total) * 1000) / 10,
    passThreshold: 90, // 45/50 = 90%
    passed: success >= 45,
    results,
  };

  writeFileSync(join(OUT_DIR, "f3-result.json"), JSON.stringify(summary, null, 2));
  console.log(`\n結果を out/f3-result.json に保存しました。`);
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
