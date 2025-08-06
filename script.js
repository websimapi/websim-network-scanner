// --- Audio Context for Sound Effects ---
let audioContext;
let scanBuffer;

function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    fetch('scan.mp3')
        .then(response => response.arrayBuffer())
        .then(data => audioContext.decodeAudioData(data))
        .then(buffer => {
            scanBuffer = buffer;
        })
        .catch(e => console.error("Error loading audio:", e));
}

function playScanSound() {
    if (!audioContext || !scanBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = scanBuffer;
    source.connect(audioContext.destination);
    source.start(0);
}

// --- DOM ELEMENTS ---
const networkAnalyzeBtn = document.getElementById('analyze-network-btn');
const bluetoothScanBtn = document.getElementById('scan-bluetooth-btn');
const networkResultsList = document.getElementById('network-results-list');
const bluetoothList = document.getElementById('bluetooth-list');
const networkStatus = document.getElementById('network-status');
const bluetoothStatus = document.getElementById('bluetooth-status');

// --- EVENT LISTENERS ---
networkAnalyzeBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startNetworkAnalysis();
});
bluetoothScanBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startBluetoothScan();
});

// --- SCANNING LOGIC ---
async function startNetworkAnalysis() {
    const listEl = networkResultsList;
    const statusEl = networkStatus;
    const btnEl = networkAnalyzeBtn;

    // Reset UI
    listEl.innerHTML = '<li><div class="analysis-result"><span class="value">Gathering data...</span></div></li>';
    btnEl.disabled = true;
    statusEl.textContent = 'Status: Analyzing...';
    statusEl.classList.add('scanning');

    playScanSound();

    // Clear previous results
    listEl.innerHTML = '';

    // Simulate a slight delay for effect
    await new Promise(resolve => setTimeout(resolve, 500));

    // 1. Get Public IP Address
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        addAnalysisResult('Public IP', ipData.ip);
    } catch (e) {
        addAnalysisResult('Public IP', 'Unavailable');
    }

    // 2. Get Connection Info
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
        addAnalysisResult('Connection Type', connection.effectiveType ? connection.effectiveType.toUpperCase() : 'Unknown');
        if (connection.downlink) {
            addAnalysisResult('Est. Speed', `${connection.downlink} Mbps`);
        }
    } else {
        addAnalysisResult('Connection Info', 'API not supported');
    }

    // 3. Measure Latency (Ping)
    const startTime = performance.now();
    try {
        await fetch(window.location.origin, { method: 'HEAD', mode: 'no-cors' });
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        addAnalysisResult('Latency', `${latency} ms`);
    } catch (e) {
        // no-cors fetch will probably throw error but we can still get timing
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        if (latency > 0 && latency < 2000) { // Plausibility check
             addAnalysisResult('Latency', `${latency} ms`);
        } else {
             addAnalysisResult('Latency', 'Unavailable');
        }
    }

    statusEl.textContent = 'Status: Analysis Complete';
    statusEl.classList.remove('scanning');
    btnEl.disabled = false;
}

