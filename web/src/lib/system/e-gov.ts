export function buildEgovDocumentUrl(
  egovLawId: string,
  articleNumberNormalized?: string | null,
): string {
  const base = `https://elaws.e-gov.go.jp/document?lawid=${egovLawId}`;
  if (articleNumberNormalized) {
    return `${base}#_${articleNumberNormalized}`;
  }
  return base;
}
