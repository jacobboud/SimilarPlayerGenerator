import { useState } from "react";
import axios from "axios";
import { STAT_GROUP_CONFIG, STAT_LABELS } from "../statsConfig";
import { GoatMode, GoatPlayerResult, GoatResponse } from "../types";

type WeightMap = Record<string, string>; // string for inputs, keyed by season stat keys
type NumericWeightMap = Record<string, number>;

// --- Award denormalization helpers (same idea as SimilarPlayerGenerator) ---

type StatMode = "career" | "season";

function denormalizeCumulativeChain(
  stats: Record<string, number>,
  keys: string[]
) {
  // keys are in order: [1st, 2nd, 3rd, ORV] or [1st, 2nd, ORV]
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

// --- Component ---

export default function GoatPage() {
  const [mode, setMode] = useState<GoatMode>("career");
  const [activeGroupLabel, setActiveGroupLabel] = useState<string>(
    STAT_GROUP_CONFIG[0]?.label ?? "Per Game"
  );

  // Single canonical weight map (keyed by SEASON stat keys)
  const [weightInputs, setWeightInputs] = useState<WeightMap>({});

  const [results, setResults] = useState<GoatPlayerResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showAllStatsRows, setShowAllStatsRows] = useState<
    Record<string, boolean>
  >({});

  // This stores the weights actually sent to the backend (career_* or season keys)
  const [lastWeightsUsed, setLastWeightsUsed] =
    useState<NumericWeightMap | null>(null);

  const DEFAULT_FORMULA: NumericWeightMap = {
    pts: 0.002,
    trb: 0.004,
    ast: 0.004,
    stl: 0.008,
    blk: 0.008,
    CHMP: 7.5,
    FMVP: 7.5,
    all_star: 1,
    all_nba_1T: 5,
    all_nba_2T: 3,
    all_nba_3T: 2,
    all_defense_1st: 2,
    all_defense_2nd: 2,
    mvp_winner: 15,
    dpoy_winner: 3,
  };

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // input for jumping directly to a page
  const [pageInput, setPageInput] = useState<string>("");
  const [showDefaultImportedMsg, setShowDefaultImportedMsg] = useState(false);

  const currentGroup = STAT_GROUP_CONFIG.find(
    (g) => g.label === activeGroupLabel
  );

  // For the editor, we treat SEASON keys as the canonical ones to attach weights to.
  const currentGroupSeasonKeys = currentGroup?.seasonKeys ?? [];

  function handleWeightChange(statKey: string, value: string) {
    // statKey here is always a SEASON stat key (canonical for weights)
    setWeightInputs((prev) => ({
      ...prev,
      [statKey]: value,
    }));
  }

  // Build numeric canonical weights keyed by SEASON stat keys.
  function buildCanonicalNumericWeights(): NumericWeightMap {
    const numeric: NumericWeightMap = {};

    Object.entries(weightInputs).forEach(([key, value]) => {
      if (value === "" || value == null) return;
      const num = parseFloat(value);
      if (!Number.isNaN(num) && num !== 0) {
        numeric[key] = num;
      }
    });

    return numeric;
  }

  function importDefaultFormula() {
    setWeightInputs((prev) => {
      const updated: WeightMap = { ...prev };

      Object.entries(DEFAULT_FORMULA).forEach(([key, value]) => {
        updated[key] = String(value); // convert number → string for inputs
      });

      return updated;
    });

    setShowDefaultImportedMsg(true);
    // Optional: hide after 2.5s
    setTimeout(() => {
      setShowDefaultImportedMsg(false);
    }, 2500);
  }

  // Convert canonical (season-keyed) weights into backend stat keys:
  // - For season mode → same season keys.
  // - For career mode → matching career_* keys at the same index in STAT_GROUP_CONFIG.
  function buildBackendWeights(
    canonical: NumericWeightMap,
    modeToUse: GoatMode
  ): NumericWeightMap {
    const backend: NumericWeightMap = {};

    STAT_GROUP_CONFIG.forEach((group) => {
      const seasonKeys = group.seasonKeys;
      const careerKeys = group.careerKeys;

      seasonKeys.forEach((seasonKey, idx) => {
        const w = canonical[seasonKey];
        if (w == null || Number.isNaN(w) || w === 0) return;

        let backendKey: string;
        if (modeToUse === "season") {
          backendKey = seasonKey;
        } else {
          // Career mode: map to corresponding career key if available, otherwise fall back.
          backendKey = careerKeys[idx] ?? seasonKey;
        }

        backend[backendKey] = w;
      });
    });

    return backend;
  }

  async function fetchGoatPage(
    targetPage: number,
    targetPageSize: number,
    modeToUse: GoatMode,
    backendWeights: NumericWeightMap
  ) {
    if (Object.keys(backendWeights).length === 0) {
      setResults([]);
      setTotalPages(0);
      setTotalCount(0);
      setPage(1);
      setErrorMsg("Please enter at least one non-zero weight.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setExpandedRows({});
    setShowAllStatsRows({});

    try {
      const res = await axios.post<GoatResponse>(
        `${import.meta.env.VITE_API_BASE_URL}goat`,
        {
          mode: modeToUse,
          page: targetPage,
          pageSize: targetPageSize,
          weights: backendWeights,
        }
      );

      const data = res.data;
      setResults(data.players ?? []);
      setPage(data.page);
      setPageSize(data.pageSize);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
      setPageInput(String(data.page)); // keep jump input in sync
    } catch (err) {
      console.error("GOAT calculation failed:", err);
      setErrorMsg("Something went wrong calculating GOAT scores.");
      setResults([]);
      setTotalPages(0);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCalculate() {
    // 1) Build canonical weights (season-keyed)
    const canonical = buildCanonicalNumericWeights();

    // 2) Convert to backend keys for current mode
    const backendWeights = buildBackendWeights(canonical, mode);

    // 3) Remember what we actually used (for filtering stats later)
    setLastWeightsUsed(backendWeights);

    // 4) Fetch page 1
    await fetchGoatPage(1, pageSize, mode, backendWeights);
  }

  async function goToPage(newPage: number) {
    if (!lastWeightsUsed) return;
    if (newPage < 1 || (totalPages > 0 && newPage > totalPages)) return;
    await fetchGoatPage(newPage, pageSize, mode, lastWeightsUsed);
  }

  async function changePageSize(newSize: number) {
    const clamped = Math.max(1, Math.min(200, newSize));
    setPageSize(clamped);
    if (!lastWeightsUsed) return;
    await fetchGoatPage(1, clamped, mode, lastWeightsUsed);
  }

  async function handleJumpToPage() {
    if (!lastWeightsUsed) return;
    if (!pageInput) return;
    const parsed = parseInt(pageInput, 10);
    if (
      Number.isNaN(parsed) ||
      parsed < 1 ||
      (totalPages > 0 && parsed > totalPages)
    ) {
      setErrorMsg(`Please enter a page between 1 and ${totalPages || 1}.`);
      return;
    }
    await fetchGoatPage(parsed, pageSize, mode, lastWeightsUsed);
  }

  function toggleRow(rowKey: string) {
    setExpandedRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }

  function toggleShowAllStats(rowKey: string) {
    setShowAllStatsRows((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }

  function renderStatGroupsForPlayer(
    player: GoatPlayerResult,
    showOnlyWeighted: boolean
  ) {
    const rawStats = player.stats;
    if (!rawStats) return null;
    if (Object.keys(rawStats).length === 0) return null;

    const modeForPlayer: StatMode = player.season != null ? "season" : "career";

    // Use the same denormalization as SimilarPlayerGenerator for display
    const stats = transformStatsForDisplay(rawStats, modeForPlayer);

    const weightedKeysSet: Set<string> | null =
      showOnlyWeighted && lastWeightsUsed
        ? new Set(Object.keys(lastWeightsUsed).filter((k) => k in stats))
        : null;

    return (
      <>
        {STAT_GROUP_CONFIG.map((group) => {
          const keys =
            modeForPlayer === "career" ? group.careerKeys : group.seasonKeys;
          const availableKeys = keys.filter((k) => {
            if (!(k in stats)) return false;
            if (weightedKeysSet && !weightedKeysSet.has(k)) return false;
            return true;
          });

          if (availableKeys.length === 0) return null;

          return (
            <div key={group.label} style={{ marginBottom: "12px" }}>
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
                {availableKeys.map((k) => {
                  const label = STAT_LABELS[k] ?? k;
                  const value = stats[k];
                  const hasNumericValue = Number.isFinite(value);
                  const valueStr = hasNumericValue
                    ? (value as number).toFixed(3).replace(/\.?0+$/, "")
                    : String(value);

                  // Breakdown value × weight = contribution, only in "stats used" view
                  const weight =
                    showOnlyWeighted && lastWeightsUsed
                      ? lastWeightsUsed[k]
                      : undefined;

                  let breakdown: string | null = null;
                  if (
                    showOnlyWeighted &&
                    weight != null &&
                    hasNumericValue &&
                    Number.isFinite(weight)
                  ) {
                    const contrib = (value as number) * weight;
                    const weightStr = (weight as number)
                      .toFixed(3)
                      .replace(/\.?0+$/, "");
                    const contribStr = contrib.toFixed(3).replace(/\.?0+$/, "");
                    breakdown = `${valueStr} × ${weightStr} = ${contribStr}`;
                  }

                  return (
                    <div key={k}>
                      <strong>{label}:</strong>{" "}
                      {breakdown ? breakdown : valueStr}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  }

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
        GOAT Ranking Engine
      </h1>

      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
          Assign point values to any stats you care about. GOAT score = Σ (stat
          value × your weight).
        </p>
      </div>

      {/* Weight editor box */}
      <div
        style={{
          marginTop: "20px",
          marginBottom: "24px",
          maxWidth: "900px",
          marginInline: "auto",
          backgroundColor: "var(--color-surface)",
          borderRadius: "8px",
          border: "1px solid var(--color-border)",
          padding: "16px",
        }}
      >
        {/* Header + Import button */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "10px",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
            Step 1: Build your GOAT Formula
          </h2>
          <button
            onClick={importDefaultFormula}
            style={{
              padding: "8px 14px",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "var(--color-primary)", // ⬅ stands out
              color: "var(--color-primary-contrast)",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              boxShadow: "var(--shadow-elevated)", // optional extra pop
            }}
          >
            Import Default Formula
          </button>
        </div>

        {showDefaultImportedMsg && (
          <div
            style={{
              marginBottom: "10px",
              fontSize: "0.9rem",
              color: "var(--color-success)",
              textAlign: "left",
            }}
          >
            Default Formula Imported!
          </div>
        )}

        {/* Tabs for groups */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {STAT_GROUP_CONFIG.map((group) => (
            <button
              key={group.label}
              onClick={() => setActiveGroupLabel(group.label)}
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid var(--color-border)",
                backgroundColor:
                  activeGroupLabel === group.label
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                color:
                  activeGroupLabel === group.label
                    ? "var(--color-primary-contrast)"
                    : "var(--color-text-primary)",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Inputs for current group (using SEASON keys as canonical) */}
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            padding: "12px",
            maxHeight: "350px",
            overflowY: "auto",
          }}
        >
          {currentGroup ? (
            <>
              <h3
                style={{
                  marginBottom: "8px",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                }}
              >
                {currentGroup.label}
              </h3>
              <p
                style={{
                  color: "var(--color-text-muted)",
                  marginBottom: "10px",
                  fontSize: "0.9rem",
                }}
              >
                Enter a point value for any stat you want to include. Leave it
                blank or 0 to ignore.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                }}
              >
                {currentGroupSeasonKeys.map((statKey) => {
                  const label = STAT_LABELS[statKey] ?? statKey;
                  const value = weightInputs[statKey] ?? "";
                  return (
                    <div key={statKey}>
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span>
                          <strong>{label}</strong> <br />
                          <span
                            style={{
                              color: "var(--color-text-muted)",
                              fontSize: "0.8rem",
                            }}
                          >
                            ({statKey})
                          </span>
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={value}
                          onChange={(e) =>
                            handleWeightChange(statKey, e.target.value)
                          }
                          style={{
                            padding: "4px 6px",
                            borderRadius: "4px",
                            border: "1px solid var(--color-border)",
                            backgroundColor: "var(--color-bg)",
                            color: "var(--color-text-primary)",
                            textAlign: "center",
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div>No group selected.</div>
          )}
        </div>
      </div>

      {/* Calculate button + pagination controls */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          Step 2: Calculate GOAT Scores
        </h2>

        {/* Mode selector (only affects which dataset we calculate on) */}
        <div
          style={{
            marginTop: "24px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <button
            onClick={() => setMode("career")}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid var(--color-border)",
              backgroundColor:
                mode === "career"
                  ? "var(--color-primary)"
                  : "var(--color-surface)",
              color:
                mode === "career"
                  ? "var(--color-primary-contrast)"
                  : "var(--color-text-primary)",
              cursor: "pointer",
            }}
          >
            Careers
          </button>
          <button
            onClick={() => setMode("season")}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid var(--color-border)",
              backgroundColor:
                mode === "season"
                  ? "var(--color-primary)"
                  : "var(--color-surface)",
              color:
                mode === "season"
                  ? "var(--color-primary-contrast)"
                  : "var(--color-text-primary)",
              cursor: "pointer",
            }}
          >
            Seasons
          </button>
        </div>

        <button
          onClick={handleCalculate}
          disabled={isLoading}
          style={{
            padding: "10px 20px",
            backgroundColor: "var(--color-primary)",
            color: "var(--color-primary-contrast)",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {isLoading ? "Calculating..." : "Calculate"}
        </button>

        {/* Page size */}
        <div style={{ marginTop: "12px", fontSize: "0.9rem" }}>
          <label>
            Results per page:{" "}
            <select
              value={pageSize}
              onChange={(e) => changePageSize(parseInt(e.target.value, 10))}
              style={{ padding: "4px 6px" }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto 16px",
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid var(--color-warning-border)",
            backgroundColor: "var(--color-warning-bg)",
            color: "var(--color-warning-text)",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {(results.length > 0 || isLoading) && (
        <div style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
            GOAT Rankings
          </h2>

          <div
            style={{
              marginBottom: "10px",
              fontSize: "0.9rem",
              color: "var(--color-text-muted)",
            }}
          >
            {totalPages > 0 ? (
              <>
                Showing {results.length} of {totalCount} result
                {totalCount === 1 ? "" : "s"}. Page{" "}
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  style={{
                    width: "60px",
                    padding: "2px 4px",
                    borderRadius: "4px",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-bg)",
                    color: "var(--color-text-primary)",
                    marginLeft: "4px",
                    marginRight: "4px",
                  }}
                />{" "}
                of {totalPages}.
                {/* Show Go only if user changed the value and it's not empty */}
                {pageInput !== "" &&
                  pageInput !== String(page) &&
                  totalPages > 1 && (
                    <button
                      onClick={handleJumpToPage}
                      disabled={isLoading || !lastWeightsUsed}
                      style={{
                        marginLeft: "8px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-text-primary)",
                        cursor:
                          isLoading || !lastWeightsUsed ? "default" : "pointer",
                      }}
                    >
                      Go
                    </button>
                  )}
              </>
            ) : (
              <>No results yet.</>
            )}
          </div>

          {/* Pagination controls */}
          <div
            style={{
              marginBottom: "8px",
              display: "flex",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || isLoading || !lastWeightsUsed}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
                cursor:
                  page <= 1 || isLoading || !lastWeightsUsed
                    ? "default"
                    : "pointer",
              }}
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={
                page >= totalPages ||
                isLoading ||
                !lastWeightsUsed ||
                totalPages === 0
              }
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
                cursor:
                  page >= totalPages ||
                  isLoading ||
                  !lastWeightsUsed ||
                  totalPages === 0
                    ? "default"
                    : "pointer",
              }}
            >
              Next
            </button>
          </div>

          {/* NEW: small loading indicator ABOVE list, but keep old results visible */}
          {isLoading && (
            <div
              style={{
                textAlign: "center",
                fontSize: "0.95rem",
                color: "var(--color-text-muted)",
                marginBottom: "8px",
              }}
            >
              Loading...
            </div>
          )}

          {/* Results list stays rendered during loading */}
          {results.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                alignItems: "center",
              }}
            >
              {results.map((player, index) => {
                const rowKey =
                  mode === "season" && player.season != null
                    ? `${player.playerId}_${player.season}`
                    : player.playerId;

                const isExpanded = expandedRows[rowKey] ?? false;
                const showAll = showAllStatsRows[rowKey] ?? false;

                const teamText =
                  player.teams && player.teams.length > 0
                    ? player.teams.join(", ")
                    : "";

                const displayYears =
                  mode === "season" && player.season != null
                    ? `${player.season}`
                    : player.years;

                const rank = (page - 1) * pageSize + index + 1;

                return (
                  <div
                    key={rowKey + "_" + index}
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      padding: "20px",
                      width: "90vw",
                      maxWidth: "700px",
                      boxShadow: "var(--shadow-elevated)",
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div>
                        <strong>#{rank}</strong> <strong>{player.name}</strong>{" "}
                        ({displayYears})
                      </div>

                      {teamText && <div>Team(s): {teamText}</div>}

                      <div>
                        GOAT Score:{" "}
                        {player.goatScore.toFixed(3).replace(/\.?0+$/, "")}
                      </div>

                      <button
                        onClick={() => toggleRow(rowKey)}
                        style={{
                          marginTop: "6px",
                          padding: "6px 12px",
                          backgroundColor: "var(--color-success)",
                          color: "var(--color-primary-contrast)",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {isExpanded ? "Hide Stats" : "See Stats"}
                      </button>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "12px",
                          border: "1px solid var(--color-border)",
                          borderRadius: "4px",
                          padding: "14px",
                          backgroundColor: "var(--color-bg)",
                          maxHeight: "350px",
                          overflowY: "auto",
                        }}
                      >
                        <h4
                          style={{
                            marginBottom: "8px",
                            fontSize: "1rem",
                            fontWeight: 700,
                          }}
                        >
                          Stats used in GOAT calculation
                        </h4>
                        {renderStatGroupsForPlayer(player, true)}

                        <div
                          style={{
                            marginTop: "10px",
                            textAlign: "center",
                          }}
                        >
                          <button
                            onClick={() => toggleShowAllStats(rowKey)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "var(--color-secondary)",
                              color: "var(--color-primary-contrast)",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            {showAll ? "Hide extra stats" : "See More Stats"}
                          </button>
                        </div>

                        {showAll && (
                          <>
                            <h4
                              style={{
                                marginTop: "12px",
                                marginBottom: "8px",
                                fontSize: "1rem",
                                fontWeight: 700,
                              }}
                            >
                              All available stats
                            </h4>
                            {renderStatGroupsForPlayer(player, false)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
