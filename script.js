// AI Radio Online - Client-side JavaScript
// Handles authentication token generation and radio streaming redirection

class AIRadioClient {
    constructor() {
        this.radioServerUrl = 'http://localhost:81'; // Default radio server URL
        this.defaultChannel = 'red'; // Default channel name
        this.selectedChannel = null; // Currently selected channel object
        this.selectedEndpointPath = '/'; // Currently selected endpoint path
        this.init();
    }

    async init() {
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

        // Reset button states when navigating back to the page
        this.resetButtonStates();

        // Perform health check on page load
        await this.performHealthCheck();
    }

    async startRadio() {
        const statusMessage = document.getElementById('statusMessage');

        try {
            // Disable all channel buttons and show loading
            const channelButtons = document.querySelectorAll('.channel-button');
            channelButtons.forEach(button => {
                button.disabled = true;
                button.innerHTML = button.innerHTML.replace(/<br>/g, '\n').split('\n')[0] + '<br><span class="loading"></span>Свързване...';
            });

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

            // Re-enable all channel buttons
            const channelButtons = document.querySelectorAll('.channel-button');
            channelButtons.forEach(button => {
                button.disabled = false;
                // Restore original button text (remove loading spinner)
                const originalText = button.innerHTML.replace(/<br><span class="loading"><\/span>Свързване\.\.\./, '');
                button.innerHTML = originalText;
            });
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
        const baseUrl = this.radioServerUrl + this.selectedEndpointPath;
        const params = new URLSearchParams({
            channel: this.defaultChannel,
            token: authData.token,
            user: authData.user,
            expiry: authData.expiry
        });

        return `${baseUrl}?${params.toString()}`;
    }

    async performHealthCheck() {
        try {
            // Show checking status
            this.showServerStatus('🔄 Проверка на сървъра...', 'checking');

            // Call the new server endpoint to get health status and configuration
            const response = await fetch(`${this.radioServerUrl}/api/health-and-config`, {
                method: 'GET',
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const startupConfig = await response.json();

            // Server is online and configured - render channel buttons
            this.showServerStatus('✅ AI Radio сървърът е онлайн и конфигуриран', 'online');
            this.renderChannelButtons(startupConfig);

        } catch (error) {
            console.warn('Health check failed:', error.message);
            this.showServerStatus('❌ AI Radio сървърът е недостъпен', 'offline');
        }
    }

    renderChannelButtons(startupConfig) {
        const container = document.getElementById('channelButtonsContainer');
        if (!container || !startupConfig || !startupConfig.channels) {
            return;
        }

        // Clear existing buttons
        const buttonsContainer = container.querySelector('.channel-buttons') || document.createElement('div');
        buttonsContainer.className = 'channel-buttons';
        buttonsContainer.innerHTML = '';

        // Create buttons for each channel
        startupConfig.channels.forEach(channel => {
            const button = document.createElement('button');
            button.className = 'channel-button';
            button.setAttribute('data-channel-name', channel.name);
            button.setAttribute('data-endpoint-path', channel.endpointPath);

            // Build button text with channel information
            let buttonText = `${channel.name}\n`;
            buttonText += `Продължителност: ${channel.trackDurationSeconds} сек\n`;
            buttonText += `Може да се заявява: ${channel.isRequestChannel ? 'Да' : 'Не'}`;

            if (channel.preferredStyles && channel.preferredStyles.length > 0) {
                buttonText += `\nСтилове: ${channel.preferredStyles.join(', ')}`;
            }

            const fullButtonText = buttonText.replace(/\n/g, '<br>');
            button.innerHTML = fullButtonText;

            // Store the original full text for later restoration
            button.setAttribute('data-original-text', fullButtonText);

            button.addEventListener('click', () => {
                this.selectChannel(channel);
                this.startRadio();
            });

            buttonsContainer.appendChild(button);
        });

        // Add buttons container to the main container
        if (!container.contains(buttonsContainer)) {
            container.appendChild(buttonsContainer);
        }

        // Show the container and hide the original start button and channel info
        container.style.display = 'block';
        const startButton = document.getElementById('startRadioBtn');
        const channelInfo = document.querySelector('.channel-info');
        if (startButton) startButton.style.display = 'none';
        if (channelInfo) channelInfo.style.display = 'none';

        // Auto-select the first channel as default
        if (startupConfig.channels.length > 0) {
            this.selectChannel(startupConfig.channels[0]);
        }
    }

    selectChannel(channel) {
        // Update selected channel properties
        this.selectedChannel = channel;
        this.selectedEndpointPath = channel.endpointPath;
        this.defaultChannel = channel.name;

        // Update visual state of buttons
        const buttons = document.querySelectorAll('.channel-button');
        buttons.forEach(button => {
            if (button.getAttribute('data-channel-name') === channel.name) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });

        // Update status message
        this.showStatus(`Избран канал: ${channel.name}`, 'info');
    }

    generateUserId() {
        // Generate a unique anonymous user ID
        // In production, you might want to use a more sophisticated method
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `anon_${timestamp}_${random}`;
    }

    showServerStatus(message, status) {
        const serverStatusElement = document.getElementById('serverStatus');
        if (serverStatusElement) {
            serverStatusElement.textContent = message;
            serverStatusElement.className = 'server-status';

            // Add status-specific styling
            if (status === 'online') {
                serverStatusElement.classList.add('online');
            } else if (status === 'offline') {
                serverStatusElement.classList.add('offline');
            } else if (status === 'checking') {
                serverStatusElement.classList.add('checking');
            }
        }
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

    resetButtonStates() {
        // Reset all channel buttons to their original state
        const channelButtons = document.querySelectorAll('.channel-button');
        channelButtons.forEach(button => {
            button.disabled = false;
            // Restore the original full button text
            const originalText = button.getAttribute('data-original-text');
            if (originalText) {
                button.innerHTML = originalText;
            }
        });
    }
}

// Global client instance
let radioClient;

// Initialize the client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    radioClient = new AIRadioClient();
});

// Handle page navigation (including back button)
window.addEventListener('pageshow', (event) => {
    // Reset button states when navigating back to the page
    if (radioClient) {
        radioClient.resetButtonStates();
    }
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    const client = new AIRadioClient();
    client.showError('Неочаквана грешка. Моля, опитайте отново.');
});
