// Models/GoatModels.cs
using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class GoatRequest
    {
        /// <summary>
        /// "career" or "season". Defaults to "career" if null/empty.
        /// </summary>
        public string? Mode { get; set; }

        /// <summary>
        /// Stat weights: key = stat column name, value = weight.
        /// e.g. { "career_pts": 0.1, "career_ws": 3.0 } or { "pts": 1.0, "ws": 5.0 }
        /// </summary>
        public Dictionary<string, double>? Weights { get; set; }

        /// <summary>
        /// 1-based page number.
        /// </summary>
        public int Page { get; set; } = 1;

        /// <summary>
        /// Page size (results per page).
        /// </summary>
        public int PageSize { get; set; } = 25;
    }

    public class GoatPlayerResult
    {
        public string PlayerId { get; set; } = default!;
        public string Name { get; set; } = default!;
        public string Years { get; set; } = "";
        public List<string> Teams { get; set; } = new();
        public int? Season { get; set; } // for season mode
        public double GoatScore { get; set; }

        /// <summary>
        /// All numeric stats for this row (career or season perspective).
        /// </summary>
        public Dictionary<string, double> Stats { get; set; } = new();
    }

    public class GoatResponse
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }
        public List<GoatPlayerResult> Players { get; set; } = new();
    }
}
