import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ChildProcess } from 'child_process';
import crypto from 'crypto';

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

    // Load the UI - in dev, maybe localhost, in prod, the static build.
    // For now, assuming the backend serves the UI at localhost:PORT
    const uiUrl = `http://localhost:${PORT}/`;

    // We can add a secure header to the loadURL request if supported, or rely on the backend validation 
    // checking a custom header we send from the renderer via preload.

    mainWindow.loadURL(uiUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function startBackend() {
    const rootDir = path.resolve(__dirname, '../../..'); // apps/electron/dist -> apps/electron -> root
    const scriptPath = path.join(rootDir, 'openclaw.mjs');

    console.log(`Starting backend from: ${scriptPath}`);

    /*
     * Use fork() to spawn the backend using the Electron binary itself as the Node.js runtime.
     * This ensures we don't depend on the user having Node.js installed.
     */
    // fork uses IPC channel by default, but we can silence it or use it for logging if we want.
    // modifying options to include stdio pipe if we want to read stdout.
    backendProcess = fork(scriptPath, [], {
        cwd: rootDir,
        env: {
            ...process.env,
            PORT: PORT.toString(),
            ELECTRON_API_KEY: API_KEY,
            OPENCLAW_HEADLESS: 'true',
            ELECTRON_RUN_AS_NODE: '1', // Ensure Electron runs this as a plain Node script
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
    // Wait a bit for backend to be ready? Or rely on retry in renderer?
    // Ideally backend signals readiness. specific solution: wait a static time or poll.
    setTimeout(createWindow, 3000);

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
