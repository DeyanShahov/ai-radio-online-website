// AI Radio Online - Client-side JavaScript
// Handles authentication token generation and radio streaming redirection

class AIRadioClient {
    constructor() {
        // Configuration for multiple radio servers
        this.radioServers = [
            { id: 'redfox', name: "RedFox", url: "https://77.77.134.134:443", defaultChannel: "red" },
            { id: 'mdae', name: "Mdae", url: "https://46.10.144.87:443", defaultChannel: "blue" }
        ];

        // Current server selection (will be set when user selects a server)
        this.selectedServer = null;
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

        // Render server sections and perform health checks
        this.renderServerSections();
    }

    async startRadio() {
        try {
            // Find and disable only the clicked button
            const clickedButton = document.querySelector(`.channel-button[data-server-id="${this.selectedServer.id}"][data-channel-name="${this.selectedChannel.name}"]`);
            if (clickedButton) {
                clickedButton.disabled = true;
                clickedButton.innerHTML = `🎧 Свързване към ${this.selectedChannel.name}...<br><span class="loading"></span>`;
            }

            this.showStatusForServer(this.selectedServer.id, 'Получаване на оторизационен токен...', 'info');

            // Generate anonymous user ID if needed
            const userId = this.generateUserId();

            // Get authentication token from Netlify function
            const authData = await this.getAuthToken(userId);

            if (!authData || !authData.token) {
                throw new Error('Неуспешно получаване на токен');
            }

            this.showStatusForServer(this.selectedServer.id, 'Токен получен успешно. Пренасочване към радиото...', 'success');

            // Construct radio server URL with authentication parameters
            const radioUrl = this.constructRadioUrl(authData);

            // Small delay for user feedback, then redirect
            setTimeout(() => {
                // Hide status message before redirect
                const statusMessage = document.getElementById(`statusMessage-${this.selectedServer.id}`);
                if (statusMessage) {
                    statusMessage.style.display = 'none';
                }
                window.location.href = radioUrl;
            }, 1500);

        } catch (error) {
            console.error('Error starting radio:', error);
            this.showErrorForServer(this.selectedServer.id, 'Грешка при стартиране на радиото: ' + error.message);

            // Re-enable only the clicked button
            const clickedButton = document.querySelector(`.channel-button[data-server-id="${this.selectedServer.id}"][data-channel-name="${this.selectedChannel.name}"]`);
            if (clickedButton) {
                clickedButton.disabled = false;
                // Restore original button text
                clickedButton.innerHTML = `🎧 Стартирай ${this.selectedChannel.name} Радио`;
            }
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
        const baseUrl = this.selectedServer.url + this.selectedEndpointPath;
        const params = new URLSearchParams({
            channel: this.selectedServer.defaultChannel,
            token: authData.token,
            user: authData.user,
            expiry: authData.expiry
        });

        return `${baseUrl}?${params.toString()}`;
    }

    renderServerSections() {
        const container = document.getElementById('radioServersContainer');
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        // Create sections for each server
        this.radioServers.forEach(server => {
            const serverSection = document.createElement('div');
            serverSection.className = 'server-section';
            serverSection.setAttribute('data-server-id', server.id);

            serverSection.innerHTML = `
                <h2>${server.name}</h2>
                <div class="radio-interface">
                    <div class="status-message" id="statusMessage-${server.id}" style="display: none;">
                        Готов за стартиране на ${server.name} радиото
                    </div>

                    <div class="server-status" id="serverStatus-${server.id}">
                        🔄 Проверка на сървъра...
                    </div>

                    <button id="startRadioBtn-${server.id}" class="start-button" data-server-id="${server.id}" style="display: none;">
                        🎧 Стартирай Радио
                    </button>

                    <div class="channel-info" id="channelInfo-${server.id}" style="display: none;">
                        <p>Ще бъдете пренасочени към канал: ${server.defaultChannel}</p>
                    </div>

                    <div id="channelButtonsContainer-${server.id}" class="channel-buttons-container" style="display: none;">
                        <h3>Изберете канал:</h3>
                    </div>
                </div>
            `;

            container.appendChild(serverSection);

            // Add event listener to the start button
            const startButton = serverSection.querySelector(`#startRadioBtn-${server.id}`);
            startButton.addEventListener('click', () => {
                this.selectServer(server);
                this.startRadio();
            });

            // Perform health check for this server after DOM is ready
            setTimeout(() => {
                this.performHealthCheckForServer(server);
            }, 100);
        });
    }

    async performHealthCheckForServer(server) {
        try {
            // Show checking status
            this.showServerStatusForServer(server.id, '🔄 Проверка на сървъра...', 'checking');

            // Try HTTPS first (port 443), then fallback to HTTP (port 81)
            let workingUrl = null;
            let startupConfig = null;

            // Extract base IP from server URL
            const urlMatch = server.url.match(/https?:\/\/([^:]+):(\d+)/);
            if (!urlMatch) {
                throw new Error('Invalid server URL format');
            }
            const baseIp = urlMatch[1];

            // Try HTTPS first - direct API call from browser
            try {
                const httpsUrl = `https://${baseIp}:443`;
                console.log(`Trying HTTPS for ${server.name}: ${httpsUrl}`);

                // Try to get configuration directly via HTTPS
                const configResponse = await fetch(`${httpsUrl}/api/health-and-config`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(8000),
                    mode: 'cors' // Explicitly set CORS mode
                });

                if (configResponse.ok) {
                    startupConfig = await configResponse.json();
                    workingUrl = httpsUrl;
                    console.log(`✅ ${server.name} works on HTTPS`);
                }
            } catch (httpsError) {
                console.log(`HTTPS failed for ${server.name}, trying HTTP...`, httpsError.message);
            }

            // If HTTPS didn't work, try HTTP
            if (!workingUrl) {
                try {
                    const httpUrl = `http://${baseIp}:81`;
                    console.log(`Trying HTTP for ${server.name}: ${httpUrl}`);

                    // Try to get configuration directly via HTTP
                    const configResponse = await fetch(`${httpUrl}/api/health-and-config`, {
                        method: 'GET',
                        signal: AbortSignal.timeout(8000),
                        mode: 'cors' // Explicitly set CORS mode
                    });

                    if (configResponse.ok) {
                        startupConfig = await configResponse.json();
                        workingUrl = httpUrl;
                        console.log(`✅ ${server.name} works on HTTP`);
                    }
                } catch (httpError) {
                    console.log(`HTTP also failed for ${server.name}`, httpError.message);
                }
            }

            if (workingUrl && startupConfig) {
                // Update server URL to the working one
                server.url = workingUrl;
                this.showServerStatusForServer(server.id, `✅ ${server.name} сървърът е онлайн и конфигуриран (${workingUrl.includes('https') ? 'HTTPS' : 'HTTP'})`, 'online');
                this.renderChannelButtonsForServer(server.id, startupConfig);
            } else if (workingUrl) {
                // Server is online but no config
                server.url = workingUrl;
                this.showServerStatusForServer(server.id, `✅ ${server.name} сървърът е онлайн (${workingUrl.includes('https') ? 'HTTPS' : 'HTTP'})`, 'online');
            } else {
                this.showServerStatusForServer(server.id, `❌ ${server.name} сървърът е недостъпен`, 'offline');
            }

        } catch (error) {
            console.warn(`Health check failed for ${server.name}:`, error.message);
            this.showServerStatusForServer(server.id, `❌ ${server.name} сървърът е недостъпен`, 'offline');
        }
    }

