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
        policy.WithOrigins(
            "http://localhost:3000", // local dev
            "https://polite-mud-0ca1bbf1e.6.azurestaticapps.net" // deployed frontend
        )
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

// Add security headers middleware
app.Use(async (context, next) =>
{
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Add("X-Frame-Options", "DENY");
    context.Response.Headers.Add("X-XSS-Protection", "1; mode=block");
    // Optional: content security policy (CSP)
    // context.Response.Headers.Add("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self';");
    await next();
});


// Enable CORS
app.UseCors("AllowFrontend");

// HTTPS redirection
app.UseHttpsRedirection();

// Authorization (not used yet, but safe to include)
app.UseAuthorization();

// Enable controllers
app.MapControllers();

app.Run();
