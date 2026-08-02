import { createHash } from "crypto";

export interface ArticleContentChecksumInput {
  level: string;
  articleNumber: string | null;
  paragraphNumber: string | null;
  itemNumber: string | null;
  subitemNumber: string | null;
  title: string | null;
  caption: string | null;
  text: string | null;
  systemTags: Record<string, unknown> | null;
}

export function computeArticleContentChecksum(
  input: ArticleContentChecksumInput,
): string {
  const payload: Record<string, unknown> = {
    level: input.level,
    articleNumber: input.articleNumber,
    paragraphNumber: input.paragraphNumber,
    itemNumber: input.itemNumber,
    subitemNumber: input.subitemNumber,
    title: input.title,
    caption: input.caption,
    text: input.text,
  };
  if (input.systemTags !== null) payload.systemTags = input.systemTags;

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
