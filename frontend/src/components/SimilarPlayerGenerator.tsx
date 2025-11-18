import { useState, useEffect } from "react";
import axios from "axios";

const STAT_GROUPS = [
  "Per Game",
  "Totals",
  "Advanced",
  "Per 100",
  "Play by Play",
  "Shooting",
] as const;

const ACCOLADE_GROUPS = [
  "Championships",
  "All-League Teams",
  "Individual Awards",
] as const;

type GroupName =
  | (typeof STAT_GROUPS)[number]
  | (typeof ACCOLADE_GROUPS)[number];

type GroupsPreset = "stats" | "accolades" | "all" | "custom" | null;

interface Player {
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

// ----- Display stat groups for the SELECTED player -----
// Season columns (from nba_player_seasons.csv)
const SEASON_PER_GAME_KEYS = [
  "mp_per_game",
  "fg_per_game",
  "fga_per_game",
  "fg_percent",
  "x3p_per_game",
  "x3pa_per_game",
  "x3p_percent",
  "x2p_per_game",
  "x2pa_per_game",
  "x2p_percent",
  "e_fg_percent",
  "ft_per_game",
  "fta_per_game",
  "ft_percent",
  "orb_per_game",
  "drb_per_game",
  "trb_per_game",
  "ast_per_game",
  "stl_per_game",
  "blk_per_game",
  "tov_per_game",
  "pf_per_game",
  "pts_per_game",
];

const SEASON_TOTAL_KEYS = [
  "g",
  "gs",
  "mp",
  "fg",
  "fga",
  "x3p",
  "x3pa",
  "x2p",
  "x2pa",
  "ft",
  "fta",
  "orb",
  "drb",
  "trb",
  "ast",
  "stl",
  "blk",
  "tov",
  "pf",
  "pts",
  "trp_dbl",
];

const SEASON_ADVANCED_KEYS = [
  "per",
  "ts_percent",
  "x3p_ar",
  "f_tr",
  "orb_percent",
  "drb_percent",
  "trb_percent",
  "ast_percent",
  "stl_percent",
  "blk_percent",
  "tov_percent",
  "usg_percent",
  "ows",
  "dws",
  "ws",
  "ws_48",
  "obpm",
  "dbpm",
  "bpm",
  "vorp",
];

const SEASON_PER_100_KEYS = [
  "fg_per_100_poss",
  "fga_per_100_poss",
  "x3p_per_100_poss",
  "x3pa_per_100_poss",
  "x2p_per_100_poss",
  "x2pa_per_100_poss",
  "ft_per_100_poss",
  "fta_per_100_poss",
  "orb_per_100_poss",
  "drb_per_100_poss",
  "trb_per_100_poss",
  "ast_per_100_poss",
  "stl_per_100_poss",
  "blk_per_100_poss",
  "tov_per_100_poss",
  "pf_per_100_poss",
  "pts_per_100_poss",
  "o_rtg",
  "d_rtg",
];

const SEASON_PLAY_BY_PLAY_KEYS = [
  "pg_percent",
  "sg_percent",
  "sf_percent",
  "pf_percent",
  "c_percent",
  "on_court_plus_minus_per_100_poss",
  "net_plus_minus_per_100_poss",
  "bad_pass_turnover",
  "lost_ball_turnover",
  "shooting_foul_committed",
  "offensive_foul_committed",
  "shooting_foul_drawn",
  "offensive_foul_drawn",
  "points_generated_by_assists",
  "and1",
  "fga_blocked",
];

const SEASON_SHOOTING_KEYS = [
  "avg_dist_fga",
  "percent_fga_from_x2p_range",
  "percent_fga_from_x0_3_range",
  "percent_fga_from_x3_10_range",
  "percent_fga_from_x10_16_range",
  "percent_fga_from_x16_3p_range",
  "percent_fga_from_x3p_range",
  "fg_percent_from_x2p_range",
  "fg_percent_from_x0_3_range",
  "fg_percent_from_x3_10_range",
  "fg_percent_from_x10_16_range",
  "fg_percent_from_x16_3p_range",
  "fg_percent_from_x3p_range",
  "percent_assisted_x2p_fg",
  "percent_assisted_x3p_fg",
  "percent_dunks_of_fga",
  "num_of_dunks",
  "percent_corner_3s_of_3pa",
  "corner_3_point_percent",
  "num_heaves_attempted",
  "num_heaves_made",
];

const SEASON_ACCOLADES_KEYS = [
  "CHMP",
  "FMVP",
  "all_star",
  "all_defense_share",
  "all_nba_share",
  "all_rookie_share",
  "all_defense_1st",
  "all_defense_2nd",
  "all_defense_ORV",
  "all_nba_1T",
  "all_nba_2T",
  "all_nba_3T",
  "all_nba_ORV",
  "all_rookie_1st",
  "all_rookie_2nd",
  "all_rookie_ORV",
  "mvp_winner",
  "mvp_share",
  "roy_winner",
  "roy_share",
  "smoy_winner",
  "smoy_share",
  "mip_winner",
  "mip_share",
  "dpoy_winner",
  "dpoy_share",
  "clutch_poy_winner",
  "clutch_poy_share",
];

// Career columns (from nba_player_careers.csv)
const CAREER_PER_GAME_KEYS = [
  "mp_per_game",
  "fg_per_game",
  "fga_per_game",
  "fg_percent",
  "x3p_per_game",
  "x3pa_per_game",
  "x3p_percent",
  "x2p_per_game",
  "x2pa_per_game",
  "x2p_percent",
  "e_fg_percent",
  "ft_per_game",
  "fta_per_game",
  "ft_percent",
  "orb_per_game",
  "drb_per_game",
  "trb_per_game",
  "ast_per_game",
  "stl_per_game",
  "blk_per_game",
  "tov_per_game",
  "pf_per_game",
  "pts_per_game",
];

const CAREER_TOTAL_KEYS = [
  "career_g",
  "career_gs",
  "career_mp",
  "career_fg",
  "career_fga",
  "career_x3p",
  "career_x3pa",
  "career_x2p",
  "career_x2pa",
  "career_ft",
  "career_fta",
  "career_orb",
  "career_drb",
  "career_trb",
  "career_ast",
  "career_stl",
  "career_blk",
  "career_tov",
  "career_pf",
  "career_pts",
  "career_trp_dbl",
];

const CAREER_ADVANCED_KEYS = [
  "career_per",
  "career_ts_percent",
  "career_x3p_ar",
  "career_f_tr",
  "career_orb_percent",
  "career_drb_percent",
  "career_trb_percent",
  "career_ast_percent",
  "career_stl_percent",
  "career_blk_percent",
  "career_tov_percent",
  "career_usg_percent",
  "career_ows",
  "career_dws",
  "career_ws",
  "career_ws_48",
  "career_obpm",
  "career_dbpm",
  "career_bpm",
  "career_vorp",
];

const CAREER_PER_100_KEYS = [
  "career_fg_per_100_poss",
  "career_fga_per_100_poss",
  "career_x3p_per_100_poss",
  "career_x3pa_per_100_poss",
  "career_x2p_per_100_poss",
  "career_x2pa_per_100_poss",
  "career_ft_per_100_poss",
  "career_fta_per_100_poss",
  "career_orb_per_100_poss",
  "career_drb_per_100_poss",
  "career_trb_per_100_poss",
  "career_ast_per_100_poss",
  "career_stl_per_100_poss",
  "career_blk_per_100_poss",
  "career_tov_per_100_poss",
  "career_pf_per_100_poss",
  "career_pts_per_100_poss",
  "career_o_rtg",
  "career_d_rtg",
];

const CAREER_PLAY_BY_PLAY_KEYS = [
  "career_pg_percent",
  "career_sg_percent",
  "career_sf_percent",
  "career_pf_percent",
  "career_c_percent",
  "career_on_court_plus_minus_per_100_poss",
  "career_net_plus_minus_per_100_poss",
  "career_bad_pass_turnover",
  "career_lost_ball_turnover",
  "career_shooting_foul_committed",
  "career_offensive_foul_committed",
  "career_shooting_foul_drawn",
  "career_offensive_foul_drawn",
  "career_points_generated_by_assists",
  "career_and1",
  "career_fga_blocked",
];

const CAREER_SHOOTING_KEYS = [
  "career_avg_dist_fga",
  "career_percent_fga_from_x2p_range",
  "career_percent_fga_from_x0_3_range",
  "career_percent_fga_from_x3_10_range",
  "career_percent_fga_from_x10_16_range",
  "career_percent_fga_from_x16_3p_range",
  "career_percent_fga_from_x3p_range",
  "career_fg_percent_from_x2p_range",
  "career_fg_percent_from_x0_3_range",
  "career_fg_percent_from_x3_10_range",
  "career_fg_percent_from_x10_16_range",
  "career_fg_percent_from_x16_3p_range",
  "career_fg_percent_from_x3p_range",
  "career_percent_assisted_x2p_fg",
  "career_percent_assisted_x3p_fg",
  "career_percent_dunks_of_fga",
  "career_num_of_dunks",
  "career_percent_corner_3s_of_3pa",
  "career_corner_3_point_percent",
  "career_num_heaves_attempted",
  "career_num_heaves_made",
];

const CAREER_ACCOLADES_KEYS = [
  "career_CHMP_count",
  "career_FMVP_count",
  "career_all_star_count",
  "career_all_defense_share_mean",
  "career_all_nba_share_mean",
  "career_all_rookie_share_mean",
  "career_all_defense_1st_count",
  "career_all_defense_2nd_count",
  "career_all_defense_ORV_count",
  "career_all_nba_1T_count",
  "career_all_nba_2T_count",
  "career_all_nba_3T_count",
  "career_all_nba_ORV_count",
  "career_all_rookie_1st_count",
  "career_all_rookie_2nd_count",
  "career_all_rookie_ORV_count",
  "career_mvp_winner_count",
  "career_mvp_share_mean",
  "career_roy_winner_count",
  "career_roy_share_sum",
  "career_smoy_winner_count",
  "career_smoy_share_mean",
  "career_mip_winner_count",
  "career_mip_share_mean",
  "career_dpoy_winner_count",
  "career_dpoy_share_mean",
  "career_clutch_poy_winner_count",
  "career_clutch_poy_share_mean",
];

// Group config used for the SELECTED player stats panel
type StatGroupConfig = {
  label: string;
  seasonKeys: string[];
  careerKeys: string[];
  alwaysShow?: boolean; // Per Game always shown; others only when "Show advanced" = true
};

const STAT_GROUP_CONFIG: StatGroupConfig[] = [
  {
    label: "Per Game",
    seasonKeys: SEASON_PER_GAME_KEYS,
    careerKeys: CAREER_PER_GAME_KEYS,
    alwaysShow: true,
  },
  {
    label: "Totals",
    seasonKeys: SEASON_TOTAL_KEYS,
    careerKeys: CAREER_TOTAL_KEYS,
  },
  {
    label: "Advanced",
    seasonKeys: SEASON_ADVANCED_KEYS,
    careerKeys: CAREER_ADVANCED_KEYS,
  },
  {
    label: "Per 100",
    seasonKeys: SEASON_PER_100_KEYS,
    careerKeys: CAREER_PER_100_KEYS,
  },
  {
    label: "Play by Play",
    seasonKeys: SEASON_PLAY_BY_PLAY_KEYS,
    careerKeys: CAREER_PLAY_BY_PLAY_KEYS,
  },
  {
    label: "Shooting",
    seasonKeys: SEASON_SHOOTING_KEYS,
    careerKeys: CAREER_SHOOTING_KEYS,
  },
  {
    label: "Accolades",
    seasonKeys: SEASON_ACCOLADES_KEYS,
    careerKeys: CAREER_ACCOLADES_KEYS,
  },
];

export default function SimilarPlayerGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [usedSeason, setUsedSeason] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<Player[]>([]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recStatsShown, setRecStatsShown] = useState<Record<string, boolean>>(
    {}
  );
  const [recAdvancedShown, setRecAdvancedShown] = useState<
    Record<string, boolean>
  >({});

