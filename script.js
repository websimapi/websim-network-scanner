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

// --- Advanced State Management ---
const connections = {}; // Manages all device connection states
let currentViewingDeviceId = null; // Tracks which device is currently shown in the modal

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

// --- GATT UUID Definitions ---
const gattUuids = {
    services: {
        "00001800-0000-1000-8000-00805f9b34fb": "Generic Access",
        "00001801-0000-1000-8000-00805f9b34fb": "Generic Attribute",
        "0000180a-0000-1000-8000-00805f9b34fb": "Device Information",
        "0000180f-0000-1000-8000-00805f9b34fb": "Battery Service",
        "0000180d-0000-1000-8000-00805f9b34fb": "Heart Rate",
        "0000181c-0000-1000-8000-00805f9b34fb": "User Data",
    },
    characteristics: {
        "00002a00-0000-1000-8000-00805f9b34fb": "Device Name",
        "00002a01-0000-1000-8000-00805f9b34fb": "Appearance",
        "00002a29-0000-1000-8000-00805f9b34fb": "Manufacturer Name String",
        "00002a24-0000-1000-8000-00805f9b34fb": "Model Number String",
        "00002a25-0000-1000-8000-00805f9b34fb": "Serial Number String",
        "00002a19-0000-1000-8000-00805f9b34fb": "Battery Level",
        "00002a37-0000-1000-8000-00805f9b34fb": "Heart Rate Measurement",
    }
};

function getGattName(uuid, type = 'services') {
    uuid = uuid.toLowerCase();
    return gattUuids[type]?.[uuid] || uuid;
}

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
    currentViewingDeviceId = null;
});

// A separate close button for the connected view
document.querySelector('#modal-connected-view .close-button').addEventListener('click', () => {
    modal.style.display = 'none';
    currentViewingDeviceId = null;
});

disconnectBtn.addEventListener('click', () => {
    if (currentViewingDeviceId && connections[currentViewingDeviceId]) {
        const { gatt } = connections[currentViewingDeviceId];
        if (gatt && gatt.connected) {
            logToModal("User initiated disconnect.", currentViewingDeviceId);
            gatt.disconnect();
        }
    }
});

