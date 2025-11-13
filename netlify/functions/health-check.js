exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // AI Radio server URL - can be configured via environment variable
        const radioServerUrl = process.env.RADIO_SERVER_URL || 'http://localhost:81';

        console.log(`Health check: Checking ${radioServerUrl}`);

        // Try health endpoint first
        try {
            const healthResponse = await fetch(`${radioServerUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });

            if (healthResponse.ok) {
                console.log('Health check: Server is online (health endpoint)');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'online',
                        method: 'health_endpoint',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        } catch (healthError) {
            console.log('Health endpoint not available, trying fallback');
        }

        // Fallback: Try main page with HEAD request
        try {
            const mainResponse = await fetch(`${radioServerUrl}/`, {
                method: 'HEAD',
                timeout: 3000
            });

            // Accept both 200 OK and 401 Unauthorized (auth required is still online)
            if (mainResponse.ok || mainResponse.status === 401) {
                console.log('Health check: Server is online (main page)');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'online',
                        method: 'main_page',
                        http_status: mainResponse.status,
                        timestamp: new Date().toISOString()
                    })
                };
            } else {
                console.log(`Health check: Server returned ${mainResponse.status}`);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'offline',
                        method: 'main_page',
                        http_status: mainResponse.status,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        } catch (mainError) {
            console.log('Main page check failed:', mainError.message);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'offline',
                    method: 'main_page',
                    error: mainError.message,
                    timestamp: new Date().toISOString()
                })
            };
        }

    } catch (error) {
        console.error('Health check error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
