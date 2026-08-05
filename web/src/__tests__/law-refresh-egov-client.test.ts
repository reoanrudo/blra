import { describe, expect, it, vi } from "vitest";
import {
  getLawVersionAt,
  getLawXmlAt,
  type EgovLawVersion,
} from "@/lib/law-refresh/egov-client";

const EGOV_BASE = "https://laws.e-gov.go.jp/api/2";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function xmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml" },
    ...init,
  });
}

const enforcedVersion: EgovLawVersion = {
  lawId: "325AC0000000201",
  revisionId: "rev-enforced",
  title: "建築基準法",
  effectiveFrom: "2026-05-27",
  sourceUpdatedAt: "2026-05-27T10:30:46+09:00",
  repealStatus: "None",
  repealDate: null,
};

describe("getLawVersionAt", () => {
  it("asofを必須にしcurrent_revision_infoの将来版を選ばない", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-enforced",
              law_title: "建築基準法",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
            current_revision_info: { law_revision_id: "rev-future" },
          },
        ],
      }),
    );

    const value = await getLawVersionAt(
      "325AC0000000201",
      "2026-08-04",
      fetcher,
    );
    expect(value.revisionId).toBe("rev-enforced");
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.searchParams.get("asof")).toBe("2026-08-04");
  });

  it("revision_infoが欠けている法令は将来版へフォールバックしない", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            // asof時点で未施行: revision_info が存在しない
            current_revision_info: { law_revision_id: "rev-future" },
          },
        ],
      }),
    );

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/revision_info/);
  });

  it("asof時点で施行済みのrevision_infoだけを返す", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-enforced",
              law_title: "建築基準法",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
          },
        ],
      }),
    );

    const value = await getLawVersionAt(
      "325AC0000000201",
      "2026-08-04",
      fetcher,
    );
    expect(value).toEqual(enforcedVersion);
  });

  it("廃止済み法令のrepeal情報を保持する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-repealed",
              law_title: "廃止された法",
              amendment_enforcement_date: "2020-04-01",
              updated: "2020-04-01T09:00:00+09:00",
              repeal_status: "Repealed",
              repeal_date: "2024-03-31",
            },
          },
        ],
      }),
    );

    const value = await getLawVersionAt(
      "325AC0000000201",
      "2026-08-04",
      fetcher,
    );
    expect(value.repealStatus).toBe("Repealed");
    expect(value.repealDate).toBe("2024-03-31");
  });

  it("law_id完全一致で複数件返された場合は拒否する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-1",
              law_title: "建築基準法",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
          },
          {
            // 異なるlaw_idは完全一致フィルタで除外されることを前提に、
            // 同じlaw_idの重複レコードだけを「単一性違反」として扱う
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-2",
              law_title: "建築基準法（重複）",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
          },
        ],
      }),
    );

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/single|単一/i);
  });

  it("law_id完全一致のみを採用し前方一致・部分一致は除外する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            // 前方一致するが完全一致ではない → 除外され、0件扱いでエラー
            law_info: { law_id: "325AC0000000201_OR_OTHER" },
            revision_info: {
              law_revision_id: "rev-1",
              law_title: "別の法令",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
          },
        ],
      }),
    );

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/not found|0|single|単一/i);
  });

  it("法令が0件の場合はエラーにする", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ laws: [] }));

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/not found|0|single/i);
  });

  it("asofより後に施行されるrevisionは採用しない", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-future-enforced",
              law_title: "建築基準法",
              // asof (2026-08-04) より未来の施行日
              amendment_enforcement_date: "2026-12-01",
              updated: "2026-11-01T10:00:00+09:00",
              repeal_status: "None",
            },
          },
        ],
      }),
    );

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/enforcement|effective|asof/i);
  });

  it("APIエンドポイントにlaw_idとresponse_format=jsonを含める", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        laws: [
          {
            law_info: { law_id: "325AC0000000201" },
            revision_info: {
              law_revision_id: "rev-enforced",
              law_title: "建築基準法",
              amendment_enforcement_date: "2026-05-27",
              updated: "2026-05-27T10:30:46+09:00",
              repeal_status: "None",
            },
          },
        ],
      }),
    );

    await getLawVersionAt("325AC0000000201", "2026-08-04", fetcher);
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(`${EGOV_BASE}/laws`);
    expect(url.searchParams.get("law_id")).toBe("325AC0000000201");
    expect(url.searchParams.get("response_format")).toBe("json");
  });

  it("HTTPエラーを例外へ変換する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ error: "boom" }, { status: 500 }),
    );

    await expect(
      getLawVersionAt("325AC0000000201", "2026-08-04", fetcher),
    ).rejects.toThrow(/500/);
  });
});

