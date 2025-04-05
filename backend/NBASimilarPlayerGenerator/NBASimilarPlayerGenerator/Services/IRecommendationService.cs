using NBASimilarPlayerGenerator.Models;

namespace NBASimilarPlayerGenerator.Services
{
    public interface IRecommendationService
    {
        List<PlayerDto> SearchPlayers(string query);
        List<PlayerDto> GetCareerRecommendations(int playerId);
        List<PlayerDto> GetSeasonRecommendations(int playerId, int season);
        List<int> GetSeasonsForPlayer(int playerId);
    }
}
