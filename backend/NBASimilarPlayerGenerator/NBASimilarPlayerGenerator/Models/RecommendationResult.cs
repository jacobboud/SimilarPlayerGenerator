// Models/RecommendationResult.cs (for example)
using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class RecommendationResult
    {
        public List<PlayerDto> Players { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }
}