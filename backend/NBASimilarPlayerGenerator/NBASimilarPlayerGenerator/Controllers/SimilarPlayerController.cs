// Controllers/SimilarPlayerController.cs
using System;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using NBASimilarPlayerGenerator.Services;

namespace NBASimilarPlayerGenerator.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SimilarPlayerController : ControllerBase
    {
        private readonly IRecommendationService _recommendationService;

        public SimilarPlayerController(IRecommendationService recommendationService)
        {
            _recommendationService = recommendationService;
        }

        [HttpGet("players")]
        public IActionResult GetPlayers([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query) || query.Length > 100)
                return BadRequest("Invalid player name query.");

            var players = _recommendationService.SearchPlayers(query);
            return Ok(players);
        }

        [HttpGet("career/{playerId}")]
        public IActionResult GetCareerRecommendations(
            string playerId,
            [FromQuery] string? groupsPreset,
            [FromQuery] string? groups,
            [FromQuery] int topN = 10)
        {
            if (string.IsNullOrWhiteSpace(playerId))
                return BadRequest("Invalid player ID.");

            var options = new RecommendationOptions
            {
                GroupsPreset = groupsPreset,
                TopN = topN,
                Groups = groups?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList()
            };

            var recs = _recommendationService.GetCareerRecommendations(playerId, options);
            return Ok(recs);
        }

        [HttpGet("season/{playerId}/{season}")]
        public IActionResult GetSeasonRecommendations(
            string playerId,
            int season,
            [FromQuery] string? groupsPreset,
            [FromQuery] string? groups,
            [FromQuery] int topN = 10)
        {
            if (string.IsNullOrWhiteSpace(playerId) || season <= 0)
                return BadRequest("Invalid player ID or season.");

            var options = new RecommendationOptions
            {
                GroupsPreset = groupsPreset,
                TopN = topN,
                Groups = groups?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList()
            };

            var recs = _recommendationService.GetSeasonRecommendations(playerId, season, options);
            return Ok(recs);
        }

        [HttpGet("seasons/{playerId}")]
        public IActionResult GetAvailableSeasons(string playerId)
        {
            if (string.IsNullOrWhiteSpace(playerId))
                return BadRequest("Invalid player ID.");

            var seasons = _recommendationService.GetSeasonsForPlayer(playerId);
            return Ok(seasons);
        }
    }
}