async function startBluetoothScan() {
    if (!navigator.bluetooth) {
        bluetoothStatus.textContent = "Status: Web Bluetooth not supported!";
        return;
    }

    const btnEl = bluetoothScanBtn;
    const statusEl = bluetoothStatus;
    const listEl = bluetoothList;

    // Reset UI
    listEl.innerHTML = '';
    btnEl.disabled = true;
    statusEl.textContent = 'Status: Awaiting user selection...';
    statusEl.classList.add('scanning');
    
    playScanSound();

    try {
        // Simplify options for broader compatibility.
        // Requesting a couple of common services can help get device names.
        const options = {
            acceptAllDevices: true,
            optionalServices: ['battery_service', 'device_information_service']
        };

        const device = await navigator.bluetooth.requestDevice(options);
        
        statusEl.textContent = 'Status: Device found! Click connect.';
        const { listItem, connectButton } = createBluetoothItem(device, statusEl);
        listEl.appendChild(listItem);

        connectButton.onclick = async () => {
            connectButton.disabled = true;
            connectButton.textContent = 'Connecting...';
            statusEl.textContent = `Status: Connecting to ${device.name || 'device'}...`;
            try {
                console.log('Attempting to connect to GATT Server...');
                const server = await device.gatt.connect();
                console.log('Connected to GATT Server:', server);
                statusEl.textContent = `Status: Connected to ${device.name || 'device'}!`;
                connectButton.textContent = 'Connected';
                // You could now interact with services and characteristics
                // To allow reconnection, we can listen for disconnection
                device.addEventListener('gattserverdisconnected', () => {
                    statusEl.textContent = `Status: Disconnected from ${device.name || 'device'}`;
                    connectButton.disabled = false;
                    connectButton.textContent = 'Connect';
                });
            } catch (error) {
                console.error('Connection failed:', error);
                statusEl.textContent = `Status: Connection Failed.`;
                connectButton.disabled = false;
                connectButton.textContent = 'Connect';
            }
        };

    } catch (error) {
        if (error.name === 'NotFoundError') {
             statusEl.textContent = 'Status: Scan cancelled by user.';
        } else {
            console.error('Bluetooth scan failed:', error);
            statusEl.textContent = 'Status: Scan failed. See console for details.';
        }
    } finally {
        statusEl.classList.remove('scanning');
        btnEl.disabled = false;
    }
}

// --- ITEM CREATION ---
function addAnalysisResult(label, value) {
    const li = document.createElement('li');
    li.className = 'analysis-result';
    
    // Add staggered animation delay
    const existingItems = networkResultsList.children.length;
    li.style.setProperty('--delay', `${existingItems * 0.1}s`);

    li.innerHTML = `
        <span class="label">${label}:</span>
        <span class="value">${value}</span>
    `;
    networkResultsList.appendChild(li);
}

function createBluetoothItem(device, statusEl) {
    const li = document.createElement('li');
    li.className = 'result-item';
    const signal = Math.floor(Math.random() * (100 - 20 + 1) + 20); // 20-100%
    const name = device.name || 'Unknown Device';
    const id = device.id;

    li.innerHTML = `
        <div class="result-info">
            <strong>${name}</strong>
            <span class="device-id">ID: ${id.substring(0, 20)}...</span>
        </div>
        <div class="signal-strength">
            ${createSignalBars(signal)}
            <span>${signal}%</span>
        </div>
        <button class="connect-btn-item">Connect</button>
    `;
    
    const connectButton = li.querySelector('.connect-btn-item');

    // Add a click listener to the whole item to open the modal for more details.
    li.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return; // Don't trigger if button is clicked

        const modal = document.getElementById('modal');
        document.getElementById('modal-device-name').textContent = `Name: ${name}`;
        document.getElementById('modal-device-id').textContent = `ID: ${id}`;
        document.getElementById('modal-device-signal').textContent = `Signal: ${signal}%`;
        
        // This button in modal is now for show or can be removed.
        const connectBtnInModal = document.getElementById('connect-btn');
        connectBtnInModal.style.display = 'none'; // Hide modal connect button to avoid confusion
        
        modal.style.display = 'block';
    });

    return { listItem: li, connectButton };
}

function createSignalBars(percentage) {
    let activeBars = 0;
    if (percentage > 25) activeBars = 1;
    if (percentage > 50) activeBars = 2;
    if (percentage > 75) activeBars = 3;
    if (percentage > 90) activeBars = 4;

    return `
        <div class="signal-bars">
            <div class="bar bar1 ${activeBars >= 1 ? 'active' : ''}"></div>
            <div class="bar bar2 ${activeBars >= 2 ? 'active' : ''}"></div>
            <div class="bar bar3 ${activeBars >= 3 ? 'active' : ''}"></div>
            <div class="bar bar4 ${activeBars >= 4 ? 'active' : ''}"></div>
        </div>
    `;
}