    selectServer(server) {
        this.selectedServer = server;
        console.log(`Selected server: ${server.name}`);
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

    // renderChannelButtons(startupConfig) {
    //     const container = document.getElementById('channelButtonsContainer');
    //     if (!container || !startupConfig || !startupConfig.channels) {
    //         return;
    //     }

    //     // Clear existing buttons
    //     const buttonsContainer = container.querySelector('.channel-buttons') || document.createElement('div');
    //     buttonsContainer.className = 'channel-buttons';
    //     buttonsContainer.innerHTML = '';

    //     // Create buttons for each channel
    //     startupConfig.channels.forEach(channel => {
    //         const button = document.createElement('button');
    //         button.className = 'channel-button';
    //         button.setAttribute('data-channel-name', channel.name);
    //         button.setAttribute('data-endpoint-path', channel.endpointPath);

    //         // Build button text with channel information
    //         let buttonText = `Име / Стил на канала: ${channel.name}\n`;
    //         buttonText += `Продължителност на песните: ${channel.trackDurationSeconds} сек\n`;
    //         buttonText += `Може да се правят заявки: ${channel.isRequestChannel ? 'Да' : 'Не'}`;

    //         if (channel.preferredStyles && channel.preferredStyles.length > 0) {
    //             buttonText += `\nСтилове: ${channel.preferredStyles.join(', ')}`;
    //         }

    //         const fullButtonText = buttonText.replace(/\n/g, '<br>');
    //         button.innerHTML = fullButtonText;

    //         // Store the original full text for later restoration
    //         button.setAttribute('data-original-text', fullButtonText);

    //         button.addEventListener('click', () => {
    //             this.selectChannel(channel);
    //             this.startRadio();
    //         });

    //         buttonsContainer.appendChild(button);
    //     });

    //     // Add buttons container to the main container
    //     if (!container.contains(buttonsContainer)) {
    //         container.appendChild(buttonsContainer);
    //     }

    //     // Show the container and hide the original start button and channel info
    //     container.style.display = 'block';
    //     const startButton = document.getElementById('startRadioBtn');
    //     const channelInfo = document.querySelector('.channel-info');
    //     if (startButton) startButton.style.display = 'none';
    //     if (channelInfo) channelInfo.style.display = 'none';

    //     // Auto-select the first channel as default
    //     if (startupConfig.channels.length > 0) {
    //         this.selectChannel(startupConfig.channels[0]);
    //     }
    // }

    selectChannel(channel) {
        // Update selected channel properties
        this.selectedChannel = channel;
        this.selectedEndpointPath = channel.endpointPath;

        // Update visual state of buttons
        const buttons = document.querySelectorAll('.channel-button');
        buttons.forEach(button => {
            if (button.getAttribute('data-channel-name') === channel.name) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });

        // Status messages are now handled per-server during radio start
        console.log(`Selected channel: ${channel.name}`);
    }

    generateUserId() {
        // Generate a unique anonymous user ID
        // In production, you might want to use a more sophisticated method
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `anon_${timestamp}_${random}`;
    }

    showServerStatusForServer(serverId, message, status) {
        const serverStatusElement = document.getElementById(`serverStatus-${serverId}`);
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
        } else {
            // If element doesn't exist, try again after a short delay
            setTimeout(() => {
                this.showServerStatusForServer(serverId, message, status);
            }, 50);
        }
    }

