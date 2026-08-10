/**
 * 表示トークン（LegalDisplayToken）を ReactNode として描画する共通ヘルパー。
 *
 * 分数トークン（"数字/数字" パターン）を縦分数表示（.law-fraction）として描画する。
 * 本文・テーブルセル・リンクセグメントのすべてで同一の描画ロジックを使用する。
 */

import type { ReactNode } from "react";
import type { LegalDisplayToken } from "@/lib/article/legal-display-format";

/**
 * 単一トークンを縦分数または通常テキストとして描画する。
 *
 * @param token 表示トークン
 * @param key React key
 * @param textOffset セグメント内オフセット（リンクセグメント等で絶対位置へ変換するために使用）。デフォルトは 0。
 * @returns 縦分数 span または通常テキスト span
 */
export function renderTokenNode(
  token: LegalDisplayToken,
  key: string,
  textOffset: number = 0,
): ReactNode {
  const absStart = textOffset + token.sourceStart;
  const absEnd = textOffset + token.sourceEnd;

  // 分数パターン（"7/10" 等）は縦分数表示
  const isFraction =
    token.kind === "fraction" || /^\d+\/\d+$/.test(token.displayText);

  if (isFraction) {
    const [num, denom] = token.displayText.split("/");
    return (
      <span
        key={key}
        data-source-start={absStart}
        data-source-end={absEnd}
        data-source-kind={token.kind}
        className="law-fraction"
      >
        <span className="law-fraction__num">{num}</span>
        <span className="law-fraction__bar">/</span>
        <span className="law-fraction__denom">{denom}</span>
      </span>
    );
  }

  return (
    <span
      key={key}
      data-source-start={absStart}
      data-source-end={absEnd}
      data-source-kind={token.kind}
    >
      {token.displayText}
    </span>
  );
}

/**
 * トークン列を一括描画する（textOffset=0 の場合のショートカット）。
 */
export function renderTokenNodes(
  tokens: LegalDisplayToken[],
  keyPrefix: string,
  textOffset: number = 0,
): ReactNode[] {
  return tokens.map((token, i) => renderTokenNode(token, `${keyPrefix}-${i}`, textOffset));
}
