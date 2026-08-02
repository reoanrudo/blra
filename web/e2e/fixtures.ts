import { test as base, expect } from "@playwright/test";

/**
 * E2Eテスト共通fixture（設計書§10）
 *
 * ベースURLは環境変数 E2E_BASE_URL または localhost:3000。
 * テスト用Article IDは建築基準法の最初の条を使用する。
 */
export const TEST_ARTICLE_ID =
  process.env.E2E_ARTICLE_ID ?? "art_325ac0000000201_20260101_000002";

export const DEEP_TEST_ARTICLE_ID =
  process.env.E2E_DEEP_ARTICLE_ID ?? "art_325ac0000000201_20260101_000203";

export const CHAPTER1_LAST_ARTICLE_ID =
  process.env.E2E_CHAPTER1_LAST_ARTICLE_ID ??
  "art_325ac0000000201_20260101_000429";

export const CHAPTER2_SCOPE_ID =
  process.env.E2E_CHAPTER2_SCOPE_ID ??
  "art_325ac0000000201_20260101_000433";

export const CHAPTER2_FIRST_ARTICLE_ID =
  process.env.E2E_CHAPTER2_FIRST_ARTICLE_ID ??
  "art_325ac0000000201_20260101_000434";

export const LAW_LAST_ARTICLE_ID =
  process.env.E2E_LAW_LAST_ARTICLE_ID ??
  "art_325ac0000000201_20260101_002605";

export const ARTICLE_107_ID =
  process.env.E2E_ARTICLE_107_ID ??
  "art_325ac0000000201_20260101_001866";

export const PREVIOUS_SUPPLEMENT_ARTICLE_ID =
  process.env.E2E_PREVIOUS_SUPPLEMENT_ARTICLE_ID ??
  "art_325ac0000000201_20260101_002603";

export const test = base.extend({});

export { expect };
