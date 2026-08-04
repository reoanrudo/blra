const articleXml = (number: string): string => {
  const [base, branch] = number.split("_");
  const kanjiByNumber: Record<string, string> = {
    "10": "十",
    "11": "十一",
  };
  const displayNumber = branch
    ? `${kanjiByNumber[base]}条の${kanjiByNumber[branch] ?? branch}`
    : `${kanjiByNumber[base]}条`;

  return `
      <Article Num="${number}">
        <ArticleTitle>第${displayNumber}</ArticleTitle>
        <Paragraph Num="1">
          <ParagraphNum>1</ParagraphNum>
          <ParagraphSentence>
            <Sentence Num="1">第${displayNumber}の本文</Sentence>
          </ParagraphSentence>
        </Paragraph>
      </Article>`;
};

export function makeMinimalLawXml(articleNumbers: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Law Lang="ja" Era="Showa" Year="25" Num="201" PromulgateMonth="05" PromulgateDay="24" LawType="Act">
  <LawBody>
    <MainProvision>${articleNumbers.map(articleXml).join("")}
    </MainProvision>
  </LawBody>
</Law>`;
}
