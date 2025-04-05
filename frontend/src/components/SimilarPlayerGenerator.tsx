import React, { useState, useEffect } from "react";
import axios from "axios";

interface Player {
  playerId: number;
  name: string;
  years: string;
}

export default function SimilarPlayerGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [usedSeason, setUsedSeason] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<Player[]>([]);

  const handleSearch = async () => {
    try {
      const res = await axios.get(`/api/similarplayer/players?query=${query}`);
      setSearchResults(res.data);
      setSelectedPlayer(null);
      setRecommendations([]);
      setSeasons([]);
      setSelectedSeason(null);
      setUsedSeason(null);
    } catch (err) {
      console.error("Search failed:", err);
    }
  };

  const handleSelectPlayer = async (player: Player) => {
    try {
      setSelectedPlayer(player);
      setSearchResults([]); // 👈 This clears the search results list
      const res = await axios.get(
        `/api/similarplayer/seasons/${player.playerId}`
      );
      setSeasons(res.data);
      setRecommendations([]);
      setSelectedSeason(null);
      setUsedSeason(null);
    } catch (err) {
      console.error("Season fetch failed:", err);
    }
  };

  const generateRecommendations = async () => {
    if (!selectedPlayer) return;

    // Clear existing recommendations first to avoid accidental appends
    setRecommendations([]);

    let url = `/api/similarplayer/career/${selectedPlayer.playerId}`;
    let isSeasonBased = false;

    if (
      selectedSeason !== null &&
      selectedSeason !== undefined &&
      selectedSeason !== ""
    ) {
      url = `/api/similarplayer/season/${selectedPlayer.playerId}/${selectedSeason}`;
      isSeasonBased = true;
    }

    try {
      const res = await axios.get(url);
      const data: Player[] = res.data;

      // Defensive: If backend always returns 5, slice is redundant but safe
      setRecommendations(data.slice(0, 5));
      setUsedSeason(isSeasonBased ? selectedSeason : null);
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
      setRecommendations([]);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9f9f9",
        paddingTop: "50px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#1f2937" }}>
        Similar Player Generator
      </h1>

      <div style={{ marginTop: "30px" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "10px" }}>
          Step 1: Search for a Player
        </h2>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a player name..."
            style={{ padding: "8px", width: "300px" }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: "8px 16px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
            }}
          >
            Search
          </button>
        </div>

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

      {selectedPlayer && (
        <div style={{ marginTop: "40px" }}>
          <div
            style={{
              marginBottom: "10px",
              fontWeight: "bold",
              fontSize: "1.5rem",
            }}
          >
            Selected Player: {selectedPlayer.name} ({selectedPlayer.years})
          </div>

          <h2 style={{ fontSize: "1.25rem", marginBottom: "10px" }}>
            Step 2: Select a Season
          </h2>

          <div>
            <select
              value={selectedSeason ?? ""}
              onChange={(e) =>
                setSelectedSeason(
                  e.target.value ? Number(e.target.value) : null
                )
              }
              style={{ padding: "8px", width: "150px", marginBottom: "10px" }}
            >
              <option value="">Career</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

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

      {recommendations.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "15px" }}>
            Similar Players
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
            }}
          >
            {recommendations.map((player) => (
              <div key={player.playerId}>
                {player.name} ({player.years})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
