const https = require('https');

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
        // Get target URL from query parameters, fallback to environment variable
        const targetUrl = event.queryStringParameters?.targetUrl || process.env.RADIO_SERVER_URL || 'http://localhost:81';
        const action = event.queryStringParameters?.action; // 'config' for configuration fetch

        console.log(`Health check: Checking ${targetUrl}, action: ${action || 'health'}`);

        // Create HTTPS agent that ignores self-signed certificates
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });

        // If action is 'config', try to fetch configuration directly
        if (action === 'config') {
            try {
                const configResponse = await fetch(`${targetUrl}/api/health-and-config`, {
                    method: 'GET',
                    timeout: 8000,
                    agent: httpsAgent
                });

                if (configResponse.ok) {
                    const config = await configResponse.json();
                    console.log('Config fetch: Success');
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            config: config,
                            timestamp: new Date().toISOString()
                        })
                    };
                } else {
                    console.log(`Config fetch failed: ${configResponse.status}`);
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            config: null,
                            error: `HTTP ${configResponse.status}`,
                            timestamp: new Date().toISOString()
                        })
                    };
                }
            } catch (configError) {
                console.log('Config fetch error:', configError.message);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        config: null,
                        error: configError.message,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Default health check logic
        // Try health endpoint first
        try {
            const healthResponse = await fetch(`${targetUrl}/health`, {
                method: 'GET',
                timeout: 5000,
                agent: httpsAgent
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
            const mainResponse = await fetch(`${targetUrl}/`, {
                method: 'HEAD',
                timeout: 3000,
                agent: httpsAgent
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
