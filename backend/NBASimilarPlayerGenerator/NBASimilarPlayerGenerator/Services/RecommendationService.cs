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

        // peaks and starts, keyed by window size N
        private readonly Dictionary<int, string> _peakFileByWindow = new();
        private readonly Dictionary<int, string> _startFileByWindow = new();

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

        private void IndexPeakCsvs(string basePath)
        {
            foreach (var path in Directory.GetFiles(basePath, "nba_player_peaks_*.csv"))
            {
                var fileName = Path.GetFileNameWithoutExtension(path);
                var parts = fileName.Split('_');
                if (!int.TryParse(parts.Last(), out var windowSize) || windowSize <= 0) continue;
                _peakFileByWindow[windowSize] = path;
            }
        }

        private void IndexStartCsvs(string basePath)
        {
            foreach (var path in Directory.GetFiles(basePath, "nba_player_starts_*.csv"))
            {
                var fileName = Path.GetFileNameWithoutExtension(path);
                var parts = fileName.Split('_');
                if (!int.TryParse(parts.Last(), out var windowSize) || windowSize <= 0) continue;
                _startFileByWindow[windowSize] = path;
            }
        }

        private static List<dynamic> LoadCsvRows(string path)
        {
            using var reader = new StreamReader(path);
            using var csv = new CsvReader(reader, CultureInfo.InvariantCulture);
            return csv.GetRecords<dynamic>().ToList();
        }

        public RecommendationService(IWebHostEnvironment env)
        {
            try
            {
                var basePath = Path.Combine(env.ContentRootPath, "stats");
                Console.WriteLine($"[RecommendationService] basePath = {basePath}");

                if (!Directory.Exists(basePath))
                {
                    throw new DirectoryNotFoundException($"Stats folder not found at '{basePath}'.");
                }

                var seasonsPath = Path.Combine(basePath, "nba_player_seasons.csv");
                var careersPath = Path.Combine(basePath, "nba_player_careers.csv");

                if (!File.Exists(seasonsPath) || !File.Exists(careersPath))
                {
                    throw new FileNotFoundException(
                        "Required CSVs not found. Expected:\n" +
                        $"  {seasonsPath}\n  {careersPath}");
                }

                // Load season + career CSVs (existing)
                using var readerSeasons = new StreamReader(seasonsPath);
                using var csvSeasons = new CsvReader(readerSeasons, CultureInfo.InvariantCulture);
                _seasonRows = csvSeasons.GetRecords<dynamic>().ToList();

                using var readerCareers = new StreamReader(careersPath);
                using var csvCareers = new CsvReader(readerCareers, CultureInfo.InvariantCulture);
                _careerRows = csvCareers.GetRecords<dynamic>().ToList();

                // Build feature groups (existing)
                _seasonFeatureGroups = BuildSeasonFeatureGroups(_seasonRows);
                _careerFeatureGroups = BuildCareerFeatureGroups(_careerRows);

                // Build player lookups / stat dictionaries (existing)
                BuildLookupsFromSeasons();
                BuildLookupsFromCareers();

                // NEW: load peaks and starts
                IndexPeakCsvs(basePath);
                IndexStartCsvs(basePath);

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
                ("Shooting", 115, 133),
                ("Championships", 134, 135),
                ("All-League Teams", 136, 149),
                ("Individual Awards", 150, 161)
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
                ("Shooting", 113, 131),
                ("Championships", 132, 133),
                ("All-League Teams", 134, 147),
                ("Individual Awards", 148, 159)
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

        // At class level in RecommendationService
        private static readonly Dictionary<string, int> GROUP_START_YEAR = new()
        {
            // Started in 1947
            ["Career Info"] = 1947,
            ["Season Info"] = 1947,
            ["Per Game"] = 1947,
            ["Totals"] = 1947,
            ["Advanced"] = 1947,
            ["Championships"] = 1947,
            ["All-League Teams"] = 1947,

            // Started in 1948
            ["Individual Awards"] = 1948,

            // Started in 1974
            ["Per 100"] = 1974,

            // Started in 1997
            ["Play by Play"] = 1997,
            ["Shooting"] = 1997
        };

        private Dictionary<string, int> GetSeasonTargetNonNullCounts(
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
                throw new InvalidOperationException(
                    $"No row found for player_id='{playerId}', season={season} in seasons data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;
            var result = new Dictionary<string, int>();

            foreach (var g in selectedGroups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    continue; // should not happen, but be defensive

                int count = 0;
                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                        count++;
                }

                result[g] = count;
            }

            return result;
        }

        private Dictionary<string, int> GetCareerTargetNonNullCounts(
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
                throw new InvalidOperationException(
                    $"player_id='{playerId}' not found in careers data.");

            var targetRow = (IDictionary<string, object?>)targetRowDyn;
            var result = new Dictionary<string, int>();

            foreach (var g in selectedGroups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    continue;

                int count = 0;
                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                        count++;
                }

                result[g] = count;
            }

            return result;
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

        private IEnumerable<dynamic> FilterSeasonRowsByGroups(
    Dictionary<string, List<string>> featureGroups,
    List<string> selectedGroups,
    Dictionary<string, int> targetNonNullCounts)
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

                    if (!targetNonNullCounts.TryGetValue(g, out var targetCount) || targetCount <= 0)
                    {
                        // target has no stats in this group – by this point that
                        // really shouldn't happen because of pruning/validation,
                        // but if it does, drop this group.
                        keep = false;
                        break;
                    }

                    int candidateCount = 0;
                    foreach (var col in groupCols)
                    {
                        if (!row.ContainsKey(col)) continue;
                        if (TryGetNumericOrBool(row[col], out _))
                            candidateCount++;
                    }

                    var minRequired = (int)Math.Ceiling(targetCount / 2.0);

                    if (candidateCount < minRequired)
                    {
                        keep = false;
                        break;
                    }
                }

                if (keep)
                    yield return rowDyn;
            }
        }

        private static Dictionary<string, double> ExtractNumericStatsFromRow(
            IDictionary<string, object?> row,
            params string[] excludedColumns)
        {
            var exclude = new HashSet<string>(excludedColumns ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            var dict = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in row)
            {
                var key = kvp.Key;
                if (exclude.Contains(key))
                    continue;

                if (TryGetNumericOrBool(kvp.Value, out var v))
                {
                    dict[key] = v;
                }
            }

            return dict;
        }

        private Dictionary<string, int> GetTargetNonNullCountsFromRow(
            IDictionary<string, object?> targetRow,
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups)
        {
            var result = new Dictionary<string, int>();

            foreach (var g in selectedGroups)
            {
                if (!featureGroups.TryGetValue(g, out var groupCols))
                    continue;

                int count = 0;
                foreach (var col in groupCols)
                {
                    if (!targetRow.ContainsKey(col)) continue;
                    if (TryGetNumericOrBool(targetRow[col], out _))
                        count++;
                }

                result[g] = count;
            }

            return result;
        }

        // Generic row filter (replaces old FilterCareerRowsByGroups)
        private IEnumerable<dynamic> FilterRowsByGroups(
            IEnumerable<dynamic> sourceRows,
            Dictionary<string, List<string>> featureGroups,
            List<string> selectedGroups,
            Dictionary<string, int> targetNonNullCounts)
        {
            foreach (var rowDyn in sourceRows)
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

                    if (!targetNonNullCounts.TryGetValue(g, out var targetCount) || targetCount <= 0)
                    {
                        keep = false;
                        break;
                    }

                    int candidateCount = 0;
                    foreach (var col in groupCols)
                    {
                        if (!row.ContainsKey(col)) continue;
                        if (TryGetNumericOrBool(row[col], out _))
                            candidateCount++;
                    }

                    var minRequired = (int)Math.Ceiling(targetCount / 2.0);

                    if (candidateCount < minRequired)
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

        // Services/RecommendationService.cs

        public PlayerDto? GetPeakWindowStats(string playerId, int fromSeason, int toSeason)
        {
            if (string.IsNullOrWhiteSpace(playerId))
                return null;

            if (toSeason < fromSeason)
                return null;

            int windowSize = toSeason - fromSeason + 1;
            if (!_peakFileByWindow.TryGetValue(windowSize, out var path) || !File.Exists(path))
                return null;

            var rows = LoadCsvRows(path);
            if (rows.Count == 0) return null;

            var rowDyn = rows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                var fromStr = row["from_season"]?.ToString();
                var toStr = row["to_season"]?.ToString();

                return pid == playerId
                       && int.TryParse(fromStr, out var fs) && fs == fromSeason
                       && int.TryParse(toStr, out var ts) && ts == toSeason;
            });

            if (rowDyn is null)
                return null;

            var rowDict = (IDictionary<string, object?>)rowDyn;

            // Base info from global lookup if possible
            _players.TryGetValue(playerId, out var basePlayer);

            var name = basePlayer?.Name ?? rowDict["player"]?.ToString() ?? playerId;

            // window label like "2008-2011"
            string yearsLabel = $"{fromSeason}-{toSeason}";

            // Teams for this window
            var teamsStr = rowDict.TryGetValue("teams", out var tVal) ? tVal?.ToString() : null;
            var teams = string.IsNullOrWhiteSpace(teamsStr)
                ? basePlayer?.Teams ?? new List<string>()
                : teamsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                          .Select(t => t.Trim())
                          .Where(t => t.Length > 0)
                          .Distinct()
                          .ToList();

            var stats = ExtractNumericStatsFromRow(rowDict, "player", "player_id", "teams", "from_season", "to_season");

            return new PlayerDto
            {
                PlayerId = playerId,
                Name = name,
                Years = yearsLabel,
                Teams = teams,
                CareerStats = stats
            };
        }

        public PlayerDto? GetStartWindowStats(string playerId, int nSeasons)
        {
            if (string.IsNullOrWhiteSpace(playerId) || nSeasons <= 0)
                return null;

            if (!_startFileByWindow.TryGetValue(nSeasons, out var path) || !File.Exists(path))
                return null;

            var rows = LoadCsvRows(path);
            if (rows.Count == 0) return null;

            var rowDyn = rows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                return pid == playerId;
            });

            if (rowDyn is null)
                return null;

            var rowDict = (IDictionary<string, object?>)rowDyn;

            _players.TryGetValue(playerId, out var basePlayer);
            var name = basePlayer?.Name ?? rowDict["player"]?.ToString() ?? playerId;

            // We have from_season and to_season in the CSV
            int.TryParse(rowDict["from_season"]?.ToString(), out var fromSeason);
            int.TryParse(rowDict["to_season"]?.ToString(), out var toSeason);

            string yearsLabel = (fromSeason > 0 && toSeason > 0)
                ? $"{fromSeason}-{toSeason}"
                : $"{nSeasons} seasons (start)";

            var teamsStr = rowDict.TryGetValue("teams", out var tVal) ? tVal?.ToString() : null;
            var teams = string.IsNullOrWhiteSpace(teamsStr)
                ? basePlayer?.Teams ?? new List<string>()
                : teamsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                          .Select(t => t.Trim())
                          .Where(t => t.Length > 0)
                          .Distinct()
                          .ToList();

            var stats = ExtractNumericStatsFromRow(rowDict, "player", "player_id", "teams", "from_season", "to_season");

            return new PlayerDto
            {
                PlayerId = playerId,
                Name = name,
                Years = yearsLabel,
                Teams = teams,
                CareerStats = stats
            };
        }

        // ---------- Public API: Season Recommendations ----------

        public RecommendationResult GetSeasonRecommendations(
    string playerId,
    int season,
    RecommendationOptions options)
        {
            var fg = _seasonFeatureGroups;
            var result = new RecommendationResult();

            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                // Use preset ("stats"/"all"/"accolades")
                groupNames = ResolveGroups(options, fg);
            }
            else
            {
                // Custom selection; no throwing, we’ll adjust via warnings + dropping
                groupNames = options.Groups!;
            }

            // Compute how many stats the TARGET has in each requested group
            var targetCountsAll = GetSeasonTargetNonNullCounts(playerId, season, fg, groupNames);

            var effectiveGroups = new List<string>();
            var droppedGroups = new List<string>();
            var playerName = _players.TryGetValue(playerId, out var p) ? p.Name : playerId;

            foreach (var g in groupNames)
            {
                targetCountsAll.TryGetValue(g, out var count);
                GROUP_START_YEAR.TryGetValue(g, out var startYear);

                // 1) Season before the stat existed → ignore, explain
                if (startYear > 0 && season < startYear)
                {
                    result.Warnings.Add(
                        $"{playerName}'s {season} season occurred before {g} stats started being tracked in {startYear}. Ignoring {g} for this comparison."
                    );
                    droppedGroups.Add(g);
                    continue;
                }

                // 2) No usable stats for this group in this season → ignore, explain
                if (count <= 0)
                {
                    result.Warnings.Add(
                        $"{playerName} has no stats recorded in group '{g}' for season {season}. Ignoring {g} for this comparison."
                    );
                    droppedGroups.Add(g);
                    continue;
                }

                // otherwise we can use this group
                effectiveGroups.Add(g);
            }

            if (!effectiveGroups.Any())
            {
                // No groups left → no similarity possible, but we still return nicely
                result.Warnings.Add(
                    $"No usable stat groups remain for {playerName} in season {season} after dropping unsupported groups, so no similar players can be generated."
                );
                return result;
            }

            // Recompute counts but only for the effective groups, since the filter uses them
            var targetNonNullCounts = GetSeasonTargetNonNullCounts(playerId, season, fg, effectiveGroups);

            // Filter season rows: they must have at least half as many non-null stats
            // in each effective group as the target player.
            var filteredRows = FilterSeasonRowsByGroups(fg, effectiveGroups, targetNonNullCounts);
            var rowList = filteredRows.ToList();

            // Build matrix [rowIndex, colIndex] for feature values
            var featureCols = GetFeatureColumns(fg, effectiveGroups);

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
            {
                result.Warnings.Add("Target season missing after filtering; no recommendations returned.");
                return result;
            }

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

            var orderedSims = sims.OrderByDescending(s => s.Score);

            List<(string Key, double Score)> top;
            if (options.LimitOnePerPlayer)
            {
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                top = orderedSims
                    .Where(s =>
                    {
                        var pidPart = s.Key.Split('_')[0];
                        return seen.Add(pidPart);
                    })
                    .Take(options.TopN)
                    .ToList();
            }
            else
            {
                top = orderedSims
                    .Take(options.TopN)
                    .ToList();
            }

            foreach (var (key, score) in top)
            {
                var parts = key.Split('_');
                var pid = parts[0];
                var yr = int.Parse(parts[1]);

                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                var seasonLabel = $"{pid}_{yr}";
                _seasonStats.TryGetValue(seasonLabel, out var seasonStats);

                result.Players.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = yr.ToString(), // for season mode
                    Teams = new List<string>
            {
                basePlayer.Seasons?.FirstOrDefault(s => s.Year == yr)?.Team ?? ""
            },
                    SeasonStats = seasonStats,
                    SimilarityScore = score
                });
            }

            return result;
        }

        // ---------- Public API: Career Recommendations ----------

        public RecommendationResult GetCareerRecommendations(
    string playerId,
    RecommendationOptions options)
        {
            var fg = _careerFeatureGroups;
            var result = new RecommendationResult();

            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                groupNames = ResolveGroups(options, fg);
                // keep initial set; now we’ll adjust rather than throw
            }
            else
            {
                groupNames = options.Groups!;
                // no more ValidateCareerTargetHasGroups throwing
                // we’ll handle missing groups via warnings and dropping
            }

            // Count non-null stats the target has in each group
            var targetCounts = GetCareerTargetNonNullCounts(playerId, fg, groupNames);

            // Determine which groups we can actually use, and build warnings
            var effectiveGroups = new List<string>();
            var playerName = _players.TryGetValue(playerId, out var p) ? p.Name : playerId;
            (int From, int To) span;
            _spanById.TryGetValue(playerId, out span); // span.From / span.To may be 0 if missing

            var droppedGroups = new List<string>();

            foreach (var g in groupNames)
            {
                targetCounts.TryGetValue(g, out var count);
                GROUP_START_YEAR.TryGetValue(g, out var startYear);

                // If we know the tracking start year and the span:
                if (startYear > 0 && span.To > 0)
                {
                    // 1) Entire career before the stat existed → ignore, explain
                    if (span.To < startYear)
                    {
                        result.Warnings.Add(
                            $"{playerName} ended his career before {g} stats started being tracked in {startYear}. Ignoring {g} for this comparison."
                        );
                        droppedGroups.Add(g);
                        continue;
                    }

                    // 2) Career straddles the start year → warn but we may still use group
                    if (span.From < startYear && span.To >= startYear)
                    {
                        result.Warnings.Add(
                            $"{playerName} played some seasons before {g} stats started being tracked in {startYear}, so those early seasons aren't accounted for in this stat group."
                        );
                    }
                }

                // 3) If the player has zero usable stats in this group at all, drop it
                if (count <= 0)
                {
                    result.Warnings.Add(
                        $"{playerName} has no stats recorded in group '{g}'. Ignoring {g} for this comparison."
                    );
                    droppedGroups.Add(g);
                    continue;
                }

                // otherwise we can use this group
                effectiveGroups.Add(g);
            }

            if (!effectiveGroups.Any())
            {
                // No groups left → no similarity possible, but we still return nicely
                result.Warnings.Add(
                    $"No usable stat groups remain for {playerName} after dropping unsupported groups, so no similar players can be generated."
                );
                return result;
            }

            // -------- Now run your existing pipeline using effectiveGroups instead of groupNames --------

            var filteredRows = FilterRowsByGroups(
                _careerRows,
                fg,
                effectiveGroups,
                GetCareerTargetNonNullCounts(playerId, fg, effectiveGroups)
            );
            var rowList = filteredRows.ToList();

            var featureCols = GetFeatureColumns(fg, effectiveGroups);
            int rows = rowList.Count;
            int cols = featureCols.Count;

            var matrix = new double?[rows, cols];
            var idList = new List<string>(rows);

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
            {
                // Should be extremely rare; fail gracefully.
                result.Warnings.Add("Target career missing after filtering; no recommendations returned.");
                return result;
            }

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

            foreach (var (pid, score) in top)
            {
                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                _careerStats.TryGetValue(pid, out var cstats);

                result.Players.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = basePlayer.Years,
                    Teams = basePlayer.Teams,
                    CareerStats = cstats,
                    SimilarityScore = score
                });
            }

            return result;
        }

        public RecommendationResult GetPeakRecommendations(
    string playerId,
    int fromSeason,
    int toSeason,
    RecommendationOptions options)
        {
            var result = new RecommendationResult();

            if (string.IsNullOrWhiteSpace(playerId))
            {
                result.Warnings.Add("Invalid player ID.");
                return result;
            }

            if (toSeason < fromSeason)
            {
                result.Warnings.Add("End season must be >= start season.");
                return result;
            }

            int windowSize = toSeason - fromSeason + 1;
            if (!_peakFileByWindow.TryGetValue(windowSize, out var path) || !File.Exists(path))
            {
                result.Warnings.Add($"No peak windows available for window size N={windowSize}.");
                return result;
            }

            var allRows = LoadCsvRows(path);
            if (allRows.Count == 0)
            {
                result.Warnings.Add($"No peak windows available for window size N={windowSize}.");
                return result;
            }

            var fg = _careerFeatureGroups;

            // Resolve groups (like career)
            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                groupNames = ResolveGroups(options, fg);
            }
            else
            {
                groupNames = options.Groups!;
            }

            // Find target row for this player + window
            var targetRowDyn = allRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                var fromStr = row["from_season"]?.ToString();
                var toStr = row["to_season"]?.ToString();

                return pid == playerId
                       && int.TryParse(fromStr, out var fs) && fs == fromSeason
                       && int.TryParse(toStr, out var ts) && ts == toSeason;
            });

            var playerName = _players.TryGetValue(playerId, out var p) ? p.Name : playerId;

            if (targetRowDyn is null)
            {
                result.Warnings.Add(
                    $"No peak window found for {playerName} from {fromSeason} to {toSeason}. " +
                    "This usually means that span is not a contiguous block of seasons."
                );
                return result;
            }

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            // Count usable stats per group for this window
            var targetCounts = GetTargetNonNullCountsFromRow(targetRow, fg, groupNames);

            var effectiveGroups = new List<string>();
            foreach (var g in groupNames)
            {
                targetCounts.TryGetValue(g, out var count);
                if (count <= 0)
                {
                    result.Warnings.Add(
                        $"{playerName} has no stats recorded in group '{g}' for this window ({fromSeason}-{toSeason}). Ignoring {g}."
                    );
                    continue;
                }
                effectiveGroups.Add(g);
            }

            if (!effectiveGroups.Any())
            {
                result.Warnings.Add(
                    $"No usable stat groups remain for {playerName} in his {fromSeason}-{toSeason} window, so no similar players can be generated."
                );
                return result;
            }

            // Filter candidate rows by coverage
            var targetCountsEffective = GetTargetNonNullCountsFromRow(targetRow, fg, effectiveGroups);
            var filteredRows = FilterRowsByGroups(allRows, fg, effectiveGroups, targetCountsEffective).ToList();

            // Build feature matrix
            var featureCols = GetFeatureColumns(fg, effectiveGroups);
            int rows = filteredRows.Count;
            int cols = featureCols.Count;

            var matrix = new double?[rows, cols];
            var idList = new List<string>(rows);

            for (int i = 0; i < rows; i++)
            {
                var drow = (IDictionary<string, object?>)filteredRows[i];
                var pid = drow["player_id"]?.ToString()?.Trim();
                var fromStr = drow["from_season"]?.ToString();
                var toStr = drow["to_season"]?.ToString();

                if (pid == null || !int.TryParse(fromStr, out var fs) || !int.TryParse(toStr, out var ts))
                    continue;

                var key = $"{pid}|{fs}|{ts}";
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
            var targetKey = $"{playerId}|{fromSeason}|{toSeason}";
            var targetIndex = idList.IndexOf(targetKey);

            if (targetIndex < 0)
            {
                result.Warnings.Add("Target peak window missing after filtering; no recommendations returned.");
                return result;
            }

            var sims = new List<(int RowIndex, string Key, double Score)>();
            var targetVec = Enumerable.Range(0, cols).Select(c => scaled[targetIndex, c]).ToList();

            for (int i = 0; i < rows; i++)
            {
                if (i == targetIndex) continue;

                var otherKey = idList[i];
                var parts = otherKey.Split('|');
                var otherPid = parts[0];

                // Drop same player's other windows
                if (otherPid == playerId) continue;

                var otherVec = Enumerable.Range(0, cols).Select(c => scaled[i, c]).ToList();
                var sim = CosineSimWithPairwiseDrop(targetVec, otherVec);
                if (sim.HasValue)
                {
                    sims.Add((i, otherKey, sim.Value));
                }
            }

            var orderedSims = sims.OrderByDescending(s => s.Score);

            List<(int RowIndex, string Key, double Score)> top;
            if (options.LimitOnePerPlayer)
            {
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                top = orderedSims
                    .Where(s =>
                    {
                        var pidPart = s.Key.Split('|')[0];
                        return seen.Add(pidPart);
                    })
                    .Take(options.TopN)
                    .ToList();
            }
            else
            {
                top = orderedSims
                    .Take(options.TopN)
                    .ToList();
            }

            foreach (var (rowIndex, key, score) in top)
            {
                var parts = key.Split('|');
                var pid = parts[0];
                int.TryParse(parts[1], out var fs);
                int.TryParse(parts[2], out var ts);

                var drow = (IDictionary<string, object?>)filteredRows[rowIndex];

                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                var labelYears = $"{fs}-{ts}";

                // Teams specifically for this window, fall back to global teams
                var teamsStr = drow.TryGetValue("teams", out var tVal) ? tVal?.ToString() : null;
                var teams = string.IsNullOrWhiteSpace(teamsStr)
                    ? basePlayer.Teams ?? new List<string>()
                    : teamsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                              .Select(t => t.Trim())
                              .Where(t => t.Length > 0)
                              .Distinct()
                              .ToList();

                var stats = ExtractNumericStatsFromRow(drow, "player", "player_id", "teams", "from_season", "to_season");

                result.Players.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = labelYears,
                    Teams = teams,
                    CareerStats = stats,
                    SimilarityScore = score
                });
            }

            return result;
        }

        public RecommendationResult GetStartRecommendations(
    string playerId,
    int nSeasons,
    RecommendationOptions options)
        {
            var result = new RecommendationResult();

            if (string.IsNullOrWhiteSpace(playerId) || nSeasons <= 0)
            {
                result.Warnings.Add("Invalid player ID or season count.");
                return result;
            }

            if (!_startFileByWindow.TryGetValue(nSeasons, out var path) || !File.Exists(path))
            {
                result.Warnings.Add($"No start windows available for N={nSeasons} seasons.");
                return result;
            }

            var allRows = LoadCsvRows(path);
            if (allRows.Count == 0)
            {
                result.Warnings.Add($"No start windows available for N={nSeasons} seasons.");
                return result;
            }

            var fg = _careerFeatureGroups;

            bool presetMode = options.Groups == null || !options.Groups.Any();
            List<string> groupNames;

            if (presetMode)
            {
                groupNames = ResolveGroups(options, fg);
            }
            else
            {
                groupNames = options.Groups!;
            }

            // Find target row for this player (first N seasons)
            var targetRowDyn = allRows.FirstOrDefault(r =>
            {
                var row = (IDictionary<string, object?>)r;
                var pid = row["player_id"]?.ToString()?.Trim();
                return pid == playerId;
            });

            var playerName = _players.TryGetValue(playerId, out var p) ? p.Name : playerId;

            if (targetRowDyn is null)
            {
                result.Warnings.Add(
                    $"{playerName} does not have at least {nSeasons} seasons in the dataset.");
                return result;
            }

            var targetRow = (IDictionary<string, object?>)targetRowDyn;

            var targetCounts = GetTargetNonNullCountsFromRow(targetRow, fg, groupNames);

            var effectiveGroups = new List<string>();
            foreach (var g in groupNames)
            {
                targetCounts.TryGetValue(g, out var count);
                if (count <= 0)
                {
                    result.Warnings.Add(
                        $"{playerName} has no stats recorded in group '{g}' in his first {nSeasons} seasons. Ignoring {g}."
                    );
                    continue;
                }
                effectiveGroups.Add(g);
            }

            if (!effectiveGroups.Any())
            {
                result.Warnings.Add(
                    $"No usable stat groups remain for {playerName} in his first {nSeasons} seasons, so no similar players can be generated."
                );
                return result;
            }

            var targetCountsEffective = GetTargetNonNullCountsFromRow(targetRow, fg, effectiveGroups);
            var filteredRows = FilterRowsByGroups(allRows, fg, effectiveGroups, targetCountsEffective).ToList();

            var featureCols = GetFeatureColumns(fg, effectiveGroups);
            int rows = filteredRows.Count;
            int cols = featureCols.Count;

            var matrix = new double?[rows, cols];
            var idList = new List<string>(rows);

            for (int i = 0; i < rows; i++)
            {
                var drow = (IDictionary<string, object?>)filteredRows[i];
                var pid = drow["player_id"]?.ToString()?.Trim();
                if (pid == null) continue;

                // from/to seasons just for labeling
                var fromStr = drow["from_season"]?.ToString();
                var toStr = drow["to_season"]?.ToString();
                int.TryParse(fromStr, out var fs);
                int.TryParse(toStr, out var ts);

                var key = $"{pid}|{fs}|{ts}";
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
            // target key has player's row, but from/to may be used, we can match by pid only
            var targetIndex = idList.FindIndex(k => k.StartsWith(playerId + "|", StringComparison.OrdinalIgnoreCase));

            if (targetIndex < 0)
            {
                result.Warnings.Add("Target start window missing after filtering; no recommendations returned.");
                return result;
            }

            var sims = new List<(int RowIndex, string Key, double Score)>();
            var targetVec = Enumerable.Range(0, cols).Select(c => scaled[targetIndex, c]).ToList();

            for (int i = 0; i < rows; i++)
            {
                if (i == targetIndex) continue;

                var otherKey = idList[i];
                var parts = otherKey.Split('|');
                var otherPid = parts[0];

                if (otherPid == playerId) continue;

                var otherVec = Enumerable.Range(0, cols).Select(c => scaled[i, c]).ToList();
                var sim = CosineSimWithPairwiseDrop(targetVec, otherVec);
                if (sim.HasValue)
                {
                    sims.Add((i, otherKey, sim.Value));
                }
            }

            var top = sims
                .OrderByDescending(s => s.Score)
                .Take(options.TopN)
                .ToList();

            foreach (var (rowIndex, key, score) in top)
            {
                var parts = key.Split('|');
                var pid = parts[0];
                int.TryParse(parts[1], out var fs);
                int.TryParse(parts[2], out var ts);

                var drow = (IDictionary<string, object?>)filteredRows[rowIndex];

                if (!_players.TryGetValue(pid, out var basePlayer))
                    continue;

                string yearsLabel = (fs > 0 && ts > 0) ? $"{fs}-{ts}" : $"{nSeasons} seasons (start)";

                var teamsStr = drow.TryGetValue("teams", out var tVal) ? tVal?.ToString() : null;
                var teams = string.IsNullOrWhiteSpace(teamsStr)
                    ? basePlayer.Teams ?? new List<string>()
                    : teamsStr.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                              .Select(t => t.Trim())
                              .Where(t => t.Length > 0)
                              .Distinct()
                              .ToList();

                var stats = ExtractNumericStatsFromRow(drow, "player", "player_id", "teams", "from_season", "to_season");

                result.Players.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = basePlayer.Name,
                    Years = yearsLabel,
                    Teams = teams,
                    CareerStats = stats,
                    SimilarityScore = score
                });
            }

            return result;
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

        // ---------- Public API: GOAT Ranking ----------

        private double? ComputeWeightedScore(
    IDictionary<string, object?> row,
    Dictionary<string, double> weights)
        {
            double score = 0;
            bool hasContribution = false;

            foreach (var kvp in weights)
            {
                var statKey = kvp.Key;
                var weight = kvp.Value;

                if (!row.ContainsKey(statKey))
                    continue;

                if (TryGetNumericOrBool(row[statKey], out var val))
                {
                    score += val * weight;
                    hasContribution = true;
                }
            }

            return hasContribution ? score : (double?)null;
        }

        public GoatResponse CalculateGoatScores(GoatRequest request)
        {
            if (request == null)
                throw new ArgumentNullException(nameof(request));

            var mode = (request.Mode ?? "career").Trim().ToLowerInvariant();
            if (mode != "career" && mode != "season" && mode != "peak" && mode != "start")
            {
                mode = "career";
            }

            int? nSeasons = request.NSeasons;
            bool limitOnePerPlayer = request.LimitOnePerPlayer;

            int page = request.Page <= 0 ? 1 : request.Page;
            int pageSize = request.PageSize <= 0 ? 25 : request.PageSize;
            pageSize = Math.Min(pageSize, 200); // hard cap to avoid silly sizes

            var rawWeights = request.Weights ?? new Dictionary<string, double>();
            var weights = rawWeights
                .Where(kvp => !double.IsNaN(kvp.Value) && kvp.Value != 0.0)
                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value, StringComparer.OrdinalIgnoreCase);

            // If no weights, nothing meaningful to compute
            if (!weights.Any())
            {
                return new GoatResponse
                {
                    Page = 1,
                    PageSize = pageSize,
                    TotalCount = 0,
                    TotalPages = 0,
                    Players = new List<GoatPlayerResult>()
                };
            }

            var results = new List<GoatPlayerResult>();

            if (mode == "season")
            {
                Dictionary<string, GoatPlayerResult>? bestByPlayer =
                    limitOnePerPlayer
                        ? new Dictionary<string, GoatPlayerResult>(StringComparer.OrdinalIgnoreCase)
                        : null;

                foreach (var rowDyn in _seasonRows)
                {
                    var row = (IDictionary<string, object?>)rowDyn;

                    var playerId = row["player_id"]?.ToString()?.Trim();
                    var seasonStr = row["season"]?.ToString();

                    if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(seasonStr))
                        continue;

                    if (!int.TryParse(seasonStr, out var season))
                        continue;

                    double score = 0;
                    bool hasContribution = false;

                    foreach (var kvp in weights)
                    {
                        var statKey = kvp.Key;
                        var weight = kvp.Value;

                        if (!row.ContainsKey(statKey))
                            continue;

                        if (TryGetNumericOrBool(row[statKey], out var val))
                        {
                            score += val * weight;
                            hasContribution = true;
                        }
                    }

                    if (!hasContribution)
                        continue;

                    _players.TryGetValue(playerId, out var basePlayer);
                    var name = basePlayer?.Name ?? row["player"]?.ToString() ?? playerId;
                    var years = season.ToString();

                    string? team = row.ContainsKey("team") ? row["team"]?.ToString() : null;

                    var statsDict = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                    foreach (var kvp in row)
                    {
                        if (TryGetNumericOrBool(kvp.Value, out var v))
                            statsDict[kvp.Key] = v;
                    }

                    var teams = new List<string>();
                    if (!string.IsNullOrWhiteSpace(team))
                        teams.Add(team);

                    var candidate = new GoatPlayerResult
                    {
                        PlayerId = playerId,
                        Name = name ?? playerId,
                        Years = years,
                        Teams = teams,
                        Season = season,
                        GoatScore = score,
                        Stats = statsDict
                    };

                    if (!limitOnePerPlayer)
                    {
                        results.Add(candidate);
                    }
                    else
                    {
                        if (!bestByPlayer!.TryGetValue(playerId, out var existing) || candidate.GoatScore > existing.GoatScore)
                            bestByPlayer[playerId] = candidate;
                    }
                }

                if (limitOnePerPlayer && bestByPlayer != null)
                    results = bestByPlayer.Values.ToList();
            }
            else if (mode == "peak")
            {
                var n = nSeasons ?? 0;
                if (n <= 0)
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                if (!_peakFileByWindow.TryGetValue(n, out var path) || !File.Exists(path))
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                var allRows = LoadCsvRows(path);
                if (allRows.Count == 0)
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                // Best window per playerId
                Dictionary<string, GoatPlayerResult>? bestByPlayer =
                    limitOnePerPlayer
                        ? new Dictionary<string, GoatPlayerResult>(StringComparer.OrdinalIgnoreCase)
                        : null;

                foreach (var rowDyn in allRows)
                {
                    var row = (IDictionary<string, object?>)rowDyn;

                    var playerId = row.TryGetValue("player_id", out var pidObj)
                        ? pidObj?.ToString()?.Trim()
                        : null;

                    if (string.IsNullOrWhiteSpace(playerId))
                        continue;

                    var scoreOrNull = ComputeWeightedScore(row, weights);
                    if (!scoreOrNull.HasValue)
                        continue;

                    double score = scoreOrNull.Value;

                    int.TryParse(row.TryGetValue("from_season", out var fsObj) ? fsObj?.ToString() : null, out var fromSeason);
                    int.TryParse(row.TryGetValue("to_season", out var tsObj) ? tsObj?.ToString() : null, out var toSeason);

                    _players.TryGetValue(playerId, out var basePlayer);
                    var name = basePlayer?.Name
                        ?? (row.TryGetValue("player", out var pObj) ? pObj?.ToString() : null)
                        ?? playerId;

                    // Window teams if present, else fallback to career teams
                    List<string> teams;
                    var teamsStr = row.TryGetValue("teams", out var tObj) ? tObj?.ToString() : null;
                    if (!string.IsNullOrWhiteSpace(teamsStr))
                    {
                        teams = teamsStr
                            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(t => t.Trim())
                            .Where(t => t.Length > 0)
                            .Distinct()
                            .ToList();
                    }
                    else
                    {
                        teams = basePlayer?.Teams ?? (_teamsById.TryGetValue(playerId, out var ts) ? ts : new List<string>());
                    }

                    var yearsLabel = (fromSeason > 0 && toSeason > 0)
                        ? $"{fromSeason}-{toSeason}"
                        : $"{n} season peak";

                    var statsDict = ExtractNumericStatsFromRow(
                        row,
                        "player", "player_id", "teams", "from_season", "to_season"
                    );

                    var candidate = new GoatPlayerResult
                    {
                        PlayerId = playerId,
                        Name = name ?? playerId,
                        Years = yearsLabel,
                        Teams = teams,
                        Season = null,          // keep null for non-season modes
                        GoatScore = score,
                        Stats = statsDict
                    };

                    if (!limitOnePerPlayer)
                    {
                        results.Add(candidate);
                    }
                    else
                    {
                        if (!bestByPlayer!.TryGetValue(playerId, out var existing) || candidate.GoatScore > existing.GoatScore)
                            bestByPlayer[playerId] = candidate;
                    }
                }

                if (limitOnePerPlayer && bestByPlayer != null)
                    results = bestByPlayer.Values.ToList();
            }
            else if (mode == "start")
            {
                var n = nSeasons ?? 0;
                if (n <= 0)
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                if (!_startFileByWindow.TryGetValue(n, out var path) || !File.Exists(path))
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                var allRows = LoadCsvRows(path);
                if (allRows.Count == 0)
                {
                    return new GoatResponse
                    {
                        Page = 1,
                        PageSize = pageSize,
                        TotalCount = 0,
                        TotalPages = 0,
                        Players = new List<GoatPlayerResult>()
                    };
                }

                foreach (var rowDyn in allRows)
                {
                    var row = (IDictionary<string, object?>)rowDyn;

                    var playerId = row.TryGetValue("player_id", out var pidObj)
                        ? pidObj?.ToString()?.Trim()
                        : null;

                    if (string.IsNullOrWhiteSpace(playerId))
                        continue;

                    var scoreOrNull = ComputeWeightedScore(row, weights);
                    if (!scoreOrNull.HasValue)
                        continue;

                    double score = scoreOrNull.Value;

                    int.TryParse(row.TryGetValue("from_season", out var fsObj) ? fsObj?.ToString() : null, out var fromSeason);
                    int.TryParse(row.TryGetValue("to_season", out var tsObj) ? tsObj?.ToString() : null, out var toSeason);

                    _players.TryGetValue(playerId, out var basePlayer);
                    var name = basePlayer?.Name
                        ?? (row.TryGetValue("player", out var pObj) ? pObj?.ToString() : null)
                        ?? playerId;

                    List<string> teams;
                    var teamsStr = row.TryGetValue("teams", out var tObj) ? tObj?.ToString() : null;
                    if (!string.IsNullOrWhiteSpace(teamsStr))
                    {
                        teams = teamsStr
                            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(t => t.Trim())
                            .Where(t => t.Length > 0)
                            .Distinct()
                            .ToList();
                    }
                    else
                    {
                        teams = basePlayer?.Teams ?? (_teamsById.TryGetValue(playerId, out var ts) ? ts : new List<string>());
                    }

                    var yearsLabel = (fromSeason > 0 && toSeason > 0)
                        ? $"{fromSeason}-{toSeason}"
                        : $"{n} seasons (start)";

                    var statsDict = ExtractNumericStatsFromRow(
                        row,
                        "player", "player_id", "teams", "from_season", "to_season"
                    );

                    results.Add(new GoatPlayerResult
                    {
                        PlayerId = playerId,
                        Name = name ?? playerId,
                        Years = yearsLabel,
                        Teams = teams,
                        Season = null,
                        GoatScore = score,
                        Stats = statsDict
                    });
                }
            }
            else
            {
                // Career mode
                foreach (var rowDyn in _careerRows)
                {
                    var row = (IDictionary<string, object?>)rowDyn;

                    var playerId = row["player_id"]?.ToString()?.Trim();
                    if (string.IsNullOrWhiteSpace(playerId))
                        continue;

                    double score = 0;
                    bool hasContribution = false;

                    foreach (var kvp in weights)
                    {
                        var statKey = kvp.Key;
                        var weight = kvp.Value;

                        if (!row.ContainsKey(statKey))
                            continue;

                        if (TryGetNumericOrBool(row[statKey], out var val))
                        {
                            score += val * weight;
                            hasContribution = true;
                        }
                    }

                    if (!hasContribution)
                        continue;

                    _players.TryGetValue(playerId, out var basePlayer);
                    var name = basePlayer?.Name ?? row["player"]?.ToString() ?? playerId;

                    string years;
                    if (basePlayer?.Years is { Length: > 0 })
                    {
                        years = basePlayer.Years;
                    }
                    else
                    {
                        var fromSeasonStr = row["from_season"]?.ToString();
                        var toSeasonStr = row["to_season"]?.ToString();
                        years = $"{fromSeasonStr}-{toSeasonStr}";
                    }

                    List<string> teams;
                    if (basePlayer?.Teams != null && basePlayer.Teams.Any())
                    {
                        teams = basePlayer.Teams;
                    }
                    else
                    {
                        var teamsStr = row["teams"]?.ToString();
                        teams = string.IsNullOrWhiteSpace(teamsStr)
                            ? new List<string>()
                            : teamsStr
                                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                                .Select(t => t.Trim())
                                .Where(t => t.Length > 0)
                                .Distinct()
                                .ToList();
                    }

                    var statsDict = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                    foreach (var kvp in row)
                    {
                        if (TryGetNumericOrBool(kvp.Value, out var v))
                        {
                            statsDict[kvp.Key] = v;
                        }
                    }

                    results.Add(new GoatPlayerResult
                    {
                        PlayerId = playerId,
                        Name = name ?? playerId,
                        Years = years,
                        Teams = teams,
                        Season = null,
                        GoatScore = score,
                        Stats = statsDict
                    });
                }
            }

            // Sort & paginate
            var ordered = results.OrderByDescending(r => r.GoatScore).ToList();
            var totalCount = ordered.Count;
            var totalPages = totalCount == 0
                ? 0
                : (int)Math.Ceiling(totalCount / (double)pageSize);

            if (totalPages == 0)
            {
                return new GoatResponse
                {
                    Page = 1,
                    PageSize = pageSize,
                    TotalCount = 0,
                    TotalPages = 0,
                    Players = new List<GoatPlayerResult>()
                };
            }

            if (page > totalPages)
                page = totalPages;

            var skip = (page - 1) * pageSize;
            var pageItems = ordered.Skip(skip).Take(pageSize).ToList();

            return new GoatResponse
            {
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount,
                TotalPages = totalPages,
                Players = pageItems
            };
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

    }
}
