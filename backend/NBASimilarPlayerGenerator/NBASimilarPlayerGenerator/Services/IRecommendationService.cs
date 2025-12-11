// Services/IRecommendationService.cs
using System.Collections.Generic;
using NBASimilarPlayerGenerator.Models;

namespace NBASimilarPlayerGenerator.Services
{
    public interface IRecommendationService
    {
        // Search players by name (PlayerId is now string under the hood)
        List<PlayerDto> SearchPlayers(string query);

        // Season list for dropdown
        List<int> GetSeasonsForPlayer(string playerId);

        // Season-based similarity by id + season
        RecommendationResult GetSeasonRecommendations(
            string playerId,
            int season,
            RecommendationOptions options);

        // Career-based similarity by id
        RecommendationResult GetCareerRecommendations(
            string playerId,
            RecommendationOptions options);

        // Peak window stats + recommendations
        PlayerDto? GetPeakWindowStats(string playerId, int fromSeason, int toSeason);
        RecommendationResult GetPeakRecommendations(
            string playerId,
            int fromSeason,
            int toSeason,
            RecommendationOptions options);

        // Start-window stats + recommendations
        PlayerDto? GetStartWindowStats(string playerId, int nSeasons);
        RecommendationResult GetStartRecommendations(
            string playerId,
            int nSeasons,
            RecommendationOptions options);

        GoatResponse CalculateGoatScores(GoatRequest request);
    }

    public class RecommendationOptions
    {
        /// <summary>
        /// "stats", "accolades", "all", or null (defaults to "stats")
        /// </summary>
        public string? GroupsPreset { get; set; }

        /// <summary>
        /// Explicit stat groups, e.g. ["Per Game", "Totals"].
        /// If provided, overrides GroupsPreset.
        /// </summary>
        public List<string>? Groups { get; set; }

        /// <summary>
        /// Number of similar players to return.
        /// </summary>
        public int TopN { get; set; } = 10;
    }
}
