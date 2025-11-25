import { useState, useEffect } from "react";
import axios from "axios";
import {
  STAT_GROUPS,
  ACCOLADE_GROUPS,
  GroupName,
  GroupsPreset,
  STAT_LABELS,
  STAT_GROUP_CONFIG,
} from "../statsConfig";
import { Player, RecommendationResult } from "../types";

export default function SimilarPlayerGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [usedSeason, setUsedSeason] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<Player[]>([]);
  const [recStatsShown, setRecStatsShown] = useState<Record<string, boolean>>(
    {}
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Which tab is active in the stats panel (still used for the *selected* player)
  const [statsTab, setStatsTab] = useState<"career" | "season">("career");

  // Groups + topN for recommendations
  const [groupsPreset, setGroupsPreset] = useState<GroupsPreset>("stats");
  const [customGroups, setCustomGroups] = useState<GroupName[]>([]);
  const [topNInput, setTopNInput] = useState("10");

  // Which groups were actually requested the last time
  const [usedGroupsForLastRequest, setUsedGroupsForLastRequest] = useState<
    GroupName[] | null
  >(null);

  // ---- Group helpers (for backend presets/custom) ----

  const isGroupChecked = (group: GroupName) => customGroups.includes(group);

  const toggleGroup = (group: GroupName) => {
    setGroupsPreset("custom");
    setCustomGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
  };

  const toggleAllStats = () => {
    setGroupsPreset("custom");
    setCustomGroups((prev) => {
      const allStatSelected = STAT_GROUPS.every((g) => prev.includes(g));
      if (allStatSelected) {
        return prev.filter((g) => !STAT_GROUPS.includes(g as any));
      }
      const base = prev.filter((g) => !STAT_GROUPS.includes(g as any));
      return [...base, ...STAT_GROUPS];
    });
  };

  const toggleAllAccolades = () => {
    setGroupsPreset("custom");
    setCustomGroups((prev) => {
      const allAccSelected = ACCOLADE_GROUPS.every((g) => prev.includes(g));
      if (allAccSelected) {
        return prev.filter((g) => !ACCOLADE_GROUPS.includes(g as any));
      }
      const base = prev.filter((g) => !ACCOLADE_GROUPS.includes(g as any));
      return [...base, ...ACCOLADE_GROUPS];
    });
  };

  const toggleAllGroups = () => {
    setGroupsPreset("custom");
    const allGroups: GroupName[] = [...STAT_GROUPS, ...ACCOLADE_GROUPS];
    const allSelected = allGroups.every((g) => customGroups.includes(g));
    if (allSelected) {
      setCustomGroups([]);
    } else {
      setCustomGroups(allGroups);
    }
  };

  const buildRecommendationParams = (topN: number) => {
    const params = new URLSearchParams();
    params.set("topN", String(topN));

    if (groupsPreset === "custom") {
      if (customGroups.length > 0) {
        params.set("groups", customGroups.join(","));
      }
    } else if (groupsPreset) {
      params.set("groupsPreset", groupsPreset);
    }

    return params.toString();
  };

  // ---- API calls ----

  const handleSearch = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}players?query=${encodeURIComponent(
          query
        )}`
      );
      setSearchResults(res.data);
      setSelectedPlayer(null);
      setRecommendations([]);
      setSeasons([]);
      setSelectedSeason(null);
      setUsedSeason(null);
      setShowAdvanced(false);
      setStatsTab("career");
      setWarnings([]);
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
      setShowAdvanced(false);
      setStatsTab("career");
      setWarnings([]);
    } catch (err) {
      console.error("Season fetch failed:", err);
    }
  };

  const generateRecommendations = async () => {
    if (!selectedPlayer) return;
    setRecommendations([]);
    setRecStatsShown({});
    setWarnings([]);

    // Parse the input; default to 10 if blank/invalid
    let parsed = parseInt(topNInput, 10);
    if (Number.isNaN(parsed)) {
      parsed = 10;
    }
    // Clamp to [1, 50]
    parsed = Math.max(1, Math.min(50, parsed));

    // Keep the UI in sync with the clamped value
    setTopNInput(String(parsed));

    const params = buildRecommendationParams(parsed);

    // Figure out which groups we *requested*,
    // so we can limit visible stat groups for recs.
    let effectiveGroups: GroupName[] | null = null;

    if (groupsPreset === "custom") {
      if (customGroups.length > 0) {
        effectiveGroups = [...customGroups];
      } else {
        // Custom with nothing selected → backend falls back to "stats"
        effectiveGroups = [...STAT_GROUPS];
      }
    } else if (groupsPreset === "stats" || groupsPreset === null) {
      effectiveGroups = [...STAT_GROUPS];
    } else if (groupsPreset === "accolades") {
      effectiveGroups = [...ACCOLADE_GROUPS];
    } else if (groupsPreset === "all") {
      effectiveGroups = [...STAT_GROUPS, ...ACCOLADE_GROUPS];
    }

    setUsedGroupsForLastRequest(effectiveGroups);

    const useSeason = statsTab === "season" && selectedSeason !== null;

    let url: string;
    if (useSeason) {
      url = `${import.meta.env.VITE_API_BASE_URL}season/${
        selectedPlayer.playerId
      }/${selectedSeason}?${params}`;
    } else {
      url = `${import.meta.env.VITE_API_BASE_URL}career/${
        selectedPlayer.playerId
      }?${params}`;
    }

    try {
      const res = await axios.get<RecommendationResult>(url);
      const data = res.data;
      setRecommendations(data.players ?? []);
      setWarnings(data.warnings ?? []);
      setUsedSeason(useSeason ? selectedSeason : null);
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
      setWarnings(["Something went wrong fetching recommendations."]);
    }
  };

  const getSelectedPlayerTeam = () => {
    if (!selectedPlayer) return "";

    const displaySeason =
      statsTab === "season" && selectedSeason !== null ? selectedSeason : null;

    if (displaySeason == null) {
      // Career view
      return selectedPlayer.teams?.join(", ") ?? "";
    }

    // Season view – try to find that season’s team, fall back to career teams
    const season = selectedPlayer.seasons?.find(
      (s) => s.year === displaySeason
    );
    return season?.team ?? selectedPlayer.teams?.join(", ") ?? "";
  };

  // Stats source respects the statsTab (career vs season).
  const getSelectedPlayerStats = () => {
    if (!selectedPlayer) return null;

    if (statsTab === "career") {
      return selectedPlayer.careerStats ?? null;
    }

    if (selectedSeason == null) return null;

    const season = selectedPlayer.seasons?.find(
      (s) => s.year === selectedSeason
    );
    return season?.stats ?? null;
  };

  const getStatsTitle = () => {
    if (statsTab === "career") {
      return "Career Per Game Stats";
    }
    if (selectedSeason != null) {
      return `Season ${selectedSeason} Per Game Stats`;
    }
    return "Season Per Game Stats";
  };

  type StatMode = "career" | "season";

  function denormalizeCumulativeChain(
    stats: Record<string, number>,
    keys: string[]
  ) {
    // keys are in order: [1st, 2nd, 3rd, RV] or [1st, 2nd, RV]
    const values = keys.map((k) => stats[k] ?? 0);
    const result: number[] = [];

    for (let i = 0; i < values.length; i++) {
      if (i === 0) {
        result[i] = values[i];
      } else {
        result[i] = values[i] - values[i - 1];
      }
      if (result[i] < 0) result[i] = 0; // safety
    }

    keys.forEach((k, i) => {
      stats[k] = result[i];
    });
  }

  function transformStatsForDisplay(
    raw: Record<string, number>,
    mode: StatMode
  ): Record<string, number> {
    const stats = { ...raw }; // don't mutate original

    if (mode === "season") {
      // All-NBA 1 / 2 / 3 / ORV
      denormalizeCumulativeChain(stats, [
        "all_nba_1T",
        "all_nba_2T",
        "all_nba_3T",
        "all_nba_ORV",
      ]);

      // All-Defense 1st / 2nd / ORV
      denormalizeCumulativeChain(stats, [
        "all_defense_1st",
        "all_defense_2nd",
        "all_defense_ORV",
      ]);

      // All-Rookie 1st / 2nd / ORV
      denormalizeCumulativeChain(stats, [
        "all_rookie_1st",
        "all_rookie_2nd",
        "all_rookie_ORV",
      ]);
    } else {
      // CAREER versions (counts)
      denormalizeCumulativeChain(stats, [
        "career_all_nba_1T_count",
        "career_all_nba_2T_count",
        "career_all_nba_3T_count",
        "career_all_nba_ORV_count",
      ]);

      denormalizeCumulativeChain(stats, [
        "career_all_defense_1st_count",
        "career_all_defense_2nd_count",
        "career_all_defense_ORV_count",
      ]);

      denormalizeCumulativeChain(stats, [
        "career_all_rookie_1st_count",
        "career_all_rookie_2nd_count",
        "career_all_rookie_ORV_count",
      ]);
    }

    return stats;
  }

  // Render grouped stats for the selected player
  const renderSelectedPlayerStatGroups = (mode: "career" | "season") => {
    const rawStats = getSelectedPlayerStats();
    if (!rawStats) return null;

    const stats = transformStatsForDisplay(rawStats, mode);

    return (
      <>
        {STAT_GROUP_CONFIG.map((group) => {
          // Per Game is always shown; others only when showAdvanced is true
          if (!group.alwaysShow && !showAdvanced) {
            return null;
          }

          const keys = mode === "career" ? group.careerKeys : group.seasonKeys;

          const availableKeys = keys.filter((k) => k in stats);
          if (availableKeys.length === 0) return null;

          return (
            <div key={group.label} style={{ marginBottom: "16px" }}>
              <h4
                style={{
                  marginBottom: "8px",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "#1f2937", // darker heading
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: "4px",
                }}
              >
                {group.label}
              </h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  rowGap: "12px",
                  columnGap: "24px",
                }}
              >
                {availableKeys.map((key) => {
                  const label = STAT_LABELS[key] ?? key;
                  return (
                    <div key={key}>
                      <strong>{label}:</strong>{" "}
                      {Number.isFinite(stats[key])
                        ? stats[key].toFixed(3).replace(/\.?0+$/, "")
                        : stats[key]}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const isSeasonComparison = statsTab === "season" && selectedSeason !== null;

  useEffect(() => {
    setRecommendations([]);
    setUsedSeason(null);
    setRecStatsShown({});
    setWarnings([]);
  }, [statsTab, selectedSeason]);

  useEffect(() => {
    // When switching between Career and Season tabs,
    // reset the "Show More Stats" toggle for the selected player panel
    setShowAdvanced(false);
  }, [statsTab]);

  // ---- Render ----

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
        Similar Player Generator
      </h1>

      {/* Step 1: Search */}
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

      {/* Selected Player / Stat Groups / Season selection / Generate */}
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
            {statsTab === "season" && selectedSeason !== null
              ? `(${selectedSeason})`
              : `(${selectedPlayer.years})`}
          </div>

          {getSelectedPlayerTeam() && (
            <div style={{ marginBottom: "10px" }}>
              Team(s): {getSelectedPlayerTeam()}
            </div>
          )}

          {/* Stats panel with tabs */}

          <div
            style={{
              maxHeight: "400px",
              overflowY: "auto",
              backgroundColor: "#ffffff",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "20px",
              margin: "0 auto 20px",
              width: "90vw",
              maxWidth: "700px",
              textAlign: "left",
            }}
          >
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <button
                onClick={() => {
                  setStatsTab("career");
                  setSelectedSeason(null);
                }}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  backgroundColor:
                    statsTab === "career" ? "#007bff" : "#f0f0f0",
                  color: statsTab === "career" ? "white" : "black",
                  cursor: "pointer",
                }}
              >
                Career
              </button>
              <button
                onClick={() => setStatsTab("season")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  backgroundColor:
                    statsTab === "season" ? "#007bff" : "#f0f0f0",
                  color: statsTab === "season" ? "white" : "black",
                  cursor: "pointer",
                }}
              >
                Season
              </button>
            </div>

            {/* Season dropdown lives in the Season tab */}
            {statsTab === "season" && (
              <div style={{ marginBottom: "12px" }}>
                <label>
                  Season:{" "}
                  <select
                    value={selectedSeason ?? ""}
                    onChange={(e) =>
                      setSelectedSeason(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    style={{ padding: "6px 8px", minWidth: "120px" }}
                  >
                    <option value="">(choose a season)</option>
                    {seasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <h3
              style={{
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              {getStatsTitle()}
            </h3>

            {getSelectedPlayerStats() ? (
              <>
                {renderSelectedPlayerStatGroups(statsTab)}
                <div style={{ marginTop: "12px", textAlign: "center" }}>
                  <button
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    style={{
                      padding: "6px 14px",
                      backgroundColor: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                    }}
                  >
                    {showAdvanced ? "Hide More Stats" : "Show More Stats"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#666" }}>
                {statsTab === "season"
                  ? "Select a season to view stats."
                  : "No stats available."}
              </div>
            )}
          </div>

          {/* Step 2: Choose Stat Groups for similarity */}
          <div
            style={{
              marginTop: "20px",
              marginBottom: "20px",
              maxWidth: "700px",
              marginInline: "auto",
              textAlign: "left",
              backgroundColor: "#fff",
              borderRadius: "8px",
              padding: "16px",
              border: "1px solid #ddd",
            }}
          >
            <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
              Step 2: Choose Stat Groups (for similarity)
            </h2>

            {/* Preset radios */}
            <div style={{ marginBottom: "10px" }}>
              <label style={{ marginRight: "12px" }}>
                <input
                  type="radio"
                  name="preset"
                  value="stats"
                  checked={groupsPreset === "stats"}
                  onChange={() => setGroupsPreset("stats")}
                />{" "}
                Stats
              </label>
              <label style={{ marginRight: "12px" }}>
                <input
                  type="radio"
                  name="preset"
                  value="accolades"
                  checked={groupsPreset === "accolades"}
                  onChange={() => setGroupsPreset("accolades")}
                />{" "}
                Accolades
              </label>
              <label style={{ marginRight: "12px" }}>
                <input
                  type="radio"
                  name="preset"
                  value="all"
                  checked={groupsPreset === "all"}
                  onChange={() => setGroupsPreset("all")}
                />{" "}
                All
              </label>
              <label>
                <input
                  type="radio"
                  name="preset"
                  value="custom"
                  checked={groupsPreset === "custom"}
                  onChange={() => setGroupsPreset("custom")}
                />{" "}
                Custom selection
              </label>
            </div>

            {/* Custom group checkboxes */}
            {groupsPreset === "custom" && (
              <div style={{ marginTop: "10px" }}>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={[...STAT_GROUPS, ...ACCOLADE_GROUPS].every((g) =>
                        customGroups.includes(g)
                      )}
                      onChange={toggleAllGroups}
                    />{" "}
                    All
                  </label>
                </div>

                <div style={{ marginLeft: "16px", marginTop: "4px" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={STAT_GROUPS.every((g) =>
                        customGroups.includes(g)
                      )}
                      onChange={toggleAllStats}
                    />{" "}
                    Stats
                  </label>
                  <div style={{ marginLeft: "16px", marginTop: "4px" }}>
                    {STAT_GROUPS.map((g) => (
                      <div key={g}>
                        <label>
                          <input
                            type="checkbox"
                            checked={isGroupChecked(g)}
                            onChange={() => toggleGroup(g)}
                          />{" "}
                          {g}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginLeft: "16px", marginTop: "8px" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={ACCOLADE_GROUPS.every((g) =>
                        customGroups.includes(g)
                      )}
                      onChange={toggleAllAccolades}
                    />{" "}
                    Accolades
                  </label>
                  <div style={{ marginLeft: "16px", marginTop: "4px" }}>
                    {ACCOLADE_GROUPS.map((g) => (
                      <div key={g}>
                        <label>
                          <input
                            type="checkbox"
                            checked={isGroupChecked(g)}
                            onChange={() => toggleGroup(g)}
                          />{" "}
                          {g}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TopN control */}
            <div style={{ marginTop: "10px" }}>
              <label>
                Top{" "}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={topNInput}
                  onChange={(e) => setTopNInput(e.target.value)}
                  style={{ width: "60px", marginLeft: "4px" }}
                />{" "}
                similar players:
              </label>
            </div>
          </div>

          {/* Step 3: Generate recommendations */}
          <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
            Step 3: Generate Similar Players
          </h2>

          <div style={{ marginBottom: "10px", color: "#555" }}>
            {isSeasonComparison
              ? `Currently comparing SEASONS. Choose the Career tab if you want career-based comparisons.`
              : "Currently comparing CAREERS. Choose the Season tab and pick a season if you want season-based comparisons."}
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

      {/* Warnings + Recommendations */}
      {(warnings.length > 0 || recommendations.length > 0) && (
        <div style={{ marginTop: "40px" }}>
          {warnings.length > 0 && (
            <div
              style={{
                maxWidth: "700px",
                margin: "0 auto 20px",
                padding: "12px 16px",
                borderRadius: "6px",
                border: "1px solid #f59e0b",
                backgroundColor: "#fffbeb",
                color: "#92400e",
                textAlign: "left",
                fontSize: "0.95rem",
              }}
            >
              <strong>Notes about this comparison:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {recommendations.length > 0 && (
            <>
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
                  const mode: "career" | "season" =
                    usedSeason != null ? "season" : "career";
                  const rawStats =
                    mode === "season" ? player.seasonStats : player.careerStats;

                  const displayStats = rawStats
                    ? transformStatsForDisplay(rawStats, mode)
                    : null;

                  const team =
                    mode === "season"
                      ? player.teams?.[0] ?? ""
                      : player.teams?.join(", ");

                  const key = `${player.playerId}_${
                    player.similarityScore ?? index
                  }`;

                  const isShown = recStatsShown[key] ?? false;

                  const groupsToShow: GroupName[] =
                    usedGroupsForLastRequest &&
                    usedGroupsForLastRequest.length > 0
                      ? usedGroupsForLastRequest
                      : ([...STAT_GROUPS, ...ACCOLADE_GROUPS] as GroupName[]);

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
                      {player.similarityScore != null && (
                        <div>
                          Similarity:{" "}
                          {(player.similarityScore * 100)
                            .toFixed(3)
                            .replace(/\.?0+$/, "")}
                          %
                        </div>
                      )}

                      {/* Toggle button for this recommendation’s stats */}
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

                      {/* Only show stats when this card is expanded, and only for the groups being compared */}
                      {isShown && displayStats && (
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
                            boxSizing: "border-box",
                          }}
                        >
                          {STAT_GROUP_CONFIG.map((group) => {
                            // Only render groups that were actually requested
                            if (
                              !groupsToShow.includes(group.label as GroupName)
                            ) {
                              return null;
                            }

                            const keys =
                              usedSeason != null
                                ? group.seasonKeys
                                : group.careerKeys;

                            const availableKeys = keys.filter(
                              (k) => k in displayStats
                            );
                            if (availableKeys.length === 0) return null;

                            return (
                              <div
                                key={group.label}
                                style={{ marginBottom: "12px" }}
                              >
                                <h4
                                  style={{
                                    marginBottom: "8px",
                                    fontSize: "1.05rem",
                                    fontWeight: 700,
                                    color: "#1f2937",
                                    borderBottom: "1px solid #e5e7eb",
                                    paddingBottom: "4px",
                                  }}
                                >
                                  {group.label}
                                </h4>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(150px, 1fr))",
                                    rowGap: "12px",
                                    columnGap: "24px",
                                  }}
                                >
                                  {availableKeys.map((k) => {
                                    const label = STAT_LABELS[k] ?? k;
                                    const value = displayStats[k];
                                    return (
                                      <div key={k}>
                                        <strong>{label}:</strong>{" "}
                                        {Number.isFinite(value)
                                          ? value
                                              .toFixed(3)
                                              .replace(/\.?0+$/, "")
                                          : value}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
