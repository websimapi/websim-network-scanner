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
const disconnectBtn = document.getElementById('disconnect-btn');

// --- New elements for connected view ---
const modalInitialView = document.getElementById('modal-initial-view');
const modalConnectedView = document.getElementById('modal-connected-view');
const connectedDeviceName = document.getElementById('connected-device-name');
const gattServicesContainer = document.getElementById('gatt-services');
const dataLog = document.getElementById('data-log');
const connectionStatusBox = document.getElementById('connection-status-box');

let connectedDevice = null;
let gattServer = null;

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

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

// A separate close button for the connected view
document.querySelector('#modal-connected-view .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
});

disconnectBtn.addEventListener('click', () => {
    if (gattServer && gattServer.connected) {
        logToModal("User initiated disconnect.");
        gattServer.disconnect();
    }
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

    // Don't clear list, allow appending
    btnEl.disabled = true;
    statusEl.textContent = 'Status: Awaiting user selection...';
    statusEl.classList.add('scanning');
    
    playScanSound();

    try {
        const options = {
            acceptAllDevices: true,
        };

        const device = await navigator.bluetooth.requestDevice(options);
        
        // Check if device is already in the list
        if (document.querySelector(`[data-device-id="${device.id}"]`)) {
            statusEl.textContent = 'Status: Device already in list.';
        } else {
            statusEl.textContent = 'Status: Device added to list!';
            const listItem = createBluetoothItem(device.name || 'Unknown Device', device.id);
            listEl.appendChild(listItem);

            listItem.addEventListener('click', () => {
                modalDeviceName.textContent = `Name: ${device.name || 'Unknown Device'}`;
                modalDeviceId.textContent = `ID: ${device.id}`;
                // Real signal strength isn't available from this API, so we'll fake it for the modal.
                const signal = parseInt(listItem.querySelector('.signal-strength span')?.textContent || '50');
                modalDeviceSignal.textContent = `Signal: ${signal}%`;
                modal.style.display = 'block';

                connectBtn.onclick = async () => {
                    if (device.gatt.connected) {
                         logToModal('Already connected to GATT Server.');
                         bluetoothStatus.textContent = `Status: Already connected to ${device.name || 'device'}.`;
                         modal.style.display = 'none';
                         return;
                    }
                    
                    connectedDevice = device;
                    await connectToDevice(device);
                };
            });
        }

    } catch (error) {
        console.error('Bluetooth scan failed:', error);
        if (error.name === 'NotFoundError') {
             statusEl.textContent = 'Status: No device selected.';
        } else {
             statusEl.textContent = 'Status: Scan cancelled or failed.';
        }
    } finally {
        statusEl.classList.remove('scanning');
        btnEl.disabled = false;
        if(listEl.children.length > 0){
             statusEl.textContent = 'Status: Ready to find another device.';
        }
    }
}

// --- DATA LOGGING & UI ---
function logToModal(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    dataLog.textContent += `[${timestamp}] ${message}\n`;
    dataLog.scrollTop = dataLog.scrollHeight; // Auto-scroll
}

// --- GATT CONNECTION & INTERACTION ---
async function connectToDevice(device) {
    // Switch to connected view
    modalInitialView.style.display = 'none';
    modalConnectedView.style.display = 'block';
    dataLog.textContent = ''; // Clear log
    gattServicesContainer.innerHTML = ''; // Clear services
    
    connectedDeviceName.textContent = `Device: ${device.name || 'Unknown Device'}`;
    connectionStatusBox.textContent = `Status: Connecting...`;
    connectionStatusBox.className = 'status-box connecting';
    logToModal(`Attempting to connect to ${device.name} (${device.id})`);

    device.addEventListener('gattserverdisconnected', onDisconnected);

    try {
        gattServer = await device.gatt.connect();
        logToModal("GATT Server connected.");
        connectionStatusBox.textContent = `Status: Connected`;
        connectionStatusBox.className = 'status-box connected';
        bluetoothStatus.textContent = `Status: Connected to ${device.name || 'device'}`;
        
        discoverServices(gattServer);

    } catch (error) {
        console.error('Connection failed:', error);
        logToModal(`Error: ${error.message}`, 'error');
        connectionStatusBox.textContent = `Status: Connection Failed`;
        connectionStatusBox.className = 'status-box error';
        bluetoothStatus.textContent = `Status: Connection Failed.`;
        if (gattServer) {
            gattServer.disconnect();
        }
    }
}

function onDisconnected() {
    logToModal("Device disconnected.");
    connectionStatusBox.textContent = `Status: Disconnected`;
    connectionStatusBox.className = 'status-box disconnected';
    bluetoothStatus.textContent = 'Status: Device disconnected.';
    
    if (connectedDevice) {
        connectedDevice.removeEventListener('gattserverdisconnected', onDisconnected);
    }
    connectedDevice = null;
    gattServer = null;

    // Reset modal after a short delay
    setTimeout(() => {
        if(modal.style.display === 'block') { // Only reset if still open
            modalConnectedView.style.display = 'none';
            modalInitialView.style.display = 'block';
        }
    }, 2000);
}

async function discoverServices(server) {
    logToModal("Discovering services...");
    try {
        const services = await server.getPrimaryServices();
        logToModal(`Found ${services.length} service(s).`);
        gattServicesContainer.innerHTML = ''; // Clear previous

        for (const service of services) {
            const serviceEl = document.createElement('div');
            serviceEl.className = 'service-container';
            serviceEl.innerHTML = `<h4 class="service-uuid">Service: ${service.uuid}</h4>`;
            gattServicesContainer.appendChild(serviceEl);
            logToModal(`Exploring service: ${service.uuid}`);
            discoverCharacteristics(service, serviceEl);
        }
    } catch (error) {
        logToModal(`Service discovery failed: ${error.message}`, 'error');
    }
}

async function discoverCharacteristics(service, serviceEl) {
    try {
        const characteristics = await service.getCharacteristics();
        logToModal(`  > Found ${characteristics.length} characteristic(s) for service ${service.uuid}.`);
        
        const charList = document.createElement('ul');
        charList.className = 'characteristic-list';
        serviceEl.appendChild(charList);

        for (const characteristic of characteristics) {
            const charItem = document.createElement('li');
            charItem.className = 'characteristic-item';

            const props = characteristic.properties;
            const canRead = props.read;
            const canWrite = props.write || props.writeWithoutResponse;
            const canNotify = props.notify;

            let propBadges = '';
            if(canRead) propBadges += `<span class="prop-badge read">READ</span>`;
            if(canWrite) propBadges += `<span class="prop-badge write">WRITE</span>`;
            if(canNotify) propBadges += `<span class="prop-badge notify">NOTIFY</span>`;

            charItem.innerHTML = `
                <div class="char-info">
                    <span class="char-uuid">Characteristic: ${characteristic.uuid}</span>
                    <div class="char-props">${propBadges}</div>
                </div>
                <div class="char-actions"></div>
                <div class="char-value" style="display: none;"></div>
            `;
            charList.appendChild(charItem);

            const actionsContainer = charItem.querySelector('.char-actions');
            const valueContainer = charItem.querySelector('.char-value');

            if (canRead) {
                const readBtn = document.createElement('button');
                readBtn.textContent = 'Read';
                readBtn.onclick = () => readCharacteristic(characteristic, valueContainer);
                actionsContainer.appendChild(readBtn);
            }

            if (canWrite) {
                const writeInput = document.createElement('input');
                writeInput.type = 'text';
                writeInput.placeholder = 'Data to send';
                const writeBtn = document.createElement('button');
                writeBtn.textContent = 'Send';
                writeBtn.onclick = () => writeCharacteristic(characteristic, writeInput);
                actionsContainer.appendChild(writeInput);
                actionsContainer.appendChild(writeBtn);
            }

            if (canNotify) {
                const notifyBtn = document.createElement('button');
                notifyBtn.textContent = 'Subscribe';
                notifyBtn.onclick = (e) => toggleNotifications(characteristic, e.target);
                actionsContainer.appendChild(notifyBtn);
            }
        }
    } catch (error) {
        logToModal(`  > Characteristic discovery failed for service ${service.uuid}: ${error.message}`, 'error');
    }
}

async function readCharacteristic(characteristic, valueContainer) {
    try {
        logToModal(`Reading from ${characteristic.uuid}...`);
        const value = await characteristic.readValue();
        const decodedValue = textDecoder.decode(value);
        logToModal(`  > Received: "${decodedValue}"`);
        valueContainer.textContent = `Last Read: "${decodedValue}"`;
        valueContainer.style.display = 'block';
    } catch (error) {
        logToModal(`  > Read failed: ${error.message}`, 'error');
    }
}

async function writeCharacteristic(characteristic, inputEl) {
    const value = inputEl.value;
    if (!value) {
        logToModal("Write Error: Input is empty.", 'error');
        return;
    }
    try {
        logToModal(`Writing "${value}" to ${characteristic.uuid}...`);
        await characteristic.writeValue(textEncoder.encode(value));
        logToModal(`  > Write successful.`);
        inputEl.value = '';
    } catch(error) {
        logToModal(`  > Write failed: ${error.message}`, 'error');
    }
}

async function toggleNotifications(characteristic, button) {
    if (button.textContent === 'Subscribe') {
        try {
            logToModal(`Subscribing to notifications for ${characteristic.uuid}...`);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
            button.textContent = 'Unsubscribe';
            logToModal('  > Subscribed successfully.');
        } catch (error) {
            logToModal(`  > Subscription failed: ${error.message}`, 'error');
        }
    } else {
         try {
            logToModal(`Unsubscribing from ${characteristic.uuid}...`);
            await characteristic.stopNotifications();
            characteristic.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
            button.textContent = 'Subscribe';
            logToModal('  > Unsubscribed successfully.');
        } catch (error) {
            logToModal(`  > Unsubscribe failed: ${error.message}`, 'error');
        }
    }
}

function handleCharacteristicValueChanged(event) {
    const characteristic = event.target;
    const value = characteristic.value;
    const decodedValue = textDecoder.decode(value);
    logToModal(`[NOTIFY] from ${characteristic.uuid}: "${decodedValue}"`);
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
    li.dataset.deviceId = id; // Add data attribute to identify the device
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