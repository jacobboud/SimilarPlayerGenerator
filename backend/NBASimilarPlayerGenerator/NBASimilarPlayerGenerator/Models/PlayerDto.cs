using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class PlayerDto
    {
        public int PlayerId { get; set; }
        public string Name { get; set; } = "";
        public string Years { get; set; } = "";
        public List<string>? Teams { get; set; }
        public Dictionary<string, float>? CareerStats { get; set; }
        public Dictionary<string, float>? SeasonStats { get; set; }
        public List<SeasonDto>? Seasons { get; set; }
        public float? SimilarityScore { get; set; }
    }
}
