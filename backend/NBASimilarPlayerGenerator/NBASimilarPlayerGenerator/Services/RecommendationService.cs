using System.Text.Json;
using CsvHelper;
using System.Globalization;
using NBASimilarPlayerGenerator.Models;
using Microsoft.AspNetCore.Hosting;

namespace NBASimilarPlayerGenerator.Services
{
    public class RecommendationService : IRecommendationService
    {
        private readonly Dictionary<string, List<SimilarPlayerEntry>> _careerRecs;
        private readonly Dictionary<string, List<SeasonSimilarPlayerEntry>> _seasonRecs;
        private readonly Dictionary<int, List<int>> _playerSeasons;
        private readonly Dictionary<int, PlayerDto> _playerInfo;
        private readonly Dictionary<int, List<string>> _teamMap = new();
        private readonly Dictionary<string, string> _seasonTeams = new();
        private readonly Dictionary<int, Dictionary<string, float>> _careerStats = new();
        private readonly Dictionary<string, Dictionary<string, float>> _seasonStats = new();

        public RecommendationService(IWebHostEnvironment env)
        {
            try
            {
                var basePath = env.ContentRootPath;

                var careerPath = Path.Combine(basePath, "career_recommendations.json");
                var seasonPath = Path.Combine(basePath, "season_recommendations.json");
                var csvPath = Path.Combine(basePath, "player_dataset_CLEANED.csv");

                _careerRecs = LoadJson<Dictionary<string, List<SimilarPlayerEntry>>>(careerPath)
                    .ToDictionary(kvp => kvp.Key.Trim(), kvp => kvp.Value);

                _seasonRecs = LoadJson<Dictionary<string, List<SeasonSimilarPlayerEntry>>>(seasonPath)
                    .ToDictionary(kvp => kvp.Key.Trim(), kvp => kvp.Value);

                using var reader = new StreamReader(csvPath);
                using var csv = new CsvReader(reader, CultureInfo.InvariantCulture);
                var records = csv.GetRecords<dynamic>().ToList();

                _playerInfo = new();
                _playerSeasons = new();

                foreach (var record in records)
                {
                    string? playerIdRaw = record.playerid?.ToString();
                    string? seasonRaw = record.season?.ToString();
                    string? name = record.player?.ToString();
                    string? team = record.team?.ToString();

                    if (!int.TryParse(playerIdRaw, out int playerId)) continue;
                    if (!int.TryParse(seasonRaw, out int season)) continue;
                    if (string.IsNullOrEmpty(name)) continue;

                    if (!_playerSeasons.ContainsKey(playerId))
                        _playerSeasons[playerId] = new List<int>();
                    if (!_playerSeasons[playerId].Contains(season))
                        _playerSeasons[playerId].Add(season);

                    if (!_teamMap.ContainsKey(playerId))
                        _teamMap[playerId] = new List<string>();
                    if (!string.IsNullOrEmpty(team) && !_teamMap[playerId].Contains(team))
                        _teamMap[playerId].Add(team);

                    if (!_playerInfo.ContainsKey(playerId))
                    {
                        _playerInfo[playerId] = new PlayerDto
                        {
                            PlayerId = playerId,
                            Name = name,
                            Years = ""
                        };
                    }

                    var stats = new Dictionary<string, float>();
                    foreach (var kvp in record)
                    {
                        string key = kvp.Key;
                        if (key is "player" or "team" or "season" or "playerid") continue;
                        if (float.TryParse(kvp.Value?.ToString(), out float val))
                            stats[key] = val;
                    }

                    string label = $"{playerId}_{season}";
                    _seasonStats[label] = stats;

                    if (!string.IsNullOrEmpty(team))
                    {
                        _seasonTeams[label] = team;
                    }
                }

                foreach (var kvp in _playerSeasons)
                {
                    var years = kvp.Value;
                    var range = $"{years.Min()}–{years.Max()}";
                    _playerInfo[kvp.Key].Years = range;
                }

                foreach (var playerId in _playerSeasons.Keys)
                {
                    var relevantSeasons = _seasonStats
                        .Where(kvp => kvp.Key.StartsWith($"{playerId}_"))
                        .Select(kvp => kvp.Value)
                        .ToList();

                    var allKeys = relevantSeasons.SelectMany(d => d.Keys).Distinct();
                    var averagedStats = new Dictionary<string, float>();

                    foreach (var key in allKeys)
                    {
                        var vals = relevantSeasons.Where(d => d.ContainsKey(key)).Select(d => d[key]);
                        averagedStats[key] = vals.Average();
                    }

                    _careerStats[playerId] = averagedStats;
                }

                Console.WriteLine("✅ RecommendationService initialized successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("💥 Error initializing RecommendationService:");
                Console.WriteLine(ex.ToString());
                throw;
            }
        }

        private static T LoadJson<T>(string path)
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json, options)!;
        }

