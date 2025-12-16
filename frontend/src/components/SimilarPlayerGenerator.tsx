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

type StatTabMode = "career" | "season" | "peak" | "start";
type StatMode = "career" | "season" | "peak" | "start";

export default function SimilarPlayerGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [noResultsMessage, setNoResultsMessage] = useState<string | null>(null);
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

  // Career / Season / Peak / Start tab in stats panel
  const [statsTab, setStatsTab] = useState<StatTabMode>("career");

  // Peak tab state: start/end seasons + fetched window player
  const [peakStartSeason, setPeakStartSeason] = useState<number | "">("");
  const [peakEndSeason, setPeakEndSeason] = useState<number | "">("");
  const [peakWindowPlayer, setPeakWindowPlayer] = useState<Player | null>(null);

  // Start tab state: first N seasons + fetched window player
  const [startSeasonsInput, setStartSeasonsInput] = useState<string>("");
  const [startWindowPlayer, setStartWindowPlayer] = useState<Player | null>(
    null
  );
  const [limitOnePerPlayer, setLimitOnePerPlayer] = useState(false);

  // Groups + topN for recommendations
  const [groupsPreset, setGroupsPreset] = useState<GroupsPreset>("stats");
  const [customGroups, setCustomGroups] = useState<GroupName[]>([]);
  const [topNInput, setTopNInput] = useState("10");

  // Which groups were actually requested the last time
  const [usedGroupsForLastRequest, setUsedGroupsForLastRequest] = useState<
    GroupName[] | null
  >(null);

  const formatSeason = (year: number | null | undefined) => {
    if (!year) return "";
    const start = year - 1; // 2025 -> 2024
    const endShort = String(year).slice(-2); // 2025 -> "25"
    return `${start}-${endShort}`; // "2024-25"
  };

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

  const buildRecommendationParams = (topN: number, limitOne?: boolean) => {
    const params = new URLSearchParams();
    params.set("topN", String(topN));

    if (groupsPreset === "custom") {
      if (customGroups.length > 0) {
        params.set("groups", customGroups.join(","));
      }
    } else if (groupsPreset) {
      params.set("groupsPreset", groupsPreset);
    }

    // only attach when explicitly provided
    if (limitOne != null) {
      params.set("limitOnePerPlayer", String(limitOne));
    }

    return params.toString();
  };

  // ---- API calls ----

  const handleSearch = async () => {
    try {
      setHasSearched(true);
      setNoResultsMessage(null);

      const res = await axios.get(
        `${
          import.meta.env.VITE_API_BASE_URL
        }similarplayer/players?query=${encodeURIComponent(query)}`
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

      // Clear peak/start state
      setPeakStartSeason("");
      setPeakEndSeason("");
      setPeakWindowPlayer(null);
      setStartSeasonsInput("");
      setStartWindowPlayer(null);
      setLimitOnePerPlayer(false);

      if (Array.isArray(res.data) && res.data.length === 0) {
        setNoResultsMessage(
          `No players found matching "${query}". This might be because:\n` +
            `• The player is a current rookie (this site doesn’t include 2025–26 stats yet).\n` +
            `• The player’s name includes accents or special characters (e.g. "Nikola Jokić").\n` +
            `• The name was misspelled`
        );
      }
    } catch (err) {
      console.error("Search failed:", err);
      setHasSearched(true);
      setNoResultsMessage(
        "Something went wrong searching for players. Please try again in a moment."
      );
    }
  };

  const handleSelectPlayer = async (player: Player) => {
    try {
      setSelectedPlayer(player);
      setSearchResults([]);
      setHasSearched(false);
      setNoResultsMessage(null);

      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}similarplayer/seasons/${
          player.playerId
        }`
      );
      setSeasons(res.data);
      setRecommendations([]);
      setSelectedSeason(null);
      setUsedSeason(null);
      setShowAdvanced(false);
      setStatsTab("career");
      setWarnings([]);

      // Clear peak/start state when a new player is chosen
      setPeakStartSeason("");
      setPeakEndSeason("");
      setPeakWindowPlayer(null);
      setStartSeasonsInput("");
      setStartWindowPlayer(null);
      setLimitOnePerPlayer(false);
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

    const includeLimit =
      statsTab === "season" || statsTab === "peak"
        ? limitOnePerPlayer
        : undefined;

    const params = buildRecommendationParams(parsed, includeLimit);

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

    const baseUrl = import.meta.env.VITE_API_BASE_URL;

    let url: string;
    let usedSeasonForCall: number | null = null;

    if (statsTab === "season" && selectedSeason !== null) {
      // per-season similarity
      url = `${baseUrl}similarplayer/season/${selectedPlayer.playerId}/${selectedSeason}?${params}`;
      usedSeasonForCall = selectedSeason;
    } else if (statsTab === "peak") {
      // peak window similarity
      if (!peakStartSeason || !peakEndSeason) {
        setWarnings([
          "Please select both a start and end season for the peak window.",
        ]);
        return;
      }
      const fromSeason = Number(peakStartSeason);
      const toSeason = Number(peakEndSeason);
      if (toSeason < fromSeason) {
        setWarnings([
          "End season must be greater than or equal to start season for the peak window.",
        ]);
        return;
      }
      url = `${baseUrl}similarplayer/peak/${selectedPlayer.playerId}?fromSeason=${fromSeason}&toSeason=${toSeason}&${params}`;
      usedSeasonForCall = null; // peak windows use "career-like" stats
    } else if (statsTab === "start") {
      // start window similarity
      let n = parseInt(startSeasonsInput, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setWarnings([
          "Please enter a positive number of seasons for the start window.",
        ]);
        return;
      }

      const maxN = seasons.length;
      if (maxN > 0 && n > maxN) {
        n = maxN;
        setStartSeasonsInput(String(maxN)); // keep UI in sync
      }

      url = `${baseUrl}similarplayer/start/${selectedPlayer.playerId}?nSeasons=${n}&${params}`;
      usedSeasonForCall = null;
    } else {
      // default to full career similarity
      url = `${baseUrl}similarplayer/career/${selectedPlayer.playerId}?${params}`;
      usedSeasonForCall = null;
    }

    try {
      const res = await axios.get<RecommendationResult>(url);
      const data = res.data;
      setRecommendations(data.players ?? []);
      setWarnings(data.warnings ?? []);
      setUsedSeason(usedSeasonForCall);
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
      setWarnings(["Something went wrong fetching recommendations."]);
    }
  };

  const getSelectedPlayerYearsDisplay = () => {
    if (!selectedPlayer) return "";

    if (statsTab === "season" && selectedSeason !== null) {
      return formatSeason(selectedSeason);
    }

    if (statsTab === "peak" && peakWindowPlayer?.years) {
      return peakWindowPlayer.years;
    }

    if (statsTab === "start" && startWindowPlayer?.years) {
      return startWindowPlayer.years;
    }

    return selectedPlayer.years;
  };

  const getSelectedPlayerTeam = () => {
    if (!selectedPlayer) return "";

    // Peak / Start: prefer window teams if available
    if (statsTab === "peak" && peakWindowPlayer?.teams?.length) {
      return peakWindowPlayer.teams.join(", ");
    }
    if (statsTab === "start" && startWindowPlayer?.teams?.length) {
      return startWindowPlayer.teams.join(", ");
    }

    const displaySeason =
      statsTab === "season" && selectedSeason !== null ? selectedSeason : null;

    if (displaySeason == null || statsTab === "career") {
      // Career or no specific season
      return selectedPlayer.teams?.join(", ") ?? "";
    }

    // Season view – try to find that season’s team, fall back to career teams
    const season = selectedPlayer.seasons?.find(
      (s) => s.year === displaySeason
    );
    return season?.team ?? selectedPlayer.teams?.join(", ") ?? "";
  };

  // Stats source respects the statsTab.
  const getSelectedPlayerStats = () => {
    if (!selectedPlayer) return null;

    if (statsTab === "career") {
      return selectedPlayer.careerStats ?? null;
    }

    if (statsTab === "season") {
      if (selectedSeason == null) return null;
      const season = selectedPlayer.seasons?.find(
        (s) => s.year === selectedSeason
      );
      return season?.stats ?? null;
    }

    if (statsTab === "peak") {
      return peakWindowPlayer?.careerStats ?? null;
    }

    if (statsTab === "start") {
      return startWindowPlayer?.careerStats ?? null;
    }

    return null;
  };

  const getStatsTitle = () => {
    if (statsTab === "career") {
      return "Career Stats";
    }
    if (statsTab === "season") {
      if (selectedSeason != null) {
        return `${formatSeason(selectedSeason)} Season Stats`;
      }
      return "Season Stats";
    }
    if (statsTab === "peak") {
      return peakWindowPlayer?.years
        ? `Peak Stats (${peakWindowPlayer.years})`
        : "Peak Stats";
    }
    if (statsTab === "start") {
      return startWindowPlayer?.years
        ? `Start Stats (${startWindowPlayer.years})`
        : "Start Stats";
    }
    return "Stats";
  };

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
      // CAREER-style versions (counts) – used for career, peak windows, start windows
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
  const renderSelectedPlayerStatGroups = (mode: StatMode) => {
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

          // Season vs everything else (career, peak, start share careerKeys)
          const keys = mode === "season" ? group.seasonKeys : group.careerKeys;

          const availableKeys = keys.filter((k) => k in stats);
          if (availableKeys.length === 0) return null;

          return (
            <div key={group.label} style={{ marginBottom: "16px" }}>
              <h4
                style={{
                  marginBottom: "8px",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  borderBottom: "1px solid var(--color-border)",
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

  // Clear recommendations whenever the mode / selectors change
  useEffect(() => {
    setRecommendations([]);
    setUsedSeason(null);
    setRecStatsShown({});
    setWarnings([]);
  }, [
    statsTab,
    selectedSeason,
    peakStartSeason,
    peakEndSeason,
    startSeasonsInput,
    limitOnePerPlayer,
  ]);

  useEffect(() => {
    // When switching between tabs,
    // reset the "Show More Stats" toggle for the selected player panel
    setShowAdvanced(false);
  }, [statsTab]);

  // Fetch peak window stats whenever player + peak seasons change (and tab is Peak)
  useEffect(() => {
    const fetchPeakWindow = async () => {
      if (!selectedPlayer) return;
      if (statsTab !== "peak") return;
      if (!peakStartSeason || !peakEndSeason) {
        setPeakWindowPlayer(null);
        return;
      }

      const fromSeason = Number(peakStartSeason);
      const toSeason = Number(peakEndSeason);
      if (!Number.isFinite(fromSeason) || !Number.isFinite(toSeason)) {
        setPeakWindowPlayer(null);
        return;
      }
      if (toSeason < fromSeason) {
        setPeakWindowPlayer(null);
        return;
      }

      try {
        const res = await axios.get<Player>(
          `${import.meta.env.VITE_API_BASE_URL}similarplayer/peakwindow/${
            selectedPlayer.playerId
          }?fromSeason=${fromSeason}&toSeason=${toSeason}`
        );
        setPeakWindowPlayer(res.data);
      } catch (err) {
        console.error("Failed to fetch peak window stats:", err);
        setPeakWindowPlayer(null);
      }
    };

    fetchPeakWindow();
  }, [statsTab, selectedPlayer?.playerId, peakStartSeason, peakEndSeason]);

  // Fetch start window stats whenever player + N seasons change (and tab is Start)
  useEffect(() => {
    const fetchStartWindow = async () => {
      if (!selectedPlayer) return;
      if (statsTab !== "start") return;
      if (!startSeasonsInput) {
        setStartWindowPlayer(null);
        return;
      }

      const n = parseInt(startSeasonsInput, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setStartWindowPlayer(null);
        return;
      }

      try {
        const res = await axios.get<Player>(
          `${import.meta.env.VITE_API_BASE_URL}similarplayer/startwindow/${
            selectedPlayer.playerId
          }?nSeasons=${n}`
        );
        setStartWindowPlayer(res.data);
      } catch (err) {
        console.error("Failed to fetch start window stats:", err);
        setStartWindowPlayer(null);
      }
    };

    fetchStartWindow();
  }, [statsTab, selectedPlayer?.playerId, startSeasonsInput]);

  // ---- Render ----

  // Helper label for comparison mode
  const comparisonExplanation = (() => {
    if (statsTab === "career") {
      return "Currently comparing CAREERS";
    }
    if (statsTab === "season") {
      if (selectedSeason != null) {
        return `Currently comparing SEASONS`;
      }
      return "Season tab selected. Pick a season above to compare that season against other players’ seasons.";
    }
    if (statsTab === "peak") {
      if (peakStartSeason && peakEndSeason) {
        const from = Number(peakStartSeason);
        const to = Number(peakEndSeason);
        const windowSize =
          Number.isFinite(from) && Number.isFinite(to)
            ? to - from + 1
            : undefined;
        return windowSize && windowSize > 0
          ? `Currently comparing ${windowSize}-season PEAKS`
          : "Peak tab selected. Choose a valid start and end season to compare that window against other players’ same-length windows.";
      }
      return "Peak tab selected. Choose a start and end season to compare that multi-season window to other players’ peak windows.";
    }
    if (statsTab === "start") {
      const n = parseInt(startSeasonsInput, 10);
      if (Number.isFinite(n) && n > 0) {
        return `Currently comparing FIRST ${n} SEASONS of players’ careers.`;
      }
      return "Start tab selected. Enter how many seasons to compare the first N seasons of careers.";
    }
    return "";
  })();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-primary)",
        padding: "30px 16px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: "bold",
          color: "var(--color-text-primary)",
        }}
      >
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
            style={{
              padding: "10px",
              width: "90vw",
              maxWidth: "400px",
              borderRadius: "4px",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: "10px 20px",
              backgroundColor: "var(--color-primary)",
              color: "var(--color-primary-contrast)",
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
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                marginBottom: "5px",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
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

          {hasSearched &&
            !selectedPlayer &&
            searchResults.length === 0 &&
            noResultsMessage && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  textAlign: "left",
                  whiteSpace: "pre-line",
                  fontSize: "0.9rem",
                  color: "var(--color-text-muted)",
                }}
              >
                {noResultsMessage}
              </div>
            )}
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
            {getSelectedPlayerYearsDisplay()
              ? `(${getSelectedPlayerYearsDisplay()})`
              : ""}
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
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
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
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <button
                onClick={() => {
                  setStatsTab("career");
                  setSelectedSeason(null);
                  setPeakStartSeason("");
                  setPeakEndSeason("");
                  setPeakWindowPlayer(null);
                  setStartSeasonsInput("");
                  setStartWindowPlayer(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor:
                    statsTab === "career"
                      ? "var(--color-primary)"
                      : "var(--color-surface)",
                  color:
                    statsTab === "career"
                      ? "var(--color-primary-contrast)"
                      : "var(--color-text-primary)",
                  cursor: "pointer",
                }}
              >
                Career
              </button>

              <button
                onClick={() => {
                  setStatsTab("season");
                  setPeakStartSeason("");
                  setPeakEndSeason("");
                  setPeakWindowPlayer(null);
                  setStartSeasonsInput("");
                  setStartWindowPlayer(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor:
                    statsTab === "season"
                      ? "var(--color-primary)"
                      : "var(--color-surface)",
                  color:
                    statsTab === "season"
                      ? "var(--color-primary-contrast)"
                      : "var(--color-text-primary)",
                  cursor: "pointer",
                }}
              >
                Season
              </button>

              <button
                onClick={() => {
                  setStatsTab("peak");
                  setSelectedSeason(null);
                  setStartSeasonsInput("");
                  setStartWindowPlayer(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor:
                    statsTab === "peak"
                      ? "var(--color-primary)"
                      : "var(--color-surface)",
                  color:
                    statsTab === "peak"
                      ? "var(--color-primary-contrast)"
                      : "var(--color-text-primary)",
                  cursor: "pointer",
                }}
              >
                Peak
              </button>

              <button
                onClick={() => {
                  setStatsTab("start");
                  setSelectedSeason(null);
                  setPeakStartSeason("");
                  setPeakEndSeason("");
                  setPeakWindowPlayer(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border)",
                  backgroundColor:
                    statsTab === "start"
                      ? "var(--color-primary)"
                      : "var(--color-surface)",
                  color:
                    statsTab === "start"
                      ? "var(--color-primary-contrast)"
                      : "var(--color-text-primary)",
                  cursor: "pointer",
                }}
              >
                Start
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
                        {formatSeason(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Peak tab controls: start / end season dropdowns */}
            {statsTab === "peak" && (
              <div
                style={{
                  marginBottom: "12px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <label>
                  Start season:{" "}
                  <select
                    value={peakStartSeason === "" ? "" : peakStartSeason}
                    onChange={(e) =>
                      setPeakStartSeason(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    style={{ padding: "6px 8px", minWidth: "120px" }}
                  >
                    <option value="">(choose start)</option>
                    {seasons
                      .slice()
                      .sort((a, b) => a - b)
                      .map((s) => (
                        <option key={s} value={s}>
                          {formatSeason(s)}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  End season:{" "}
                  <select
                    value={peakEndSeason === "" ? "" : peakEndSeason}
                    onChange={(e) =>
                      setPeakEndSeason(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    style={{ padding: "6px 8px", minWidth: "120px" }}
                  >
                    <option value="">(choose end)</option>
                    {seasons
                      .slice()
                      .sort((a, b) => a - b)
                      .map((s) => (
                        <option key={s} value={s}>
                          {formatSeason(s)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}

            {/* Start tab controls: N seasons input */}
            {statsTab === "start" && (
              <div style={{ marginBottom: "12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <label>
                    First{" "}
                    <input
                      type="number"
                      min={1}
                      max={seasons.length || undefined}
                      value={startSeasonsInput}
                      onChange={(e) => setStartSeasonsInput(e.target.value)}
                      style={{ width: "70px", margin: "0 4px" }}
                    />{" "}
                    seasons (from start of career)
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      if (seasons.length > 0)
                        setStartSeasonsInput(String(seasons.length));
                    }}
                    disabled={seasons.length === 0}
                    style={{
                      padding: "6px 14px",
                      backgroundColor: "var(--color-secondary)",
                      color: "var(--color-primary-contrast)",
                      border: "none",
                      borderRadius: "4px",
                      cursor: seasons.length === 0 ? "default" : "pointer",
                      opacity: seasons.length === 0 ? 0.6 : 1,
                    }}
                  >
                    Max
                  </button>

                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {seasons.length > 0
                      ? `${seasons.length} seasons available`
                      : "No seasons available"}
                  </span>
                </div>
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
                      backgroundColor: "var(--color-secondary)",
                      color: "var(--color-primary-contrast)",
                      border: "none",
                      borderRadius: "4px",
                    }}
                  >
                    {showAdvanced ? "Hide More Stats" : "Show More Stats"}
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                }}
              >
                {statsTab === "season"
                  ? "Select a season to view stats."
                  : statsTab === "peak"
                  ? "Choose a valid start and end season to view peak stats."
                  : statsTab === "start"
                  ? "Enter how many seasons to view the first N seasons of this player’s career."
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
              backgroundColor: "var(--color-surface)",
              borderRadius: "8px",
              padding: "16px",
              border: "1px solid var(--color-border)",
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
                Custom
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

          <div
            style={{ marginBottom: "10px", color: "var(--color-text-muted)" }}
          >
            {comparisonExplanation}
          </div>

          {(statsTab === "season" || statsTab === "peak") && (
            <div style={{ marginBottom: "12px", fontSize: "0.95rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={limitOnePerPlayer}
                  onChange={(e) => setLimitOnePerPlayer(e.target.checked)}
                />
                Limit results to one per player
              </label>
            </div>
          )}

          <button
            onClick={generateRecommendations}
            style={{
              padding: "10px 20px",
              backgroundColor: "var(--color-primary)",
              color: "var(--color-primary-contrast)",
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
                border: "1px solid var(--color-warning-border)",
                backgroundColor: "var(--color-warning-bg)",
                color: "var(--color-warning-text)",
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
                  // For window-based modes (peak/start), we use "career-like" stats
                  const mode: StatMode =
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
                  const rank = index + 1;

                  const groupsToShow: GroupName[] =
                    usedGroupsForLastRequest &&
                    usedGroupsForLastRequest.length > 0
                      ? usedGroupsForLastRequest
                      : ([...STAT_GROUPS, ...ACCOLADE_GROUPS] as GroupName[]);

                  return (
                    <div
                      key={key}
                      style={{
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        padding: "20px",
                        width: "90vw",
                        maxWidth: "600px",
                        boxShadow: "var(--shadow-elevated)",
                      }}
                    >
                      <div>
                        <strong>#{rank}</strong> <strong>{player.name}</strong>{" "}
                        ({player.years})
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
                          backgroundColor: "var(--color-success)",
                          color: "var(--color-primary-contrast)",
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
                            backgroundColor: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
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
                                    color: "var(--color-text-primary)",
                                    borderBottom:
                                      "1px solid var(--color-border)",
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
