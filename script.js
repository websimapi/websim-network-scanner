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
const modal = document.getElementById('modal');
const modalCloseBtn = document.querySelector('.close-button');
const modalDeviceName = document.getElementById('modal-device-name');
const modalDeviceId = document.getElementById('modal-device-id');
const modalDeviceSignal = document.getElementById('modal-device-signal');
const connectBtn = document.getElementById('connect-btn');

// --- EVENT LISTENERS ---
networkAnalyzeBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startNetworkAnalysis();
});
bluetoothScanBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startScan('bluetooth');
});

modalCloseBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

// --- SCANNING LOGIC ---
function startScan(type) {
    if (type === 'bluetooth') {
        startBluetoothScan();
    }
}

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
        // Requesting optional services increases the chance of getting a device name.
        const options = {
            acceptAllDevices: true,
            optionalServices: [
                'battery_service', 
                'device_information_service', 
                'heart_rate',
                'health_thermometer',
                'c48e6067-5295-48d3-8d5c-0395f61792b1' // A common generic service
            ]
        };

        const device = await navigator.bluetooth.requestDevice(options);
        
        statusEl.textContent = 'Status: Device found!';
        const listItem = createBluetoothItem(device.name || 'Unknown Device', device.id);
        listEl.appendChild(listItem);

        listItem.addEventListener('click', () => {
            modalDeviceName.textContent = `Name: ${device.name || 'Unknown Device'}`;
            modalDeviceId.textContent = `ID: ${device.id}`;
            // Real signal strength isn't available from this API, so we'll fake it for the modal.
            modalDeviceSignal.textContent = `Signal: ${Math.floor(Math.random() * 60) + 40}%`;
            modal.style.display = 'block';

            // Simple connection log for demonstration
            connectBtn.onclick = async () => {
                try {
                    console.log('Attempting to connect to GATT Server...');
                    statusEl.textContent = `Status: Connecting to ${device.name || 'device'}...`;
                    const server = await device.gatt.connect();
                    console.log('Connected to GATT Server:', server);
                    statusEl.textContent = `Status: Connected to ${device.name || 'device'}!`;
                    modal.style.display = 'none';
                    // You could now interact with services and characteristics
                    // server.disconnect();
                } catch (error) {
                    console.error('Connection failed:', error);
                    statusEl.textContent = `Status: Connection Failed.`;
                    modal.style.display = 'none';
                }
            };
        });


    } catch (error) {
        console.error('Bluetooth scan failed:', error);
        statusEl.textContent = 'Status: Scan cancelled or failed.';
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

function createBluetoothItem(name, id) {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.style.cursor = 'pointer'; // Make it look clickable
    const signal = Math.floor(Math.random() * (100 - 20 + 1) + 20); // 20-100%

    li.innerHTML = `
        <div class="result-info">
            <strong>${name}</strong>
            <span class="device-id">ID: ${id.substring(0, 20)}...</span>
        </div>
        <div class="signal-strength">
            ${createSignalBars(signal)}
            <span>${signal}%</span>
        </div>
    `;
    return li;
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