    renderChannelButtonsForServer(serverId, startupConfig) {
        const container = document.getElementById(`channelButtonsContainer-${serverId}`);
        if (!container || !startupConfig || !startupConfig.channels) {
            return;
        }

        // Clear existing buttons
        const buttonsContainer = container.querySelector('.channel-buttons') || document.createElement('div');
        buttonsContainer.className = 'channel-buttons';
        buttonsContainer.innerHTML = '';

        // Create buttons for each channel
        startupConfig.channels.forEach(channel => {
            const channelDiv = document.createElement('div');
            channelDiv.className = 'channel-item';

            // Create the colored button
            const button = document.createElement('button');
            button.className = 'channel-button';
            button.setAttribute('data-channel-name', channel.name);
            button.setAttribute('data-endpoint-path', channel.endpointPath);
            button.setAttribute('data-server-id', serverId);

            button.innerHTML = `🎧 Стартирай ${channel.name} Радио`;

            // Create the info panel
            const infoDiv = document.createElement('div');
            infoDiv.className = 'channel-info-panel';

            let infoText = `Канал / Стил: ${channel.name}\n`;
            infoText += `Продължителност на песните: ${channel.trackDurationSeconds} сек\n`;
            infoText += `Възможност за заявки: ${channel.isRequestChannel ? 'Да' : 'Не'}`;

            if (channel.preferredStyles && channel.preferredStyles.length > 0) {
                infoText += `\nАвтоматично зададени стилове: ${channel.preferredStyles.join(', ')}`;
            }

            infoDiv.innerHTML = `<p>${infoText.replace(/\n/g, '<br>')}</p>`;

            button.addEventListener('click', () => {
                this.selectChannel(channel);
                // Find the server object with the working URL (updated during health check)
                const server = this.radioServers.find(s => s.id === serverId);
                this.selectServer(server);
                this.startRadio();
            });

            channelDiv.appendChild(button);
            channelDiv.appendChild(infoDiv);
            buttonsContainer.appendChild(channelDiv);
        });

        // Add buttons container to the main container
        if (!container.contains(buttonsContainer)) {
            container.appendChild(buttonsContainer);
        }

        // Show the container
        container.style.display = 'block';

        // Auto-select the first channel as default
        if (startupConfig.channels.length > 0) {
            this.selectChannel(startupConfig.channels[0]);
        }

        // Ensure buttons start in clean state
        this.resetButtonStates();
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

    showStatusForServer(serverId, message, type = 'info') {
        const statusMessage = document.getElementById(`statusMessage-${serverId}`);
        if (statusMessage) {
            statusMessage.textContent = message;
            statusMessage.className = 'status-message';
            statusMessage.style.display = 'block'; // Make sure it's visible

            // Add type-specific styling
            if (type === 'error') {
                statusMessage.classList.add('error');
            } else if (type === 'success') {
                statusMessage.classList.add('success');
            }
        }
    }

    showErrorForServer(serverId, message) {
        this.showStatusForServer(serverId, message, 'error');
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
            // Restore the original button text (without loading spinner)
            const originalText = button.getAttribute('data-original-text');
            if (originalText) {
                button.innerHTML = originalText;
            } else {
                // If no original text stored, reconstruct from channel name
                const channelName = button.getAttribute('data-channel-name');
                if (channelName) {
                    button.innerHTML = `🎧 Стартирай ${channelName} Радио`;
                }
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
    // Use multiple attempts since buttons might not be created yet
    if (radioClient) {
        radioClient.resetButtonStates();
        // Also reset after a short delay in case buttons are still loading
        setTimeout(() => radioClient.resetButtonStates(), 500);
        setTimeout(() => radioClient.resetButtonStates(), 1500);
    }
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    const client = new AIRadioClient();
    client.showError('Неочаквана грешка. Моля, опитайте отново.');
});