        public List<PlayerDto> SearchPlayers(string query)
        {
            return _playerInfo.Values
                .Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(p => p.Name)
                .Select(p => new PlayerDto
                {
                    PlayerId = p.PlayerId,
                    Name = p.Name,
                    Years = p.Years,
                    Teams = _teamMap.GetValueOrDefault(p.PlayerId),
                    CareerStats = _careerStats.GetValueOrDefault(p.PlayerId),
                    Seasons = _playerSeasons.GetValueOrDefault(p.PlayerId)?.Select(season => new SeasonDto
                    {
                        Year = season,
                        Team = _seasonTeams.GetValueOrDefault($"{p.PlayerId}_{season}") ?? _teamMap[p.PlayerId].FirstOrDefault() ?? "",
                        Stats = _seasonStats[$"{p.PlayerId}_{season}"]
                    }).ToList()
                })
                .ToList();
        }

        public List<PlayerDto> GetCareerRecommendations(int playerId)
        {
            string key = playerId.ToString().Trim();
            if (!_careerRecs.TryGetValue(key, out var entries)) return new();

            var result = new List<PlayerDto>();
            foreach (var entry in entries)
            {
                int pid = entry.PlayerId;
                if (!_playerInfo.ContainsKey(pid)) continue;

                var player = _playerInfo[pid];
                result.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = player.Name,
                    Years = player.Years,
                    Teams = _teamMap.GetValueOrDefault(pid),
                    CareerStats = _careerStats.GetValueOrDefault(pid),
                    Seasons = _playerSeasons.GetValueOrDefault(pid)?.Select(season => new SeasonDto
                    {
                        Year = season,
                        Team = _seasonTeams.GetValueOrDefault($"{pid}_{season}") ?? _teamMap[pid].FirstOrDefault() ?? "",
                        Stats = _seasonStats[$"{pid}_{season}"]
                    }).ToList(),
                    SimilarityScore = entry.Score
                });
            }

            return result;
        }

        public List<PlayerDto> GetSeasonRecommendations(int playerId, int season)
        {
            var key = $"{playerId}_{season}".Trim();
            if (!_seasonRecs.TryGetValue(key, out var entries)) return new();

            var result = new List<PlayerDto>();
            foreach (var entry in entries)
            {
                int pid = entry.PlayerId;
                int yr = entry.Season;

                if (!_playerInfo.ContainsKey(pid)) continue;

                var player = _playerInfo[pid];
                result.Add(new PlayerDto
                {
                    PlayerId = pid,
                    Name = player.Name,
                    Years = yr.ToString(),
                    Teams = new List<string> { _seasonTeams.GetValueOrDefault($"{pid}_{yr}") ?? _teamMap[pid].FirstOrDefault() ?? "" },
                    SeasonStats = _seasonStats.GetValueOrDefault($"{pid}_{yr}"),
                    SimilarityScore = entry.Score
                });
            }

            return result;
        }

        public List<int> GetSeasonsForPlayer(int playerId)
        {
            return _playerSeasons.TryGetValue(playerId, out var seasons)
                ? seasons.OrderByDescending(x => x).ToList()
                : new List<int>();
        }
    }
}
