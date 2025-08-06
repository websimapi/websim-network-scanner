// --- FAKE DATA ---
const fakeWifiSSIDs = [
    "xfinitywifi", "NETGEAR-GUEST", "MySpectrumWiFi2G", "Linksys_Home",
    "CoffeeShop_FreeWiFi", "Airport_WiFi", "Public_Library_Net",
    "ASUS_5G", "TP-Link_Router", "Hidden Network"
];

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
const wifiScanBtn = document.getElementById('scan-wifi-btn');
const bluetoothScanBtn = document.getElementById('scan-bluetooth-btn');
const wifiList = document.getElementById('wifi-list');
const bluetoothList = document.getElementById('bluetooth-list');
const wifiStatus = document.getElementById('wifi-status');
const bluetoothStatus = document.getElementById('bluetooth-status');
const modal = document.getElementById('modal');
const modalCloseBtn = document.querySelector('.close-button');
const modalDeviceName = document.getElementById('modal-device-name');
const modalDeviceId = document.getElementById('modal-device-id');
const modalDeviceSignal = document.getElementById('modal-device-signal');
const connectBtn = document.getElementById('connect-btn');

// --- EVENT LISTENERS ---
wifiScanBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startScan('wifi');
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
    } else {
        startWifiScan();
    }
}

function startWifiScan() {
    const listEl = wifiList;
    const statusEl = wifiStatus;
    const btnEl = wifiScanBtn;
    const dataSet = fakeWifiSSIDs;

    // Reset UI
    listEl.innerHTML = '';
    btnEl.disabled = true;
    statusEl.textContent = 'Status: Scanning...';
    statusEl.classList.add('scanning');

    playScanSound();

    const scanDuration = 4000;
    const itemsToFind = 5 + Math.floor(Math.random() * 5); // Find 5-9 items
    const interval = scanDuration / itemsToFind;
    let itemsFound = 0;

    const scanInterval = setInterval(() => {
        if (itemsFound >= itemsToFind) {
            clearInterval(scanInterval);
            statusEl.textContent = `Status: Found ${itemsFound} networks`;
            statusEl.classList.remove('scanning');
            btnEl.disabled = false;
            return;
        }

        const itemName = dataSet[Math.floor(Math.random() * dataSet.length)];
        const listItem = createWifiItem(itemName);
        listEl.appendChild(listItem);
        itemsFound++;
    }, interval);
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
        const options = {
            acceptAllDevices: true,
            // Optional: To get more info like services, which can be useful
            // but might narrow down the discoverable devices.
            // optionalServices: ['battery_service', 'device_information_service'] 
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
function createWifiItem(name) {
    const li = document.createElement('li');
    li.className = 'result-item';
    const signal = Math.floor(Math.random() * (100 - 30 + 1) + 30); // 30-100%
    const security = ['WPA2', 'WPA3', 'WEP', 'Open'][Math.floor(Math.random() * 4)];
    const mac = Array(6).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');

    li.innerHTML = `
        <div class="result-info">
            <strong>${name}</strong>
            <span>${mac.toUpperCase()} - ${security}</span>
        </div>
        <div class="signal-strength">
            ${createSignalBars(signal)}
            <span>${signal}%</span>
        </div>
    `;
    return li;
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