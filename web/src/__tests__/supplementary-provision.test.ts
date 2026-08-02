import { describe, expect, it } from "vitest";
import {
  extractSupplementaryProvisionMetadataFromXml,
  supplementaryProvisionMetadataFromNode,
  supplementaryProvisionSystemTags,
  supplementaryProvisionTitle,
} from "../../scripts/lib/supplementary-provision";
import { computeArticleContentChecksum } from "../../scripts/lib/article-content-checksum";

describe("附則メタデータ", () => {
  it("制定時附則を識別する", () => {
    const metadata = supplementaryProvisionMetadataFromNode({
      SupplProvisionLabel: "附　則",
    });

    expect(metadata).toEqual({
      amendLawNum: null,
      extract: false,
      sourceLabel: "附　則",
    });
    expect(supplementaryProvisionTitle(metadata)).toBe("制定時附則");
  });

  it("改正法番号と抄録区分を表示名と構造化タグへ反映する", () => {
    const metadata = supplementaryProvisionMetadataFromNode({
      "@_AmendLawNum": "昭和二六年六月一日法律第一七八号",
      "@_Extract": "true",
      SupplProvisionLabel: "附　則",
    });

    expect(supplementaryProvisionTitle(metadata)).toBe(
      "附則（昭和二六年六月一日法律第一七八号・抄）",
    );
    expect(supplementaryProvisionSystemTags(metadata)).toEqual({
      supplementaryProvision: {
        amendLawNum: "昭和二六年六月一日法律第一七八号",
        extract: true,
        sourceLabel: "附　則",
      },
    });
  });

  it("公式XMLの掲載順どおり附則メタデータを抽出する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <Law>
        <LawBody>
          <SupplProvision>
            <SupplProvisionLabel>附　則</SupplProvisionLabel>
          </SupplProvision>
          <SupplProvision AmendLawNum="平成一六年法律第六七号" Extract="true">
            <SupplProvisionLabel>附　則</SupplProvisionLabel>
          </SupplProvision>
        </LawBody>
      </Law>`;

    expect(extractSupplementaryProvisionMetadataFromXml(xml)).toEqual([
      { amendLawNum: null, extract: false, sourceLabel: "附　則" },
      {
        amendLawNum: "平成一六年法律第六七号",
        extract: true,
        sourceLabel: "附　則",
      },
    ]);
  });

  it("附則の構造化タグが変わればArticle checksumも変わる", () => {
    const base = {
      level: "suppl_provision",
      articleNumber: null,
      paragraphNumber: null,
      itemNumber: null,
      subitemNumber: null,
      title: "附則（平成一六年法律第六七号・抄）",
      caption: null,
      text: "附　則",
      systemTags: null,
    };

    const withoutMetadata = computeArticleContentChecksum(base);
    const withMetadata = computeArticleContentChecksum({
      ...base,
      systemTags: {
        supplementaryProvision: {
          amendLawNum: "平成一六年法律第六七号",
          extract: true,
          sourceLabel: "附　則",
        },
      },
    });

    expect(withMetadata).not.toBe(withoutMetadata);
    expect(withMetadata).toMatch(/^[a-f0-9]{64}$/);
  });
});
