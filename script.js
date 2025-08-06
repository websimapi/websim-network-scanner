// --- FAKE DATA ---
const fakeWifiSSIDs = [
    "xfinitywifi", "NETGEAR-GUEST", "MySpectrumWiFi2G", "Linksys_Home",
    "CoffeeShop_FreeWiFi", "Airport_WiFi", "Public_Library_Net",
    "ASUS_5G", "TP-Link_Router", "Hidden Network"
];

const fakeBluetoothNames = [
    "AirPods Pro", "JBL Charge 5", "WH-1000XM5", "Logitech MX Master 3",
    "Smart TV 4K", "Apple Watch", "Fitbit Versa 3", "Bose SoundLink",
    "Tesla Model 3", "Tile Mate"
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

// --- EVENT LISTENERS ---
wifiScanBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startScan('wifi');
});
bluetoothScanBtn.addEventListener('click', () => {
    initAudio(); // Initialize audio on first user interaction
    startScan('bluetooth');
});

// --- SCANNING LOGIC ---
function startScan(type) {
    const isWifi = type === 'wifi';
    const listEl = isWifi ? wifiList : bluetoothList;
    const statusEl = isWifi ? wifiStatus : bluetoothStatus;
    const btnEl = isWifi ? wifiScanBtn : bluetoothScanBtn;
    const dataSet = isWifi ? fakeWifiSSIDs : fakeBluetoothNames;

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
            statusEl.textContent = `Status: Found ${itemsFound} ${isWifi ? 'networks' : 'devices'}`;
            statusEl.classList.remove('scanning');
            btnEl.disabled = false;
            return;
        }

        const itemName = dataSet[Math.floor(Math.random() * dataSet.length)];
        const listItem = isWifi ? createWifiItem(itemName) : createBluetoothItem(itemName);
        listEl.appendChild(listItem);
        itemsFound++;
    }, interval);
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

function createBluetoothItem(name) {
    const li = document.createElement('li');
    li.className = 'result-item';
    const signal = Math.floor(Math.random() * (100 - 20 + 1) + 20); // 20-100%
    const mac = Array(6).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');

    li.innerHTML = `
        <div class="result-info">
            <strong>${name}</strong>
            <span>Device Address: ${mac.toUpperCase()}</span>
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

