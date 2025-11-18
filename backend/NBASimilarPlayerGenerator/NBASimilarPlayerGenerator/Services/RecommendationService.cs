// Services/RecommendationService.cs
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using CsvHelper;
using Microsoft.AspNetCore.Hosting;
using NBASimilarPlayerGenerator.Models;

namespace NBASimilarPlayerGenerator.Services
{
    public class RecommendationService : IRecommendationService
    {
        private readonly List<dynamic> _seasonRows;
        private readonly List<dynamic> _careerRows;

        // Lookups
        private readonly Dictionary<string, PlayerDto> _players = new();
        private readonly Dictionary<string, List<int>> _playerSeasons = new();    // playerId -> seasons
        private readonly Dictionary<string, Dictionary<string, double>> _seasonStats = new(); // "id_season" -> stats
        private readonly Dictionary<string, Dictionary<string, double>> _careerStats = new(); // id -> stats
        private readonly Dictionary<string, string> _playerNameById = new();       // id -> name
        private readonly Dictionary<string, (int From, int To)> _spanById = new(); // id -> career span
        private readonly Dictionary<string, List<string>> _teamsById = new();      // id -> all teams

        // Feature groups (mirroring the notebook)
        private readonly Dictionary<string, List<string>> _seasonFeatureGroups;
        private readonly Dictionary<string, List<string>> _careerFeatureGroups;

        private static readonly string[] INFO_GROUPS = { "Career Info", "Season Info" };
        private static readonly string[] STATS_GROUPS = {
            "Per Game", "Totals", "Advanced", "Per 100", "Play by Play", "Shooting"
        };
        private static readonly string[] ACCOLADE_GROUPS = {
            "Championships", "All-League Teams", "Individual Awards"
        };

