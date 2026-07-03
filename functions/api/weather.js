export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const city = url.searchParams.get('city');

    const API_KEY = env.QWEATHER_KEY;
    const API_HOST = env.QWEATHER_HOST;

    if (!city) {
        return new Response(JSON.stringify({ error: 'City parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!API_KEY) {
        return new Response(JSON.stringify({ error: 'Weather API key not configured. Please set QWEATHER_KEY in environment variables.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!API_HOST) {
        return new Response(JSON.stringify({ error: 'API Host not configured. Please set QWEATHER_HOST in environment variables.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const geoUrl = `https://${API_HOST}/geo/v2/city/lookup?location=${encodeURIComponent(city)}`;
        const geoRes = await fetch(geoUrl, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!geoRes.ok) {
            const errorText = await geoRes.text();
            return new Response(JSON.stringify({ error: `Geo API request failed: ${geoRes.status}. ${errorText}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const geoText = await geoRes.text();
        if (!geoText) {
            return new Response(JSON.stringify({ error: 'Geo API returned empty response. Check your API key and host.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const geoData = JSON.parse(geoText);

        if (geoData.code !== '200' || !geoData.location || geoData.location.length === 0) {
            return new Response(JSON.stringify({ error: `City not found. API code: ${geoData.code}. Message: ${geoData.message || 'No message'}` }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const location = geoData.location[0];
        const locationId = location.id;

        const weatherUrl = `https://${API_HOST}/weather/v7/now?location=${locationId}`;
        const forecastUrl = `https://${API_HOST}/weather/v7/3d?location=${locationId}`;
        
        const [weatherRes, forecastRes] = await Promise.all([
            fetch(weatherUrl, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            }),
            fetch(forecastUrl, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            })
        ]);

        if (!weatherRes.ok) {
            return new Response(JSON.stringify({ error: `Weather API request failed: ${weatherRes.status}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const weatherText = await weatherRes.text();
        if (!weatherText) {
            return new Response(JSON.stringify({ error: 'Weather API returned empty response' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const weatherData = JSON.parse(weatherText);
        
        const forecastText = await forecastRes.text();
        const forecastData = forecastText ? JSON.parse(forecastText) : { daily: [] };

        if (weatherData.code !== '200') {
            return new Response(JSON.stringify({ error: `Weather API error. Code: ${weatherData.code}. Check if your API key is valid.` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const result = {
            location: {
                name: location.name,
                adm1: location.adm1,
                adm2: location.adm2,
                country: location.country
            },
            now: {
                temp: weatherData.now.temp,
                feelsLike: weatherData.now.feelsLike,
                text: weatherData.now.text,
                icon: weatherData.now.icon,
                windDir: weatherData.now.windDir,
                windScale: weatherData.now.windScale,
                windSpeed: weatherData.now.windSpeed,
                humidity: weatherData.now.humidity,
                vis: weatherData.now.vis,
                pressure: weatherData.now.pressure
            },
            forecast: forecastData.daily || []
        };

        return new Response(JSON.stringify(result), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Server error: ' + e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
