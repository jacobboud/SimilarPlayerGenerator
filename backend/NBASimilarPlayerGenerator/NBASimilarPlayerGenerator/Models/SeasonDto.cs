using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class SeasonDto
    {
        public int Year { get; set; }
        public string Team { get; set; } = "";
        public Dictionary<string, float> Stats { get; set; } = new();
    }
}