        public RecommendationService(IWebHostEnvironment env)
        {
            try
            {
                var basePath = env.ContentRootPath;
                var seasonsPath = Path.Combine(basePath, "nba_player_seasons.csv");
                var careersPath = Path.Combine(basePath, "nba_player_careers.csv");

                // Load CSVs
                using var readerSeasons = new StreamReader(seasonsPath);
                using var csvSeasons = new CsvReader(readerSeasons, CultureInfo.InvariantCulture);
                _seasonRows = csvSeasons.GetRecords<dynamic>().ToList();

                using var readerCareers = new StreamReader(careersPath);
                using var csvCareers = new CsvReader(readerCareers, CultureInfo.InvariantCulture);
                _careerRows = csvCareers.GetRecords<dynamic>().ToList();

                // Build feature group dictionaries (same ranges as notebook)
                _seasonFeatureGroups = BuildSeasonFeatureGroups(_seasonRows);
                _careerFeatureGroups = BuildCareerFeatureGroups(_careerRows);

                // Build player lookups and stat dictionaries
                BuildLookupsFromSeasons();
                BuildLookupsFromCareers();

                Console.WriteLine("✅ RecommendationService initialized successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("💥 Error initializing RecommendationService:");
                Console.WriteLine(ex.ToString());
                throw;
            }
        }

        // ---------- Feature Groups ----------

        private Dictionary<string, List<string>> BuildSeasonFeatureGroups(List<dynamic> rows)
        {
            // Get header order from first row (CsvHelper's dynamic has a dictionary-like interface)
            var first = (IDictionary<string, object?>)rows[0];
            var columns = first.Keys.ToList(); // index order matches CSV

            var groupSpecsSeasons = new (string Name, int Start, int End)[]
            {
                ("Career Info", 0, 9),
                ("Season Info", 10, 15),
                ("Per Game", 16, 40),
                ("Totals", 41, 59),
                ("Advanced", 60, 79),
                ("Per 100", 80, 98),
                ("Play by Play", 99, 114),
                ("Shooting", 115, 135),
                ("Championships", 136, 137),
                ("All-League Teams", 138, 151),
                ("Individual Awards", 152, 163)
            };

            var dict = new Dictionary<string, List<string>>();

            foreach (var (name, start, end) in groupSpecsSeasons)
            {
                var slice = columns
                    .Skip(start)
                    .Take(end - start + 1)
                    .Where(c => !string.IsNullOrWhiteSpace(c))
                    .ToList();

                dict[name] = slice;
            }

            return dict;
        }

        private Dictionary<string, List<string>> BuildCareerFeatureGroups(List<dynamic> rows)
        {
            var first = (IDictionary<string, object?>)rows[0];
            var columns = first.Keys.ToList();

            var groupSpecsCareers = new (string Name, int Start, int End)[]
            {
                ("Career Info", 0, 9),
                ("Season Info", 10, 13),
                ("Per Game", 14, 38),
                ("Totals", 39, 57),
                ("Advanced", 58, 77),
                ("Per 100", 78, 96),
                ("Play by Play", 97, 112),
                ("Shooting", 113, 133),
                ("Championships", 134, 135),
                ("All-League Teams", 136, 149),
                ("Individual Awards", 150, 161)
            };

            var dict = new Dictionary<string, List<string>>();

            foreach (var (name, start, end) in groupSpecsCareers)
            {
                var slice = columns
                    .Skip(start)
                    .Take(end - start + 1)
                    .Where(c => !string.IsNullOrWhiteSpace(c))
                    .ToList();

                dict[name] = slice;
            }

            return dict;
        }

        private static List<string> GetFeatureColumns(
            Dictionary<string, List<string>> featureGroups,
            IEnumerable<string> groups)
        {
            var cols = new List<string>();
            foreach (var g in groups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    throw new ArgumentException($"Unknown group: {g}");

                cols.AddRange(groupCols);
            }

            var seen = new HashSet<string>();
            var ordered = new List<string>();
            foreach (var c in cols)
            {
                if (seen.Add(c))
                    ordered.Add(c);
            }
            return ordered;
        }

        private static IEnumerable<string> GetAllGroups(Dictionary<string, List<string>> fg) =>
            fg.Keys.Where(g => !INFO_GROUPS.Contains(g));

        private List<string> ResolveGroups(RecommendationOptions options, Dictionary<string, List<string>> fg)
        {
            // Explicit groups override presets
            if (options.Groups != null && options.Groups.Any())
                return options.Groups;

            var preset = options.GroupsPreset?.ToLowerInvariant() ?? "stats";

            if (preset == "all")
                return GetAllGroups(fg).ToList();
            if (preset == "accolades")
                return ACCOLADE_GROUPS.Where(g => fg.ContainsKey(g)).ToList();

            // default "stats"
            return STATS_GROUPS.Where(g => fg.ContainsKey(g)).ToList();
        }

        // ---------- Lookups from Seasons / Careers ----------

        private void BuildLookupsFromSeasons()
        {
            foreach (var rowDyn in _seasonRows)
            {
                var row = (IDictionary<string, object?>)rowDyn;

                var playerId = row["player_id"]?.ToString()?.Trim();
                var seasonStr = row["season"]?.ToString();
                var playerName = row["player"]?.ToString();
                var team = row["team"]?.ToString();

                if (string.IsNullOrEmpty(playerId) || string.IsNullOrEmpty(seasonStr) || string.IsNullOrEmpty(playerName))
                    continue;

                if (!int.TryParse(seasonStr, out var season))
                    continue;

                // player basic info
                if (!_players.ContainsKey(playerId))
                {
                    _players[playerId] = new PlayerDto
                    {
                        PlayerId = playerId,
                        Name = playerName,
                        Years = "", // we'll fill from careers/span later
                        Teams = new List<string>(),
                        Seasons = new List<SeasonDto>()
                    };
                }

                if (!_playerNameById.ContainsKey(playerId))
                    _playerNameById[playerId] = playerName;

                // seasons list
                if (!_playerSeasons.ContainsKey(playerId))
                    _playerSeasons[playerId] = new List<int>();
                if (!_playerSeasons[playerId].Contains(season))
                    _playerSeasons[playerId].Add(season);

                // teams
                if (!_teamsById.ContainsKey(playerId))
                    _teamsById[playerId] = new List<string>();
                if (!string.IsNullOrEmpty(team) && !_teamsById[playerId].Contains(team))
                    _teamsById[playerId].Add(team);

                // season stats: numeric/bool fields
                var stats = new Dictionary<string, double>();
                foreach (var kvp in row)
                {
                    var key = kvp.Key;
                    if (key is "player" or "player_id" or "team" or "season") continue;

                    if (TryGetNumericOrBool(kvp.Value, out var val))
                    {
                        stats[key] = val;
                    }
                }

                var label = $"{playerId}_{season}";
                _seasonStats[label] = stats;

                // attach minimal season info to the PlayerDto
                _players[playerId].Seasons!.Add(new SeasonDto
                {
                    Year = season,
                    Team = team ?? "",
                    Stats = stats
                });
            }

            // Sort seasons descending for convenience
            foreach (var kvp in _playerSeasons)
            {
                kvp.Value.Sort();
                kvp.Value.Reverse();
            }
        }

        private void BuildLookupsFromCareers()
        {
            foreach (var rowDyn in _careerRows)
            {
                var row = (IDictionary<string, object?>)rowDyn;

                var playerId = row["player_id"]?.ToString()?.Trim();
                var playerName = row["player"]?.ToString();
                var fromSeasonStr = row["from_season"]?.ToString();
                var toSeasonStr = row["to_season"]?.ToString();
                var teamsStr = row["teams"]?.ToString();

                if (string.IsNullOrEmpty(playerId) || string.IsNullOrEmpty(playerName))
                    continue;

                int.TryParse(fromSeasonStr, out var fromSeason);
                int.TryParse(toSeasonStr, out var toSeason);

                _spanById[playerId] = (fromSeason, toSeason);

                if (!_players.ContainsKey(playerId))
                {
                    _players[playerId] = new PlayerDto
                    {
                        PlayerId = playerId,
                        Name = playerName,
                        Teams = new List<string>(),
                        Seasons = new List<SeasonDto>()
                    };
                }

                // Parse career-level teams (correct, deduplicated, non-hyphenated)
                if (!string.IsNullOrWhiteSpace(teamsStr))
                {
                    var teamsList = teamsStr
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(t => t.Trim())
                        .Where(t => t.Length > 0)
                        .Distinct()
                        .ToList();

                    if (teamsList.Count > 0)
                    {
                        // Override any season-based teams
                        _teamsById[playerId] = teamsList;

                        if (_players.TryGetValue(playerId, out var player))
                        {
                            player.Teams = teamsList;
                        }
                    }
                }

                // Build career stats dictionary (numeric-only)
                var stats = new Dictionary<string, double>();
                foreach (var kvp in row)
                {
                    var key = kvp.Key;
                    if (key is "player" or "player_id" or "teams" or "from_season" or "to_season") continue;

                    if (TryGetNumericOrBool(kvp.Value, out var val))
                    {
                        stats[key] = val;
                    }
                }

                _careerStats[playerId] = stats;
            }

            // Fill PlayerDto.Years and Teams if not set
            foreach (var (playerId, player) in _players)
            {
                if (_spanById.TryGetValue(playerId, out var span))
                {
                    // match pretty_print_recs logic: start = from_season - 1
                    var start = span.From - 1;
                    var end = span.To;
                    player.Years = $"{start}-{end}";
                }

                if (_teamsById.TryGetValue(playerId, out var teams))
                {
                    player.Teams = teams;
                }

                if (_careerStats.TryGetValue(playerId, out var cstats))
                {
                    player.CareerStats = cstats;
                }
            }
        }

        // ---------- Filtering / Validation Helpers ----------

        private void ValidateSeasonTargetHasGroups(
            string playerId,
            int season,
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups)
        {
            var targetRowDyn = _seasonRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                var seasonStr = row["season"]?.ToString();
                return pid == playerId && seasonStr == season.ToString();
            });

