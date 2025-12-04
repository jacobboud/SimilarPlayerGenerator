import { useState } from "react";
import axios from "axios";
import { STAT_GROUP_CONFIG, STAT_LABELS } from "../statsConfig";
import { GoatMode, GoatPlayerResult, GoatResponse } from "../types";

type WeightMap = Record<string, string>; // string for inputs
type NumericWeightMap = Record<string, number>;

export default function GoatPage() {
  const [mode, setMode] = useState<GoatMode>("career");
  const [activeGroupLabel, setActiveGroupLabel] = useState<string>(
    STAT_GROUP_CONFIG[0]?.label ?? "Per Game"
  );

  const [careerWeights, setCareerWeights] = useState<WeightMap>({});
  const [seasonWeights, setSeasonWeights] = useState<WeightMap>({});

  const [results, setResults] = useState<GoatPlayerResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showAllStatsRows, setShowAllStatsRows] = useState<
    Record<string, boolean>
  >({});

  const [lastWeightsUsed, setLastWeightsUsed] =
    useState<NumericWeightMap | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentWeights = mode === "career" ? careerWeights : seasonWeights;
  const setCurrentWeights =
    mode === "career" ? setCareerWeights : setSeasonWeights;

  const currentGroup = STAT_GROUP_CONFIG.find(
    (g) => g.label === activeGroupLabel
  );

  const currentGroupKeys =
    currentGroup == null
      ? []
      : mode === "career"
      ? currentGroup.careerKeys
      : currentGroup.seasonKeys;

  function handleWeightChange(statKey: string, value: string) {
    setCurrentWeights((prev) => ({
      ...prev,
      [statKey]: value,
    }));
  }

  function buildNumericWeights(): NumericWeightMap {
    const source = currentWeights;
    const numeric: NumericWeightMap = {};

    Object.entries(source).forEach(([key, value]) => {
      if (value === "" || value == null) return;
      const num = parseFloat(value);
      if (!Number.isNaN(num) && num !== 0) {
        numeric[key] = num;
      }
    });

    return numeric;
  }

  async function fetchGoatPage(
    targetPage: number,
    targetPageSize: number,
    modeToUse: GoatMode,
    weights: NumericWeightMap
  ) {
    if (Object.keys(weights).length === 0) {
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
          weights,
        }
      );

      const data = res.data;
      setResults(data.players ?? []);
      setPage(data.page);
      setPageSize(data.pageSize);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
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
    const weights = buildNumericWeights();
    setLastWeightsUsed(weights);
    await fetchGoatPage(1, pageSize, mode, weights);
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
    const stats = player.stats;
    if (!stats) return null;
    if (Object.keys(stats).length === 0) return null;

    const weightedKeysSet: Set<string> | null =
      showOnlyWeighted && lastWeightsUsed
        ? new Set(Object.keys(lastWeightsUsed).filter((k) => k in stats))
        : null;

    const modeForPlayer: GoatMode = player.season != null ? "season" : "career";

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
                  return (
                    <div key={k}>
                      <strong>{label}:</strong>{" "}
                      {Number.isFinite(value)
                        ? value.toFixed(3).replace(/\.?0+$/, "")
                        : value}
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

      {/* Mode selector */}
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
          Career GOAT
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
          Season GOAT
        </button>
      </div>

      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "left",
        }}
      >
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem" }}>
          Assign point values to any stats you care about. GOAT score = Σ (stat
          value × your weight). No standardization, just pure counting chaos.
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
        <h2 style={{ fontSize: "1.2rem", marginBottom: "10px" }}>
          Step 1: Build your GOAT Formula
        </h2>

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

        {/* Inputs for current group */}
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
                {currentGroup.label} ({mode === "career" ? "Career" : "Season"}{" "}
                stats)
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
                {currentGroupKeys.map((statKey) => {
                  const label = STAT_LABELS[statKey] ?? statKey;
                  const value = currentWeights[statKey] ?? "";
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
                          <strong>{label}</strong>{" "}
                          <span
                            style={{
                              color: "var(--color-text-muted)",
                              fontSize: "0.8rem",
                            }}
                          ></span>
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

        <div
          style={{
            marginBottom: "10px",
            color: "var(--color-text-muted)",
          }}
        >
          {mode === "career"
            ? "Ranking full careers across NBA history."
            : "Ranking individual seasons across NBA history (each player-season is its own entry)."}
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
            textAlign: "left",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
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
            Showing {results.length} of {totalCount} result
            {totalCount === 1 ? "" : "s"}. Page {page} of {totalPages}.
          </div>

          {/* Pagination controls */}
          <div
            style={{
              marginBottom: "16px",
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
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div>
                        <strong>{player.name}</strong> ({displayYears})
                      </div>
                      {teamText && <div>Team(s): {teamText}</div>}
                      <div>
                        GOAT Score:{" "}
                        {player.goatScore.toFixed(3).replace(/\.?0+$/, "")}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRow(rowKey)}
                      style={{
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
        </div>
      )}
    </div>
  );
}
