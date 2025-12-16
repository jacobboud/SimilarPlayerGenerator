// Models/GoatModels.cs
using System.Collections.Generic;

namespace NBASimilarPlayerGenerator.Models
{
    public class GoatRequest
    {
        public string? Mode { get; set; }
        public int? NSeasons { get; set; }
        public Dictionary<string, double>? Weights { get; set; }

        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 25;

        /// <summary>
        /// Only applies to Season + Peak modes.
        /// If true, return at most one result per player (best season/peak window).
        /// </summary>
        public bool LimitOnePerPlayer { get; set; } = false;
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
