// Models/PlayerDto.cs
using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class PlayerDto
    {
        public string PlayerId { get; set; } = default!;
        public string Name { get; set; } = default!;
        public string Years { get; set; } = "";
        public List<string>? Teams { get; set; }

        public Dictionary<string, double>? CareerStats { get; set; }
        public Dictionary<string, double>? SeasonStats { get; set; }

        public List<SeasonDto>? Seasons { get; set; }

        public double? SimilarityScore { get; set; }
    }

    public class SeasonDto
    {
        public int Year { get; set; }
        public string Team { get; set; } = "";
        public Dictionary<string, double>? Stats { get; set; }
    }
}
