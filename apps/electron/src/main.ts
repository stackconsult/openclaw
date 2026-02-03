import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ChildProcess, fork } from 'child_process';
import crypto from 'crypto';
import { autoUpdater } from 'electron-updater';

const isDev = process.env.NODE_ENV === 'development';
const API_KEY = crypto.randomBytes(32).toString('hex');
const PORT = 3000; // Define a port or better, find a free one.

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const uiUrl = `http://localhost:${PORT}/`;
    mainWindow.loadURL(uiUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function setupAutoUpdater() {
    autoUpdater.logger = console;
    autoUpdater.checkForUpdatesAndNotify();
}

async function startBackend() {
    const rootDir = path.resolve(__dirname, '../../..');
    const scriptPath = path.join(rootDir, 'openclaw.mjs');

    console.log(`Starting backend from: ${scriptPath}`);

    backendProcess = fork(scriptPath, [], {
        cwd: rootDir,
        env: {
            ...process.env,
            PORT: PORT.toString(),
            ELECTRON_API_KEY: API_KEY,
            OPENCLAW_HEADLESS: 'true',
            ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    if (backendProcess.stdout) {
        backendProcess.stdout.on('data', (data) => {
            console.log(`[Backend]: ${data}`);
        });
    }
    if (backendProcess.stderr) {
        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend Err]: ${data}`);
        });
    }

    backendProcess.on('error', (err) => {
        console.error('Backend failed to start:', err);
    });

    backendProcess.on('exit', (code, signal) => {
        console.log(`Backend exited with code ${code} signal ${signal}`);
        app.quit();
    });
}

app.whenReady().then(() => {
    startBackend();
    setTimeout(createWindow, 3000);

    if (!isDev) {
        setupAutoUpdater();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});

ipcMain.handle('get-api-key', () => {
    return API_KEY;
});
