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

            if (string.IsNullOrWhiteSpace(request.Mode))
                request.Mode = "career";

            if (request.Page <= 0)
                request.Page = 1;

            if (request.PageSize <= 0)
                request.PageSize = 25;

            var result = _recommendationService.CalculateGoatScores(request);
            return Ok(result);
        }
    }
}