  // New: which tab is active in the stats panel
  const [statsTab, setStatsTab] = useState<"career" | "season">("career");

  // New: groups + topN for recommendations
  const [groupsPreset, setGroupsPreset] = useState<GroupsPreset>("stats");
  const [customGroups, setCustomGroups] = useState<GroupName[]>([]);
  const [topN, setTopN] = useState(5);

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

  const buildRecommendationParams = () => {
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
    } catch (err) {
      console.error("Season fetch failed:", err);
    }
  };

  const generateRecommendations = async () => {
    if (!selectedPlayer) return;
    setRecommendations([]);

    const params = buildRecommendationParams();

    // Only use season-based comparisons when:
    //  - the Season tab is active, AND
    //  - a season is actually selected
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
      const res = await axios.get(url);
      const data: Player[] = res.data;
      setRecommendations(data);
      setUsedSeason(useSeason ? selectedSeason : null);
      setRecStatsShown({});
      setRecAdvancedShown({});
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    }
  };

  const getSelectedPlayerTeam = () => {
    if (!selectedPlayer) return "";

    // For the SELECTED player header, follow the current tab + season selection
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

  // NEW: stats source respects the statsTab (career vs season).
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

  // Render grouped stats for the selected player
  const renderSelectedPlayerStatGroups = (mode: "career" | "season") => {
    const stats = getSelectedPlayerStats();
    if (!stats) return null;

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
              <h4 style={{ marginBottom: "8px" }}>{group.label}</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  rowGap: "12px",
                  columnGap: "24px",
                }}
              >
                {availableKeys.map((key) => (
                  <div key={key}>
                    <strong>{key}:</strong>{" "}
                    {Number.isFinite(stats[key])
                      ? stats[key].toFixed(2)
                      : stats[key]}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const isSeasonComparison = statsTab === "season" && selectedSeason !== null;

  useEffect(() => {
    // Any time the user changes between career/season
    // or picks a different season, clear the current results
    setRecommendations([]);
    setUsedSeason(null);
    setRecStatsShown({});
    setRecAdvancedShown({});
  }, [statsTab, selectedSeason]);

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
                  // Optional: clear the selected season so the UI reflects that
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
                    {showAdvanced
                      ? "Hide Advanced Groups"
                      : "Show Advanced Groups"}
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
                Stats (default)
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
                Top N similar players:{" "}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={topN}
                  onChange={(e) =>
                    setTopN(
                      Math.max(1, Math.min(50, Number(e.target.value) || 1))
                    )
                  }
                  style={{ width: "60px", marginLeft: "4px" }}
                />
              </label>
            </div>
          </div>

          {/* Step 3: Generate recommendations (career vs season still uses selectedSeason) */}
          <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
            Step 3: Generate Similar Players
          </h2>

          <div style={{ marginBottom: "10px", color: "#555" }}>
            {isSeasonComparison
              ? `Currently comparing SEASONS (season ${selectedSeason}).`
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

      {/* Recommendations (unchanged layout, still basic vs advanced toggle) */}
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
              const mode: "career" | "season" =
                usedSeason != null ? "season" : "career";
              const stats =
                mode === "season" ? player.seasonStats : player.careerStats;

              const team =
                mode === "season"
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
                  {player.similarityScore != null && (
                    <div>
                      Similarity: {(player.similarityScore * 100).toFixed(2)}%
                    </div>
                  )}
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
                      {STAT_GROUP_CONFIG.map((group) => {
                        // Per Game always visible; other groups only when this card's advanced toggle is on
                        if (!group.alwaysShow && !isAdv) return null;

                        const keys =
                          usedSeason != null
                            ? group.seasonKeys
                            : group.careerKeys;

                        const availableKeys = keys.filter((k) => k in stats);
                        if (availableKeys.length === 0) return null;

                        return (
                          <div
                            key={group.label}
                            style={{ marginBottom: "12px" }}
                          >
                            <h4 style={{ marginBottom: "6px" }}>
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
                              {availableKeys.map((k) => (
                                <div key={k}>
                                  <strong>{k}:</strong>{" "}
                                  {Number.isFinite(stats[k])
                                    ? stats[k].toFixed(2)
                                    : stats[k]}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

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
                            ? "Hide Advanced Groups"
                            : "Show Advanced Groups"}
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
