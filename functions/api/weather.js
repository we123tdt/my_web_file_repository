export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const city = url.searchParams.get('city');

    const API_KEY = env.QWEATHER_KEY;

    if (!city) {
        return new Response(JSON.stringify({ error: 'City parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!API_KEY || API_KEY === '你的和风天气API_KEY') {
        return new Response(JSON.stringify({ error: 'Weather API key not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const geoRes = await fetch(
            `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(city)}&key=${API_KEY}`
        );
        const geoData = await geoRes.json();

        if (geoData.code !== '200' || !geoData.location || geoData.location.length === 0) {
            return new Response(JSON.stringify({ error: 'City not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const location = geoData.location[0];
        const locationId = location.id;

        const [weatherRes, forecastRes] = await Promise.all([
            fetch(`https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${API_KEY}`),
            fetch(`https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${API_KEY}`)
        ]);

        const weatherData = await weatherRes.json();
        const forecastData = await forecastRes.json();

        if (weatherData.code !== '200') {
            return new Response(JSON.stringify({ error: 'Weather API error' }), {
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
