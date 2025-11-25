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
