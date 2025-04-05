using Microsoft.AspNetCore.Mvc;
using NBASimilarPlayerGenerator.Services;

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
    public IActionResult GetCareerRecommendations(int playerId)
    {
        if (playerId <= 0)
            return BadRequest("Invalid player ID.");

        var recs = _recommendationService.GetCareerRecommendations(playerId);
        return Ok(recs);
    }

    [HttpGet("season/{playerId}/{season}")]
    public IActionResult GetSeasonRecommendations(int playerId, int season)
    {
        if (playerId <= 0 || season <= 0)
            return BadRequest("Invalid player ID or season.");

        var recs = _recommendationService.GetSeasonRecommendations(playerId, season);
        return Ok(recs);
    }

    [HttpGet("seasons/{playerId}")]
    public IActionResult GetAvailableSeasons(int playerId)
    {
        if (playerId <= 0)
            return BadRequest("Invalid player ID.");

        var seasons = _recommendationService.GetSeasonsForPlayer(playerId);
        return Ok(seasons);
    }
}
