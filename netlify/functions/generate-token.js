const crypto = require('crypto');
const path = require('path');

// For local development, try to load .env file if TOKEN_SECRET is not set
if (!process.env.TOKEN_SECRET) {
    try {
        // Load .env file from project root (two levels up from functions directory)
        require('dotenv').config({ path: path.join(__dirname, '../../.env') });
    } catch (e) {
        console.error('Failed to load .env file:', e.message);
    }
}

exports.handler = async (event, context) => {
    // Get the token secret from environment variables
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!tokenSecret) {
        console.error('TOKEN_SECRET environment variable is not set');
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({
                error: 'Server configuration error: TOKEN_SECRET not set'
            }),
        };
    }

    // Get user parameter from query string
    const user = event.queryStringParameters?.user || 'anonymous';

    // Validate user parameter
    if (typeof user !== 'string' || user.length === 0 || user.length > 100) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({
                error: 'Invalid user parameter'
            }),
        };
    }

    try {
        // Generate expiry timestamp (60 seconds from now)
        const expiry = Math.floor(Date.now() / 1000) + 60;

        // Create payload for HMAC
        const payload = `user=${user}&exp=${expiry}`;

        // Generate HMAC-SHA256 signature
        const hmac = crypto.createHmac('sha256', tokenSecret);
        hmac.update(payload);
        const signature = hmac.digest('hex');

        console.log(`Generated token for user: ${user}, expiry: ${expiry}`);

        // Return the token data
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            body: JSON.stringify({
                token: signature,
                expiry: expiry,
                user: user
            }),
        };

    } catch (error) {
        console.error('Error generating token:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({
                error: 'Internal server error while generating token'
            }),
        };
    }
};