window.addEventListener('click', (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
        currentViewingDeviceId = null;
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
            // Still open the modal for the existing device
            showDeviceModal(device);
        } else {
            statusEl.textContent = 'Status: Device added to list!';
            const listItem = createBluetoothItem(device);
            listEl.appendChild(listItem);

            listItem.addEventListener('click', () => showDeviceModal(device));
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

// --- MODAL & UI MANAGEMENT ---
function showDeviceModal(device) {
    currentViewingDeviceId = device.id;
    const connection = connections[device.id];

    // If connected or connecting, show the detailed view
    if (connection && connection.status !== 'disconnected') {
        updateModalContent(device.id);
        modalInitialView.style.display = 'none';
        modalConnectedView.style.display = 'block';
    } else { // Otherwise, show the initial connection prompt
        modalDeviceName.textContent = `Name: ${device.name || 'Unknown Device'}`;
        modalDeviceId.textContent = `ID: ${device.id}`;
        
        const listItem = document.querySelector(`[data-device-id="${device.id}"]`);
        const signal = parseInt(listItem.querySelector('.signal-strength span')?.textContent || '50');
        modalDeviceSignal.textContent = `Signal: ${signal}%`;

        modalInitialView.style.display = 'block';
        modalConnectedView.style.display = 'none';

        connectBtn.onclick = () => {
            connectToDevice(device);
        };
    }
    modal.style.display = 'block';
}

function updateModalContent(deviceId) {
    const connection = connections[deviceId];
    if (!connection) return;

    const { device, status, log, services } = connection;

    // Update Header
    connectedDeviceName.textContent = `Device: ${device.name || 'Unknown Device'}`;

    // Update Status Box
    connectionStatusBox.textContent = `Status: ${status}`;
    connectionStatusBox.className = `status-box ${status}`;

    // Update Log
    dataLog.textContent = log.join('\n');
    dataLog.scrollTop = dataLog.scrollHeight;

    // Update Services
    gattServicesContainer.innerHTML = '';
    if (services) {
        gattServicesContainer.appendChild(services);
    }
}

function updateDeviceStatusIndicator(deviceId, status) {
    const listItem = document.querySelector(`[data-device-id="${deviceId}"]`);
    if (listItem) {
        const indicator = listItem.querySelector('.status-indicator');
        if(indicator) {
            indicator.className = `status-indicator ${status}`;
            indicator.title = `Status: ${status}`;
        }
    }
}

// --- DATA LOGGING & UI ---
function logToModal(message, deviceId, type = 'info') {
    if (!connections[deviceId]) return;
    const timestamp = new Date().toLocaleTimeString();
    connections[deviceId].log.push(`[${timestamp}] ${message}`);
    
    // If the modal for this device is currently open, update it
    if(currentViewingDeviceId === deviceId) {
        dataLog.textContent = connections[deviceId].log.join('\n');
        dataLog.scrollTop = dataLog.scrollHeight; // Auto-scroll
    }
}

// --- GATT CONNECTION & INTERACTION ---
async function connectToDevice(device) {
    const deviceId = device.id;

    // Initialize connection state
    connections[deviceId] = {
        device: device,
        gatt: null,
        status: 'connecting',
        log: [],
        services: null,
    };

    updateDeviceStatusIndicator(deviceId, 'connecting');
    
    // Switch to connected view
    modalInitialView.style.display = 'none';
    modalConnectedView.style.display = 'block';
    currentViewingDeviceId = deviceId;
    updateModalContent(deviceId);
    
    logToModal(`Attempting to connect to ${device.name || 'Unknown'} (${deviceId})`, deviceId);

    device.addEventListener('gattserverdisconnected', () => onDisconnected(deviceId));

    try {
        const gattServer = await device.gatt.connect();
        connections[deviceId].gatt = gattServer;
        connections[deviceId].status = 'connected';
        updateDeviceStatusIndicator(deviceId, 'connected');
        
        logToModal("GATT Server connected.", deviceId);
        bluetoothStatus.textContent = `Status: Connected to ${device.name || 'device'}`;
        updateModalContent(deviceId); // Update status box
        
        discoverServices(gattServer, deviceId);

    } catch (error) {
        console.error('Connection failed:', error);
        connections[deviceId].status = 'error';
        logToModal(`Error: ${error.message}`, deviceId, 'error');
        bluetoothStatus.textContent = `Status: Connection Failed.`;
        updateDeviceStatusIndicator(deviceId, 'error');
        updateModalContent(deviceId); // Update status box
        if (connections[deviceId].gatt) {
            connections[deviceId].gatt.disconnect();
        }
    }
}

function onDisconnected(deviceId) {
    if(!connections[deviceId]) return;
    
    logToModal("Device disconnected.", deviceId);
    connections[deviceId].status = 'disconnected';
    connections[deviceId].gatt = null;
    
    updateDeviceStatusIndicator(deviceId, 'disconnected');
    bluetoothStatus.textContent = 'Status: Device disconnected.';
    
    const { device } = connections[deviceId];
    device.removeEventListener('gattserverdisconnected', onDisconnected);

    // If the modal for this device is currently open, update it
    if (currentViewingDeviceId === deviceId) {
        updateModalContent(deviceId);
        // Reset modal after a short delay
        setTimeout(() => {
            if(modal.style.display === 'block' && currentViewingDeviceId === deviceId) {
                modalConnectedView.style.display = 'none';
                modalInitialView.style.display = 'block';
                currentViewingDeviceId = null;
                 modal.style.display = 'none';
            }
        }, 2000);
    }
}

async function discoverServices(server, deviceId) {
    logToModal("Discovering services...", deviceId);
    const connection = connections[deviceId];
    
    try {
        const services = await server.getPrimaryServices();
        logToModal(`Found ${services.length} service(s).`, deviceId);
        
        const servicesFragment = document.createDocumentFragment();

        for (const service of services) {
            const serviceEl = document.createElement('div');
            serviceEl.className = 'service-container';
            const serviceName = getGattName(service.uuid, 'services');
            serviceEl.innerHTML = `<h4 class="service-uuid" title="UUID: ${service.uuid}">Service: ${serviceName}</h4>`;
            servicesFragment.appendChild(serviceEl);
            logToModal(`Exploring service: ${serviceName}`, deviceId);
            discoverCharacteristics(service, serviceEl, deviceId);
        }
        
        connection.services = servicesFragment;
        updateModalContent(deviceId);

    } catch (error) {
        logToModal(`Service discovery failed: ${error.message}`, deviceId, 'error');
        updateModalContent(deviceId);
    }
}

async function discoverCharacteristics(service, serviceEl, deviceId) {
    try {
        const characteristics = await service.getCharacteristics();
        logToModal(`  > Found ${characteristics.length} characteristic(s) for service ${getGattName(service.uuid)}.`, deviceId);
        
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
            
            const charName = getGattName(characteristic.uuid, 'characteristics');

            charItem.innerHTML = `
                <div class="char-info">
                    <span class="char-uuid" title="UUID: ${characteristic.uuid}">Characteristic: ${charName}</span>
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
                readBtn.onclick = () => readCharacteristic(characteristic, valueContainer, deviceId);
                actionsContainer.appendChild(readBtn);
            }

            if (canWrite) {
                const writeInput = document.createElement('input');
                writeInput.type = 'text';
                writeInput.placeholder = 'Data to send';
                const writeBtn = document.createElement('button');
                writeBtn.textContent = 'Send';
                writeBtn.onclick = () => writeCharacteristic(characteristic, writeInput, deviceId);
                actionsContainer.appendChild(writeInput);
                actionsContainer.appendChild(writeBtn);
            }

            if (canNotify) {
                const notifyBtn = document.createElement('button');
                notifyBtn.textContent = 'Subscribe';
                notifyBtn.dataset.subscribed = 'false';
                notifyBtn.onclick = (e) => toggleNotifications(characteristic, e.target, deviceId);
                actionsContainer.appendChild(notifyBtn);
            }
        }
    } catch (error) {
        logToModal(`  > Characteristic discovery failed for service ${getGattName(service.uuid)}: ${error.message}`, deviceId, 'error');
    }
}

function decodeCharacteristicValue(characteristic) {
    const value = characteristic.value;
    if (!value) return "N/A";

    const uuid = characteristic.uuid.toLowerCase();
    try {
        switch(uuid) {
            case '00002a19-0000-1000-8000-00805f9b34fb': // Battery Level
                return `Battery: ${value.getUint8(0)}%`;
            case '00002a29-0000-1000-8000-00805f9b34fb': // Manufacturer Name
            case '00002a24-0000-1000-8000-00805f9b34fb': // Model Number
            case '00002a25-0000-1000-8000-00805f9b34fb': // Serial Number
            case '00002a00-0000-1000-8000-00805f9b34fb': // Device Name
                return textDecoder.decode(value);
            // Add more decoders here for other known characteristics
            default:
                // Attempt to decode as UTF-8 text, with a fallback for non-printable characters
                const text = textDecoder.decode(value);
                 // eslint-disable-next-line no-control-regex
                if (/[\x00-\x08\x0E-\x1F]/.test(text)) {
                    // If it contains non-printable chars, show as hex
                     return Array.from(new Uint8Array(value.buffer)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                }
                return `"${text}"`;
        }
    } catch(e) {
        return `Error decoding: ${e.message}`;
    }
}

async function readCharacteristic(characteristic, valueContainer, deviceId) {
    try {
        logToModal(`Reading from ${getGattName(characteristic.uuid, 'characteristics')}...`, deviceId);
        await characteristic.readValue(); // This triggers the 'characteristicvaluechanged' event if successful
        const decodedValue = decodeCharacteristicValue(characteristic);
        logToModal(`  > Received: ${decodedValue}`, deviceId);
        valueContainer.textContent = `Last Read: ${decodedValue}`;
        valueContainer.style.display = 'block';
    } catch (error) {
        logToModal(`  > Read failed: ${error.message}`, deviceId, 'error');
    }
}

async function writeCharacteristic(characteristic, inputEl, deviceId) {
    const value = inputEl.value;
    if (!value) {
        logToModal("Write Error: Input is empty.", deviceId, 'error');
        return;
    }
    try {
        logToModal(`Writing "${value}" to ${getGattName(characteristic.uuid, 'characteristics')}...`, deviceId);
        await characteristic.writeValue(textEncoder.encode(value));
        logToModal(`  > Write successful.`, deviceId);
        inputEl.value = '';
    } catch(error) {
        logToModal(`  > Write failed: ${error.message}`, deviceId, 'error');
    }
}

async function toggleNotifications(characteristic, button, deviceId) {
    const isSubscribed = button.dataset.subscribed === 'true';

    if (!isSubscribed) {
        try {
            logToModal(`Subscribing to notifications for ${getGattName(characteristic.uuid, 'characteristics')}...`, deviceId);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => handleCharacteristicValueChanged(event, deviceId));
            button.textContent = 'Unsubscribe';
            button.dataset.subscribed = 'true';
            logToModal('  > Subscribed successfully.', deviceId);
        } catch (error) {
            logToModal(`  > Subscription failed: ${error.message}`, deviceId, 'error');
        }
    } else {
         try {
            logToModal(`Unsubscribing from ${getGattName(characteristic.uuid, 'characteristics')}...`, deviceId);
            await characteristic.stopNotifications();
            // Note: The event listener is kept, but stopNotifications() prevents it from firing.
            // Removing it can be complex if multiple listeners exist.
            button.textContent = 'Subscribe';
            button.dataset.subscribed = 'false';
            logToModal('  > Unsubscribed successfully.', deviceId);
        } catch (error) {
            logToModal(`  > Unsubscribe failed: ${error.message}`, deviceId, 'error');
        }
    }
}

function handleCharacteristicValueChanged(event, deviceId) {
    const characteristic = event.target;
    const decodedValue = decodeCharacteristicValue(characteristic);
    logToModal(`[NOTIFY] from ${getGattName(characteristic.uuid, 'characteristics')}: ${decodedValue}`, deviceId);
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

function createBluetoothItem(device) {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.style.cursor = 'pointer'; // Make it look clickable
    li.dataset.deviceId = device.id; // Add data attribute to identify the device
    const signal = Math.floor(Math.random() * (100 - 20 + 1) + 20); // 20-100%

    li.innerHTML = `
        <div class="status-indicator-container">
            <div class="status-indicator"></div>
        </div>
        <div class="result-info">
            <strong>${device.name || 'Unknown Device'}</strong>
            <span class="device-id">ID: ${device.id.substring(0, 20)}...</span>
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