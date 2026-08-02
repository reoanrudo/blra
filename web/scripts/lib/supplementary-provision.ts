import { XMLParser } from "fast-xml-parser";

export interface SupplementaryProvisionMetadata {
  amendLawNum: string | null;
  extract: boolean;
  sourceLabel: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return null;
  const text = value["#text"];
  return typeof text === "string" ? text.trim() : null;
}

export function supplementaryProvisionMetadataFromNode(
  node: unknown,
): SupplementaryProvisionMetadata {
  if (!isRecord(node)) {
    throw new Error("SupplProvision must be an object");
  }

  const sourceLabel = textValue(node.SupplProvisionLabel);
  if (!sourceLabel) {
    throw new Error("SupplProvisionLabel is missing");
  }

  const rawAmendLawNum = node["@_AmendLawNum"];
  const amendLawNum = typeof rawAmendLawNum === "string" && rawAmendLawNum.trim()
    ? rawAmendLawNum.trim()
    : null;
  const rawExtract = node["@_Extract"];

  return {
    amendLawNum,
    extract: rawExtract === true || rawExtract === "true",
    sourceLabel,
  };
}

export function supplementaryProvisionTitle(
  metadata: SupplementaryProvisionMetadata,
): string {
  if (!metadata.amendLawNum) return "制定時附則";
  const extractLabel = metadata.extract ? "・抄" : "";
  return `附則（${metadata.amendLawNum}${extractLabel}）`;
}

export function supplementaryProvisionSystemTags(
  metadata: SupplementaryProvisionMetadata,
): Record<string, unknown> {
  return {
    supplementaryProvision: {
      amendLawNum: metadata.amendLawNum,
      extract: metadata.extract,
      sourceLabel: metadata.sourceLabel,
    },
  };
}

export function extractSupplementaryProvisionMetadataFromXml(
  xml: string,
): SupplementaryProvisionMetadata[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name: string) => name === "SupplProvision",
    removeNSPrefix: true,
    textNodeName: "#text",
    preserveOrder: false,
  });
  const parsed = parser.parse(xml) as unknown;
  if (!isRecord(parsed)) throw new Error("XML root must be an object");

  const dataRoot = isRecord(parsed.DataRoot) ? parsed.DataRoot : null;
  const applData = dataRoot && isRecord(dataRoot.ApplData) ? dataRoot.ApplData : null;
  const lawFullText = applData && isRecord(applData.LawFullText) ? applData.LawFullText : null;
  const law = isRecord(parsed.Law)
    ? parsed.Law
    : lawFullText && isRecord(lawFullText.Law)
      ? lawFullText.Law
      : null;
  if (!law) throw new Error("Missing Law");

  const lawBody = isRecord(law.LawBody) ? law.LawBody : null;
  if (!lawBody) throw new Error("Missing LawBody");
  const rawSupplements = lawBody.SupplProvision;
  if (rawSupplements === undefined) return [];
  const supplements = Array.isArray(rawSupplements) ? rawSupplements : [rawSupplements];

  return supplements.map(supplementaryProvisionMetadataFromNode);
}