describe("getLawXmlAt", () => {
  const minimalXml = `<Law><LawBody><MainProvision>
    <Article Num="1"><ArticleTitle>第一条</ArticleTitle>
      <Paragraph Num="1"><ParagraphNum>1</ParagraphNum>
        <ParagraphSentence><Sentence>本文</Sentence></ParagraphSentence>
      </Paragraph>
    </Article>
  </MainProvision></LawBody></Law>`;

  it("公式XMLを取得しSHA-256 checksumとsource URLを記録する", async () => {
    const fetcher = vi.fn().mockResolvedValue(xmlResponse(minimalXml));

    const value = await getLawXmlAt(enforcedVersion, "2026-08-04", fetcher);
    expect(value.lawId).toBe("325AC0000000201");
    expect(value.revisionId).toBe("rev-enforced");
    expect(value.xml).toBe(minimalXml);
    expect(value.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(value.sourceUrl).toContain(
      `/law_file/xml/325AC0000000201`,
    );
    expect(value.sourceUrl).toContain("asof=2026-08-04");
    expect(value.fetchedAt).toBeInstanceOf(Date);
  });

  it("入力versionのrevision IDを取得結果へ強制的に記録する", async () => {
    // レスポンスXMLには revision 情報が含まれないが、戻り値は入力 version に従う
    const fetcher = vi.fn().mockResolvedValue(xmlResponse(minimalXml));

    const value = await getLawXmlAt(
      { ...enforcedVersion, revisionId: "rev-input" },
      "2026-08-04",
      fetcher,
    );
    expect(value.revisionId).toBe("rev-input");
  });

  it("Law要素がないXMLは拒否する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      xmlResponse(`<Other><MainProvision/></Other>`),
    );

    await expect(
      getLawXmlAt(enforcedVersion, "2026-08-04", fetcher),
    ).rejects.toThrow(/Law/);
  });

  it("MainProvisionがないXMLは拒否する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      xmlResponse(`<Law><LawBody><SupplProvision/></LawBody></Law>`),
    );

    await expect(
      getLawXmlAt(enforcedVersion, "2026-08-04", fetcher),
    ).rejects.toThrow(/MainProvision/);
  });

  it("空本文は拒否する", async () => {
    const fetcher = vi.fn().mockResolvedValue(xmlResponse(""));

    await expect(
      getLawXmlAt(enforcedVersion, "2026-08-04", fetcher),
    ).rejects.toThrow();
  });

  it("HTTPエラーを例外へ変換する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      xmlResponse("not found", { status: 404 }),
    );

    await expect(
      getLawXmlAt(enforcedVersion, "2026-08-04", fetcher),
    ).rejects.toThrow(/404/);
  });

  it("checksumはXML正文のSHA-256と一致する", async () => {
    const fetcher = vi.fn().mockResolvedValue(xmlResponse(minimalXml));
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256")
      .update(minimalXml)
      .digest("hex");

    const value = await getLawXmlAt(enforcedVersion, "2026-08-04", fetcher);
    expect(value.checksum).toBe(expected);
  });
});
