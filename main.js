const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const CryptoJS = require('crypto-js');
const bcrypt = require('bcryptjs');
const os = require('os');

let mainWindow;
let isAuthenticated = false;
let encryptionKey = null;
let currentDataDir = null;

// Create data and config directories if they don't exist
const dataDir = path.join(app.getPath('userData'), 'data');
const configDir = path.join(app.getPath('userData'), 'config');
const passwordFile = path.join(configDir, 'password.hash');
const settingsFile = path.join(configDir, 'settings.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Default settings
const defaultSettings = {
  theme: 'dark',
  dateFormat: 'US', // US, EU, ISO
  dataDirectory: dataDir
};

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      return { ...defaultSettings, ...settings };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
}

// Save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

// Initialize current data directory
let settings = loadSettings();
currentDataDir = settings.dataDirectory;

// Update data directory references
function updateDataDir(newDir) {
  currentDataDir = newDir;
  settings.dataDirectory = newDir;
  saveSettings(settings);
}

// Get current data directory
function getCurrentDataDir() {
  return currentDataDir || dataDir;
}

// Encryption/Decryption functions
function encrypt(text, password) {
  return CryptoJS.AES.encrypt(text, password).toString();
}

function decrypt(encryptedText, password) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, password);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    throw new Error('Failed to decrypt - invalid password or corrupted data');
  }
}

// Check authentication for protected routes
function requireAuth() {
  if (!isAuthenticated) {
    throw new Error('Authentication required');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Password management
ipcMain.handle('check-password-exists', async () => {
  return fs.existsSync(passwordFile);
});

ipcMain.handle('set-password', async (event, password) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    fs.writeFileSync(passwordFile, hashedPassword, 'utf8');
    encryptionKey = password;
    isAuthenticated = true;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-password', async (event, password) => {
  try {
    if (!fs.existsSync(passwordFile)) {
      return { success: false, error: 'No password set' };
    }
    
    const hashedPassword = fs.readFileSync(passwordFile, 'utf8');
    const isValid = await bcrypt.compare(password, hashedPassword);
    
    if (isValid) {
      encryptionKey = password;
      isAuthenticated = true;
      return { success: true };
    } else {
      return { success: false, error: 'Invalid password' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  isAuthenticated = false;
  encryptionKey = null;
  return { success: true };
});

ipcMain.handle('change-password', async (event, oldPassword, newPassword) => {
  try {
    const hashedPassword = fs.readFileSync(passwordFile, 'utf8');
    const isValid = await bcrypt.compare(oldPassword, hashedPassword);
    
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }
    
    const dir = getCurrentDataDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const entryFiles = files.filter(file => file.endsWith('.enc'));
      
      for (const file of entryFiles) {
        const filePath = path.join(dir, file);
        const encryptedContent = fs.readFileSync(filePath, 'utf8');
        const decryptedContent = decrypt(encryptedContent, oldPassword);
        const newEncryptedContent = encrypt(decryptedContent, newPassword);
        fs.writeFileSync(filePath, newEncryptedContent, 'utf8');
      }
    }
    
    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    fs.writeFileSync(passwordFile, newHashedPassword, 'utf8');
    encryptionKey = newPassword;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Settings management
ipcMain.handle('get-settings', async () => {
  return { success: true, settings: loadSettings() };
});

ipcMain.handle('save-settings', async (event, newSettings) => {
  try {
    const success = saveSettings(newSettings);
    if (success) {
      settings = newSettings;
      if (newSettings.dataDirectory !== currentDataDir) {
        updateDataDir(newSettings.dataDirectory);
      }
    }
    return { success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Directory selection
ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Journal Storage Directory',
      defaultPath: os.homedir()
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0];
      const journalDir = path.join(selectedDir, 'SecureJournal');
      
      if (!fs.existsSync(journalDir)) {
        fs.mkdirSync(journalDir, { recursive: true });
      }
      
      return { success: true, directory: journalDir };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Journal entry operations
ipcMain.handle('save-entry', async (event, date, content) => {
  try {
    requireAuth();
    const filePath = path.join(getCurrentDataDir(), `${date}.enc`);
    const encryptedContent = encrypt(content, encryptionKey);
    
    const dir = getCurrentDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, encryptedContent, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-entry', async (event, date) => {
  try {
    requireAuth();
    const filePath = path.join(getCurrentDataDir(), `${date}.enc`);
    if (fs.existsSync(filePath)) {
      const encryptedContent = fs.readFileSync(filePath, 'utf8');
      const content = decrypt(encryptedContent, encryptionKey);
      return { success: true, content };
    } else {
      return { success: true, content: '' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-all-entries', async () => {
  try {
    requireAuth();
    const dir = getCurrentDataDir();
    if (!fs.existsSync(dir)) {
      return { success: true, dates: [] };
    }
    
    const files = fs.readdirSync(dir);
    const dates = files
      .filter(file => file.endsWith('.enc'))
      .map(file => file.replace('.enc', ''))
      .sort((a, b) => new Date(b) - new Date(a));
    return { success: true, dates };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-entry', async (event, date) => {
  try {
    requireAuth();
    const filePath = path.join(getCurrentDataDir(), `${date}.enc`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
