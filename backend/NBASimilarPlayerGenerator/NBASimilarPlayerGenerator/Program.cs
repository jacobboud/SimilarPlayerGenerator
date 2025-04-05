using Microsoft.AspNetCore.Routing; // ?? Required for RouteOptions
using NBASimilarPlayerGenerator.Models;
using NBASimilarPlayerGenerator.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers(); // ? Clean - no need for SuppressInferBindingSourcesForParameters

// Swagger/OpenAPI support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Recommendation Service (Singleton pattern)
builder.Services.AddSingleton<IRecommendationService, RecommendationService>();

// CORS Policy to allow frontend (on Vite port)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowCredentials()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ?? Lowercase all routes for consistent frontend URLs
builder.Services.Configure<RouteOptions>(options =>
{
    options.LowercaseUrls = true;
});

var app = builder.Build();

// Swagger UI in dev mode
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Enable CORS
app.UseCors("AllowFrontend");

// HTTPS redirection
app.UseHttpsRedirection();

// Authorization (not used yet, but safe to include)
app.UseAuthorization();

// Enable controllers
app.MapControllers();

app.Run();
