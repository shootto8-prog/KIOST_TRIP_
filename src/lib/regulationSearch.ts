import regulationData from "../../rules/regulation_articles.json";

export type RegulationArticle = {
  id: string;
  title: string;
  chapter: string | null;
  text: string;
};

export type RegulationSearchResult = {
  id: string;
  title: string;
  chapter: string | null;
  text: string;
  score: number;
};

const articles = regulationData.articles as RegulationArticle[];

/**
 * 한국어는 조사/어미가 붙어(교착어) 단순 공백 분리로는 같은 단어를 잘 못 맞춘다.
 * 별도 형태소 분석기 없이도 꽤 잘 작동하는 트릭으로, 한글 연속 구간을 문자 2-gram으로
 * 쪼갠다 ("숙박비는" -> "숙박","박비","비는"). 숫자는 그대로 하나의 토큰으로 둔다.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const runs = text.match(/[가-힣]+|\d+/g) ?? [];
  for (const run of runs) {
    if (/^\d+$/.test(run)) {
      tokens.push(run);
    } else if (run.length <= 2) {
      tokens.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        tokens.push(run.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

// --- 인덱스 구축 (모듈 로드 시 1회) ---

const docTermFreqs = articles.map((a) => termFrequency(tokenize(`${a.title} ${a.text}`)));

const documentFrequency = new Map<string, number>();
for (const tf of docTermFreqs) {
  for (const term of tf.keys()) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
}

const N = articles.length;
function idf(term: string): number {
  const df = documentFrequency.get(term) ?? 0;
  return Math.log((N + 1) / (df + 1)) + 1; // smoothed idf, 항상 양수
}

function tfIdfVector(tf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) {
    vec.set(term, freq * idf(term));
  }
  return vec;
}

function norm(vec: Map<string, number>): number {
  let sum = 0;
  for (const w of vec.values()) sum += w * w;
  return Math.sqrt(sum);
}

const docVectors = docTermFreqs.map(tfIdfVector);
const docNorms = docVectors.map(norm);

function cosineSimilarity(
  queryVec: Map<string, number>,
  queryNorm: number,
  docVec: Map<string, number>,
  docNorm: number
): number {
  if (queryNorm === 0 || docNorm === 0) return 0;
  let dot = 0;
  // 더 작은 벡터를 기준으로 순회
  const [small, large] = queryVec.size <= docVec.size ? [queryVec, docVec] : [docVec, queryVec];
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other) dot += w * other;
  }
  return dot / (queryNorm * docNorm);
}

/**
 * 규정 조항 검색. 여비규정(r1/여비규정.pdf)을 조항 단위로 미리 구조화한
 * rules/regulation_articles.json 위에서 TF-IDF 코사인 유사도로 topK를 반환한다.
 */
export function searchRegulation(query: string, topK = 3): RegulationSearchResult[] {
  const queryTf = termFrequency(tokenize(query));
  const queryVec = tfIdfVector(queryTf);
  const queryNorm = norm(queryVec);

  const scored = articles.map((a, i) => ({
    id: a.id,
    title: a.title,
    chapter: a.chapter,
    text: a.text,
    score: cosineSimilarity(queryVec, queryNorm, docVectors[i], docNorms[i]),
  }));

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function getArticleById(id: string): RegulationArticle | undefined {
  return articles.find((a) => a.id === id);
}
