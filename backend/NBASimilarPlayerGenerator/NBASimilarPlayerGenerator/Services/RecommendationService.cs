using System.Text.Json;
using CsvHelper;
using System.Globalization;
using NBASimilarPlayerGenerator.Models;
using Microsoft.AspNetCore.Hosting;

namespace NBASimilarPlayerGenerator.Services
{
    public class RecommendationService : IRecommendationService
    {
        private readonly Dictionary<string, List<string>> _careerRecs;
        private readonly Dictionary<string, List<string>> _seasonRecs;
        private readonly Dictionary<int, List<int>> _playerSeasons;
        private readonly Dictionary<int, PlayerDto> _playerInfo;

        public RecommendationService(IWebHostEnvironment env)
        {
            try
            {
                var basePath = env.ContentRootPath;

                var careerPath = Path.Combine(basePath, "career_recommendations.json");
                var seasonPath = Path.Combine(basePath, "season_recommendations.json");
                var csvPath = Path.Combine(basePath, "player_dateset_CLEANED.csv");

                _careerRecs = LoadJson<Dictionary<string, List<string>>>(careerPath);
                _seasonRecs = LoadJson<Dictionary<string, List<string>>>(seasonPath);

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

                    if (!int.TryParse(playerIdRaw, out int playerId)) continue;
                    if (!int.TryParse(seasonRaw, out int season)) continue;
                    if (string.IsNullOrEmpty(name)) continue;

                    if (!_playerSeasons.ContainsKey(playerId))
                        _playerSeasons[playerId] = new List<int>();

                    if (!_playerSeasons[playerId].Contains(season))
                        _playerSeasons[playerId].Add(season);

                    if (!_playerInfo.ContainsKey(playerId))
                    {
                        _playerInfo[playerId] = new PlayerDto
                        {
                            PlayerId = playerId,
                            Name = name,
                            Years = "" // to be updated below
                        };
                    }
                }

                // Compute readable year ranges
                foreach (var kvp in _playerSeasons)
                {
                    var years = kvp.Value;
                    var range = $"{years.Min()}-{years.Max()}";
                    _playerInfo[kvp.Key].Years = range;
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
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json)!;
        }

        public List<PlayerDto> SearchPlayers(string query)
        {
            return _playerInfo.Values
                .Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(p => p.Name)
                .ToList();
        }

        public List<PlayerDto> GetCareerRecommendations(int playerId)
        {
            if (!_careerRecs.TryGetValue(playerId.ToString(), out var ids)) return new();
            return ids
                .Select(id => int.TryParse(id, out var pid) ? pid : -1)
                .Where(pid => pid != -1 && _playerInfo.ContainsKey(pid))
                .Select(pid => _playerInfo[pid])
                .ToList();
        }

        public List<PlayerDto> GetSeasonRecommendations(int playerId, int season)
        {
            var key = $"{playerId}_{season}";
            if (!_seasonRecs.TryGetValue(key, out var ids)) return new();

            return ids
                .Select(s =>
                {
                    var parts = s.Split('_');
                    if (parts.Length != 2) return null;

                    if (int.TryParse(parts[0], out int pid) &&
                        int.TryParse(parts[1], out int similarSeason) &&
                        _playerInfo.ContainsKey(pid))
                    {
                        var original = _playerInfo[pid];
                        return new PlayerDto
                        {
                            PlayerId = pid,
                            Name = original.Name,
                            Years = similarSeason.ToString() // only that one season
                        };
                    }

                    return null;
                })
                .Where(p => p != null)
                .ToList()!;
        }

        public List<int> GetSeasonsForPlayer(int playerId)
        {
            return _playerSeasons.TryGetValue(playerId, out var seasons)
                ? seasons.OrderByDescending(x => x).ToList()
                : new List<int>();
        }
    }
}
