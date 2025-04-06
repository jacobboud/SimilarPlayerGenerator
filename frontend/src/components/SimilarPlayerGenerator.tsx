import { useState } from "react";
import axios from "axios";

interface Player {
  playerId: number;
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

export default function SimilarPlayerGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [usedSeason, setUsedSeason] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<Player[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [recStatsShown, setRecStatsShown] = useState<Record<string, boolean>>(
    {}
  );
  const [recAdvancedShown, setRecAdvancedShown] = useState<
    Record<string, boolean>
  >({});

  const basicStatKeys = [
    "MIN",
    "PTS",
    "FGM",
    "FGA",
    "FG%",
    "3PM",
    "3PA",
    "3P%",
    "FTM",
    "FTA",
    "FT%",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TOV",
    "PF",
    "+/-",
  ];

  const advancedStatKeys = [
    "OFFRTG",
    "DEFRTG",
    "NETRTG",
    "AST%",
    "AST/TO",
    "AST RATIO",
    "OREB%",
    "DREB%",
    "REB%",
    "TO RATIO",
    "EFG%",
    "TS%",
    "USG%",
    "PACE",
    "PIE",
    "PTS OFF TO",
    "2ND PTS",
    "FBPS",
    "PITP",
    "OPP PTS OFF TO",
    "OPP 2ND PTS",
    "OPP FBPS",
    "OPP PITP",
    "BLKA",
    "PFD",
    "%FGA 2PT",
    "%FGA 3PT",
    "%PTS 2PT",
    "%PTS 2PT MR",
    "%PTS 3PT",
    "%PTS FBPS",
    "%PTS FT",
    "%PTS OFFTO",
    "%PTS PITP",
    "2FGM %AST",
    "2FGM %UAST",
    "3FGM %AST",
    "3FGM %UAST",
    "FGM %AST",
    "FGM %UAST",
    "%FGM",
    "%FGA",
    "%3PM",
    "%3PA",
    "%FTM",
    "%FTA",
    "%OREB",
    "%DREB",
    "%REB",
    "%AST",
    "%TOV",
    "%STL",
    "%BLK",
    "%BLKA",
    "%PF",
    "%PFD",
    "%PTS",
  ];

  const handleSearch = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}players?query=${query}`
      );
      setSearchResults(res.data);
      setSelectedPlayer(null);
      setRecommendations([]);
      setSeasons([]);
      setSelectedSeason(null);
      setUsedSeason(null);
      setShowStats(false);
      setShowAdvanced(false);
    } catch (err) {
      console.error("Search failed:", err);
    }
  };

  const handleSelectPlayer = async (player: Player) => {
    try {
      setSelectedPlayer(player);
      setSearchResults([]);
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}seasons/${player.playerId}`
      );
      setSeasons(res.data);
      setRecommendations([]);
      setSelectedSeason(null);
      setUsedSeason(null);
      setShowStats(false);
      setShowAdvanced(false);
    } catch (err) {
      console.error("Season fetch failed:", err);
    }
  };

  const generateRecommendations = async () => {
    if (!selectedPlayer) return;
    setRecommendations([]);

    let url = `${import.meta.env.VITE_API_BASE_URL}career/${
      selectedPlayer.playerId
    }`;
    let isSeasonBased = false;

    if (selectedSeason !== null) {
      url = `${import.meta.env.VITE_API_BASE_URL}season/${
        selectedPlayer.playerId
      }/${selectedSeason}`;
      isSeasonBased = true;
    }

    try {
      const res = await axios.get(url);
      const data: Player[] = res.data;
      setRecommendations(data.slice(0, 5));
      setUsedSeason(isSeasonBased ? selectedSeason : null);
      setRecStatsShown({});
      setRecAdvancedShown({});
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    }
  };

  const getSelectedPlayerTeam = () => {
    if (!selectedPlayer) return "";
    if (usedSeason === null) return selectedPlayer.teams?.join(", ");
    const season = selectedPlayer.seasons?.find((s) => s.year === usedSeason);
    return season?.team ?? "";
  };

  const getSelectedPlayerStats = () => {
    if (!selectedPlayer) return null;
    if (usedSeason === null) return selectedPlayer.careerStats;
    const season = selectedPlayer.seasons?.find((s) => s.year === usedSeason);
    return season?.stats ?? null;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9f9f9",
        padding: "30px 16px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937" }}>
        NBA Similar Player Generator
      </h1>

      <div style={{ marginTop: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setShowDisclaimer((prev) => !prev)}
          style={{
            padding: "6px 14px",
            backgroundColor: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          {showDisclaimer ? "Hide Disclaimer" : "Show Disclaimer"}
        </button>

        {showDisclaimer && (
          <div
            style={{
              marginTop: "15px",
              padding: "15px",
              backgroundColor: "#f1f1f1",
              border: "1px solid #ccc",
              borderRadius: "6px",
              textAlign: "left",
              maxWidth: "600px",
              marginLeft: "auto",
              marginRight: "auto",
              color: "#1f2937",
            }}
          >
            <ul style={{ paddingLeft: "20px", margin: 0 }}>
              <li>Stats are from the play-by-play era (1996–97 to 2023–24)</li>
              <li>
                “Career” stats = seasons from 1997–2024 (excludes current season
                & pre-1996)
              </li>
              <li>Averages include all games (regular season + playoffs)</li>
              <li>
                Built using a cosine similarity model over basic & advanced
                stats
              </li>
              <li>Similarity % is based on full statistical profiles</li>
            </ul>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ marginTop: "30px" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          Step 1: Search for a Player
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
            width: "100%",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a player name..."
            style={{ padding: "10px", width: "90vw", maxWidth: "400px" }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              width: "fit-content",
            }}
          >
            Search
          </button>
        </div>

        {/* Search Results */}
        <div style={{ maxWidth: "400px", margin: "0 auto" }}>
          {searchResults.map((player) => (
            <div
              key={player.playerId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px",
                border: "1px solid #ccc",
                marginBottom: "5px",
                borderRadius: "4px",
              }}
            >
              <span>
                {player.name} ({player.years})
              </span>
              <button
                onClick={() => handleSelectPlayer(player)}
                style={{ padding: "4px 12px", borderRadius: "4px" }}
              >
                Select
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Player */}
      {selectedPlayer && (
        <div style={{ marginTop: "40px" }}>
          <div
            style={{
              fontWeight: "bold",
              fontSize: "1.25rem",
              marginBottom: "10px",
            }}
          >
            Selected Player: {selectedPlayer.name}{" "}
            {usedSeason ? `(${usedSeason})` : `(${selectedPlayer.years})`}
          </div>

          {getSelectedPlayerTeam() && (
            <div style={{ marginBottom: "10px" }}>
              Team(s): {getSelectedPlayerTeam()}
            </div>
          )}

          {showStats && getSelectedPlayerStats() && (
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "#ffffff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                padding: "20px",
                margin: "0 auto 20px",
                width: "90vw",
                maxWidth: "600px",
                textAlign: "left",
              }}
            >
              <h3 style={{ marginBottom: "16px", textAlign: "center" }}>
                {usedSeason ? "Season Stats" : "Career Stats"}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  rowGap: "12px",
                  columnGap: "24px",
                }}
              >
                {[...basicStatKeys, ...(showAdvanced ? advancedStatKeys : [])]
                  .filter((statKey) => statKey in getSelectedPlayerStats()!)
                  .map((statKey) => (
                    <div key={statKey}>
                      <strong>{statKey}:</strong>{" "}
                      {getSelectedPlayerStats()![statKey].toFixed(2)}
                    </div>
                  ))}
              </div>
              <div style={{ marginTop: "12px", textAlign: "center" }}>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    padding: "6px 14px",
                    backgroundColor: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                  }}
                >
                  {showAdvanced ? "Hide Advanced Stats" : "Show Advanced Stats"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowStats(!showStats)}
            style={{
              padding: "6px 14px",
              marginBottom: "10px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
            }}
          >
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>

          {/* Season Dropdown */}
          <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
            Step 2: Select a Season
          </h2>
          <select
            value={selectedSeason ?? ""}
            onChange={(e) =>
              setSelectedSeason(e.target.value ? Number(e.target.value) : null)
            }
            style={{
              padding: "8px",
              width: "90vw",
              maxWidth: "200px",
              marginBottom: "10px",
            }}
          >
            <option value="">Career</option>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <br />
          <br />
          <button
            onClick={generateRecommendations}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
            }}
          >
            Generate Similar Players
          </button>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "15px" }}>
            Similar Players
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              alignItems: "center",
            }}
          >
            {recommendations.map((player, index) => {
              const stats = usedSeason
                ? player.seasonStats
                : player.careerStats;
              const team = usedSeason
                ? player.teams?.[0] ?? ""
                : player.teams?.join(", ");
              const key = `${player.playerId}_${
                player.similarityScore ?? index
              }`;
              const isShown = recStatsShown[key] ?? false;
              const isAdv = recAdvancedShown[key] ?? false;

              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: "white",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    padding: "20px",
                    width: "90vw",
                    maxWidth: "600px",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                  }}
                >
                  <div>
                    <strong>{player.name}</strong> ({player.years})
                  </div>
                  {team && <div>Team(s): {team}</div>}
                  <div>
                    Similarity: {(player.similarityScore! * 100).toFixed(2)}%
                  </div>
                  <button
                    onClick={() =>
                      setRecStatsShown((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }))
                    }
                    style={{
                      marginTop: "6px",
                      padding: "6px 12px",
                      backgroundColor: "#28a745",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                    }}
                  >
                    {isShown ? "Hide Stats" : "Show Stats"}
                  </button>

                  {isShown && stats && (
                    <div
                      style={{
                        maxHeight: "300px",
                        overflowY: "auto",
                        backgroundColor: "#ffffff",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        padding: "20px",
                        marginTop: "10px",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(150px, 1fr))",
                          rowGap: "12px",
                          columnGap: "24px",
                        }}
                      >
                        {[...basicStatKeys, ...(isAdv ? advancedStatKeys : [])]
                          .filter((key) => key in stats)
                          .map((key) => (
                            <div key={key}>
                              <strong>{key}:</strong> {stats[key].toFixed(2)}
                            </div>
                          ))}
                      </div>
                      <div style={{ marginTop: "12px", textAlign: "center" }}>
                        <button
                          onClick={() =>
                            setRecAdvancedShown((prev) => ({
                              ...prev,
                              [key]: !prev[key],
                            }))
                          }
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#6c757d",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                          }}
                        >
                          {isAdv
                            ? "Hide Advanced Stats"
                            : "Show Advanced Stats"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