            if (targetRowDyn is null)
                throw new InvalidOperationException($"No row found for player_id='{playerId}', season={season} in seasons data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            foreach (var g in selectedGroups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    throw new ArgumentException($"Unknown group: {g}");

                bool hasAny = false;

                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                    {
                        hasAny = true;
                        break;
                    }
                }

                if (!hasAny)
                {
                    throw new InvalidOperationException(
                        $"Player id {playerId} in season {season} has no stats in group '{g}'. " +
                        "Remove that group or choose a different player."
                    );
                }
            }
        }

        private IEnumerable<dynamic> FilterSeasonRowsByGroups(
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups)
        {
            foreach (var rowDyn in _seasonRows)
            {
                var row = (IDictionary<string, object?>)rowDyn;
                bool keep = true;

                foreach (var g in selectedGroups)
                {
                    if (!featureGroups.TryGetValue(g, out var groupCols))
                    {
                        keep = false;
                        break;
                    }

                    bool hasAny = false;

                    foreach (var col in groupCols)
                    {
                        if (!row.ContainsKey(col)) continue;
                        if (TryGetNumericOrBool(row[col], out _))
                        {
                            hasAny = true;
                            break;
                        }
                    }

                    if (!hasAny)
                    {
                        keep = false;
                        break;
                    }
                }

                if (keep)
                    yield return rowDyn;
            }
        }

        private void ValidateCareerTargetHasGroups(
            string playerId,
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups)
        {
            var targetRowDyn = _careerRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                return pid == playerId;
            });

            if (targetRowDyn is null)
                throw new InvalidOperationException($"player_id='{playerId}' not found in careers data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            foreach (var g in selectedGroups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    throw new ArgumentException($"Unknown group: {g}");

                bool hasAny = false;

                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                    {
                        hasAny = true;
                        break;
                    }
                }

                if (!hasAny)
                {
                    throw new InvalidOperationException(
                        $"Player id {playerId} has no stats in group '{g}'. " +
                        "Remove that group or choose a different player."
                    );
                }
            }
        }

        private IEnumerable<dynamic> FilterCareerRowsByGroups(
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups)
        {
            foreach (var rowDyn in _careerRows)
            {
                var row = (IDictionary<string, object?>)rowDyn;
                bool keep = true;

                foreach (var g in selectedGroups)
                {
                    if (!featureGroups.TryGetValue(g, out var groupCols))
                    {
                        keep = false;
                        break;
                    }

                    bool hasAny = false;

                    foreach (var col in groupCols)
                    {
                        if (!row.ContainsKey(col)) continue;
                        if (TryGetNumericOrBool(row[col], out _))
                        {
                            hasAny = true;
                            break;
                        }
                    }

                    if (!hasAny)
                    {
                        keep = false;
                        break;
                    }
                }

                if (keep)
                    yield return rowDyn;
            }
        }

        // ---------- Math Helpers (cosine + standardization) ----------

        private static double? CosineSimWithPairwiseDrop(
            IReadOnlyList<double?> v1,
            IReadOnlyList<double?> v2)
        {
            if (v1.Count != v2.Count) throw new ArgumentException("Vectors must be same length.");

            double dot = 0;
            double norm1 = 0;
            double norm2 = 0;
            int count = 0;

            for (int i = 0; i < v1.Count; i++)
            {
                var a = v1[i];
                var b = v2[i];
                if (!a.HasValue || !b.HasValue) continue;

                count++;
                dot += a.Value * b.Value;
                norm1 += a.Value * a.Value;
                norm2 += b.Value * b.Value;
            }

            if (count == 0 || norm1 == 0 || norm2 == 0)
                return null;

            return dot / (Math.Sqrt(norm1) * Math.Sqrt(norm2));
        }

        private static double?[,] StandardizeMatrix(double?[,] matrix)
        {
            int rows = matrix.GetLength(0);
            int cols = matrix.GetLength(1);

            var result = new double?[rows, cols];

            for (int j = 0; j < cols; j++)
            {
                double sum = 0;
                double sumSq = 0;
                int count = 0;

                for (int i = 0; i < rows; i++)
                {
                    var v = matrix[i, j];
                    if (!v.HasValue) continue;
                    sum += v.Value;
                    sumSq += v.Value * v.Value;
                    count++;
                }

                if (count == 0)
                {
                    for (int i = 0; i < rows; i++)
                        result[i, j] = null;
                    continue;
                }

                var mean = sum / count;
                var variance = sumSq / count - mean * mean;
                var std = variance <= 0 ? 0 : Math.Sqrt(variance);

                for (int i = 0; i < rows; i++)
                {
                    var v = matrix[i, j];
                    if (!v.HasValue)
                    {
                        result[i, j] = null;
                    }
                    else if (std == 0)
                    {
                        result[i, j] = 0; // all same
                    }
                    else
                    {
                        result[i, j] = (v.Value - mean) / std;
                    }
                }
            }

            return result;
        }

        // ---------- Public API: Season Recommendations ----------

        public List<PlayerDto> GetSeasonRecommendations(
    string playerId,
    int season,
    RecommendationOptions options)
        {
            var fg = _seasonFeatureGroups;

            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                // Use preset ("stats"/"all"/"accolades") then prune groups the player lacks
                groupNames = ResolveGroups(options, fg);
                groupNames = PruneGroupsForSeasonTarget(playerId, season, fg, groupNames);

                if (!groupNames.Any())
                {
                    throw new InvalidOperationException(
                        $"Player id {playerId} in season {season} has no stats in any of the preset-selected groups.");
                }
            }
            else
            {
                // Explicit list: strict mode (error if they lack a group)
                groupNames = options.Groups!;
                ValidateSeasonTargetHasGroups(playerId, season, fg, groupNames);
            }

            // Filter season rows: must have some data in each group
            var filteredRows = FilterSeasonRowsByGroups(fg, groupNames);
            var rowList = filteredRows.ToList();

            // Build matrix [rowIndex, colIndex] for feature values
            var featureCols = GetFeatureColumns(fg, groupNames);

            int rows = rowList.Count;
            int cols = featureCols.Count;

            var matrix = new double?[rows, cols];
            var idList = new List<string>(rows); // "playerId_season"

            for (int i = 0; i < rows; i++)
            {
                var drow = (IDictionary<string, object?>)rowList[i];
                var pid = drow["player_id"]?.ToString()?.Trim();
                var seasonStr = drow["season"]?.ToString();
                if (pid == null || seasonStr == null) continue;
                if (!int.TryParse(seasonStr, out var s)) continue;

                var key = $"{pid}_{s}";
                idList.Add(key);

                for (int j = 0; j < cols; j++)
                {
                    var colName = featureCols[j];
                    if (!drow.ContainsKey(colName))
                    {
                        matrix[i, j] = null;
                        continue;
                    }

                    if (TryGetNumericOrBool(drow[colName], out var val))
                        matrix[i, j] = val;
                    else
                        matrix[i, j] = null;
                }
            }

            var scaled = StandardizeMatrix(matrix);

            var targetKey = $"{playerId}_{season}";
            var targetIndex = idList.IndexOf(targetKey);
            if (targetIndex < 0)
                throw new InvalidOperationException("Target season missing after filtering.");

            // similarity to all
            var sims = new List<(string Key, double Score)>();
            var targetVec = Enumerable.Range(0, cols).Select(c => scaled[targetIndex, c]).ToList();

            for (int i = 0; i < rows; i++)
            {
                if (i == targetIndex) continue;

                var otherKey = idList[i];
                var otherVec = Enumerable.Range(0, cols).Select(c => scaled[i, c]).ToList();
                var sim = CosineSimWithPairwiseDrop(targetVec, otherVec);
                if (sim.HasValue)
                {
                    // Drop same player's other seasons
                    var pidPart = otherKey.Split('_')[0];
                    if (pidPart == playerId) continue;

                    sims.Add((otherKey, sim.Value));
                }
            }

            var top = sims
                .OrderByDescending(s => s.Score)
                .Take(options.TopN)
                .ToList();

            // Map to PlayerDto results
            var results = new List<PlayerDto>();
            foreach (var (key, score) in top)
            {
                var parts = key.Split('_');
                var pid = parts[0];
                var yr = int.Parse(parts[1]);

                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                var seasonLabel = $"{pid}_{yr}";
                _seasonStats.TryGetValue(seasonLabel, out var seasonStats);

                results.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = yr.ToString(), // for season mode
                    Teams = new List<string> { basePlayer.Seasons?.FirstOrDefault(s => s.Year == yr)?.Team ?? "" },
                    SeasonStats = seasonStats,
                    SimilarityScore = score
                });
            }

            return results;
        }

        // ---------- Public API: Career Recommendations ----------

        public List<PlayerDto> GetCareerRecommendations(
            string playerId,
            RecommendationOptions options)
        {
            var fg = _careerFeatureGroups;

            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                groupNames = ResolveGroups(options, fg);
                groupNames = PruneGroupsForCareerTarget(playerId, fg, groupNames);

                if (!groupNames.Any())
                {
                    throw new InvalidOperationException(
                        $"Player id {playerId} has no stats in any of the preset-selected groups.");
                }
            }
            else
            {
                groupNames = options.Groups!;
                ValidateCareerTargetHasGroups(playerId, fg, groupNames);
            }

            // Filter careers by group availability
            var filteredRows = FilterCareerRowsByGroups(fg, groupNames);
            var rowList = filteredRows.ToList();

            // Build matrix
            var featureCols = GetFeatureColumns(fg, groupNames);
            int rows = rowList.Count;
            int cols = featureCols.Count;

            var matrix = new double?[rows, cols];
            var idList = new List<string>(rows); // just playerId

            for (int i = 0; i < rows; i++)
            {
                var drow = (IDictionary<string, object?>)rowList[i];
                var pid = drow["player_id"]?.ToString()?.Trim();
                if (pid == null) continue;
                idList.Add(pid);

                for (int j = 0; j < cols; j++)
                {
                    var colName = featureCols[j];
                    if (!drow.ContainsKey(colName))
                    {
                        matrix[i, j] = null;
                        continue;
                    }

                    if (TryGetNumericOrBool(drow[colName], out var val))
                        matrix[i, j] = val;
                    else
                        matrix[i, j] = null;
                }
            }

            var scaled = StandardizeMatrix(matrix);

            var targetIndex = idList.IndexOf(playerId);
            if (targetIndex < 0)
                throw new InvalidOperationException("Target career missing after filtering.");

            // similarity-to-all
            var sims = new List<(string Id, double Score)>();
            var targetVec = Enumerable.Range(0, cols).Select(c => scaled[targetIndex, c]).ToList();

            for (int i = 0; i < rows; i++)
            {
                if (i == targetIndex) continue;

                var otherId = idList[i];
                var otherVec = Enumerable.Range(0, cols).Select(c => scaled[i, c]).ToList();
                var sim = CosineSimWithPairwiseDrop(targetVec, otherVec);
                if (sim.HasValue)
                {
                    sims.Add((otherId, sim.Value));
                }
            }

            var top = sims
                .OrderByDescending(s => s.Score)
                .Take(options.TopN)
                .ToList();

            // Map to PlayerDto results
            var results = new List<PlayerDto>();
            foreach (var (pid, score) in top)
            {
                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                _careerStats.TryGetValue(pid, out var cstats);

                results.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = basePlayer.Years,
                    Teams = basePlayer.Teams,
                    CareerStats = cstats,
                    SimilarityScore = score
                });
            }

            return results;
        }

        // ---------- Public API: Search / Seasons ----------

        public List<PlayerDto> SearchPlayers(string query)
        {
            return _players.Values
                .Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(p => p.Name)
                .ToList();
        }

        public List<int> GetSeasonsForPlayer(string playerId)
        {
            return _playerSeasons.TryGetValue(playerId, out var seasons)
                ? seasons.OrderByDescending(x => x).ToList()
                : new List<int>();
        }

        private static bool TryGetNumericOrBool(object? raw, out double value)
        {
            value = 0;

            if (raw is null)
                return false;

            var s = raw.ToString();
            if (string.IsNullOrWhiteSpace(s))
                return false;

            // Numeric first
            if (double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out value))
                return true;

            // Then boolean
            if (bool.TryParse(s, out var b))
            {
                value = b ? 1.0 : 0.0;
                return true;
            }

            return false;
        }

        private List<string> PruneGroupsForSeasonTarget(
    string playerId,
    int season,
    Dictionary<string, List<string>> featureGroups,
    List<string> groupNames)
        {
            var targetRowDyn = _seasonRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                var seasonStr = row["season"]?.ToString();
                return pid == playerId && seasonStr == season.ToString();
            });

            if (targetRowDyn is null)
                throw new InvalidOperationException($"No row found for player_id='{playerId}', season={season} in seasons data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            var kept = new List<string>();

            foreach (var g in groupNames)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    continue; // should not happen for presets, but be defensive

                bool hasAny = false;

                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                    {
                        hasAny = true;
                        break;
                    }
                }

                if (hasAny)
                {
                    kept.Add(g);
                }
                else
                {
                    // Optional: log dropped groups if you want
                    Console.WriteLine(
                        $"Note: player_id='{playerId}' season={season} has no stats in group '{g}', dropping it from preset.");
                }
            }

            return kept;
        }

        private List<string> PruneGroupsForCareerTarget(
            string playerId,
            Dictionary<string, List<string>> featureGroups,
            List<string> groupNames)
        {
            var targetRowDyn = _careerRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                return pid == playerId;
            });

            if (targetRowDyn is null)
                throw new InvalidOperationException($"player_id='{playerId}' not found in careers data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            var kept = new List<string>();

            foreach (var g in groupNames)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    continue;

                bool hasAny = false;

                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                    {
                        hasAny = true;
                        break;
                    }
                }

                if (hasAny)
                {
                    kept.Add(g);
                }
                else
                {
                    Console.WriteLine(
                        $"Note: player_id='{playerId}' has no stats in group '{g}', dropping it from preset.");
                }
            }

            return kept;
        }

    }
}
