export interface RecommendationItem {
  articleId: string;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  caption: string | null;
  lawShortName: string | null;
  regulationType: string | null;
  cooccurCount: number;
}

export interface RecommendationsResponse {
  data: RecommendationItem[];
  isColdStart: boolean;
}
