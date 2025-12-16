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

            var result = _recommendationService.GetCareerRecommendations(playerId, options);
            return Ok(result);
        }

        [HttpGet("season/{playerId}/{season}")]
        public IActionResult GetSeasonRecommendations(
    string playerId,
    int season,
    [FromQuery] string? groupsPreset,
    [FromQuery] string? groups,
    [FromQuery] int topN = 10,
    [FromQuery] bool limitOnePerPlayer = false)
        {
            if (string.IsNullOrWhiteSpace(playerId) || season <= 0)
                return BadRequest("Invalid player ID or season.");

            var options = new RecommendationOptions
            {
                GroupsPreset = groupsPreset,
                TopN = topN,
                LimitOnePerPlayer = limitOnePerPlayer,
                Groups = groups?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList()
            };

            var result = _recommendationService.GetSeasonRecommendations(playerId, season, options);
            return Ok(result);
        }

        [HttpGet("seasons/{playerId}")]
        public IActionResult GetAvailableSeasons(string playerId)
        {
            if (string.IsNullOrWhiteSpace(playerId))
                return BadRequest("Invalid player ID.");

            var seasons = _recommendationService.GetSeasonsForPlayer(playerId);
            return Ok(seasons);
        }

        [HttpGet("peakwindow/{playerId}")]
        public IActionResult GetPeakWindow(
        string playerId,
        [FromQuery] int fromSeason,
        [FromQuery] int toSeason)
        {
            if (string.IsNullOrWhiteSpace(playerId) || fromSeason <= 0 || toSeason <= 0)
                return BadRequest("Invalid player ID or seasons.");

            var dto = _recommendationService.GetPeakWindowStats(playerId, fromSeason, toSeason);
            if (dto == null)
                return NotFound("No peak window found for that player and season range.");

            return Ok(dto);
        }

        // ---------- NEW: Peak similarity ----------

        [HttpGet("peak/{playerId}")]
        public IActionResult GetPeakRecommendations(
    string playerId,
    [FromQuery] int fromSeason,
    [FromQuery] int toSeason,
    [FromQuery] string? groupsPreset,
    [FromQuery] string? groups,
    [FromQuery] int topN = 10,
    [FromQuery] bool limitOnePerPlayer = false)
        {
            if (string.IsNullOrWhiteSpace(playerId) || fromSeason <= 0 || toSeason <= 0)
                return BadRequest("Invalid player ID or seasons.");

            var options = new RecommendationOptions
            {
                GroupsPreset = groupsPreset,
                TopN = topN,
                LimitOnePerPlayer = limitOnePerPlayer,
                Groups = groups?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList()
            };

            var result = _recommendationService.GetPeakRecommendations(playerId, fromSeason, toSeason, options);
            return Ok(result);
        }

        // ---------- NEW: Start-window stats ----------

        [HttpGet("startwindow/{playerId}")]
        public IActionResult GetStartWindow(
            string playerId,
            [FromQuery] int nSeasons)
        {
            if (string.IsNullOrWhiteSpace(playerId) || nSeasons <= 0)
                return BadRequest("Invalid player ID or season count.");

            var dto = _recommendationService.GetStartWindowStats(playerId, nSeasons);
            if (dto == null)
                return NotFound("No start window found for that player and season count.");

            return Ok(dto);
        }

        // ---------- NEW: Start similarity ----------

        [HttpGet("start/{playerId}")]
        public IActionResult GetStartRecommendations(
            string playerId,
            [FromQuery] int nSeasons,
            [FromQuery] string? groupsPreset,
            [FromQuery] string? groups,
            [FromQuery] int topN = 10)
        {
            if (string.IsNullOrWhiteSpace(playerId) || nSeasons <= 0)
                return BadRequest("Invalid player ID or season count.");

            var options = new RecommendationOptions
            {
                GroupsPreset = groupsPreset,
                TopN = topN,
                Groups = groups?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList()
            };

            var result = _recommendationService.GetStartRecommendations(playerId, nSeasons, options);
            return Ok(result);
        }
    }
}
