// Controllers/GoatController.cs
using Microsoft.AspNetCore.Mvc;
using NBASimilarPlayerGenerator.Models;
using NBASimilarPlayerGenerator.Services;

namespace NBASimilarPlayerGenerator.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GoatController : ControllerBase
    {
        private readonly IRecommendationService _recommendationService;

        public GoatController(IRecommendationService recommendationService)
        {
            _recommendationService = recommendationService;
        }

        [HttpPost]
        public IActionResult CalculateGoatScores([FromBody] GoatRequest request)
        {
            if (request == null)
                return BadRequest("Request body is required.");

            request.Mode = string.IsNullOrWhiteSpace(request.Mode) ? "career" : request.Mode;

            var mode = request.Mode.Trim().ToLowerInvariant();
            if (mode != "career" && mode != "season" && mode != "peak" && mode != "start")
                return BadRequest("Mode must be one of: career, season, peak, start.");

            // peak/start require NSeasons
            if ((mode == "peak" || mode == "start") && (!request.NSeasons.HasValue || request.NSeasons.Value <= 0))
                return BadRequest("NSeasons is required and must be > 0 for peak/start modes.");

            if (request.Page <= 0) request.Page = 1;
            if (request.PageSize <= 0) request.PageSize = 25;

            var result = _recommendationService.CalculateGoatScores(request);
            return Ok(result);
        }
    }
}
