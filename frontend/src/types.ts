export interface Player {
  playerId: string;
  name: string;
  years: string;
  teams?: string[];
  careerStats?: Record<string, number>;
  seasonStats?: Record<string, number>;
  seasons?: {
    year: number;
    team: string;
    stats: Record<string, number>;
  }[];
  similarityScore?: number;
}

export interface RecommendationResult {
  players: Player[];
  warnings: string[];
}

export type GoatMode = "career" | "season" | "peak" | "start";

export interface GoatPlayerResult {
  playerId: string;
  name: string;
  years: string;
  teams?: string[];
  season?: number | null;
  goatScore: number;
  stats: Record<string, number>;
}

export interface GoatResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  players: GoatPlayerResult[];
}
