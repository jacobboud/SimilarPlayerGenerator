// Program.cs
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NBASimilarPlayerGenerator.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// Swagger/OpenAPI support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Recommendation Service (Singleton pattern)
builder.Services.AddSingleton<IRecommendationService, RecommendationService>();

// CORS Policy to allow frontend (local + deployed)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000", // local dev
                "https://mango-sea-0568c211e.3.azurestaticapps.net", // deployed frontend
                "https://thenbaanalyst.com",
                "https://www.thenbaanalyst.com"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Lowercase all routes for consistent frontend URLs
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

// Redirect HTTP → HTTPS
app.UseHttpsRedirection();

// Enable routing
app.UseRouting();

// Add security / debug headers middleware
app.Use(async (context, next) =>
{
    // Debug header so you can verify this version is deployed
    context.Response.Headers["X-Debug-App"] = "NBASimilarPlayerApi";

    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    // Optional: content security policy (CSP)
    // context.Response.Headers["Content-Security-Policy"] =
    //     "default-src 'self'; script-src 'self'; style-src 'self';";
    await next();
});

// Enable CORS (must be after UseRouting, before MapControllers)
app.UseCors("AllowFrontend");

// Authorization (not used yet, but safe to include)
app.UseAuthorization();

// Map controller endpoints
app.MapControllers();

app.Run();
