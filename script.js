// AI Radio Online - Client-side JavaScript
// Handles authentication token generation and radio streaming redirection

class AIRadioClient {
    constructor() {
        this.radioServerUrl = 'http://localhost:81'; // Default radio server URL
        this.defaultChannel = 'red'; // Default channel name
        this.init();
    }

    init() {
        const startButton = document.getElementById('startRadioBtn');
        const statusMessage = document.getElementById('statusMessage');

        if (startButton) {
            startButton.addEventListener('click', () => this.startRadio());
        }

        // Check if we're already authenticated (redirected back)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('error')) {
            this.showError('Грешка при оторизацията: ' + urlParams.get('error'));
        }
    }

    async startRadio() {
        const startButton = document.getElementById('startRadioBtn');
        const statusMessage = document.getElementById('statusMessage');

        try {
            // Disable button and show loading
            startButton.disabled = true;
            startButton.innerHTML = '<span class="loading"></span>Свързване...';

            this.showStatus('Получаване на оторизационен токен...', 'info');

            // Generate anonymous user ID if needed
            const userId = this.generateUserId();

            // Get authentication token from Netlify function
            const authData = await this.getAuthToken(userId);

            if (!authData || !authData.token) {
                throw new Error('Неуспешно получаване на токен');
            }

            this.showStatus('Токен получен успешно. Пренасочване към радиото...', 'success');

            // Construct radio server URL with authentication parameters
            const radioUrl = this.constructRadioUrl(authData);

            // Small delay for user feedback
            setTimeout(() => {
                window.location.href = radioUrl;
            }, 1000);

        } catch (error) {
            console.error('Error starting radio:', error);
            this.showError('Грешка при стартиране на радиото: ' + error.message);
            startButton.disabled = false;
            startButton.innerHTML = '🎧 Стартирай AI Радио';
        }
    }

    async getAuthToken(userId) {
        const response = await fetch(`/.netlify/functions/generate-token?user=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data;
    }

    constructRadioUrl(authData) {
        const baseUrl = this.radioServerUrl;
        const params = new URLSearchParams({
            channel: this.defaultChannel,
            token: authData.token,
            user: authData.user,
            expiry: authData.expiry
        });

        return `${baseUrl}?${params.toString()}`;
    }

    generateUserId() {
        // Generate a unique anonymous user ID
        // In production, you might want to use a more sophisticated method
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `anon_${timestamp}_${random}`;
    }

    showStatus(message, type = 'info') {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.className = 'status-message';

        // Add type-specific styling
        if (type === 'error') {
            statusMessage.classList.add('error');
        } else if (type === 'success') {
            statusMessage.classList.add('success');
        }
    }

    showError(message) {
        this.showStatus(message, 'error');
    }
}

// Initialize the client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AIRadioClient();
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    const client = new AIRadioClient();
    client.showError('Неочаквана грешка. Моля, опитайте отново.');
});
