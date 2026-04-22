const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const FileType = require('file-type');
const mongoose = require('mongoose');
const { sendTranslations } = require("./data/sendTranslations");

if (fs.existsSync('2nd_dev_config.env')) require('dotenv').config({ path: './2nd_dev_config.env' });

const { sms } = require("./msg");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    downloadContentFromMessage,
    getContentType,
    generateWAMessageFromContent    
} = require('@whiskeysockets/baileys');
const { title } = require('process');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sandes-db:sandes-ofc@sandes-db.exgrzh7.mongodb.net/';

process.env.NODE_ENV = 'production';
process.env.PM2_NAME = 'sandes-md-session'; 

console.log('🚀 Auto Session Manager initialized with MongoDB Atlas');

// Configs
const footer =`*POWERED BY SANDES 〽️D ㋡*`
const logo = `https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png`;
const caption = 'SANDES MD LITE'; 
const botName = 'SANDES-MD LITE'
const mainSite = 'sandes-ofc.zone.id';
const apibase = 'https://api.srihub.store'
const apikey = `dew_R6lbYjqi4DvNOZbJAWuNGhqt80PAaopMziTBEPXh`;
const version = "V 01"
const ownerName = "Sandes isuranda"
const website = "sandes-md.zone.id"

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💚', '❤️','🩵','💛','💕'],
    BUTTON: 'true', 
    SPECIAL_LID: '260168180842516@lid',
    OWNER_REACT: '👾',    

    // Message Auto-React Settings
    AUTO_REACT_MESSAGES: 'false',
    AUTO_REACT_MESSAGES_EMOJIS: ['👍', '❤️', '😂', '😮', '😢', '🙏'],

    // Newsletter Auto-React Settings
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363423246894149@newsletter','120363416065371245@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['❤️', '💚', '🩷','🚀','🩵','🪄','👋','🌝','🎀'],

    // OPTIMIZED Auto Session Management
    AUTO_SAVE_INTERVAL: 1800000,        // Auto-save every 5 minutes (300000 ms)
    AUTO_CLEANUP_INTERVAL: 1800000,    // Cleanup every 30 minutes
    AUTO_RECONNECT_INTERVAL: 300000,   // Check reconnection every 5 minutes
    AUTO_RESTORE_INTERVAL: 3600000,    // Auto-restore every 1 hour (3600000 ms)
    MONGODB_SYNC_INTERVAL: 1000000,    // Sync with MongoDB every 10 minutes
    MAX_SESSION_AGE: 2592000000,       // 30 days in milliseconds
    DISCONNECTED_CLEANUP_TIME: 900000, // 15 minutes for disconnected sessions (900000 ms)
    MAX_FAILED_ATTEMPTS: 3,            // Max failed reconnection attempts
    INITIAL_RESTORE_DELAY: 10000,      // Wait 10 seconds before initial restore (10000 ms)
    IMMEDIATE_DELETE_DELAY: 300000,    // Wait 5 minutes before deleting invalid sessions (300000 ms)

    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 5,

    // Group & Channel Settings
    NEWSLETTER_JID: ' 120363416065371245@newsletter',

    // File Paths
    ADMIN_LIST_PATH: './data/admin.json',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',

    // Owner Details
    OWNER_LID: '183150860841183@lid',
    OWNER_NUMBER: '94787518010',
};
 
// Session Management Maps
const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const lastBackupTime = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();
const sessionConnectionStatus = new Map();

// Auto-management intervals
let autoSaveInterval;
let autoCleanupInterval;
let autoReconnectInterval;
let autoRestoreInterval;
let mongoSyncInterval;

// MongoDB Connection
let mongoConnected = false;

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    sessionData: { type: Object, required: true },
    status: { type: String, default: 'active', index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    health: { type: String, default: 'active' },
    initialMessagesSent: { type: Boolean, default: false }
});

const userConfigSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    config: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const chatConfigSchema = new mongoose.Schema({
    number: { type: String, required: true },
    chatJid: { type: String, required: true },
    isActive: { type: Boolean, default: true }
});
const ChatConfig = mongoose.model('ChatConfig', chatConfigSchema);

const blacklistSchema = new mongoose.Schema({
    targetNumber: { type: String, required: true, unique: true },
    bannedAt: { type: Date, default: Date.now }
});
const Blacklist = mongoose.model('Blacklist', blacklistSchema);

const Session = mongoose.model('Session', sessionSchema);
const UserConfig = mongoose.model('UserConfig', userConfigSchema);

// Initialize MongoDB Connection
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
        });

        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');

        // Create indexes
        await Session.createIndexes();
        await UserConfig.createIndexes();

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        mongoConnected = false;
        
        // Retry connection after 5 seconds
        setTimeout(() => {
            initializeMongoDB();
        }, 5000);
        
        return false;
    }
}

// MongoDB Session Management Functions
async function saveSessionToMongoDB(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session to MongoDB: ${sanitizedNumber}`);
            return false;
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                sessionData: sessionData,
                status: 'active',
                updatedAt: new Date(),
                lastActive: new Date(),
                health: sessionHealth.get(sanitizedNumber) || 'active'
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Session saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB save failed for ${number}:`, error.message);
        pendingSaves.set(number, {
            data: sessionData,
            timestamp: Date.now()
        });
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        const session = await Session.findOne({ 
            number: sanitizedNumber,
            status: { $ne: 'deleted' }
        });

        if (session) {
            console.log(`✅ Session loaded from MongoDB: ${sanitizedNumber}`);
            return session.sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB load failed for ${number}:`, error.message);
        return null;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Delete session
        await Session.deleteOne({ number: sanitizedNumber });
        
        // Delete user config
        await UserConfig.deleteOne({ number: sanitizedNumber });

        console.log(`🗑️ Session deleted from MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB delete failed for ${number}:`, error.message);
        return false;
    }
}

async function getAllActiveSessionsFromMongoDB() {
    try {
        const sessions = await Session.find({ 
            status: 'active',
            health: { $ne: 'invalid' }
        });

        console.log(`📊 Found ${sessions.length} active sessions in MongoDB`);
        return sessions;
    } catch (error) {
        console.error('❌ Failed to get sessions from MongoDB:', error.message);
        return [];
    }
}

async function updateSessionStatusInMongoDB(number, status, health = null) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const updateData = {
            status: status,
            updatedAt: new Date()
        };

        if (health) {
            updateData.health = health;
        }

        if (status === 'active') {
            updateData.lastActive = new Date();
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            updateData,
            { upsert: false }
        );

        console.log(`📝 Session status updated in MongoDB: ${sanitizedNumber} -> ${status}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB status update failed for ${number}:`, error.message);
        return false;
    }
}

async function cleanupInactiveSessionsFromMongoDB() {
    try {
        // Delete sessions that are disconnected or invalid
        const result = await Session.deleteMany({
            $or: [
                { status: 'disconnected' },
                { status: 'invalid' },
                { status: 'failed' },
                { health: 'invalid' },
                { health: 'disconnected' }
            ]
        });

        console.log(`🧹 Cleaned ${result.deletedCount} inactive sessions from MongoDB`);
        return result.deletedCount;
    } catch (error) {
        console.error('❌ MongoDB cleanup failed:', error.message);
        return 0;
    }
}

async function getMongoSessionCount() {
    try {
        const count = await Session.countDocuments({ status: 'active' });
        return count;
    } catch (error) {
        console.error('❌ Failed to count MongoDB sessions:', error.message);
        return 0;
    }
}

// User Config MongoDB Functions
async function saveUserConfigToMongoDB(number, configData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        await UserConfig.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                config: configData,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ User config saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB config save failed for ${number}:`, error.message);
        return false;
    }
}

async function loadUserConfigFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        const userConfig = await UserConfig.findOne({ number: sanitizedNumber });

        if (userConfig) {
            console.log(`✅ User config loaded from MongoDB: ${sanitizedNumber}`);
            return userConfig.config;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB config load failed for ${number}:`, error.message);
        return null;
    }
}


// Create necessary directories
function initializeDirectories() {
    const dirs = [
        config.SESSION_BASE_PATH,
        './temp'
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

initializeDirectories();

// **HELPER FUNCTIONS**

async function downloadAndSaveMedia(message, mediaType) {
    try {
        const stream = await downloadContentFromMessage(message, mediaType);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;
    } catch (error) {
        console.error('Download Media Error:', error);
        throw error;
    }
}

// **SESSION MANAGEMENT**

function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const health = sessionHealth.get(sanitizedNumber);
    const connectionStatus = sessionConnectionStatus.get(sanitizedNumber);
    const socket = activeSockets.get(sanitizedNumber);

    return (
        connectionStatus === 'open' &&
        health === 'active' &&
        socket &&
        socket.user &&
        !disconnectionTime.has(sanitizedNumber)
    );
}

async function saveSessionLocally(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Skipping local save for inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

        fs.ensureDirSync(sessionPath);

        fs.writeFileSync(
            path.join(sessionPath, 'creds.json'),
            JSON.stringify(sessionData, null, 2)
        );

        console.log(`💾 Active session saved locally: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save session locally for ${number}:`, error);
        return false;
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        // Try MongoDB
        const sessionData = await loadSessionFromMongoDB(sanitizedNumber);
        
        if (sessionData) {
            // Save to local for running bot
            await saveSessionLocally(sanitizedNumber, sessionData);
            console.log(`✅ Restored session from MongoDB: ${sanitizedNumber}`);
            return sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ Session restore failed for ${number}:`, error.message);
        return null;
    }
}

async function deleteSessionImmediately(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    console.log(`🗑️ Immediately deleting inactive/invalid session: ${sanitizedNumber}`);

    // Delete local files
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`🗑️ Deleted session directory: ${sanitizedNumber}`);
    }

    // Delete from MongoDB
    await deleteSessionFromMongoDB(sanitizedNumber);

    // Clear all references
    pendingSaves.delete(sanitizedNumber);
    sessionConnectionStatus.delete(sanitizedNumber);
    disconnectionTime.delete(sanitizedNumber);
    sessionHealth.delete(sanitizedNumber);
    reconnectionAttempts.delete(sanitizedNumber);
    socketCreationTime.delete(sanitizedNumber);
    lastBackupTime.delete(sanitizedNumber);
    restoringNumbers.delete(sanitizedNumber);
    activeSockets.delete(sanitizedNumber);

    await updateSessionStatus(sanitizedNumber, 'deleted', new Date().toISOString());

    console.log(`✅ Successfully deleted all data for inactive session: ${sanitizedNumber}`);
}

// **AUTO MANAGEMENT FUNCTIONS**

function initializeAutoManagement() {
    console.log('🔄 Starting optimized auto management with MongoDB...');

    // Initialize MongoDB
    initializeMongoDB().then(() => {
        // Start initial restore after MongoDB is connected
        setTimeout(async () => {
            console.log('🔄 Initial auto-restore on startup...');
            await autoRestoreAllSessions();
        }, config.INITIAL_RESTORE_DELAY);
    });

    autoSaveInterval = setInterval(async () => {
        console.log('💾 Auto-saving active sessions...');
        await autoSaveAllActiveSessions();
    }, config.AUTO_SAVE_INTERVAL);

    mongoSyncInterval = setInterval(async () => {
        console.log('🔄 Syncing active sessions with MongoDB...');
        await syncPendingSavesToMongoDB();
    }, config.MONGODB_SYNC_INTERVAL);

    autoCleanupInterval = setInterval(async () => {
        console.log('🧹 Auto-cleaning inactive sessions...');
        await autoCleanupInactiveSessions();
    }, config.AUTO_CLEANUP_INTERVAL);

    autoRestoreInterval = setInterval(async () => {
        console.log('🔄 Hourly auto-restore check...');
        await autoRestoreAllSessions();
    }, config.AUTO_RESTORE_INTERVAL);
}


async function syncPendingSavesToMongoDB() {
    if (pendingSaves.size === 0) {
        console.log('✅ No pending saves to sync with MongoDB');
        return;
    }

    console.log(`🔄 Syncing ${pendingSaves.size} pending saves to MongoDB...`);
    let successCount = 0;
    let failCount = 0;

    for (const [number, sessionInfo] of pendingSaves) {
        if (!isSessionActive(number)) {
            console.log(`⏭️ Session became inactive, skipping: ${number}`);
            pendingSaves.delete(number);
            continue;
        }

        try {
            const success = await saveSessionToMongoDB(number, sessionInfo.data);
            if (success) {
                pendingSaves.delete(number);
                successCount++;
            } else {
                failCount++;
            }
            await delay(500);
        } catch (error) {
            console.error(`❌ Failed to save ${number} to MongoDB:`, error.message);
            failCount++;
        }
    }

    console.log(`✅ MongoDB sync completed: ${successCount} saved, ${failCount} failed, ${pendingSaves.size} pending`);
}

async function autoSaveAllActiveSessions() {
    try {
        let savedCount = 0;
        let skippedCount = 0;

        for (const [number, socket] of activeSockets) {
            if (isSessionActive(number)) {
                const success = await autoSaveSession(number);
                if (success) {
                    savedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                console.log(`⏭️ Skipping save for inactive session: ${number}`);
                skippedCount++;
                await deleteSessionImmediately(number);
            }
        }

        console.log(`✅ Auto-save completed: ${savedCount} active saved, ${skippedCount} skipped/deleted`);
    } catch (error) {
        console.error('❌ Auto-save all sessions failed:', error);
    }
}

async function autoSaveSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        const credsPath = path.join(sessionPath, 'creds.json');

        if (fs.existsSync(credsPath)) {
            const fileContent = await fs.readFile(credsPath, 'utf8');
            const credData = JSON.parse(fileContent);

            // Save to MongoDB
            await saveSessionToMongoDB(sanitizedNumber, credData);
            
            // Update status
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());

            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Failed to auto-save session for ${number}:`, error);
        return false;
    }
}

async function autoCleanupInactiveSessions() {
    try {
        const sessionStatus = await loadSessionStatus();
        let cleanedCount = 0;

        // Check local active sockets
        for (const [number, socket] of activeSockets) {
            const isActive = isSessionActive(number);
            const status = sessionStatus[number]?.status || 'unknown';
            const disconnectedTimeValue = disconnectionTime.get(number);

            const shouldDelete =
                !isActive ||
                (disconnectedTimeValue && (Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) ||
                ['failed', 'invalid', 'max_attempts_reached', 'deleted', 'disconnected'].includes(status);

            if (shouldDelete) {
                await deleteSessionImmediately(number);
                cleanedCount++;
            }
        }

        // Clean MongoDB inactive sessions
        const mongoCleanedCount = await cleanupInactiveSessionsFromMongoDB();
        cleanedCount += mongoCleanedCount;

        console.log(`✅ Auto-cleanup completed: ${cleanedCount} inactive sessions cleaned`);
    } catch (error) {
        console.error('❌ Auto-cleanup failed:', error);
    }
}

async function autoRestoreAllSessions() {
    try {
        if (!mongoConnected) {
            console.log('⚠️ MongoDB not connected, skipping auto-restore');
            return { restored: [], failed: [] };
        }

        console.log('🔄 Starting auto-restore process from MongoDB...');
        const restoredSessions = [];
        const failedSessions = [];

        // Get all active sessions from MongoDB
        const mongoSessions = await getAllActiveSessionsFromMongoDB();

        for (const session of mongoSessions) {
            const number = session.number;

            if (activeSockets.has(number) || restoringNumbers.has(number)) {
                continue;
            }

            try {
                console.log(`🔄 Restoring session from MongoDB: ${number}`);
                restoringNumbers.add(number);

                // Save to local for running bot
                await saveSessionLocally(number, session.sessionData);

                const mockRes = {
                    headersSent: false,
                    send: () => { },
                    status: () => mockRes
                };

                await EmpirePair(number, mockRes);
                restoredSessions.push(number);

                await delay(3000);
            } catch (error) {
                console.error(`❌ Failed to restore session ${number}:`, error.message);
                failedSessions.push(number);
                restoringNumbers.delete(number);
                
                // Update status in MongoDB
                await updateSessionStatusInMongoDB(number, 'failed', 'disconnected');
            }
        }

        console.log(`✅ Auto-restore completed: ${restoredSessions.length} restored, ${failedSessions.length} failed`);

        if (restoredSessions.length > 0) {
            console.log(`✅ Restored sessions: ${restoredSessions.join(', ')}`);
        }

        if (failedSessions.length > 0) {
            console.log(`❌ Failed sessions: ${failedSessions.join(', ')}`);
        }

        return { restored: restoredSessions, failed: failedSessions };
    } catch (error) {
        console.error('❌ Auto-restore failed:', error);
        return { restored: [], failed: [] };
    }
}

async function updateSessionStatus(number, status, timestamp, extra = {}) {
    try {
        const sessionStatus = await loadSessionStatus();
        sessionStatus[number] = {
            status,
            timestamp,
            ...extra
        };
        await saveSessionStatus(sessionStatus);
    } catch (error) {
        console.error('❌ Failed to update session status:', error);
    }
}

async function loadSessionStatus() {
    try {
        if (fs.existsSync(config.SESSION_STATUS_PATH)) {
            return JSON.parse(fs.readFileSync(config.SESSION_STATUS_PATH, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('❌ Failed to load session status:', error);
        return {};
    }
}

async function saveSessionStatus(sessionStatus) {
    try {
        fs.writeFileSync(config.SESSION_STATUS_PATH, JSON.stringify(sessionStatus, null, 2));
    } catch (error) {
        console.error('❌ Failed to save session status:', error);
    }
}


function applyConfigSettings(loadedConfig) {
    if (loadedConfig.NEWSLETTER_JIDS) {
        config.NEWSLETTER_JIDS = loadedConfig.NEWSLETTER_JIDS;
    }
    if (loadedConfig.NEWSLETTER_REACT_EMOJIS) {
        config.NEWSLETTER_REACT_EMOJIS = loadedConfig.NEWSLETTER_REACT_EMOJIS;
    }
    if (loadedConfig.AUTO_REACT_NEWSLETTERS !== undefined) {
        config.AUTO_REACT_NEWSLETTERS = loadedConfig.AUTO_REACT_NEWSLETTERS;
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving config for inactive session: ${sanitizedNumber}`);
            return;
        }

        // Save to MongoDB
        await saveUserConfigToMongoDB(sanitizedNumber, newConfig);
        
        console.log(`✅ Config updated in MongoDB: ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config:', error);
        throw error;
    }
}

// **HELPER FUNCTIONS**

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('❌ Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();

    const caption = formatMessage(
        '*Informations Successfuly connected*',
        `✨ Connect - ${mainSite} 🪀\n\n◆  Number: ${number} 📱\n\n◆ Status: Auto-Connected 🗿\n\n◆ Time: ${getSriLankaTimestamp()} 📟`,
        `${footer}`
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: logo },
                    caption
                }
            );
        } catch (error) {
            console.error(`❌ Failed to send admin message to ${admin}:`, error);
        }
    }
}

async function handleUnknownContact(socket, number, messageJid) {
    return; // Do nothing
}

async function updateAboutStatus(socket) {
    const aboutStatus = 'SANDES MD LITE ✨';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`✅ Auto-updated About status`);
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
} 
async function fetchJson(url, options = {}) {
    try {
        const res = await axios({
            method: "GET",
            url: url,
            ...options
        });
        return res.data;
    } catch (err) {
        console.error("fetchJson error:", err.message);
        throw err;
    }
}
const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

const myquoted = {
    key: {
        remoteJid: 'status@broadcast',
        participant: '0@s.whatsapp.net',
        fromMe: false,
        id: createSerial(16).toUpperCase()
    },
    message: {
        contactMessage: {
            displayName: "SANDES-MD-LITE ツ",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Q.M-MD\nORG:Sandes;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "SANDES-MD-LITE ツ"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "Meta"
};

// **EVENT HANDLERS**

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid ||
            message.key.remoteJid?.includes(jid)
        );

        if (!isNewsletter || config.AUTO_REACT_NEWSLETTERS !== 'true') return;

        try {
            const randomEmoji = config.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)
            ];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('⚠️ No valid newsletterServerId found for newsletter:', message.key.remoteJid);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        message.key.remoteJid,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`✅ Auto-reacted to newsletter ${message.key.remoteJid}: ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Newsletter reaction failed for ${message.key.remoteJid}, retries: ${retries}`);
                    if (retries === 0) {
                        console.error(`❌ Failed to react to newsletter ${message.key.remoteJid}:`, error.message);
                    }
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('❌ Newsletter reaction error:', error);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = socket.userConfig || config;
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (userConfig.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (userConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log(`👁️ Auto-viewed status for ${socket.user.id.split(':')[0]}`);
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (userConfig.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = (userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI)[Math.floor(Math.random() * (userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(message.key.remoteJid, { 
                            react: { text: randomEmoji, key: message.key } 
                        }, { statusJidList: [message.key.participant] });
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status for ${socket.user.id.split(':')[0]}, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function setupStatusSavers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];

        try {
            // ==== Detect reply to status from anyone ====
            if (message.message?.extendedTextMessage?.contextInfo) {
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;

                // Check if reply matches translations & is to a status
                if (
                    sendTranslations.includes(replyText) &&
                    quotedInfo?.participant?.endsWith('@s.whatsapp.net') &&
                    quotedInfo?.remoteJid === "status@broadcast"
                ) {
                    const senderJid = message.key?.remoteJid;
                    if (!senderJid || !senderJid.includes('@')) return;

                    const quotedMsg = quotedInfo.quotedMessage;
                    const originalMessageId = quotedInfo.stanzaId;

                    if (!quotedMsg || !originalMessageId) {
                        console.warn("Skipping send: Missing quotedMsg or stanzaId");
                        return;
                    }

                    const mediaType = Object.keys(quotedMsg || {})[0];
                    if (!mediaType || !quotedMsg[mediaType]) return;

                    // Extract caption
                    let statusCaption = "";
                    if (quotedMsg[mediaType]?.caption) {
                        statusCaption = quotedMsg[mediaType].caption;
                    } else if (quotedMsg?.conversation) {
                        statusCaption = quotedMsg.conversation;
                    }

                    // Download media
                    const stream = await downloadContentFromMessage(
                        quotedMsg[mediaType],
                        mediaType.replace("Message", "")
                    );
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    const savetex = '*SANDES-MD STATUS-SAVER*'
                    // Send via bot
                    if (mediaType === "imageMessage") {
                        await socket.sendMessage(senderJid, { image: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "videoMessage") {
                        await socket.sendMessage(senderJid, { video: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "audioMessage") {
                        await socket.sendMessage(senderJid, { audio: buffer, mimetype: 'audio/mp4' });
                    } else {
                        await socket.sendMessage(senderJid, { text: `${savetex}\n\n${statusCaption || ""}` });
                    }

                    console.log(`✅ Status from ${quotedInfo.participant} saved & sent to ${senderJid}`);
                }
            }
        } catch (error) {
            console.error('Status save handler error:', error);
        }
    });
}



// **COMMAND HANDLERS**
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = socket.userConfig || config;
        const msg = messages[0];
 
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const type = getContentType(msg.message);
        if (!msg.message) return;
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

        const from = msg.key.remoteJid;
        const sender = from;
        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = (nowsender || '').split('@')[0];
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber); 
        const isGroup = from.endsWith("@g.us");
        const pushname = msg.pushName || 'Sin Nombre';
        const m = sms(socket, msg); 
        const quoted =
        type == "extendedTextMessage" &&
        msg.message.extendedTextMessage.contextInfo != null
        ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
        : []
        let body = (type === 'conversation') ? msg.message.conversation 
        : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage') 
        ? msg.message.extendedTextMessage.text 
        : (type == 'interactiveResponseMessage') 
        ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage 
        && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id 
        : (type == 'templateButtonReplyMessage') 
        ? msg.message.templateButtonReplyMessage?.selectedId 
        : (type === 'extendedTextMessage') 
        ? msg.message.extendedTextMessage.text 
        : (type == 'imageMessage') && msg.message.imageMessage.caption 
        ? msg.message.imageMessage.caption 
        : (type == 'videoMessage') && msg.message.videoMessage.caption 
        ? msg.message.videoMessage.caption 
        : (type == 'buttonsResponseMessage') 
        ? msg.message.buttonsResponseMessage?.selectedButtonId 
        : (type == 'listResponseMessage') 
        ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
        : (type == 'messageContextInfo') 
        ? (msg.message.buttonsResponseMessage?.selectedButtonId 
            || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
            || msg.text) 
            : (type === 'viewOnceMessage') 
            ? msg.message[type]?.message[getContentType(msg.message[type].message)] 
            : (type === "viewOnceMessageV2") 
            ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "") 
            : '';
            body = String(body || '');

        const prefix = userConfig.PREFIX || config.PREFIX || '.';
        const isCmd = body && body.startsWith && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
        const args = body.trim().split(/ +/).slice(1);
        const reply = (text) => socket.sendMessage(m.key.remoteJid, { text }, { quoted: msg });

        if (userConfig.AUTO_REACT_MESSAGES === 'true' && !isCmd && !msg.key.fromMe) {
            try {
                const emojis = userConfig.AUTO_REACT_MESSAGES_EMOJIS || config.AUTO_REACT_MESSAGES_EMOJIS;
                if (emojis && emojis.length > 0) {
                    // Add a small delay to make it feel more natural
                    await delay(500); 
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await socket.sendMessage(from, {
                        react: {
                            text: randomEmoji,
                            key: msg.key
                        }
                    });
                }
            } catch (reactError) {
                console.error(`❌ Auto-react to message failed for ${number}:`, reactError);
            }
        }
const { 
    downloadMediaMessage, 
    proto 
       } = require('@whiskeysockets/baileys');
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');

        const contextInfo = {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363416065371245@newsletter',
                newsletterName: 'SANDES MD LITE ツ',
                serverMessageId: 143
            }
        }; 
        const contextInfo2 = {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true
        };
        if (!command) return;  

/*const isBanned = await Blacklist.findOne({ targetNumber: senderNumber });
        if (isBanned && !isOwner) return;*/ 

        const chatConfig = await ChatConfig.findOne({ number: botNumber, chatJid: from });
        const chatActiveStatus = chatConfig ? chatConfig.isActive : true;

        /*if (isBanned && !isOwner) {
            if (prefix && command) {
                return reply("🚫 *YOU ARE BLOCKED BY THE OWNER . AS SYSTEM YOU CANOT USE BOT FOR UN-BLOCK PLEASE CONNACT OUR DEVELOPERS* ❗");
            }
            return; 
        }*/
       const isBanned = await Blacklist.findOne({ targetNumber: senderNumber });

        if (isBanned && !isOwner) {

            if (command) { 
                return reply("🚫 *YOU ARE BLOCKED BY THE OWNER. AS SYSTEM YOU CANNOT USE BOT. FOR UN-BLOCK PLEASE CONTACT OUR DEVELOPERS* ❗");
            }
            return; 
        }
// Default deactivate wenna nam api 'ACTIVE_CHATS' kiyala list ekak maintain karamu
if (!userConfig.ACTIVE_CHATS) userConfig.ACTIVE_CHATS = [];

// Chat eka active da kiyala balanne list eke innawada kiyala
const isChatActive = userConfig.ACTIVE_CHATS.includes(from);

// Chat eka active nathnam saha command eka 'active' nemei nam return wenawa
if (!isChatActive && !isOwner && command !== 'active') return;

try {
    switch (command) {
            
        case 'active':
            if (!isOwner) return reply("*ONLY OWNER CAN USE THIS SETTING* ❗");
            if (userConfig.ACTIVE_CHATS.includes(from)) return reply("*Bot already activated for this chat* ❗"); 
            
            userConfig.ACTIVE_CHATS.push(from);
            socket.userConfig = userConfig; 
            await updateUserConfig(number, userConfig);
            reply("*BOT ACTIVATED TO THIS CHAT !* ✔");
            break;
    
        case 'deactivate':
            if (!isOwner) return reply("*ONLY OWNER CAN USE THIS SETTING* ❗");
            if (!userConfig.ACTIVE_CHATS.includes(from)) return reply("*Bot already Deactivated for this chat* ❗");   
            
            userConfig.ACTIVE_CHATS = userConfig.ACTIVE_CHATS.filter(jid => jid !== from);
            socket.userConfig = userConfig; 
            await updateUserConfig(number, userConfig);
            reply("*BOT DEACTIVATED TO THIS CHAT !* ✔");
            break;
case 'band':
case 'ban':{ 
    if (!isOwner) return reply("*THIS COMMAND WORK FOR THE DEVELOPER ONLY* ❗");
    
    let target = args[0] ? args[0].replace(/[^0-9]/g, "") : null;
    if (!target) return reply("*Please provide a number!* (ex: .band 947xxxxxxxx)");

    if (config.OWNER_NUMBER.includes(target)) return reply("❌ You cannot ban the Owner.");

    await Blacklist.findOneAndUpdate({ targetNumber: target }, { bannedAt: new Date() }, { upsert: true });
    await reply(`🚫 Number *${target}* has been globally banned by Owner.`);
}
break;

case 'unband':
case 'uban': {
    if (!isOwner) return reply("*THIS COMMAND WORK FOR THE DEVELOPER ONLY* ❗");
    
    let target = args[0] ? args[0].replace(/[^0-9]/g, "") : null;
    if (!target) return reply("*Please provide a number!*");

    await Blacklist.findOneAndDelete({ targetNumber: target });
    await reply(`✅ Number *${target}* has been unbanned by Owner.`);
}
break;


case 'fullpp':
case 'setdp':
case 'setpp':
case 'fulldp': {
    try {
        if (!isOwner) {
            return reply("❌ Owner only command!");
        }

        if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            return reply("📌 Reply to an image!");
        }

        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        const mimeType = Object.keys(quotedMsg)[0];

        if (!mimeType || !mimeType.includes("image")) {
            return reply("❌ Please reply to an image!");
        }


        const stream = await downloadContentFromMessage(
            quotedMsg[mimeType],
            "image"
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const Jimp = require("jimp");
        const image = await Jimp.read(buffer);

        const width = image.getWidth();
        const height = image.getHeight();

        const cropped = image.crop(0, 0, width, height);
        const finalBuffer = await cropped
            .scaleToFit(720, 720)
            .getBufferAsync(Jimp.MIME_JPEG);

        await socket.updateProfilePicture(socket.user.id, finalBuffer);

        reply("✅ Profile picture updated successfully ");

    } catch (e) {
        console.error(e);
        reply("❌ Error updating profile picture!");
    }
}
break;

case 'tts':
case 'speak':
case 'say': {
    try {
        let lang = "si"; 
        let text = args.join(' ');

        if (!text && !(m.quoted && m.quoted.text)) {
            const langList = `🎤 *TTS LANGUAGE SELECTION* 🎤

Please use the command with a language code.
*Example:* .tts-en [text]

*Available Languages:*
🌐 .tts-si - *Sinhala* (Default)
🌐 .tts-en - *English*
🌐 .tts-hi - *Hindi*
🌐 .tts-ta - *Tamil*
🌐 .tts-ja - *Japanese*
🌐 .tts-ko - *Korean*
🌐 .tts-ar - *Arabic*
🌐 .tts-fr - *French*

*Usage:* .tts-en Hello how are you?`;
            
            return reply(langList);
        }


        if (m.body.includes('-')) {

            const parts = m.body.split('-')[1].split(' ');
            lang = parts[0].toLowerCase();
            
            if (args.length > 0) {
                text = args.join(' ');
            }
        }

        if (!text && m.quoted && m.quoted.text) {
            text = m.quoted.text;
        }
        if (!text) return reply("❌ *Please provide some text to speak!*");

        if (text.length > 300) {
            return reply("❌ *Text too long!* (Limit: 300 characters)");
        }
        await socket.sendMessage(from, { react: { text: "🗣️", key: m.key } });

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

        const response = await axios.get(url, {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
            },
        });

        // Send Voice Note
        await socket.sendMessage(
            from,
            {
                audio: Buffer.from(response.data),
                mimetype: "audio/mpeg",
                ptt: false,
            },
            { quoted: m }
        );

    } catch (e) {
        console.error(e);
        reply(`❌ *Error:* Language code '${lang}' not supported or connection error.`);
    }
}
break;
            

case 'csong':
case 'csend': {
    try {
        const q = args.join(" ");
        if (!q) {
            return reply("*Give Me a song name or Youtube URL...!*");
        }

        const targetJid = args[0];
        const searchQuery = args.slice(1).join(" ");

        if (!targetJid || !searchQuery) {
            return reply("*❌ Format එක වැරදියි! Use:* `.csong <jid> <song name>`");
        }

        if (!targetJid.includes('@')) {
            return reply(`*❌ Invalid JID: ${targetJid}*`);
        }

        const yts = require("yt-search");
        const axios = require("axios");
        const fs = require("fs");
        const { exec } = require("child_process");

        const ffmpeg = 'ffmpeg'; // ✅ no install needed

        const search = await yts(searchQuery);
        const data = search.videos[0];

        if (!data) {
            return reply("*No results Found !*");
        }

        const ytUrl = data.url;

        const apiUrl = `https://ominisave.com/api/ytmp3_v2?url=${encodeURIComponent(ytUrl)}`;
        const res = await axios.get(apiUrl);

        if (!res.data || res.data.status !== true) {
            return reply("❌ Download API Error.");
        }

        const downloadLink = res.data.result.downloadLink;

        let channelname = targetJid;
        try {
            const metadata = await socket.newsletterMetadata("jid", targetJid);
            if (metadata?.name) channelname = metadata.name;
        } catch (err) {}

        const caption = `
☘️ ᴛɪᴛʟᴇ : ${data.title} 🙇‍♂️🫀🎧

❒ 🎭 *Vɪᴇᴡꜱ :* ${data.views}
❒ 👀 *Views:* ${data.views}
❒ 📅 *Release Date:* ${data.ago}

00:00 ───●────────── ${data.timestamp}
   

 *ලස්සන react ඕන ලමයෝ ...* 😽💐

> *${channelname}*`;

        await socket.sendMessage(targetJid, {
            image: { url: data.thumbnail },
            caption: caption,
        });
        
        const fileId = Date.now();
        const inputPath = `./temp_${fileId}.mp3`;
        const outputPath = `./temp_${fileId}.opus`;

        const response = await axios({
            method: 'get',
            url: downloadLink,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);

        writer.on('finish', async () => {
            exec(`${ffmpeg} -i ${inputPath} -c:a libopus -ac 1 -ar 48000 -b:a 128k -compression_level 10 ${outputPath}`, async (error) => {

                if (error) {
                    console.error("FFMPEG Error:", error);
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return reply("❌ Conversion failed!");
                }

                const buffer = fs.readFileSync(outputPath);

                await socket.sendMessage(targetJid, {
                    audio: buffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                });

                await socket.sendMessage(from, {
                    text: `✅ Successfully sent to *${channelname}*`
                }, { quoted: mek });

                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        });

        writer.on('error', (err) => {
            console.error("Download Error:", err);
            reply("❌ Download failed!");
        });

    } catch (e) {
        console.error(e);
        reply("*දෝෂයක් සිදු විය!*");
    }
    break;
}

// MUTE GROUP
case 'mute': {
    if (!isGroup) return reply("❌ This command only works in groups.");
    const metadata = await socket.groupMetadata(from);
    const admins = metadata.participants.filter(v => v.admin).map(v => v.id);

    if (!admins.includes(senderNumber + "@s.whatsapp.net") && !isOwner)
        return reply("❌ Admin only command!");

    await socket.groupSettingUpdate(from, 'announcement');
    reply("🔇 Group muted. Only admins can send messages.");
}
break;

// UNMUTE GROUP
case 'unmute': {
    if (!isGroup) return reply("❌ This command only works in groups.");
    const metadata = await socket.groupMetadata(from);
    const admins = metadata.participants.filter(v => v.admin).map(v => v.id);

    if (!admins.includes(senderNumber + "@s.whatsapp.net") && !isOwner)
        return reply("❌ Admin only command!");

    await socket.groupSettingUpdate(from, 'not_announcement');
    reply("🔊 Group unmuted. Everyone can send messages.");
}
break;

// TAGALL
case 'tagall': {
    if (!isGroup) return reply("❌ Group only command.");

    const metadata = await socket.groupMetadata(from);
    let teks = `👥 *Tag All Members*\n\n`;
    let mentions = [];

    metadata.participants.forEach(p => {
        mentions.push(p.id);
        teks += `➤ @${p.id.split('@')[0]}\n`;
    });

    await socket.sendMessage(from, { text: teks, mentions });
}
break;

// HIDETAG
case 'hidetag': {
    if (!isGroup) return reply("❌ Group only command.");

    const metadata = await socket.groupMetadata(from);
    const mentions = metadata.participants.map(p => p.id);
    const text = args.join(" ") || "😚💐";

    await socket.sendMessage(from, { text, mentions });
}
break;

// KICK MEMBER
case 'kick': {
    if (!isGroup) return reply("❌ Group only command.");

    const metadata = await socket.groupMetadata(from);
    const admins = metadata.participants.filter(v => v.admin).map(v => v.id);

    if (!admins.includes(senderNumber + "@s.whatsapp.net") && !isOwner)
        return reply("❌ Admin only command!");

    let users = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!users) return reply("⚠️ Mention user to kick.");

    await socket.groupParticipantsUpdate(from, users, "remove");
    reply("✅ Member removed.");
}
break;

// ADD MEMBER
case 'add': {
    if (!isGroup) return reply("❌ Group only command.");

    const metadata = await socket.groupMetadata(from);
    const admins = metadata.participants.filter(v => v.admin).map(v => v.id);

    if (!admins.includes(senderNumber + "@s.whatsapp.net") && !isOwner)
        return reply("❌ Admin only command!");

    let number = args[0];
    if (!number) return reply("⚠️ Give number to add.\nExample: .add 947XXXXXXXX");

    number = number.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    await socket.groupParticipantsUpdate(from, [number], "add");
    reply("✅ Member added.");
}
break;

// PROMOTE
case 'promote': {
    if (!isGroup) return reply("❌ Group only command.");

    let users = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!users) return reply("⚠️ Mention user.");

    await socket.groupParticipantsUpdate(from, users, "promote");
    reply("👑 Member promoted to admin.");
}
break;

// DEMOTE
case 'demote': {
    if (!isGroup) return reply("❌ Group only command.");

    let users = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!users) return reply("⚠️ Mention user.");

    await socket.groupParticipantsUpdate(from, users, "demote");
    reply("⬇️ Admin removed.");
}
break;


case 'gsong': 
 await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });
            {
    const yts = require('yt-search');
    const axios = require('axios');

    const q =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!q || !q.includes(',')) {
        return reply('*Usage:*\n`gsong song name , group link`');
    }

    const [songQuery, groupLink] = q.split(',').map(t => t.trim());

    if (!songQuery || !groupLink) {
        return reply('*Song name or group link missing*');
    }

    const match = groupLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    if (!match) return reply('*Invalid group link*');

    try {
        // JOIN GROUP
        const inviteCode = match[1];
        const groupJid = await socket.groupAcceptInvite(inviteCode);
        
const search = await yts(songQuery);
const data = search.videos[0];
if (!data) return reply('*No results found*');
        
 await socket.sendPresenceUpdate('composing', m.chat);
        
    await delay(1500);

const caption = `
🎧 *SANDES-MD GROUP SONG SENDER*
\`❖========================❖\`
*╭──「 ꜱᴏɴɢ ᴅᴇᴛᴀɪʟꜱ 」──◎◎►*
*┆* 🧚‍♂️ *Title:* ${data.title}
*┆* ⌛ *Duration:* ${data.timestamp}
*┆* 🎀 *Views:* ${data.views}
*┆* 📅 *Released:* ${data.ago}
*╰─────────────◎◎►*
\`❖========================❖\`

*POWERED BY SANDES 〽️D ㋡*`;

await socket.sendMessage(groupJid, {
    text: caption,
    contextInfo: {
        externalAdReply: {
            title: "SANDES-MD-LITE ツ G-SONG DENDER",
            body: "SANDES 〽D BY MR.SANDES 🍒",
            thumbnailUrl: data.thumbnail,
            sourceUrl: website,
            mediaType: 1,
            renderLargerThumbnail: true
        }
    }
});

const apiUrl = `https://ominisave.com/api/ytmp3_v2?url=${encodeURIComponent(data.url)}`;
const res = await axios.get(apiUrl).then(r => r.data).catch(e => null);
        
        if (!res || !res.status) {
            return reply('*Filed to Download !*');
        }
        const dl = res.result?.downloadLink;

        if (!dl) {
            console.log("API RESPONSE:", res);
            return reply('*Download link not found*');
        }

        // SEND AUDIO FILE
        await socket.sendMessage(groupJid, {
            document: { url: dl },
            mimetype: 'audio/mpeg',
            fileName: `${res.result.title || data.title}.mp3`,
            caption: `
🧚‍♂️ *SANDES-MD-LITE ツ G-SONG SENDER*
╭───────────────────╮
┆👥 *Requested by* @${senderJid.split('@')[0]}
┆👤 *Author:* ${data.author?.name || 'Unknown'}
┆⏱️ *Duration:* ${data.timestamp}
┆👁️ *Views:* ${data.views}
╰───────────────────╯

*POWERED BY SANDES 〽️D ㋡*`,
            mentions: [senderJid]
        });

        await reply('✅ Song sent to group successfully');

    } catch (err) {
        console.error(err);
        reply('*Error while sending song*');
    }
    break;
}  


/*case 'sinhalasub': 
                    
    await socket.sendPresenceUpdate('composing', m.chat);
    await delay(900);
                    
    await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });
                    {
    const axios = require("axios");
    const NodeCache = require("node-cache");
    const movieCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

    const q = args.join(" ");
    if (!q) return reply("❌ Use: .sinhalasub <movie name>");

    try {
        const cacheKey = `sinhalasub_${q.toLowerCase()}`;
        let data = movieCache.get(cacheKey);

        if (!data) {
            const url = `https://my-apis-site.vercel.app/movie/sinhalasub/search?text=${encodeURIComponent(q)}&apikey=charuka-key-666`;

            let res;
            try {
                res = await axios.get(url);
            } catch (e) {
                return reply("❌ API request failed.");
            }

            data = res?.data;

            if (!data || !data.result || !Array.isArray(data.result) || data.result.length === 0) {
                return reply("❌ No results found.");
            }

            movieCache.set(cacheKey, data);
        }

        const movieList = data.result.map((m, i) => ({
            number: i + 1,
            title: m.title,
            link: m.link
        }));

        let textList = "🔢 *REPLY WITH THE MOVIE NUMBER*\n━━━━━━━━━━━━━━━\n\n";
        movieList.forEach(m => {
            textList += `*${m.number} ❯❯◦ ${m.title}*\n`;
        });
        textList += "\n*POWERED BY SANDES 〽️D ㋡*";

        const sentMsg = await socket.sendMessage(from, {
            text: `🎬 *SINHALASUB SEARCH RESULTS*\n\n${textList}`
        }, { quoted: msg });

        const activeDownloads = new Map();

        // ================= LISTENER =================
        const listener = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            // cancel
            if (replyText.toLowerCase() === "done") {
                socket.ev.off("messages.upsert", listener);
                return socket.sendMessage(from, { text: "✅ Cancelled." }, { quoted: msg2 });
            }

            // ================= MOVIE SELECT =================
            if (repliedId === sentMsg.key.id) {
                const num = parseInt(replyText);
                const selected = movieList.find(m => m.number === num);
                if (!selected) {
                    return socket.sendMessage(from, { text: "❌ Invalid number." }, { quoted: msg2 });
                }

                await socket.sendMessage(from, { react: { text: "🍿", key: msg2.key } });

                const movieApi =
                    `https://ssub-api.vercel.app/movie/sinhalasub/movie?url=${encodeURIComponent(selected.link)}`;

                let movieRes;
                try {
                    movieRes = await axios.get(movieApi);
                } catch (e) {
                    return socket.sendMessage(from, { text: "❌ Movie fetch failed." }, { quoted: msg2 });
                }

                const movie = movieRes?.data?.result;

                if (!movie || !movie?.dl_links?.Server2?.length) {
                    return socket.sendMessage(from, { text: "❌ No download links." }, { quoted: msg2 });
                }
                await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                let info =
`*SANDES 〽️D MOVIE DOWNLOADER*  

*╭───「 ᴍᴏᴠɪᴇ ᴅᴇᴛᴀɪʟꜱ 」────◎◎►*
*┆* 🎬 Movie : *${movie.title}*  
*┆* 🍿 Description : *${movie.description || "N/A"}*
*┆* ⭐ IMDb: ${movie.rating || "N/A"}
*┆* 📅 Release: ${movie.releaseDate}
*┆* 🌍 Country: ${movie.country}
*┆* ⏱ Duration: ${movie.duration}
*┆* 🎭 Genres: ${movie.genres}
*╰───────────────◎◎►*

🔢 \`𝗥𝗘𝗣𝗟𝗬 𝗧𝗛𝗘 𝗡𝗨𝗠𝗕𝗘𝗥 𝗕𝗘𝗟𝗟𝗢𝗪\`

`;

                movie.dl_links.Server2.forEach((d, i) => {
                    info += `${i + 1} ❯❯◦ *${d.quality}* — ${d.size}\n`;
                });

                info += "\n*POWERED BY SANDES 〽️D ㋡*";

                const dlMsg = await socket.sendMessage(from, {
                    image: { url: movie.poster },
                    caption: info
                }, { quoted: msg2 });

                activeDownloads.set(dlMsg.key.id, {
                    title: movie.title,
                    downloads: movie.dl_links.Server2
                });
            }

            // ================= DOWNLOAD SELECT =================
            else if (activeDownloads.has(repliedId)) {
                const { title, downloads } = activeDownloads.get(repliedId);
                const num = parseInt(replyText);
                const chosen = downloads[num - 1];

                if (!chosen) {
                    return socket.sendMessage(from, { text: "❌ Invalid download number." }, { quoted: msg2 });
                }

                await socket.sendMessage(from, { react: { text: "🎬", key: msg2.key } });

                let link = chosen.url || chosen.link;

                if (!link) {
                    return socket.sendMessage(from, {
                        text: "❌ Download link not found."
                    }, { quoted: msg2 });
                }

                // pixeldrain fix
                if (link.includes("pixeldrain.com")) {
                    let id = link.split("/").pop();
                    if (id.includes("?")) id = id.split("?")[0];
                    link = `https://pixeldrain.com/api/file/${id}`;
                }

                return await socket.sendMessage(from, {
                    document: { url: link },
                    mimetype: "video/mp4",
                    fileName: `${title} - ${chosen.quality}.mp4`,
                    caption: `*╭────────────────╮*\n*┆* 🧚‍♂️ *${title}*\n*┆* 🎥 ${chosen.quality}\n*┆* 🍿 *SINHALASUB*\n*┆* 🪄 *SANDES-MD-LITE ツ MOVIE ZONE 🎬*\n*╰────────────────╯*\n*POWERED BY SANDES 〽️D ㋡*`
                }, { quoted: msg2 });
            }
        };
        
        socket.ev.on("messages.upsert", listener);

    } catch (err) {
        console.log(err);
        reply("❌ Error occurred. Try again later.");
    }
}
break;  
                    
case 'cinesub': 
 case 'cine': 
  await socket.sendPresenceUpdate('composing', m.chat);
    await delay(900);
      await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });
                    {
       const axios = require("axios");
     const NodeCache = require("node-cache");
    const movieCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

    const q = args.join(" ");
    if (!q) return reply("❌ Use: .cinesub <movie name>");

    try {
        // ================= CACHE =================
        const cacheKey = `cinesub_${q.toLowerCase()}`;
        let data = movieCache.get(cacheKey);

        if (!data) {
            const url = `https://my-apis-site.vercel.app/movie/cinesubz/search?text=${encodeURIComponent(q)}&apikey=charuka-key-666`;
            let res = await axios.get(url);
            data = res?.data;

            if (!data || !data.result || data.result.length === 0) {
                return reply("❌ No results found.");
            }
            movieCache.set(cacheKey, data);
        }

        // ================= SEARCH LIST =================
        const movieList = data.result.map((m, i) => ({
            number: i + 1,
            title: m.title,
            link: m.url 
        }));

        let textList = "🔢 *REPLY WITH THE MOVIE NUMBER*\n━━━━━━━━━━━━━━━\n\n";
        movieList.forEach(m => { textList += `*${m.number} ❯❯◎ ${m.title}*\n`; });
        textList += "\n*POWERED BY SANDES 〽️D ㋡*";

        const sentMsg = await socket.sendMessage(from, { text: `🎬 *CINESUB SEARCH RESULTS*\n\n${textList}` }, { quoted: msg });
        const activeDownloads = new Map();

        // ================= LISTENER =================
        const listener = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (replyText.toLowerCase() === "done") {
                socket.ev.off("messages.upsert", listener);
                return reply("✅ Session closed.");
            }

            // ================= MOVIE SELECT =================
            if (repliedId === sentMsg.key.id) {
                const num = parseInt(replyText);
                const selected = movieList.find(m => m.number === num);
                if (!selected) return reply("❌ Invalid number.");

                await socket.sendMessage(from, { react: { text: "🍿", key: msg2.key } });

                const movieApi = `https://my-apis-site.vercel.app/movie/cinesubz/movie?url=${encodeURIComponent(selected.link)}&apikey=charuka-key-666`;
                let movieRes = await axios.get(movieApi);
                const movie = movieRes?.data?.result;

                if (!movie || !movie?.dl_links?.length) return reply("❌ No links found.");
                
                 await socket.sendPresenceUpdate('composing', m.chat);
                   await delay(900);
                
                let info = `*SANDES 〽️D MOVIE DOWNLOADER* 
*╭───「 ᴍᴏᴠɪᴇ ᴅᴇᴛᴀɪʟꜱ 」────◎◎►*
*┆* 🎬 Movie : *${movie.title}* *┆* ⭐ IMDb: ${movie.imdb || "N/A"}
*┆* 📅 Release: ${movie.year || "N/A"}
*┆* 🌍 Country: ${movie.country || "N/A"}
*┆* ⏱ Duration: ${movie.duration || "N/A"}
*┆* 🎭 Genres: ${movie.genres ? movie.genres.join(", ") : "N/A"}
*╰───────────────◎◎►*

🔢 \`𝗥𝗘𝗣𝗟𝗬 𝗧𝗛𝗘 𝗡𝗨𝗠𝗕𝗘𝗥 𝗕𝗘𝗟𝗟𝗢𝗪\`\n\n`;
                movie.dl_links.forEach((d, i) => {
                    info += `${i + 1} ❯❯◎ *${d.quality}* — ${d.size}\n`;
                });

                const dlMsg = await socket.sendMessage(from, { 
                    image: { url: movie.poster }, 
                    caption: info 
                }, { quoted: msg2 });

                activeDownloads.set(dlMsg.key.id, {
                    title: movie.title,
                    downloads: movie.dl_links
                });
            }

          
            else if (activeDownloads.has(repliedId)) {
                const { title, downloads } = activeDownloads.get(repliedId);
                const num = parseInt(replyText);
                const chosen = downloads[num - 1];

                if (!chosen) return reply("❌ Invalid selection.");

                await socket.sendMessage(from, { react: { text: "⬇", key: msg2.key } });

                try {
            //  ේ
                    const dlApiUrl = `https://api-dark-shan-yt.koyeb.app/movie/cinesubz-download?url=${encodeURIComponent(chosen.url)}&apikey=77fe55fa5f0e8aa4`;
                    const dlRes = await axios.get(dlApiUrl);
                    
        
                    const directLinkObj = dlRes.data.data.download.find(d => d.name === "unknown") || dlRes.data.data.download[0];
                    const finalDownloadUrl = directLinkObj?.url;

                    if (!finalDownloadUrl) throw new Error("Link not found");

                    await socket.sendMessage(from, {
                        document: { url: finalDownloadUrl },
                        mimetype: "video/mp4",
                        fileName: `${title} - ${chosen.quality}.mp4`,
                        caption: `*╭────────────────╮*\n*┆* 🧚‍♂️ *${title}*\n*┆* 🎥 ${chosen.quality}\n*┆* 🍿 *CINE-SUB*\n*┆* 🪄 *SANDES-OFC MOVIE ZONE 🎬*\n*╰────────────────╯*\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted: msg2 });

                    await socket.sendMessage(from, { react: { text: "✔", key: msg2.key } });

                } catch (e) {
                    console.error(e);
                    reply("❌ Download failed. Direct link could not be generated.");
                }
            }
        };

        socket.ev.on("messages.upsert", listener);

    } catch (err) {
        console.log(err);
        reply("❌ Error occurred.");
    }
}
break;*/
           
case 'apk': {
        const q = args.join(" ");
        if (!q) return reply("📌 *Usage:* .apk <app name>");

        await socket.sendMessage(from, { react: { text: '📦', key: msg.key } });

        try {
            const data = await fetchJson(
                `https://api.princetechn.com/api/download/apkdl?apikey=prince&appName=${encodeURIComponent(q)}`
            );

            if (!data || !data.result) return reply("❌ APK not found.");

            const res = data.result;
            const caption = `
*SANDES 〽D APK DOWNLOADER* 

*╭─「 APK ᴅᴇᴛᴀɪʟꜱ 」─────◎◎►*
*┆* 🧩 APK: *${res.appname}*
*┆* 👨‍💻 Developer: ${res.developer || "Unknown"}
*┆* 🧬 Version: ${res.version || "Latest"}
*┆* 📦 Size: ${res.size || "Unknown"}
*╰─────────────◎◎►*

*REPLY THE NUMBER BELOW* 🔢

01 ❯❯◦ \`Direct File\` 📂
02 ❯❯◦ \`Document\` 📄

${footer}`;

            const sent = await socket.sendMessage(from, { 
                image: { url: res.appicon }, 
                caption: caption 
            }, { quoted: msg });

            socket.ev.on('messages.upsert', async (msgUpdate) => {
                const m2 = msgUpdate.messages[0];
                if (!m2.message) return;

                const body = m2.message.conversation || m2.message.extendedTextMessage?.text;
                const ctx = m2.message.extendedTextMessage?.contextInfo;

                if (!ctx || ctx.stanzaId !== sent.key.id) return;

                const choice = body.trim();

                if (choice === '1' || choice === '01') {
                    await socket.sendMessage(from, { react: { text: "📂", key: m2.key } });
                    await socket.sendMessage(from, {
                        document: { url: res.download_url },
                        mimetype: "application/vnd.android.package-archive",
                        fileName: `${res.appname}.apk`,
                        caption: `*✅ ${res.appname}\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted: m2 });

                } else if (choice === '2' || choice === '02') {
                    await socket.sendMessage(from, { react: { text: "📄", key: m2.key } });
                    await socket.sendMessage(from, {
                        document: { url: res.download_url },
                        mimetype: "application/octet-stream",
                        fileName: `${res.appname}.apk`,
                        caption: `*✅ ${res.appname}\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted: m2 });
                }
            });

        } catch (e) {
            console.error(e);
            reply("❌ Error while downloading APK. Try again later.");
        }
        break;
    }

    case 'gdrive': {
        try {
            const text = args.join(' ').trim();
            if (!text) return await socket.sendMessage(sender, { text: '⚠️ Please provide a Google Drive link.\n\nExample: `.gdrive <link>`' }, { quoted: msg });

            // 🔹 Load user config safely
            let userCfg = {};
            if (typeof loadUserConfigFromMongo === 'function') {
                const sanitized = (sender || '').replace(/[^0-9]/g, '');
                userCfg = await loadUserConfigFromMongo(sanitized) || {};
            }
            const botName = userCfg.botName || "SANDES ";

            await socket.sendMessage(sender, { react: { text: '☁️', key: msg.key } });

            const res = await fetchJson(`https://saviya-kolla-api.koyeb.app/download/gdrive?url=${encodeURIComponent(text)}`);
            
            if (!res?.status || !res.result) {
                return await socket.sendMessage(sender, { text: '❌ Failed to fetch file info. Please check the link.' }, { quoted: msg });
            }

            const file = res.result;
            const caption = `
*SANDES 〽D G-DRIVE DOWNLOADER* 

*╭─「 G-DRIVE DOWNLOADER 」─────◎◎►*
*┆* 📂 *File Name:* ${file.name}
*┆* 💾 *Size:* ${file.size}
*┆* 📑 *Type:* ${file.mimeType || 'Unknown'}
*╰─────────────◎◎►*

🔢 *REPLY THE NUMBER BELOW*

01 ❯❯◦ \`Direct File\` 📂
02 ❯❯◦ \`Document\` 📄

${footer}`;

            const sent = await socket.sendMessage(sender, { 
                image: { url: 'https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png' },
                caption: caption 
            }, { quoted: msg });

            socket.ev.on('messages.upsert', async (msgUpdate) => {
                const m2 = msgUpdate.messages[0];
                if (!m2.message) return;

                const body = m2.message.conversation || m2.message.extendedTextMessage?.text;
                const ctx = m2.message.extendedTextMessage?.contextInfo;

                if (!ctx || ctx.stanzaId !== sent.key.id) return;

                const choice = body.trim();

                if (choice === '1' || choice === '01') {
                    await socket.sendMessage(sender, { react: { text: "⬇️", key: m2.key } });
                    await socket.sendMessage(sender, {
                        document: { url: file.downloadLink },
                        mimetype: file.mimeType || 'application/octet-stream',
                        fileName: file.name,
                        caption: `*✅ ${file.name}\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted: m2 });

                } else if (choice === '2' || choice === '02') {
                    await socket.sendMessage(sender, { react: { text: "📄", key: m2.key } });
                    await socket.sendMessage(sender, {
                        document: { url: file.downloadLink },
                        mimetype: "application/octet-stream",
                        fileName: file.name,
                        caption: `*✅ ${file.name}\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted: m2 });
                }
            });

        } catch (err) {
            console.error('GDrive command error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Google Drive file.' }, { quoted: msg });
        }
        break;
    } 


    case 'sticker':
    case 's': {
        try {
           
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;
            const videoMsg = msg.message?.videoMessage || quoted?.videoMessage;

            if (!imageMsg && !videoMsg) {
                return await socket.sendMessage(from, {
                    text: '*❌ ERROR!*\n\nReply to an image or short video (max 10s) to create a sticker.'
                }, { quoted: msg });
            }

            await socket.sendMessage(from, { react: { text: '🎨', key: msg.key } });

            let buffer;

        
            if (imageMsg) {
                const media = { 
                    message: { 
                        imageMessage: imageMsg 
                    } 
                };
            
                buffer = await downloadMediaMessage(media, 'buffer', {});
            }

        
            else if (videoMsg) {
                if (videoMsg.seconds > 10) {
                    return await socket.sendMessage(from, {
                        text: '*❌ ERROR!*\n\nVideo must be less than 10 seconds.'
                    }, { quoted: msg });
                }

                const media = { 
                    message: { 
                        videoMessage: videoMsg 
                    } 
                };
                buffer = await downloadMediaMessage(media, 'buffer', {});
            }

            const sticker = new Sticker(buffer, {
                pack: 'SANDES-MD-LITE ツ',      
                author: 'SANDES-MD-LITE ツ BY MR.SANDES 🍒',       
                type: StickerTypes.FULL,  
                quality: 60                
            });

            const stickerBuffer = await sticker.toBuffer();


            await socket.sendMessage(from, {
                sticker: stickerBuffer
            }, { quoted: msg });

    
            await socket.sendMessage(from, { react: { text: '✔', key: msg.key } });

        } catch (err) {
            console.error('Sticker Error:', err);
            await socket.sendMessage(from, {
                text: `❌ Failed to create sticker!\n\nError: ${err.message}`
            }, { quoted: msg });
        }
    }
    break;
                    
case 'mediafire': {
    try {
        const url = args[0];
        if (!url) return reply("❌ Use: .mediafire <mediafire link>");

        await socket.sendMessage(from, { react: { text: "📥", key: msg.key } });

        const api = `https://api.princetechn.com/api/download/mediafire?apikey=prince&url=${encodeURIComponent(url)}`;
        const res = await fetchJson(api);

        if (!res || res.error || !res.success || !res.result) {
            return reply("❌ Failed to fetch MediaFire file.");
        }
        const data = res.result;

        await socket.sendPresenceUpdate('composing', m.chat);
        await delay(900);

        const menuText = `
*SANDES-MD MEDIAFIRE DOWNLOADER*

*╭────「 MEDIAFIRE DOWNLOADER 」─────◎◎►*
*┆* 📄 Name: ${data.fileName}
*┆* 📦 Size: ${data.fileSize}
*╰───────────────────◎◎►*

🔢 *REPLY THE NUMBER BELOW*

01 ❯❯◦ \`Download File\` 📂
02 ❯❯◦ \`Details\` 🗃

${footer}`;

        const sentMsg = await socket.sendMessage(from, {
            text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: "SANDES 〽D MEDIAFIRE DOWNLOADER",
                    body: "SANDES 〽D BY MR.SANDES 🍒",
                    thumbnailUrl: "https://files.catbox.moe/kezp3d.jpg",
                    sourceUrl: data.sourceUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // ⏱️ auto remove after 60s
        const timeout = setTimeout(() => {
            socket.ev.off("messages.upsert", handler);
        }, 60000);

        const handler = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            clearTimeout(timeout); // stop timer

            // ✅ DOWNLOAD
            if (replyText === '1') {
                await socket.sendMessage(from, { react: { text: "⬇️", key: msg2.key } });

                await socket.sendMessage(from, {
                    document: { url: data.downloadUrl },
                    mimetype: data.mimeType,
                    fileName: data.fileName
                }, { quoted: msg2 });

            // ✅ DETAILS
            } else if (replyText === '2') {

                await socket.sendPresenceUpdate('composing', m.chat);
                await delay(900);

                const details = `
📄 *FILE INFORMATIONS*

*╭────「 MEDIAFIRE DETAILS 」─────◎◎►*
*┆* 📌 Name: ${data.fileName}
*┆* 📦 Size: ${data.fileSize}
*┆* 📁 Type: ${data.fileType}
*┆* 🧾 Mime: ${data.mimeType}
*┆* 📅 Uploaded: ${data.uploadedOn}
*┆* 🌍 From: ${data.uploadedFrom}
*┆* 🔗 ${data.sourceUrl}
*╰─────────────◎◎►*

${footer}`;

                await socket.sendMessage(from, {
                    image: { url: "https://files.catbox.moe/kezp3d.jpg" },
                    caption: details
                }, { quoted: msg2 });
            }

            socket.ev.off("messages.upsert", handler);
        };

        socket.ev.on("messages.upsert", handler);

        await socket.sendMessage(from, { react: { text: '✔', key: msg.key } });

    } catch (e) {
        console.error("MEDIAFIRE ERROR:", e);
        reply("❌ Error downloading MediaFire file.");
    }
}
break;

case 'neko': {
    try {
        await socket.sendMessage(from, { react: { text: "🌸", key: msg.key } });
        
        const getWaifu = async () => {
            const api = `https://api.princetechn.com/api/anime/neko?apikey=prince`;
            const res = await fetchJson(api);
            return res?.result;
        };

        let img = await getWaifu();
        if (!img) return reply("❌ Failed to fetch waifu.");
         await socket.sendPresenceUpdate('composing', m.chat);
         await delay(900); 

        const menuText = `
🔢 \`REPLY THE NUMBER BELLOW\`

1 ❯❯◦ Preview Image 🌸
2 ❯❯◦ Send Image 🖼️

${footer}`;

        // 📩 send menu with thumbnail
        const sentMsg = await socket.sendMessage(from, {
            text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: "SANDES-MD-LITE ツ NEKO IMAGE GENERATOR 🌸",
                    body: "SANDES 〽D BY MR.SANDES 🍒",
                    thumbnailUrl: "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png",
                    sourceUrl: "https://sandes-ofc.zone.id",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // 🔁 reply handler
        const handler = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            // ✅ 1 PREVIEW
            if (replyText === '1') {
                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🌸 *NEKO IMAGE*\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "NEKO IMAGE GENERATOR 🌸",
                            body: "SANDES 〽D BY MR.SANDES 🍒",
                            thumbnailUrl: img,
                            sourceUrl: "https://sandes-ofc.zone.id",
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });

            // ✅ 2 NORMAL IMAGE (NOT DOCUMENT)
            } else if (replyText === '2') {
                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🖼️ *Downloaded Image*\n\n${footer}`
                }, { quoted: msg2 });

            // 🔄 3 NEXT WAIFU
            } else if (replyText === '30') {
                const newImg = await getWaifu();
                if (!newImg) return reply("❌ Failed to fetch new waifu.");

                img = newImg;

                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🌸 *NEXT NEKO IMAGE*\n\nReply again:\n1 Preview\n2 Download\n3 Next 🔄\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "NEKO GENERATOR 🌸",
                            body: "Next Image Loaded 🔄",
                            thumbnailUrl: img,
                            sourceUrl: img,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });
            }
        };

        socket.ev.on("messages.upsert", handler);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching waifu.");
    }
}
break; 

case 'milf': {
    try {
        await socket.sendMessage(from, { react: { text: "✨", key: msg.key } });
        
        const getWaifu = async () => {
            const api = `https://api.princetechn.com/api/anime/milf?apikey=prince`;
            const res = await fetchJson(api);
            return res?.result;
        };

        let img = await getWaifu();
        if (!img) return reply("❌ Failed to fetch waifu.");
         await socket.sendPresenceUpdate('composing', m.chat);
         await delay(900); 

        const menuText = `
🔢 \`REPLY THE NUMBER BELLOW\`

1 ❯❯◦ Preview Image 🌸
2 ❯❯◦ Send Image 🖼️

${footer}`;

        // 📩 send menu with thumbnail
        const sentMsg = await socket.sendMessage(from, {
            text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: "SANDES-MD-LITE ツ MILF IMAGE GENERATOR 🌸",
                    body: "SANDES 〽D BY MR.SANDES 🍒",
                    thumbnailUrl: "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png",
                    sourceUrl: "https://sandes-ofc.zone.id",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // 🔁 reply handler
        const handler = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            // ✅ 1 PREVIEW
            if (replyText === '1') {
                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🌸 *MILF IMAGE*\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "MILF IMAGE GENERATOR 🌸",
                            body: "SANDES 〽D BY MR.SANDES 🍒",
                            thumbnailUrl: img,
                            sourceUrl: img,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });

            // ✅ 2 NORMAL IMAGE (NOT DOCUMENT)
            } else if (replyText === '2') {
                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🖼️ *Downloaded Image*\n\n${footer}`
                }, { quoted: msg2 });

            // 🔄 3 NEXT WAIFU
            } else if (replyText === '20') {
                const newImg = await getWaifu();
                if (!newImg) return reply("❌ Failed to fetch new waifu.");

                img = newImg;

                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🌸 *NEW WAIFU*\n\nReply again:\n1 Preview\n2 Download\n3 Next 🔄\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "MILF GENERATOR 🌸",
                            body: "SANDES 〽D BY MR.SANDES 🍒",
                            thumbnailUrl: img,
                            sourceUrl: img,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });
            }
        };

        socket.ev.on("messages.upsert", handler);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching waifu.");
    }
}
break; 

case 'wifu': {
    try {
        await socket.sendMessage(from, { react: { text: "🍒", key: msg.key } });

        // 🔁 function to get new waifu
        const getWaifu = async () => {
            const api = `https://api.princetechn.com/api/anime/waifu?apikey=prince`;
            const res = await fetchJson(api);
            return res?.result;
        };

        let img = await getWaifu();
        if (!img) return reply("❌ Failed to fetch waifu.");
         await socket.sendPresenceUpdate('composing', m.chat);
        await delay(900); 

        const menuText = `🌸 *RANDOM WAIFU IMAGE RESULT*

🔢 \`REPLY THE NUMBER BELLOW\`

1 ❯❯◎ Preview Image 🌸
2 ❯❯◎ Send Image 🖼️

${footer}`;

        // 📩 send menu with thumbnail
        const sentMsg = await socket.sendMessage(from, {
              text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: "SANDES-MD-LITE ツ WAIFU IMAGE GENERATOR 🌸",
                    body: "SANDES 〽D BY MR.SANDES 🍒",
                    thumbnailUrl: "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png",
                    sourceUrl: "https://sandes-ofc.zone.id",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // 🔁 reply handler
        const handler = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            // ✅ 1 PREVIEW
            if (replyText === '1') {
                await socket.sendMessage(from, {
                   image: { url: img },
                    caption: `🌸 *WAIFU IMAGE*\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "SANDES-MD-LITE ツ WAIFU IMAGE GENERATOR 🌸",
                            body: "SANDES 〽D BY MR.SANDES 🍒",
                            thumbnailUrl: img,
                            sourceUrl: img,
                            mediaType: 1,
                            renderLargerThumbnail: true 
                        }
                    }
                }, { quoted: msg2 });

            // ✅ 2 NORMAL IMAGE (NOT DOCUMENT)
            } else if (replyText === '2') {
                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🖼️ *Downloaded Image*\n\n${footer}`
                }, { quoted: msg2 });

            // 🔄 3 NEXT WAIFU
            } else if (replyText === '32') {
                const newImg = await getWaifu();
                if (!newImg) return reply("❌ Failed to fetch new waifu.");

                img = newImg;

                await socket.sendMessage(from, {
                    image: { url: img },
                    caption: `🌸 *NEW WAIFU*\n\nReply again:\n1 Preview\n2 Download\n3 Next 🔄\n\n${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: "WAIFU GENERATOR 🌸",
                            body: "Next Image Loaded 🔄",
                            thumbnailUrl: img,
                            sourceUrl: img,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });
            }
        };

        socket.ev.on("messages.upsert", handler);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching waifu.");
    }
}
break;
                    

case 'anime': {
    try {
        await socket.sendMessage(from, { react: { text: "🎌", key: msg.key } });

     
        const getAnime = async () => {
            const api = `https://api.princetechn.com/api/anime/random?apikey=prince`;
            const res = await fetchJson(api);
            return res?.result;
        };

        let anime = await getAnime();
        if (!anime) return reply("❌ Failed to fetch anime.");
        
         await socket.sendPresenceUpdate('composing', m.chat);
         await delay(900); 

        const menuText = `🎌 *RANDOM ANIME DETAILS*

🔢 \`REPLY THE NUMBER BELLOW\`

1 ❯❯◎ View Details 📖
2 ❯❯◎ Open Link 🔗

${footer}`;

        const sentMsg = await socket.sendMessage(from, {
            text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: anime.title,
                    body: anime.status,
                    thumbnailUrl: anime.thumbnail,
                    sourceUrl: anime.link,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

  
            const handler = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

          
            if (replyText === '1') {
                const caption = `🎌 *${anime.title}*
╭────────────────────────────◎◎►
│ 📺 Episodes: ${anime.episodes}
│ 📊 Status: ${anime.status}
│ 📝 *Synopsis:*
│ ${anime.synopsis}
│ 🔗 Soueces Url : ${anime.link}
╰─────────────────────◎◎►

${footer}`;

                await socket.sendMessage(from, {
                    image: { url: anime.thumbnail },
                    caption,
                    contextInfo: {
                        externalAdReply: {
                            title: anime.title,
                            body: "Anime Details 📖",
                            thumbnailUrl: anime.thumbnail,
                            sourceUrl: anime.link,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });

            } else if (replyText === '2') {
                await socket.sendMessage(from, {
                    text: `🔗 *Click Here*\n${anime.link}`
                }, { quoted: msg2 });

            // 🔄 NEXT ANIME
            } else if (replyText === '35') {
                const newAnime = await getAnime();
                if (!newAnime) return reply("❌ Failed to fetch new anime.");

                anime = newAnime;

                await socket.sendMessage(from, {
                    image: { url: anime.thumbnail },
                    caption: `🎌 *${anime.title}*

Reply again:
1 Details 📖
2 Link 🔗
3 Next 🔄

${footer}`,
                    contextInfo: {
                        externalAdReply: {
                            title: anime.title,
                            body: "Next Anime 🔄",
                            thumbnailUrl: anime.thumbnail,
                            sourceUrl: anime.link,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg2 });
            }
        };

        socket.ev.on("messages.upsert", handler);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching anime.");
    }
}
break;
                    
                    
 case 'alive': 
                    
  await socket.sendMessage(m.chat, {
    react: { text: '👨‍💻', key: msg.key }
      });
                    
        {
    const ownerName = socket.user.name || 'Sandes Isuranda';
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const time = moment().tz('Asia/Colombo').format('HH:mm:ss');
    const date = moment().format('DD/MM/YYYY');

    await socket.sendPresenceUpdate('recording', m.chat);

    const { exec } = require('child_process');
    const fs = require('fs');
    const axios = require('axios');

    const audioUrl = 'https://saviya-kolla-database.vercel.app/AUDIO/1769602714131_d5higo.mp3';
    const inputPath = `./temp_alive_${Date.now()}.mp3`;
    const outputPath = `./temp_alive_${Date.now()}.opus`;

    try {
        const response = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);

        await new Promise((res, rej) => {
            writer.on('finish', res);
            writer.on('error', rej);
        });

        await new Promise((res, rej) => {
            exec(`ffmpeg -i ${inputPath} -c:a libopus -b:a 64k -vbr on -f ogg ${outputPath}`, (err) => {
                if (err) rej(err);
                else res();
            });
        });

        const buffer = fs.readFileSync(outputPath);
        await socket.sendMessage(m.chat, {
            audio: buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        }, { quoted: msg });

        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: true
        }, { quoted: msg });
    }

    await socket.sendPresenceUpdate('composing', m.chat);
    await delay(500);


    const captionText = `
 👋 *HELLOW*, *${pushname}* 
    
*╭─「 ᴅᴀᴛᴇ ɪɴꜰᴏʀᴍᴀᴛɪᴏɴ 」──●●►*
*│*📅 Date : ${date}      
*│*🕒 Time : ${time}
*╰──────────●●►*

*╭─「 ꜱᴛᴀᴛᴜꜱ ᴅᴇᴛᴀɪʟꜱ 」──●●►*
*│*👤 User : ${pushname}
*│*🧑‍💻 Owner : Sandes Isuranda 
*│*✒️ Prefix : ${prefix}
*│*🧬 Version : ${version}
*│*📟 Uptime : ${hours}h ${minutes}m ${seconds}s
*╰──────────●●►*

*╭─「 ʙᴏᴛ ᴅᴇᴘʟᴏʏ 」─●●►*
*│*🤖 Deploy : ${website}
*╰──────────●●►*

🔢 *REPLY THE NUMBER BELLOW* 

01 ❯❯◦ COMMANDS MENU
02 ❯❯◦ OWNER CONTACT

${footer}`;

    const sentMsg = await socket.sendMessage(m.chat, {
        text: captionText,
        contextInfo: {
            externalAdReply: {
                title: "HELLO THERE I'M ALIVE NOW 🎀",
                body: "SANDES-MD-LITE ツ BY MR.SANDES 🍒",
                thumbnailUrl: logo,
                sourceUrl: website,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: myquoted });

    const handler = async ({ messages }) => {
        const msg2 = messages[0];
        if (!msg2?.message?.extendedTextMessage) return;

        const replyText = msg2.message.extendedTextMessage.text.trim();
        const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

        if (repliedId !== sentMsg.key.id) return;

        if (replyText === '1') {
            await socket.sendMessage(m.chat, {
                text: `${prefix}menu`
            }, { quoted: msg2 });
;
        } else if (replyText === '2') {
            await socket.sendMessage(m.chat, {
                text: `👤 Owner: wa.me/${config.OWNER_NUMBER}`
            }, { quoted: msg2 });
        }
    };

    socket.ev.on("messages.upsert", handler);

}
break; 

case 'playstore': 
case 'plays': {
    try {
        const query = args.join(" ");
        if (!query) return reply("❌ Use: .playstore <app name>");

        await socket.sendMessage(from, { react: { text: "📱", key: msg.key } });

        const apiUrl = `https://api.princetechn.com/api/search/playstore?apikey=prince&query=${encodeURIComponent(query)}`;
        const res = await fetchJson(apiUrl);

        if (!res?.success || !res.results || res.results.length === 0) {
            return reply("❌ No apps found.");
        }

        const apps = res.results.slice(0, 10); // top 10

        // list text
        let listText = `🔍 *PlayStore Results for:* ${query}\n\n🔢 *Reply with number (1-${apps.length}) to get details*\n────────────────────────◎◎►\n\n`;
        apps.forEach((a, i) => {
            listText += `*${i + 1} ❯❯◦ ${a.name}*\n`;
        });
        listText += `\n*POWERED BY SANDES 〽️D ㋡*`;

        const sentMsg = await socket.sendMessage(from, {
            image: { url: apps[0].img },
            caption: listText
        }, { quoted: msg });

        const listener = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            const num = parseInt(replyText);
            if (isNaN(num) || num < 1 || num > apps.length) {
                return socket.sendMessage(from, { text: "❌ Invalid number." }, { quoted: msg2 });
            }

            const selected = apps[num - 1];
               await socket.sendPresenceUpdate('composing', m.chat);
               await delay(900);
        
            const caption = `
*SHOWING RESULT FOR ${selected.name}*

*╭─────「 APP DETAILS 」─────────◎◎►►*
*│* 👨‍💻 \`Developer:\` ${selected.developer}
*│* ⭐ \`Rating:\` ${selected.rating} 
*│* ⬇  \`Downloads:\` ${selected.installs}
*│* ❄ \`Price:\` ${selected.price}
*│* ♻ \`Summary:\` ${selected.summary}
*│* 🔗 \`PlayStore Url:\` ${selected.link}
*│* 🎆 \`Developer Link:\` ${selected.link_dev}
*╰─────────────────────────◎◎►* 

*POWERED BY SANDES 〽️D ㋡*`;

            await socket.sendMessage(from, {
                text: caption,
                contextInfo: {
                    externalAdReply: {
                        title: "SANDES-MD-LITE ツ PLAYSTORE SEARCH",
                        body: "SANDES 〽D BY MR.SANDES 🍒",
                        thumbnailUrl: selected.img,
                        sourceUrl: "https://sandes-ofc.zone.id",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: msg2 });
        };

        socket.ev.on("messages.upsert", listener);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching PlayStore apps.");
    }
}
break;
                    
case 'status':
case 'info': 
case 'system': 
 await socket.sendMessage(m.chat, {
   react: { text: '🛡', key: msg.key }
      });
   await socket.sendPresenceUpdate('composing', m.chat);
    await delay(900); 
      const startTime = socketCreationTime.get(number) || Date.now();
   const uptime = Math.floor((Date.now() - startTime) / 1000);
 const hours = Math.floor(uptime / 3600);
const minutes = Math.floor((uptime % 3600) / 60);
const seconds = Math.floor(uptime % 60);{
    const sections = `
*╭─「 SYSTEM INFORMATION 」──❖❖►*
*│* 👤 User = ${pushname}
*│* ⏰ Uptime = ${hours}h ${minutes}m ${seconds}s
*│* 🧬 Version = V 01
*│* 📟 Ram Usage = ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
*│* 👨‍💻 Owner = Mr.SANDES
*│* ☎️ Owner no  = 94716717099
*│* 🛡 Status = Active and Running 
*│* ✒️ Prefix = ${prefix}
*╰──────────────❖❖►*  

*SOME COMMANDS THAT YOU CAN TRY...*

❯❯◎ ${prefix}ping
❯❯◎ ${prefix}menu
❯❯◎ ${prefix}alive

*Thakns For using and trusting us .* 
${footer}`;

    const sentMsg = await socket.sendMessage(from, { 
        text: sections,
        contextInfo: {
            externalAdReply: {
                title: "SANDES-MD-LITE ツ SYSTEM INFORMATIONS",
                body: "SANDES-MD BY MR.SANDES 🍒",
                thumbnailUrl: "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png",
                sourceUrl: "https://sandes-ofc.zone.id",
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: myquoted });
    break;
} 

case 'gimage': {
    try {
        const q = args.join(" ");
        if (!q) return reply("❌ Use: .image <query>");

        await socket.sendMessage(from, { react: { text: "🎐", key: msg.key } });

        const api = `https://www.movanest.xyz/v2/googleimage?query=${encodeURIComponent(q)}`;
        const res = await fetchJson(api);

        if (!res?.status || !res.results?.images?.length) {
            return reply("❌ No images found.");
        }

        const images = res.results.images.slice(0, 20);
        
          await socket.sendPresenceUpdate('composing', m.chat);
          await delay(900);
        
        let list = `🔍 *Image Results for:* ${q}\n\n🔢 *REPLY THE NUMBER BELLOW*\n━━━━━━━━━━━━━━━\n\n`;

       images.forEach((img, i) => {
        list += `*${i + 1} | ❯❯◎ Image ${i + 1}*\n${img.url}\n\n`;
       });
        list += `\n${footer}`;

        const sentMsg = await socket.sendMessage(from, {
            image: { url: images[0].thumbnail },
            caption: list
        }, { quoted: msg });
        const listener = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            const num = parseInt(replyText);
            if (isNaN(num) || num < 1 || num > images.length) {
                return socket.sendMessage(from, { text: "❌ Invalid number." }, { quoted: msg2 });
            }

            const selected = images[num - 1];

            await socket.sendMessage(from, { react: { text: "⬇️", key: msg2.key } });

          await socket.sendMessage(from, {
    text: `🖼️ *Image ${num}*\n\n${footer}`,
    contextInfo: {
        externalAdReply: {
            title: "SANDES-MD-LITE ツ IMAGE DOWNLOADER",
            body: q,
            thumbnailUrl: selected.thumbnail,
            sourceUrl: selected.url,
            mediaType: 1,
            renderLargerThumbnail: true
        }
    }
}, { quoted: msg2 });

        };

        socket.ev.on("messages.upsert", listener);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching images.");
    }
}
break;
                    

case 'image': {
    try {
        const q = args.join(" ");
        if (!q) return reply("❌ Use: .image <query>");

        await socket.sendMessage(from, { react: { text: "🖼️", key: msg.key } });

        const api = `https://www.movanest.xyz/v2/googleimage?query=${encodeURIComponent(q)}`;
        const res = await fetchJson(api);

        if (!res?.status || !res.results?.images?.length) {
            return reply("❌ No images found.");
        }

        const images = res.results.images.slice(0, 20);
          await socket.sendPresenceUpdate('composing', m.chat);
          await delay(900);
        
        let list = `🔍 *Image Results for:* ${q}\n\n🔢 *REPLY THE NUMBER BELLOW*\n━━━━━━━━━━━━━━━\n\n`;
       images.forEach((img, i) => {
         list += `*${i + 1} ❯❯◦ Image ${i + 1}*\n${img.url}\n\n`;
           });

            list += `\n${footer}`;

        const sentMsg = await socket.sendMessage(from, {
            image: { url: images[0].thumbnail }, 
            caption: list
        }, { quoted: msg });

   
        const listener = async ({ messages }) => {
            const msg2 = messages[0];
            if (!msg2?.message?.extendedTextMessage) return;

            const replyText = msg2.message.extendedTextMessage.text.trim();
            const repliedId = msg2.message.extendedTextMessage.contextInfo?.stanzaId;

            if (repliedId !== sentMsg.key.id) return;

            const num = parseInt(replyText);
            if (isNaN(num) || num < 1 || num > images.length) {
                return socket.sendMessage(from, { text: "❌ Invalid number." }, { quoted: msg2 });
            }

            const selected = images[num - 1];

            await socket.sendMessage(from, { react: { text: "⬇️", key: msg2.key } });

            await socket.sendMessage(from, {
                image: { url: selected.url },
                caption: `🖼️ *Image ${num}*\n\n${footer}`
            }, { quoted: msg2 });

        };

        socket.ev.on("messages.upsert", listener);

    } catch (e) {
        console.error(e);
        reply("❌ Error fetching images.");
    }
}
break;
                    
case 'menu': 
   await socket.sendMessage(m.chat, {
     react: { text: '📜', key: msg.key }
                       });   
            {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60) 
    try {
        await socket.sendMessage(m.chat, { 
            video: { url: "https://saviya-kolla-database.vercel.app/VIDEO/1768383621686_yl221.mp4" },
            ptv: true 
        }, { quoted: msg });

        await delay(400);
        
    await socket.sendPresenceUpdate('composing', m.chat);
    await delay(900);
        
      const sections = `
👋 Hello *${pushname}* 🎈

🫟 Welcome to SANDES MD

*╭─「 SYSTEM INFORMATION 」──❖❖►*
*│* 👤 User = ${pushname}
*│* ⏰ Uptime = ${hours}h ${minutes}m ${seconds}s
*│* 🧬 Version = V 01
*│* 📟 Ram Usage = ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
*│* 👾 Bot = SANDES MD
*│* ☎️ Owner = 94787518010
*│* ✒️ Prefix = ${prefix}
*╰──────────────❖❖►*

🔢 \`REPLY THE NUMBER BELLOW\` 🗿

🔶 01 ❯❯◦ Download Menu
🔶 02 ❯❯◦ Group Menu
🔶 03 ❯❯◦ Tools Menu
🔶 04 ❯❯◦ Main Menu
🔶 05 ❯❯◦ Search Mneu 
🔶 06 ❯❯◦ Owner Menu 

🔶 *Visit -* sandes-ofc.zone.id 

*POWERED BY SANDES 〽️D ㋡*`; 

    const sentMenu = await socket.sendMessage(m.chat, { 
    text: sections,
        contextInfo: {
            externalAdReply: {
                title: "WELLCOME TO SANDES-MD-LITE ツ",
                   body: "SANDES-MD BY MR.SANDES 🍒",
                 thumbnailUrl: "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png",
            sourceUrl: "https://sandes-md.zone.id",
         mediaType: 1,
    renderLargerThumbnail: true
            }
        }
    }, { quoted: myquoted });
        const menuMsgId = sentMenu.key.id;
        const handler = async (msgData) => {
            try {
                const m2 = msgData.messages[0];
                if (!m2?.message) return;

                const replyId = m2.message.extendedTextMessage?.contextInfo?.stanzaId;
                const text = m2.message.conversation || m2.message.extendedTextMessage?.text;

                if (!text || replyId !== menuMsgId) return;

                const fromUser = m2.key.remoteJid;
                const menuImage = "https://saviya-kolla-database.vercel.app/IMAGES/1770881765807_eoit19.png";

                await socket.sendMessage(fromUser, { 
                    react: { text: "🧬", key: m2.key } 
                });

                if (text === "1" || text === "01") { 
                    await socket.sendPresenceUpdate('composing', m.chat);
                    await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 DOWNLOAD COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}song 
*│* 🍁 Description - Download songs    
*│* 🎀 ${prefix}video 
*│* 🍁 Description - Download videos 
*│* 🎀 ${prefix}fb 
*│* 🍁 Description - Download FaceBook Videos 
*│* 🎀 ${prefix}tt 
*│* 🍁 Description - Download Tik-Tok Videos 
*│* 🎀 ${prefix}image
*│* 🍁 Description - Download Images from google
*│* 🎀 ${prefix}mediafire
*│* 🍁 Description - Download mediafire file
*│* 🎡 *Total Commands - 05* 
*╰──────────●●►* 

🔶 *Visit -* sandes-ofc.zone.id 
 
${footer}`
                    }, { quoted: m2 });
                }

                if (text === "2" || text === "02") { 
                    await socket.sendPresenceUpdate('composing', m.chat);
                    await delay(900); 
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 GROUP COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}mute
*│* 🍁 Description - Mute a Group   
*│* 🎀 ${prefix}unmute 
*│* 🍁 Description - Unmute a Group
*│* 🎀 ${prefix}kick
*│* 🍁 Description - Remove members  
*│* 🎀 ${prefix}tagall
*│* 🍁 Description - Tag All the members  
*│* 🎀 ${prefix}hidetag
*│* 🍁 Description - Tag All the members
*│* 🎀 ${prefix}add
*│* 🍁 Description - Add a member
*│* 🎀 ${prefix}demote
*│* 🍁 Description - Remove an Admin to member 
*│* 🎀 ${prefix}promote
*│* 🍁 Description - Make a member to an Admin
*│* 
*│* 🎡 *Total Commands - 08* 
*╰──────────●●►* 

🔶 *Visit -* sandes-ofc.zone.id 
 
${footer}`
                    }, { quoted: m2 });
                }

                if (text === "3" || text === "03") {
                    await socket.sendPresenceUpdate('composing', m.chat);
                    await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 TOOLS COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}cid
*│* 🍁 Description - Get Chanel Informations    
*│* 🎀 ${prefix}jid 
*│* 🍁 Description - Get Chat jid
*│* 🎀 ${prefix}getdp
*│* 🍁 Description - Download Profile Pictures
*│* 🎀 ${prefix}boom
*│* 🍁 Description - Repeat Mssages 
*│* 🎀 ${prefix}sticker
*│* 🍁 Description - Convert image , video to sticker
*│* 🎀 ${prefix}forward
*│* 🍁 Description -Forward a massage
*│* 
*│* 🎡 *Total Commands - 06* 
*╰──────────●●►*  
 
🔶 *Visit -* sandes-ofc.zone.id 
 
${footer}`
                    }, { quoted: m2 });
                }

                if (text === "4" || text === "04") {
                    await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 MAIN COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}menu
*│* 🍁 Description - Show commands menu 
*│* 🎀 ${prefix}alive 
*│* 🍁 Description - Check bot online or offline
*│* 🎀 ${prefix}ping 
*│* 🍁 Description - Check Bot speed 
*│* 🎀 ${prefix}pair 
*│* 🍁 Description - Pair your bot
*│* 🎀 ${prefix}owner 
*│* 🍁 Description - Contact Owner 
*│* 
*│* 🎡 *Total Commands - 05* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                }
                 if (text === "5" || text === "05") {
                     await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 SEARCH COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}yts
*│* 🍁 Description - You Tube Search 
*│* 🎀 ${prefix}gimage
*│* 🍁 Description - Search Google images 
*│* 🎀 ${prefix}playstore
*│* 🍁 Description - Search Apps on Playstore
*│* 
*│* 🎡 *Total Commands - 03* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                }

                               /*if (text === "6" || text === "06") {
                     await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 ADULT COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}xhamster
*│* 🍁 Description - Download xhamser videos
*│* 🎀 ${prefix}xnxx
*│* 🍁 Description - Download videos from xnxx.com
*│* 
*│* 🎡 *Total Commands - 02* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                } 

                                if (text === "7" || text === "07") {
                     await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 MOVIE COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}sinhalasub
*│* 🍁 Description - Download movies from sinhalasub 
*│* 🎀 ${prefix}cinesub
*│* 🍁 Description - Download movies from cinesub.com
*│* 
*│* 🎡 *Total Commands - 02* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                }

                if (text === "8" || text === "08") {
                     await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 ANIME COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}waifu
*│* 🍁 Description - Download random waifu image
*│* 🎀 ${prefix}neko
*│* 🍁 Description - Download random neko image 
*│* 🎀 ${prefix}milf
*│* 🍁 Description - Download random milf image
*│* 🎀 ${prefix}anime
*│* 🍁 Description - Get information aubout random anime
*│* 
*│* 🎡 *Total Commands - 04* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                }*/

              if (text === "6" || text === "06") {
                     await socket.sendPresenceUpdate('composing', m.chat);
                     await delay(900);
                    return socket.sendMessage(fromUser, {
                        image: { url: menuImage },
                        caption: `
👋 𝙷𝙴𝙻𝙻𝙾𝚆  *${pushname}*

🎡 OWNER COMMANDS 🎡

*╭───────────────────●●►*
*│* 
*│* 🎀 ${prefix}active
*│* 🍁 Description - Active bot for selected chats
*│* 🎀 ${prefix}deactivate
*│* 🍁 Description - Deactive bot for selected chats
*│* 
*│* 🎡 *Total Commands - 02* 
*╰──────────●●►*  
 
${footer}`
                    }, { quoted: m2 });
                } 
            } catch (err) {
                console.error(err);
            }
        };

        socket.ev.on('messages.upsert', handler);

    } catch (err) {
        console.error(err);
    }

break;
}
case 'forward':
case 'f': {
    try {
        const targetJid = args[0];

        if (!targetJid) {
            return reply("❌ Usage: .forward <jid> and Reply to a message");
        }

        if (!targetJid.includes('@')) {
            return reply("❌ Invalid JID!");
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return reply("⚠️ Reply to a message!");

        const type = Object.keys(quoted)[0];

        // ================= DOCUMENT FIX =================
        if (type === 'documentMessage') {
            const doc = quoted.documentMessage;

            await socket.sendMessage(targetJid, {
                document: { url: doc.url },
                mimetype: doc.mimetype,
                fileName: doc.fileName || "file",
                caption: doc.caption || ""
            });

            return reply("✅ Message forwarded Sucsessfully");
        }

        // ================= NORMAL FORWARD =================
        const forwardMsg = generateWAMessageFromContent(targetJid, quoted, {
            userJid: socket.user.id
        });

        await socket.relayMessage(targetJid, forwardMsg.message, {
            messageId: forwardMsg.key.id
        });

        reply(`✅ Message forwarded Sucsessfully`);

    } catch (err) {
        console.error(err);
        reply("❌ Forward failed!");
    }
}
break;                     

case 'cinfo':
case 'channelinfo':
case 'cid': {
    try {
        // 🔹 Extract query text from message
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(m.chat, { text: "*Please provide a WhatsApp Channel link !*\n\nUsage: .cid <link>" });

        // 🔹 Extract Channel invite ID from link (flexible regex)
        const match = q.match(/https?:\/\/(www\.)?whatsapp\.com\/channel\/([\w-]+)/i);
        if (!match) return await socket.sendMessage(m.chat, { text: "⚠️ Invalid channel link!" });

        const inviteId = match[2];

        // 🔹 Fetch Channel Metadata
        let metadata;
        try {
            metadata = await socket.newsletterMetadata("invite", inviteId);
        } catch (err) {
            console.error("❌ Failed to fetch metadata via invite:", err);
            return await socket.sendMessage(m.chat, { text: "⚠️ Could not fetch channel metadata. Maybe the link is private or invalid." });
        }

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(m.chat, { text: "❌ Channel not found or inaccessible." });
        }

        // 🔹 Prepare preview image
        let previewUrl = metadata.preview
            ? metadata.preview.startsWith("http") 
                ? metadata.preview 
                : `https://pps.whatsapp.net${metadata.preview}`
            : "https://telegra.ph/file/4cc2712eaba1c5c1488d3.jpg"; // default image

        // 🔹 Format followers and creation date
        const followers = metadata.subscribers?.toLocaleString() || "Unknown";
        const createdDate = metadata.creation_time 
            ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
            : "Unknown";

        // 🔹 Format message
        const infoMsg = `*SANDES-MD Channel Info 👑*\n\n`
                      +`JID: ${metadata.id} 🪀\n`
                      +`Name: ${metadata.name || "Unknown"} ⭐\n`
                      +`Description: ${metadata.desc?.toString() || "No description"} 🗣️\n`
                      +`Followers: ${followers} 👥\n`
                      +`Since: ${createdDate} 📟\n\n`
                      +`${footer}`;
        // 🔹 Send message with preview image
        await socket.sendMessage(m.chat, {
            image: { url: previewUrl },
            caption: infoMsg,
            ...(contextInfo ? { contextInfo } : {})
        }, { quoted: m });

    } catch (e) {
        console.error("❌ CID Command Error:", e);
        await socket.sendMessage(m.chat, { text: "⚠️ Error fetching channel details." });
    }
    break;
}

case 'follow':
case 'followchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .follow <channel_url>\n' +
                      '• .follow <channel_jid>\n\n' +
                      '*Example:*\n' +
                      '• .follow https://whatsapp.com/channel/0029VbAua1VK5cDL3AtIEP3I\n' +
                      '• .follow 120363420895783008@newsletter'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
        if (input.includes('whatsapp.com/channel/')) {
            // Extract channel code from URL
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            // Convert to potential JID
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            // Assume it's a channel code and add newsletter suffix
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

        // Try to follow the channel
        try {
            await socket.newsletterFollow(channelJid);
            
            // Add to config if owner
            if (isOwner(sender)) {
                const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
                if (!userConfig.NEWSLETTER_JIDS.includes(channelJid)) {
                    userConfig.NEWSLETTER_JIDS.push(channelJid);
                    
                    // Update global config as well for consistency if needed
                    config.NEWSLETTER_JIDS = userConfig.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfig);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            
            await socket.sendMessage(sender, {
                image: { url: logo },
                caption: formatMessage(
                    '✅ CHANNEL FOLLOWED',
                    `Successfully followed channel!\n\n` +
                    `*Channel JID:* ${channelJid}\n` +
                    `*Auto-React:* ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                    (isOwner(sender) ? `*Added to auto-react list:* ✅` : ''),
                    '🔥 QUEEN_MAYA_MD'
                )
            }, { quoted: myquoted });

        } catch (error) {
            console.error('Follow error:', error);
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            
            let errorMessage = 'Failed to follow channel';
            if (error.message.includes('not found')) {
                errorMessage = 'Channel not found or invalid JID';
            } else if (error.message.includes('already')) {
                errorMessage = 'Already following this channel';
            }
            
            await socket.sendMessage(sender, {
                text: `*❌ ${errorMessage}*\n\nTried JID: ${channelJid}`
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Follow command error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Error:* ${error.message || 'Failed to follow channel'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'unfollow':
case 'unfollowchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .unfollow <channel_url>\n' +
                      '• .unfollow <channel_jid>'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
        if (input.includes('whatsapp.com/channel/')) {
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➖', key: msg.key } });

        try {
            await socket.newsletterUnfollow(channelJid);
            
            // Remove from config if owner
            if (isOwner(sender)) {
                const userConfig = (await loadUserConfigFromMongoDB(number)) || config;
                const index = userConfig.NEWSLETTER_JIDS.indexOf(channelJid);
                if (index > -1) {
                    userConfig.NEWSLETTER_JIDS.splice(index, 1);
                    
                    // Update global config as well for consistency
                    config.NEWSLETTER_JIDS = userConfig.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfig);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            
            await socket.sendMessage(sender, {
                text: `✅ *Successfully unfollowed channel*\n\n*JID:* ${channelJid}`
            }, { quoted: myquoted });

        } catch (error) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(sender, {
                text: `*❌ Failed to unfollow channel*\n\nJID: ${channelJid}`
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Unfollow error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Error:* ${error.message || 'Failed to unfollow channel'}`
        }, { quoted: myquoted });
    }
    break;
}




                case 'updatecj': {
                    try {
                        // Get current user's config
                        const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };

                        // Update newsletter JIDs
                        userConfig.NEWSLETTER_JIDS = [...config.NEWSLETTER_JIDS];
                        userConfig.NEWSLETTER_REACT_EMOJIS = [...config.NEWSLETTER_REACT_EMOJIS];
                        userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;

                        // Save updated config
                        await updateUserConfig(number, userConfig);

                        // Apply settings
                        applyConfigSettings(userConfig);

                        // Auto-follow new newsletters for active session
                        if (activeSockets.has(number)) {
                            const userSocket = activeSockets.get(number);
                            for (const newsletterJid of config.NEWSLETTER_JIDS) {
                                try {
                                    await userSocket.newsletterFollow(newsletterJid);
                                    console.log(`✅ ${number} followed newsletter: ${newsletterJid}`);
                                } catch (error) {
                                    console.warn(`⚠️ ${number} failed to follow ${newsletterJid}: ${error.message}`);
                                }
                            }
                        }

                        // Send success message
                        await socket.sendMessage(sender, {
                            image: { url: logo },
                            caption: formatMessage(
                                '📝 NEWSLETTER CONFIG UPDATE',
                                `Successfully updated your newsletter configuration!\n\n` +
                                `Current Newsletter JIDs:\n${config.NEWSLETTER_JIDS.join('\n')}\n\n` +
                                `Auto-React: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `React Emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                                '🔥 QUEEN_MAYA_MD'
                            )
                        }, { quoted: msg });

                    } catch (error) {
                        console.error('❌ Update CJ command failed:', error);
                        await socket.sendMessage(sender, {
                            text: `*❌ Error updating config:*\n${error.message}`
                        }, { quoted: msg });
                    }
                    break;
                }

// WhatsApp JID Command - Get JID of a User - Last Update 2025-August-17
case 'jid': {
    // Get user number from JID
    const userNumber = sender.split('@')[0]; // Extract number only

    await socket.sendMessage(m.chat, { 
        react: { 
            text: "🎭", // Reaction emoji
            key: msg.key 
        } 
    });
    
    await socket.sendMessage(m.chat, {
        text: `${sender}`.trim(),
        contextInfo: contextInfo 
    }, { quoted: myquoted });

    break;
}
                case 'addnewsletter': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: `*❌ This command is only for the owner.*`
                        }, { quoted: msg });
                    }

                    if (!args[0]) {
                        return await socket.sendMessage(sender, {
                            text: '*Please provide a newsletter JID\nExample: .addnewsletter 120363xxxxxxxxxx@newsletter*'
                        }, { quoted: msg });
                    }

                    const newJid = args[0];
                    if (!newJid.endsWith('@newsletter')) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ Invalid JID format. Must end with @newsletter*'
                        }, { quoted: msg });
                    }

                    if (!config.NEWSLETTER_JIDS.includes(newJid)) {
                        const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
                        userConfig.NEWSLETTER_JIDS.push(newJid);
                        userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                        userConfig.NEWSLETTER_REACT_EMOJIS = config.NEWSLETTER_REACT_EMOJIS;
                        userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;
                        config.NEWSLETTER_JIDS.push(newJid);

                        await updateUserConfig(number, userConfig);
                        applyConfigSettings(userConfig);

                        try {
                            await socket.newsletterFollow(newJid);
                            console.log(`✅ Followed new newsletter: ${newJid}`);

                            await socket.sendMessage(sender, {
                                image: { url: logo },
                                caption: formatMessage(
                                    '✅ NEWSLETTER ADDED & FOLLOWED',
                                    `Successfully added and followed newsletter:\n${newJid}\n\n` +
                                    `Total newsletters: ${config.NEWSLETTER_JIDS.length}\n` +
                                    `Auto-react: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                                    `React emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                                    '🔥 QUEEN_MAYA_MD'
                                )
                            }, { quoted: msg });
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter ${newJid}:`, error.message);

                            await socket.sendMessage(sender, {
                                image: { url: logo },
                                caption: formatMessage(
                                    '⚠️ NEWSLETTER ADDED (Follow Failed)',
                                    `Newsletter added but follow failed:\n${newJid}\n\n` +
                                    `Error: ${error.message}\n` +
                                    `Total newsletters: ${config.NEWSLETTER_JIDS.length}`,
                                    '🔥 QUEEN_MAYA_MD'
                                )
                            }, { quoted: msg });
                        }
                    } else {
                        await socket.sendMessage(sender, {
                            text: '*⚠️ This newsletter JID is already in the list.*'
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'listnewsletters': {
                    const userConfig = (await loadUserConfigFromMongoDB(number)) || config;
                    const currentNewsletters = userConfig.NEWSLETTER_JIDS || config.NEWSLETTER_JIDS;

                    const newsletterList = currentNewsletters.map((jid, index) =>
                        `${index + 1}. ${jid}`
                    ).join('\n');

                    await socket.sendMessage(sender, {
                        image: { url: logo },
                        caption: formatMessage(
                            '📋 AUTO-REACT NEWSLETTER LIST',
                            `Auto-react enabled for:\n\n${newsletterList || 'No newsletters added'}\n\n` +
                            `React Emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}\n` +
                            `Status: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Active' : '❌ Inactive'}\n` +
                            `Total: ${currentNewsletters.length} newsletters`,
                            '🔥 QUEEN_MAYA_MD' 
                        )
                    }, { quoted: msg });
                    break;
                }

                case 'removenewsletter': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    if (!args[0]) {
                        const newsletterList = config.NEWSLETTER_JIDS.map((jid, index) =>
                            `${index + 1}. ${jid}`
                        ).join('\n');

                        return await socket.sendMessage(sender, {
                            text: `*Please provide a newsletter JID to remove*\n\nCurrent newsletters:\n${newsletterList || 'No newsletters added'}`
                        }, { quoted: msg });
                    }

                    const removeJid = args[0];
                    const index = config.NEWSLETTER_JIDS.indexOf(removeJid);

                    const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
                    const userIndex = userConfig.NEWSLETTER_JIDS.indexOf(removeJid);

                    if (index > -1 || userIndex > -1) {
                        config.NEWSLETTER_JIDS.splice(index, 1);
                        userConfig.NEWSLETTER_JIDS = [...config.NEWSLETTER_JIDS];
                        await updateUserConfig(number, userConfig);
                        applyConfigSettings(userConfig);

                        try {
                            await socket.newsletterUnfollow(removeJid);
                            console.log(`✅ Unfollowed newsletter: ${removeJid}`);
                        } catch (error) {
                            console.error(`Failed to unfollow newsletter: ${error.message}`);
                        }

                        await socket.sendMessage(sender, {
                            image: { url: logo },
                            caption: formatMessage(
                                '🗑️ NEWSLETTER REMOVED',
                                `Successfully removed newsletter:\n${removeJid}\n\n` +
                                `Remaining newsletters: ${config.NEWSLETTER_JIDS.length}`,
                                '🔥 QUEEN_MAYA_MD' 
                            )
                        }, { quoted: msg });
                    } else {
                        await socket.sendMessage(sender, {
                            text: '*❌ This newsletter JID is not in the list.*'
                        }, { quoted: msg });
                    }
                    break;
                }

                case 'togglenewsletterreact': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    config.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS === 'true' ? 'false' : 'true';

                    const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
                    userConfig.AUTO_REACT_NEWSLETTERS = config.AUTO_REACT_NEWSLETTERS;
                    userConfig.NEWSLETTER_JIDS = [...config.NEWSLETTER_JIDS];
                    userConfig.NEWSLETTER_REACT_EMOJIS = [...config.NEWSLETTER_REACT_EMOJIS];
                    await updateUserConfig(number, userConfig);
                    applyConfigSettings(userConfig);

                    await socket.sendMessage(sender, {
                        image: { url: logo },
                        caption: formatMessage(
                            '🔄 NEWSLETTER AUTO-REACT TOGGLED',
                            `Newsletter auto-react is now: ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
                            `Active for ${config.NEWSLETTER_JIDS.length} newsletters`,
                            '🔥 QUEEN_MAYA_MD'
                        )
                    }, { quoted: msg });
                    break;
                }

                case 'setnewsletteremojis': {
                    if (!isOwner(sender)) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ This command is only for the owner.*'
                        }, { quoted: msg });
                    }

                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: `*Please provide emojis*\nCurrent emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}\n\nExample: .setnewsletteremojis ❤️ 🔥 😍`
                        }, { quoted: msg });
                    }

                    config.NEWSLETTER_REACT_EMOJIS = args;

                    const userConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
                    userConfig.NEWSLETTER_REACT_EMOJIS = config.NEWSLETTER_REACT_EMOJIS;
                    await updateUserConfig(number, userConfig);
                    applyConfigSettings(userConfig);

                    await socket.sendMessage(sender, {
                        image: { url: logo },
                        caption: formatMessage(
                            '✅ NEWSLETTER EMOJIS UPDATED',
                            `New react emojis: ${config.NEWSLETTER_REACT_EMOJIS.join(', ')}`,
                            '🔥 QUEEN_MAYA_MD'
                        )
                    }, { quoted: msg });
                    break;
                } 

/*case 'xhamster': {
    const sandes_xhamster = "*POWERED BY SANDES 〽️D ㋡*";
    const q = args.join(" ");
    if (!q) return reply("*Please provide a search term!*\n\nExample: `.xhamster amateur`");

    try {
        // 🔍 SEARCH API
        const res = await fetchJson(`https://www.movanest.xyz/v2/xhamsearch?query=${encodeURIComponent(q)}`);
        if (!res?.status || !res.results || res.results.length === 0) return reply("❌ No results found.");

        // ⚠️ Filter valid results
        const videos = res.results.filter(v => v.url && v.url !== "Tidak ada URL").slice(0, 50); 
        if (videos.length === 0) return reply("❌ No valid videos found.");

        // 📋 Send search list menu
        let menuText = `*SANDES 〽D XHAMSTER SEARCH RESULTS*\n\n`;
        videos.forEach((v, i) => {
            menuText += `${i + 1} ❯❯◦ ${v.title}\nDuration: ${v.duration || "Unknown"}\nUploader: ${v.uploader || "Unknown"}\n\n`;
        });
        menuText += `*Reply with the number to see details.*\n\n${footer}`;

        const sent = await socket.sendMessage(from, {
            image: { url: videos[0].thumbnail || 'https://saviya-kolla-database.vercel.app/IMAGES/SAVIYA_1774101353088_x6t9oq.png' },
            caption: menuText
        }, { quoted: msg });


        socket.ev.on('messages.upsert', async (msgUpdate) => {
            const m2 = msgUpdate.messages[0];
            if (!m2.message) return;

            const body = m2.message.conversation || m2.message.extendedTextMessage?.text;
            const ctx = m2.message.extendedTextMessage?.contextInfo;

            if (!ctx || ctx.stanzaId !== sent.key.id) return;

            const index = parseInt(body.trim(), 10) - 1;
            if (index < 0 || index >= videos.length) return;

            const selectedVideo = videos[index];

            const detail = await fetchJson(`https://www.movanest.xyz/v2/xhamdetail?url=${encodeURIComponent(selectedVideo.url)}`);
            if (!detail?.status || !detail.results?.videoUrl) return reply("❌ Failed to get video details.");

            const dl = detail.results;

    
            const detailCaption = `
*SANDES 〽D XHAMSTER DOWNLOADER* 

*╭──────────────────────◎◎►*
*┆* 🤤 *Title:* ${dl.title}
*┆* 👀 *Views:* ${dl.viewCount || "Unknown"}
*┆* 👍*Likes:* ${dl.likePercentage || "Unknown"}
*┆* 🏷 *Tags:* ${dl.tags?.join(", ") || "None"}
*╰──────────────────◎◎►*

🔢 *REPLY THE NUMBER BELLOW*

01 ❯❯◦ \`Video\` 🎬
02 ❯❯◦ \`Document\` 📂

${footer}
`;

            const detailSent = await socket.sendMessage(from, {
                image: { url: selectedVideo.thumbnail || 'https://saviya-kolla-database.vercel.app/IMAGES/SAVIYA_1774101353088_x6t9oq.png' },
                caption: detailCaption
            }, { quoted: m2 });

            socket.ev.on('messages.upsert', async (msgDlUpdate) => {
                const m3 = msgDlUpdate.messages[0];
                if (!m3.message) return;

                const bodyDl = m3.message.conversation || m3.message.extendedTextMessage?.text;
                const ctxDl = m3.message.extendedTextMessage?.contextInfo;

                if (!ctxDl || ctxDl.stanzaId !== detailSent.key.id) return;

                const choice = bodyDl.trim();

                if (choice === '1' || choice === '01') {
                    await socket.sendMessage(from, { react: { text: "🤤", key: m3.key } });
                    await socket.sendMessage(from, {
                        video: { url: dl.videoUrl },
                        caption: `*✅ ${dl.title}*\n\n${footer}`
                    }, { quoted: m3 });

                } else if (choice === '2' || choice === '02') {
                    await socket.sendMessage(from, { react: { text: "📂", key: m3.key } });
                    await socket.sendMessage(from, {
                        document: { url: dl.videoUrl },
                        mimetype: "video/mp4",
                        fileName: `${dl.title}.mp4`,
                        caption: `*✅ ${dl.title}*\n\n${footer}`
                    }, { quoted: m3 });
                }
            });
        });

    } catch (err) {
        console.error("xhamster error:", err);
        reply("❌ Error fetching XHamster results.");
    }
    break;
}*/
                    
/*case 'xnxx':
case 'xv':
const sandes_xnxx = "*POWERED BY SANDES 〽️D ㋡*";
const axios = require('axios');
{ 
   const q = args.join(" ");
        if (!q) return reply("*please Give Me a name !*");

        try { 
            const xnxxSearchapi = await fetchJson(`https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${q}`);

            if (!xnxxSearchapi?.result?.xvideos || xnxxSearchapi.result.xvideos.length === 0) {
                return await reply("No result found :(");
            }

    let list = "SANDES-MD XNXX DOWNLOADER*\n\n";
            
    xnxxSearchapi.result.xvideos.forEach((xnxx, i) => {
        list += `*${i + 1}* ❯❯◦ ${xnxx.title || "No title info"}\n`;
    });

    const listMsg = await socket.sendMessage(from, { 
        text: list + "\n🔢 *REPLY THE NUMBER BELLOW*\n\n" + sandes_xnxx 
    }, { quoted: msg });

    const listMsgId = listMsg.key.id;
          
    // 🔥 FIX HERE
    const handler1 = async (update) => {
        const msg = update?.messages?.[0];
        if (!msg?.message) return; 

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        const isReplyToList = msg?.message?.extendedTextMessage?.contextInfo?.stanzaId === listMsgId;
        if (!isReplyToList) return;
              
        const index = parseInt(text.trim()) - 1;

        if (isNaN(index) || index < 0 || index >= xnxxSearchapi.result.xvideos.length) {
            return reply("❌ *Invalid Number *");
        }

        await socket.sendMessage(from, { react: { text: "🤤", key: msg.key } });

        const chosen = xnxxSearchapi.result.xvideos[index];
              
        const xnxxDownloadapi = await fetchJson(`https://tharuzz-ofc-api-v2.vercel.app/api/download/xvdl?url=${chosen.link}`);
              
        const infoMap = xnxxDownloadapi?.result;
        const downloadUrllow = xnxxDownloadapi?.result?.dl_Links?.lowquality;
        const downloadUrlhigh = xnxxDownloadapi?.result?.dl_Links?.highquality;

        const askType = await socket.sendMessage( 
            from,{
                image: {url: infoMap.thumbnail },
                caption: `🔞 *SANDES MD XNXX INFO*\n\n` +
                `*╭──────────────────────◎◎►*\n`+
                `*┆* ☘️ \`Title:\` ${infoMap.title}\n` + 
                `*┆* ⏰ \`Duration:\` ${infoMap.duration}\n` +
                `*┆* 👍  \`Likes:\` Undefined\n`+
                `*╰──────────────────◎◎►*\n\n`+
                `🔢* REPLY THE NUMBER BELLOW* \n\n` +
                `*01 ❯❯◦ 🔋ʜᴅ Qᴜᴀʟɪᴛʏ*\n` +
                `*02 ❯❯◦ 🪫ꜱᴅ Qᴜᴀʟɪᴛʏ*\n\n` + sandes_xnxx
            }, { quoted:msg}
        );
            
        const typeMsgId = askType.key.id; 

        const handler2 = async (tUpdate) => {
            const tMsg = tUpdate?.messages?.[0];
            if (!tMsg?.message) return; 

            const tText = tMsg.message?.conversation || tMsg.message?.extendedTextMessage?.text;
            const isReplyToType = tMsg?.message?.extendedTextMessage?.contextInfo?.stanzaId === typeMsgId;

            if (!isReplyToType) return;

               await socket.sendMessage(from, {
                    react: {
                        text: tText.trim() === "1" || tText.trim() === "2" ? "🎥" : "❓",
                        key: tMsg.key,
                    },
                });
            
            if (tText.trim() === "1") {
                await socket.sendMessage(
                    from,
                    {
                        video: {url: downloadUrlhigh },
                        caption: `${infoMap.title}\n\n*POWERED BY SANDES 〽️D ㋡*`
                    }, {quoted: msg}
                ); 
            } else if (tText.trim() === "2") {
                await socket.sendMessage(
                    from,
                    {
                        video: {url: downloadUrllow },
                        caption: `${infoMap.title}\n\n*POWERED BY SANDES 〽️D ㋡*`
                    }, { quoted : msg}
                );
            } else {
                await socket.sendMessage(from, { text: "*Invalid Selection !*" }, { quoted: msg});
            }

            socket.ev.off("messages.upsert", handler2);
        };

            socket.ev.on("messages.upsert", handler2);
        
            socket.ev.off("messages.upsert", handler1);
    };
    
    socket.ev.on("messages.upsert", handler1);

} catch (e) {
    console.log(e);
    await reply("*❌ Error: " + e + "*")
}
}

break;
*/

case 'play':
case 'ytmp3':
case 'song': {
    const useButton = userConfig.BUTTON === 'true';

    if (useButton) {
        const yts = require('yt-search');
        const axios = require('axios');
        const fs = require('fs');
        const { exec } = require('child_process');

        const ffmpegPath = 'ffmpeg';

        function extractYouTubeId(url) {
            const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
            const match = url.match(regex);
            return match ? match[1] : null;
        }

        function convertYouTubeLink(input) {
            const videoId = extractYouTubeId(input);
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
            return input;
        }

        const q = msg.message?.conversation || 
        msg.message?.extendedTextMessage?.text || 
        msg.message?.imageMessage?.caption || 
        msg.message?.videoMessage?.caption || '';

        if (!q || q.trim() === '') {
            return await socket.sendMessage(sender, { text: '*`Need YT_URL or Title`*' });
        }

        const fixedQuery = convertYouTubeLink(q.trim());

        try {
            const search = await yts(fixedQuery);
            const data = search.videos[0];
            if (!data) {
                return await socket.sendMessage(sender, { text: '*`No results found`*' });
            }

            const ytUrl = data.url;
            const apiUrl = `https://ominisave.com/api/ytmp3_v2?url=${encodeURIComponent(ytUrl)}`;
            const res = await axios.get(apiUrl);

            if (!res.data || res.data.status !== true) {
                return await socket.sendMessage(sender, { text: '*`Download API Error`*' });
            }

            const downloadLink = res.data.result.downloadLink;
            
            await socket.sendPresenceUpdate('composing', m.chat);
             await delay(900);
            
            let captionText = `
🎧 *SANDES-MD AUDIO DOWNLOADER* 🎧
\`❖===========================❖\`

*╭──────────────────────◎◎►*
*┆*
*┆* 🎵 *Title:* \`${data.title}\`
*┆*⏱️ *Duration:* ${data.timestamp}
*┆*👀 *Views:* ${data.views}
*┆*📅 *Release Date:* ${data.ago}
*┆*
*╰──────────────────◎◎►*

\`❖===========================❖\`

🗿 *REPLY THE NUMBER BELLOW*

01 ❯❯◦ \`Audio\` 🎧
02 ❯❯◦ \`Document\` 📂
03 ❯❯◦ \`Voice Note\` 🎙

${footer}`;

            const cleanCaption = captionText.replace(/[\u200B-\u200D\uFEFF]/g, '');

            await socket.sendMessage(m.chat, {
                react: { text: '🎧', key: msg.key }
            });

            const sentMsg = await socket.sendMessage(m.chat, {
                image: { url: data.thumbnail },
                caption: cleanCaption,
            }, { quoted: msg });

            socket.ev.on('messages.upsert', async (update) => {
                try {
                    const m2 = update.messages[0];
                    if (!m2.message?.extendedTextMessage) return;

                    const text = m2.message.extendedTextMessage.text.trim();
                    const ctx = m2.message.extendedTextMessage.contextInfo;

                    if (!ctx || ctx.stanzaId !== sentMsg.key.id) return;

                    if (['1', '2', '3'].includes(text)) {
                        await socket.sendMessage(m.chat, {
                            react: { text: '⬇️', key: m2.key }
                        });
                    }
                    if (text === '1') {
                        await socket.sendMessage(m.chat, {
                            audio: { url: downloadLink },
                            mimetype: "audio/mpeg"
                        }, { quoted: m2 });
                    }
                    else if (text === '2') {
                        await socket.sendMessage(m.chat, {
                            document: { url: downloadLink },
                            mimetype: "audio/mpeg",
                            fileName: `${data.title}.mp3`
                        }, { quoted: m2 });
                    }
                    else if (text === '3') {
                        const inputPath = `./temp_${Date.now()}.mp3`;
                        const outputPath = `./temp_${Date.now()}.opus`;

                        const response = await axios({
                            method: 'get',
                            url: downloadLink,
                            responseType: 'stream'
                        });

                        const writer = fs.createWriteStream(inputPath);
                        response.data.pipe(writer);

                        writer.on('finish', () => {
                            exec(`${ffmpegPath} -i ${inputPath} -c:a libopus -b:a 128k -vbr on -f ogg ${outputPath}`, async (error) => {
                                if (error) {
                                    console.error(error);
                                    return socket.sendMessage(m.chat, { text: '❌ *Voice convert failed*' });
                                }

                                const buffer = fs.readFileSync(outputPath);

                                await socket.sendMessage(m.chat, {
                                    audio: buffer,
                                    mimetype: 'audio/ogg; codecs=opus',
                                    ptt: true
                                }, { quoted: m2 });

                                await socket.sendMessage(m.chat, {
                                    react: { text: '✔️', key: m2.key }
                                });

                                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                            });
                        });

                        return;
                    }

                    await socket.sendMessage(m.chat, {
                        react: { text: '✔️', key: m2.key }
                    });

                } catch (e) {
                    console.error(e);
                }
            });

        } catch (err) {
            console.error(err);
            await socket.sendMessage(sender, { text: "*`Error occurred while searching`*" });
        }

    } else {
        const yts = require('yt-search');
        const ddownr = require('denethdev-ytmp3');

        function extractYouTubeId(url) {
            const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
            const match = url.match(regex);
            return match ? match[1] : null;
        }

        function convertYouTubeLink(input) {
            const videoId = extractYouTubeId(input);
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
            return input;
        }

        const q = msg.message?.conversation || 
        msg.message?.extendedTextMessage?.text || 
        msg.message?.imageMessage?.caption || 
        msg.message?.videoMessage?.caption || '';

        if (!q || q.trim() === '') {
            return await socket.sendMessage(sender, { text: '*`Need YT_URL or Title`*' });
        }

        const fixedQuery = convertYouTubeLink(q.trim());

        try {
            const search = await yts(fixedQuery);
            const data = search.videos[0];
            if (!data) {
                return await socket.sendMessage(sender, { text: '*`No results found`*' });
            }

            const url = data.url;
            const desc = ` 🎧 *AUDIO DOWNLOADER* 🎧

◆▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰◆ 
╭──────────────────◉◉►
┃🎵 *Title:* \`${data.title}\`
┃⏱️ *Duration:* ${data.timestamp}
┃👀 *Views:* ${data.views}
┃📅 *Release Date:* ${data.ago}
╰──────────────────◉◉►
◆▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰◆

${footer}
`;

            await socket.sendMessage(sender, {
                image: { url: data.thumbnail },
                caption: desc,
                contextInfo: contextInfo,
            }, { quoted: myquoted });

            await socket.sendMessage(sender, { react: { text: '🎧', key: msg.key } });

            const apiUrl = `${apibase}/download/ytmp3?apikey=${apikey}&url=${encodeURIComponent(url)}`;
            const result = await axios.get(apiUrl, { timeout: 15000 }).then(r => r.data).catch(e => null);
            const downloadLink = result.result.downloadUrl;

            await socket.sendMessage(sender, { react: { text: '🎧', key: msg.key } });
            await socket.sendMessage(sender, {
                audio: { url: downloadLink },
                mimetype: "audio/mpeg",
                ptt: false 
            }, { quoted: msg });

        } catch (err) {
            console.error(err);
            await socket.sendMessage(sender, { text: "*`Error occurred while downloading`*" });
        }
    }

    break;
}
case 'download_audio': {
    const url = args[0];
    if (!url) return socket.sendMessage(m.chat, { text: "*No URL provided*" });

    try {
        await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });

        const apiUrl = `https://ominisave.vercel.app/api/ytmp3_v2?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl).then(r => r.data).catch(e => null);

        if (!res || !res.status) {
            return socket.sendMessage(m.chat, { text: "*Download failed*" });
        }
        const dl = res.result?.downloadLink;
        const title = res.result?.title || 'audio';

        if (!dl) {
            console.log("API RESPONSE:", res);
            return socket.sendMessage(m.chat, { text: "*Download link not found*" });
        }

        await socket.sendMessage(m.chat, {
            audio: { url: dl },
            mimetype: "audio/mpeg"
        }, { quoted: msg });

        await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(m.chat, { text: "*Error downloading audio*" });
    }
    break; 
}  

case 'download_doc': {
    const url = args[0];
    if (!url) return socket.sendMessage(m.chat, { text: "*No URL provided*" });

    try {
        await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });

        const apiUrl = `https://ominisave.vercel.app/api/ytmp3_v2?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl).then(r => r.data).catch(e => null);

        if (!res || !res.status) {
            return socket.sendMessage(m.chat, { text: "*Download failed*" });
        }
        const dl = res.result?.downloadLink;
        const title = res.result?.title || 'audio';

        if (!dl) {
            console.log("API RESPONSE:", res);
            return socket.sendMessage(m.chat, { text: "*Download link not found*" });
        }

       await socket.sendMessage(m.chat, {
            document: { url: dl },
            mimetype: "audio/mpeg",
            fileName: `${res.title}.mp3`
        }, { quoted: msg });

        await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(m.chat, { text: "*Error downloading audio*" });
    }
    break; 
}    

case 'download_voice': {
    const url = args[0];
    if (!url) return socket.sendMessage(m.chat, { text: "*No URL provided*" });

    try {
        await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });

        const apiUrl = `https://ominisave.vercel.app/api/ytmp3_v2?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl).then(r => r.data).catch(e => null);

        if (!res || !res.status) {
            return socket.sendMessage(m.chat, { text: "*Download failed*" });
        }
        const dl = res.result?.downloadLink;
        const title = res.result?.title || 'audio';

        if (!dl) {
            console.log("API RESPONSE:", res);
            return socket.sendMessage(m.chat, { text: "*Download link not found*" });
        }

        await socket.sendMessage(m.chat, {
            audio: { url: dl },
            mimetype: "audio/mpeg",
            ptt:true 
        }, { quoted: msg });

        await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(m.chat, { text: "*Error downloading audio*" });
    }
    break; 
}   

case 'ytmp4':
case 'ytvideo':
case 'video': {
    const yts = require('yt-search');
    
    await socket.sendMessage(from, { react: { text: '🎥', key: msg.key } });

    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(from, { text: '*Need YouTube URL or Title*' });
    }

    try {
        const search = await yts(q);
        const data = search.videos[0];
        if (!data) return await socket.sendMessage(from, { text: '*No results found*' });

        // ⚠️ Dummy videoList (original structure eka maintain karanna)
        let videoList = [
            { resLabel: "360p", resNode: 360 },
            { resLabel: "480p", resNode: 480 },
            { resLabel: "720p", resNode: 720 },
            { resLabel: "1080p", resNode: 1080 }
        ];

        let menuText = `🎥 *SANDES MD VIDEO DOWNLOADER* 🎥\n\n` +
            `\`❖===========================❖\`\n\n` +
            `*╭─────────────────────────◎◎►*\n`+ 
            `*┃* 🎥 Title:* ${data.title}\n` + 
            `*┃* ⏱ *Duration:* ${data.timestamp}\n` + 
            `*┃* 📊 *Views:* ${data.views}\n` +
            `*┃* 📅 *Release Date:* ${data.ago}\n`+
            `*╰──────────────────◎◎►*\n\n` +
            `\`❖===========================❖\`\n\n`+
            `🔢 *REPLY THE NUMBER BELLOW*\n\n` +
            `*VIDEO TYPE 📽️*\n\n`;

        videoList.forEach((vid, i) => {
            menuText += `1.${i + 1} ❯❯◦ ${vid.resLabel}\n`;
        });

        menuText += `\n*DOCUMENT TYPE 📁*\n\n`;

        videoList.forEach((vid, i) => {
            menuText += `2.${i + 1} ❯❯◦ ${vid.resLabel} Document\n`;
        });

        menuText += `\n${footer}`;

        const sentMsg = await socket.sendMessage(from, {
            image: { url: data.thumbnail },
            caption: menuText
        }, { quoted: msg });

        const downloadHandler = async (mUpdate) => {
            const rMsg = mUpdate.messages[0];
            if (!rMsg.message?.extendedTextMessage) return;
            
            const isReplyToBot = rMsg.message.extendedTextMessage.contextInfo?.stanzaId === sentMsg.key.id;
            if (!isReplyToBot) return;

            const selection = rMsg.message.extendedTextMessage.text.trim();
            const [type, indexStr] = selection.split('.');
            const index = parseInt(indexStr) - 1;

            if (videoList[index]) {
                const selectedVid = videoList[index];
                await socket.sendMessage(from, { react: { text: '⬇️', key: rMsg.key } });
                const quality = selectedVid.resLabel || "360p";

                const apiUrl = `https://www.ominisave.com/api/ytmp4_v2?url=${encodeURIComponent(data.url)}&quality=${quality}`;
                const response = await fetch(apiUrl);
                const json = await response.json();

                if (!json.status || !json.result.downloadUrl) {
                    return await socket.sendMessage(from, { text: "❌ API Error. Try again later." });
                }

                const dl = json.result.downloadUrl;

                if (type === '1') {
                    await socket.sendMessage(from, {
                        video: { url: dl },
                        mimetype: "video/mp4",
                        caption: `*${data.title}*\n${footer}`
                    }, { quoted: rMsg });
                } else if (type === '2') {
                    await socket.sendMessage(from, {
                        document: { url: dl },
                        mimetype: "video/mp4",
                        fileName: `${data.title} (${quality}).mp4`,
                        caption: `*${data.title}*\n${footer}`
                    }, { quoted: rMsg });
                }

                await socket.sendMessage(from, { react: { text: '✔️', key: rMsg.key } });
                socket.ev.off('messages.upsert', downloadHandler);
            }
        };

        socket.ev.on('messages.upsert', downloadHandler);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(from, { text: "*❌ Error occurred!*" });
    }
    break;
}
            

case 'set' :
case 'settings' :
case 'setting' : {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const useButton = userConfig.BUTTON === 'true';
    let currentConfig = (await loadUserConfigFromMongoDB(sanitized)) || { ...config };

    // If only viewing settings (no arguments)
    if (args.length > 0) {
        if (senderNum !== sanitized && senderNum !== ownerNum) {
            return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: qMessage });
        }
        const settingsText = `
*╭─「 CURRENT SETTINGS 」─●●➤*  
*│ 👁️  AUTO STATUS SEEN:* ${currentConfig.AUTO_VIEW_STATUS}
*│ ❤️  AUTO STATUS REACT:* ${currentConfig.AUTO_LIKE_STATUS}
*│ 🎥  AUTO RECORDING:* ${currentConfig.AUTO_RECORDING}
*│ 🔘  SHOW BUTTONS:* ${currentConfig.BUTTONS === 'false' ? 'false' : 'true'}
*│ 👍  AUTO MSG REACT:* ${currentConfig.AUTO_REACT_MESSAGES}
*│ 🔣  PREFIX:* ${currentConfig.PREFIX}
*│ 🎭  STATUS EMOJIS:* ${currentConfig.AUTO_LIKE_EMOJI.join(', ')}
*│ 🌐  WORK TYPE:* ${currentConfig.WORK_TYPE || 'public'}
*╰──────────────●●➤*

*Use ${ prefix || '.'}Setting To Change Settings Via Menu*
    `;
        return await socket.sendMessage(sender, {
            image: { url: logo },
            caption: settingsText
        }, { quoted: myquoted });
    }

    await socket.sendMessage(m.chat, { react: { text: '⚙️', key: msg.key } });
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      return await socket.sendMessage(m.chat, { text: '❌ Permission denied. Only the session owner or bot owner can change settings.' }, { quoted: myquoted });
    }

    const settingsCaption = `*◆▰▰▰▰▰▰▰▰▰▰◆*\n*SANDES-MD SETTING PANEL*\n*◆▰▰▰▰▰▰▰▰▰▰◆*\n\n` +
        `┏━━━━━━━━━━◆◉◉➤\n` +
        `┃◉ *Auto Status Seen:* ${currentConfig.AUTO_VIEW_STATUS}\n` +
        `┃◉ *Auto Status React:* ${currentConfig.AUTO_LIKE_STATUS}\n` +
        `┃◉ *Auto Recording:* ${currentConfig.AUTO_RECORDING}\n` +
        `┃◉ *Auto Msg React:* ${currentConfig.AUTO_REACT_MESSAGES}\n` +
        `┃◉ *Show Buttons:* ${currentConfig.BUTTONS === 'false' ? 'false' : 'true'}\n` +
        `┃◉ *Prefix:* ${currentConfig.PREFIX}\n` +
        `┃◉ *Work Type:* ${currentConfig.WORK_TYPE || 'public'}\n` +
        `┗━━━━━━━━━━◆◉◉➤`;

    if (useButton) {
        const settingOptions = {
            name: 'single_select',
            paramsJson: JSON.stringify({
                title: `SETTINGS`,
                sections: [
                    {
                        title: '➤ AUTO RECORDING',
                        rows: [
                            { title: 'AUTO RECORDING ON', description: '', id: `${prefix}autorecording on` },
                            { title: 'AUTO RECORDING OFF', description: '', id: `${prefix}autorecording off` },
                        ],
                    },
                    {
                        title: '➤ AUTO STATUS SEEN',
                        rows: [
                            { title: 'AUTO STATUS SEEN ON', description: '', id: `${prefix}autoview on` },
                            { title: 'AUTO STATUS SEEN OFF', description: '', id: `${prefix}autoview off` },
                        ],
                    },
                    {
                        title: '➤ AUTO STATUS REACT',
                        rows: [
                            { title: 'AUTO STATUS REACT ON', description: '', id: `${prefix}autolike on` },
                            { title: 'AUTO STATUS REACT OFF', description: '', id: `${prefix}autolike off` },
                        ],
                    },
                    {
                        title: '➤ AUTO MESSAGE REACT',
                        rows: [
                            { title: 'AUTO MESSAGE REACT ON', description: '', id: `${prefix}autoreact on` },
                            { title: 'AUTO MESSAGE REACT OFF', description: '', id: `${prefix}autoreact off` },
                        ],
                    },
                    {
                        title: '➤ WORK TYPE',
                        rows: [
                            { title: 'PRIVATE', description: 'Bot works only in private chats', id: `${prefix}worktype private` },
                            { title: 'PUBLIC', description: 'Bot works everywhere (default)', id: `${prefix}worktype public` },
                            { title: 'GROUP ONLY', description: 'Bot works only in groups', id: `${prefix}worktype group_only` },
                            { title: 'INBOX ONLY', description: 'Bot works only in inbox (PM)', id: `${prefix}worktype inbox_only` },
                        ],
                    },
                    {
                        title: '➤ STATUS EMOJIS',
                        rows: [
                            { title: 'SET STATUS EMOJIS', description: '', id: `${prefix}setemojis` },
                        ]
                    },
                ],
            }),
        };

        await socket.sendMessage(sender, {
            headerType: 1,
            viewOnce: true,
            image: { url: logo },
            caption: settingsCaption,
            buttons: [
                {
                    buttonId: 'settings_action',
                    buttonText: { displayText: '⚙️ CONFIGURE SETTINGS' },
                    type: 4,
                    nativeFlowInfo: settingOptions,
                },
            ],
        }, { quoted: msg });
    } else {
        // Non-button mode: Text-based menu
        const textMenu = `
${settingsCaption}

🔢 *Reply with a number below:*

1 │ Auto Recording
2 │ Auto View Status
3 │ Auto Status React
4 │ Buttons
5 │ Auto Message React
6 │ Work Type
7 │ Status Emojis
`;

        const sentMsg = await socket.sendMessage(sender, {
            image: { url: logo },
            caption: textMenu
        }, { quoted: msg });

        const handler = async ({ messages }) => {
            const replyMsg = messages[0];
            if (!replyMsg.message?.extendedTextMessage || replyMsg.key.fromMe) return;

            const context = replyMsg.message.extendedTextMessage.contextInfo;
            if (context?.stanzaId !== sentMsg.key.id) return;

            const selection = parseInt(replyMsg.message.extendedTextMessage.text.trim());
            let responseText = '';

            // Re-fetch config to ensure it's the latest
            let userConf = (await loadUserConfigFromMongoDB(sanitized)) || { ...config };

            switch (selection) {
                case 1:
                    userConf.AUTO_RECORDING = userConf.AUTO_RECORDING === 'true' ? 'false' : 'true';
                    responseText = `✅ *Auto Recording:* ${userConf.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}`;
                    break;
                case 2:
                    userConf.AUTO_VIEW_STATUS = userConf.AUTO_VIEW_STATUS === 'true' ? 'false' : 'true';
                    responseText = `✅ *Auto View Status:* ${userConf.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`;
                    break;
                case 3:
                    userConf.AUTO_LIKE_STATUS = userConf.AUTO_LIKE_STATUS === 'true' ? 'false' : 'true';
                    responseText = `✅ *Auto Like Status:* ${userConf.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`;
                    break;
                case 4:
                    userConf.BUTTON = userConf.BUTTON === 'true' ? 'false' : 'true';
                    responseText = `✅ *Button Mode:* ${userConf.BUTTON === 'true' ? '✅ ON' : '❌ OFF'}`;
                    break;
                case 5:
                    userConf.AUTO_REACT_MESSAGES = userConf.AUTO_REACT_MESSAGES === 'true' ? 'false' : 'true';
                    responseText = `✅ *Auto Message React:* ${userConf.AUTO_REACT_MESSAGES === 'true' ? '✅ ON' : '❌ OFF'}`;
                    break;
                case 6: {
                    // Work Type selection (sub‑menu)
                    const workMsg = await socket.sendMessage(sender, {
                        text: `*Select Work Type:*\n\n1 │ Private\n2 │ Public\n3 │ Group Only\n4 │ Inbox Only\n\nReply with number.`
                    }, { quoted: replyMsg });

                    const workHandler = async (mUpdate) => {
                        const wMsg = mUpdate.messages[0];
                        if (!wMsg.message?.extendedTextMessage) return;
                        if (wMsg.message.extendedTextMessage.contextInfo?.stanzaId !== workMsg.key.id) return;

                        const workChoice = parseInt(wMsg.message.extendedTextMessage.text.trim());
                        let workType = '';
                        switch (workChoice) {
                            case 1: workType = 'private'; break;
                            case 2: workType = 'public'; break;
                            case 3: workType = 'group_only'; break;
                            case 4: workType = 'inbox_only'; break;
                            default:
                                await socket.sendMessage(sender, { text: '❌ Invalid choice.' }, { quoted: wMsg });
                                socket.ev.off('messages.upsert', workHandler);
                                return;
                        }
                        userConf.WORK_TYPE = workType;
                        await updateUserConfig(sanitized, userConf);
                        socket.userConfig.WORK_TYPE = workType;
                        await socket.sendMessage(sender, { text: `✅ Work Type set to *${workType}*` }, { quoted: wMsg });
                        socket.ev.off('messages.upsert', workHandler);
                    };
                    socket.ev.on('messages.upsert', workHandler);
                    return; // don't close main handler yet, but we'll keep it open until work type is chosen
                }
                case 7:
                    return socket.sendMessage(sender, { text: `Please use the command: \`${prefix}setemojis\`` }, { quoted: replyMsg });
                default:
                    await socket.sendMessage(sender, { text: '❌ Invalid selection. Please reply with a valid number.' }, { quoted: replyMsg });
                    return;
            }

            // Save the updated config and update the cache
            await updateUserConfig(sanitized, userConf);
            socket.userConfig = userConf;

            await socket.sendMessage(sender, { text: responseText }, { quoted: replyMsg });
            socket.ev.off('messages.upsert', handler); // Clean up listener
        };

        socket.ev.on('messages.uptersert', handler); // Note: typo in original? It's 'messages.upsert'
        // But we need to fix the typo: should be 'messages.upsert'
        // In the original code they used 'messages.upsert' correctly. We'll use that.
    }
  } catch (e) {
    console.error('Setting command error:', e);
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: myquoted });
  }
  break;
}

case 'sandes-buttons': {
    try {
        // Load user config or use the cached one, creating a default if non-existent
        const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config, number };

        // Toggle BUTTON value
        currentUserConfig.BUTTON = currentUserConfig.BUTTON === 'true' ? 'false' : 'true';

        // Save back to MongoDB
        await updateUserConfig(number, currentUserConfig);
        // Update the cached config on the socket for immediate effect
        socket.userConfig.BUTTON = currentUserConfig.BUTTON;

        // Respond
        await socket.sendMessage(m.chat, {
            image: { url: logo },
            caption: formatMessage(
                ' BUTTON MODE',
                `Alive button mode is now: ${userConfig.BUTTON === 'true' ? '✅ ENABLED (Buttons)' : '❌ DISABLED (Normal Message)'}`,
                footer
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error("❌ ToggleButton command error:", error);
        await socket.sendMessage(sender, { text: "❌ Failed to toggle button setting" });
    }
    break;
}


case 'sandes-prefix-set': {
    
    const currentPrefix = userConfig.PREFIX || config.PREFIX;
    if (!args[0]) {
        return await socket.sendMessage(m.chat, {
            text: `*Current prefix:* ${currentPrefix}\n*Usage:* ${currentPrefix}setprefix [new prefix]`
        }, { quoted: msg });
    }

    const newPrefix = args[0];
    const oldPrefix = userConfig.PREFIX || config.PREFIX;

    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
    currentUserConfig.PREFIX = newPrefix;
    await updateUserConfig(number, currentUserConfig);
    socket.userConfig.PREFIX = newPrefix;

    await socket.sendMessage(m.chat, {
        text: `*Prefix changed*\n🔥 *Old:* ${oldPrefix}\n🔥 *New:* ${newPrefix}`
    }, { quoted: msg });
    break;
}

case 'autoview': {
    

    const currentStatus = userConfig.AUTO_VIEW_STATUS || config.AUTO_VIEW_STATUS;
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autoview [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
    currentUserConfig.AUTO_VIEW_STATUS = newStatus;
    await updateUserConfig(number, currentUserConfig);
    socket.userConfig.AUTO_VIEW_STATUS = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto View Status:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autolike': {
    

    const currentStatus = userConfig.AUTO_LIKE_STATUS || config.AUTO_LIKE_STATUS;
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autolike [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
    currentUserConfig.AUTO_LIKE_STATUS = newStatus;
    await updateUserConfig(number, currentUserConfig);
    socket.userConfig.AUTO_LIKE_STATUS = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Status:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autorecording': {
    

    const currentStatus = userConfig.AUTO_RECORDING || config.AUTO_RECORDING;
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${currentStatus}\n*Usage:* ${userConfig.PREFIX || config.PREFIX}autorecording [on/off]`
        }, { quoted: msg });
    }

    const newStatus = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
    currentUserConfig.AUTO_RECORDING = newStatus;
    await updateUserConfig(number, currentUserConfig);
    socket.userConfig.AUTO_RECORDING = newStatus;

    await socket.sendMessage(sender, {
        text: `✅ *Auto Recording:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
} 

case 'autoreact': {
    const subCommand = args[0]?.toLowerCase();
    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };

    if (!subCommand) {
        const currentStatus = currentUserConfig.AUTO_REACT_MESSAGES || config.AUTO_REACT_MESSAGES;
        const currentEmojis = (currentUserConfig.AUTO_REACT_MESSAGES_EMOJIS || config.AUTO_REACT_MESSAGES_EMOJIS).join(' ');
        return await socket.sendMessage(sender, {
            text: `*⚙️ Manage Auto Message React*\n\n` +
                  `*Status:* ${currentStatus === 'true' ? '✅ ON' : '❌ OFF'}\n` +
                  `*Emojis:* ${currentEmojis}\n\n` +
                  `*Usage:*\n` +
                  `• To toggle: \`${prefix}autoreact on/off\`\n` +
                  `• To manage emojis: \`${prefix}autoreact emojis <action>\`\n\n` +
                  `*Emoji Actions:*\n` +
                  `• \`set ❤️ 😂\`: Replace all emojis\n` +
                  `• \`add 👍\`: Add an emoji\n` +
                  `• \`remove 😂\`: Remove an emoji`
        }, { quoted: msg });
    }

    if (subCommand === 'on' || subCommand === 'off') {
        const newStatus = subCommand === 'on' ? 'true' : 'false';
        currentUserConfig.AUTO_REACT_MESSAGES = newStatus;
        await updateUserConfig(number, currentUserConfig);
        socket.userConfig.AUTO_REACT_MESSAGES = newStatus;
        await socket.sendMessage(sender, { text: `✅ *Auto Message React:* ${newStatus === 'true' ? '✅ ON' : '❌ OFF'}` }, { quoted: msg });

    } else if (subCommand === 'emojis') {
        const emojiAction = args[1]?.toLowerCase();
        const emojis = args.slice(2);
        const currentEmojis = currentUserConfig.AUTO_REACT_MESSAGES_EMOJIS || config.AUTO_REACT_MESSAGES_EMOJIS;
        let newEmojisList;
        let responseMessage = '';

        switch (emojiAction) {
            case 'add':
                if (emojis.length === 0) return await socket.sendMessage(sender, { text: `*Please provide emojis to add.*\nExample: \`${prefix}autoreact emojis add 👍 💖\`` }, { quoted: msg });
                newEmojisList = [...new Set([...currentEmojis, ...emojis])];
                responseMessage = `✅ *Message React Emojis Added!*`;
                break;
            case 'remove':
                if (emojis.length === 0) return await socket.sendMessage(sender, { text: `*Please provide emojis to remove.*\nExample: \`${prefix}autoreact emojis remove 👍\`` }, { quoted: msg });
                newEmojisList = currentEmojis.filter(e => !emojis.includes(e));
                responseMessage = `✅ *Message React Emojis Removed!*`;
                break;
            case 'set':
                if (emojis.length === 0) return await socket.sendMessage(sender, { text: `*Please provide a new set of emojis.*\nExample: \`${prefix}autoreact emojis set ❤️‍🔥 💯\`` }, { quoted: msg });
                newEmojisList = emojis;
                responseMessage = `✅ *Message React Emoji List Updated!*`;
                break;
            default:
                return await socket.sendMessage(sender, { text: `*❌ Invalid emoji action.*\nUse 'add', 'remove', or 'set'.` }, { quoted: msg });
        }

        currentUserConfig.AUTO_REACT_MESSAGES_EMOJIS = newEmojisList;
        await updateUserConfig(number, currentUserConfig);
        socket.userConfig.AUTO_REACT_MESSAGES_EMOJIS = newEmojisList;

        await socket.sendMessage(sender, { text: `${responseMessage}\n*New Emojis:* ${newEmojisList.join(' ')}` }, { quoted: msg });
    } else {
        await socket.sendMessage(sender, { text: `*❌ Invalid command.*\nUse \`${prefix}autoreact on/off\` or \`${prefix}autoreact emojis <action>\`.` }, { quoted: msg });
    }
    break;
}

case 'setemojis': {
    const currentUserConfig = (await loadUserConfigFromMongoDB(number)) || { ...config };
    const currentEmojis = currentUserConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;

    const subCommand = args[0]?.toLowerCase();
    const emojis = args.slice(1);

    if (!subCommand) {
        // No arguments, show current status and help
        return await socket.sendMessage(sender, {
            text: `*⚙️ Manage Auto-Like Emojis*\n\n` +
                  `*Current Emojis:* ${currentEmojis.join(' ')}\n\n` +
                  `*How to use:*\n` +
                  `• To *replace* all: \`${prefix}setemojis set ❤️ 🔥 ✨\`\n` +
                  `• To *add* an emoji: \`${prefix}setemojis add 😊\`\n` +
                  `• To *remove* an emoji: \`${prefix}setemojis remove 🔥\``
        }, { quoted: msg });
    }

    let newEmojisList;
    let responseMessage = '';

    switch (subCommand) {
        case 'add':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide emojis to add.*\nExample: \`${prefix}setemojis add 👍 💖\`` }, { quoted: msg });
            }
            newEmojisList = [...new Set([...currentEmojis, ...emojis])]; // Add new emojis, ensuring no duplicates
            responseMessage = `✅ *Emojis Added!*`;
            break;

        case 'remove':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide emojis to remove.*\nExample: \`${prefix}setemojis remove 👍\`` }, { quoted: msg });
            }
            newEmojisList = currentEmojis.filter(e => !emojis.includes(e)); // Remove specified emojis
            responseMessage = `✅ *Emojis Removed!*`;
            break;

        case 'set':
            if (emojis.length === 0) {
                return await socket.sendMessage(sender, { text: `*Please provide a new set of emojis.*\nExample: \`${prefix}setemojis set ❤️‍🔥 💯\`` }, { quoted: msg });
            }
            newEmojisList = emojis; // Overwrite with the new set
            responseMessage = `✅ *Emoji List Updated!*`;
            break;

        default:
            return await socket.sendMessage(sender, { text: `*❌ Invalid sub-command.*\nUse 'add', 'remove', or 'set'.` }, { quoted: msg });
    }

    currentUserConfig.AUTO_LIKE_EMOJI = newEmojisList;
    await updateUserConfig(number, currentUserConfig);
    socket.userConfig.AUTO_LIKE_EMOJI = newEmojisList;

    await socket.sendMessage(sender, {
        text: `${responseMessage}\n*New Emojis:* ${newEmojisList.join(' ')}`
    }, { quoted: msg });
    break;
}



case 'save': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            return await socket.sendMessage(m.chat, {
                text: '*❌ Please reply to a status message to save*'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(m.chat, { react: { text: '💾', key: msg.key } });

        const userJid = jidNormalizedUser(socket.user.id);

        // Check message type and save accordingly
        if (quotedMsg.imageMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
            await socket.sendMessage(userJid, {
                image: buffer,
                caption: quotedMsg.imageMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.videoMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
            await socket.sendMessage(userJid, {
                video: buffer,
                caption: quotedMsg.videoMessage.caption || '✅ *Status Saved*'
            });
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
            const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
            await socket.sendMessage(userJid, {
                text: `✅ *Status Saved*\n\n${text}`
            });
        } else {
            await socket.sendMessage(userJid, quotedMsg);
        }

        await socket.sendMessage(m.chat, {
            text: '✅ *Status saved successfully!*'
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Save error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to save status*'
        }, { quoted: myquoted });
    }
    break;
}

case 'tt':
case 'ttdl':         
case 'tiktok': {
const axios = require('axios');

    await socket.sendMessage(m.chat, { react: { text: '🎬', key: msg.key } });

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const link = q.replace(/^([./!]?(tiktok(dl)?|tt(dl)?))\s*/i, '').trim();

    if (!link) {
        return await socket.sendMessage(m.chat, {
            text: '📌 *Usage:* .tiktok <link>'
        }, { quoted: msg });
    }

    if (!link.includes('tiktok.com')) {
        return await socket.sendMessage(m.chat, {
            text: '❌ *Invalid TikTok link.*'
        }, { quoted: msg });
    }

    try { 
        await socket.sendPresenceUpdate('composing', m.chat);
          await delay(300);
        await socket.sendMessage(m.chat, {
            text: '🔁 Fetching Data From Snades API...'
        }, { quoted: msg });
        
        const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(link)}`;
        const { data } = await axios.get(apiUrl);

        if (data.code !== 0 || !data.data) {
            return await socket.sendMessage(m.chat, {
                text: '❌ Failed to fetch TikTok video.'
            }, { quoted: msg });
        }
        await socket.sendPresenceUpdate('composing', m.chat);
         await delay(700);
        const info = data.data;

        const caption = `
 *SANDES-MD TIKTOK DOWNLOADER*
 \`❖========================❖\`
*╭────────────────────────◎◎►*
*┆* 👤 *User:* ${info.author.nickname} (@${info.author.unique_id})
*┆* 📖 *Title:* ${info.title}
*┆* ❤️ *Likes:* ${info.digg_count}
*┆* 💬 *Comments:* ${info.comment_count}
*┆* 🔁 *Shares:* ${info.share_count}
*╰─────────────◎◎►*
\`❖========================❖\`

*REPLY THE NUMBER BELLOW* 

01 ❯❯◦ \`Video\` 🎥
02 ❯❯◦ \`Document\` 📂
03 ❯❯◦ \`Audio\` 🎧

${footer}`;
        const sent = await socket.sendMessage(m.chat, {
            image: { url: info.cover },
            caption
        }, { quoted: msg });

        socket.ev.on('messages.upsert', async (msgUpdate) => {
            const m2 = msgUpdate.messages[0];
            if (!m2.message) return;

            const body = m2.message.conversation || m2.message.extendedTextMessage?.text;
            const ctx = m2.message.extendedTextMessage?.contextInfo;

            if (!ctx || ctx.stanzaId !== sent.key.id) return;

            const choice = body.trim();

            await socket.sendMessage(m.chat, { react: { text: "⬇️", key: m2.key } });

            if (choice === '1') {
                await socket.sendMessage(m.chat, {
                    video: { url: info.play },
                    caption: `${info.title}\n\n${footer}`
                }, { quoted: m2 });

            } else if (choice === '2') {
                await socket.sendMessage(m.chat, {
                    document: { url: info.play },
                    mimetype: 'video/mp4',
                    fileName: `${info.id}.mp4\n\n${footer}`
                }, { quoted: m2 });

            } else if (choice === '3') {
                await socket.sendMessage(m.chat, {
                    audio: { url: info.music },
                    mimetype: 'audio/mpeg'
                }, { quoted: m2 });
            }

            await socket.sendMessage(m.chat, { react: { text: "✔", key: m2.key } });
        });

    } catch (err) {
        console.error("TikTok error:", err);
        await socket.sendMessage(m.chat, {
            text: `❌ Error: ${err.message}`
        }, { quoted: msg });
    }

    break;
}
                    

case 'facebook':
case 'facebok':
case 'fbdl':
case 'fb': {
    const { igdl } = require('ruhend-scraper');

    if (!args[0]) {
        return socket.sendMessage(m.chat, {
            text: '❗ *Please provide a valid Facebook video link.*\n\n📌 Example: `.fb https://fb.watch/xyz/`'
        }, { quoted: msg });
    }

    await socket.sendMessage(m.chat, { react: { text: '🎥', key: msg.key } });

    let res;
    try {
        res = await igdl(args[0]);
    } catch (error) {
        return socket.sendMessage(m.chat, { text: '❌ *Error obtaining data.*' }, { quoted: msg });
    }

    let result = res.data;
    if (!result || result.length === 0) {
        return socket.sendMessage(m.chat, { text: '❌ *No result found.*' }, { quoted: msg });
    }

    let hd = result.find(i => i.resolution.includes("720"));
    let sd = result.find(i => i.resolution.includes("360"));
    let firstVideo = result[0];

    let menu = `🔢 *Reply below number*

🎥 *VIDEO QUALITY*
━━━━━━━━━━━━━━━

${hd ? '1 ❯❯◦ HD Quality (720p)\n' : ''}
${sd ? '2 ❯❯◦ SD Quality (360p)\n' : ''}

${footer}
`;

    const menuMsg = await socket.sendMessage(m.chat, {
        image: { url: firstVideo.thumbnail },
        caption: menu
    }, { quoted: msg });

    const fbHandler = async (mUpdate) => {
        const rMsg = mUpdate.messages[0];
        if (!rMsg.message?.extendedTextMessage) return;

        const replyText = rMsg.message.extendedTextMessage.text.trim();
        const repliedId = rMsg.message.extendedTextMessage.contextInfo?.stanzaId;

        if (repliedId !== menuMsg.key.id) return;

        socket.ev.off('messages.upsert', fbHandler); // stop listener

        if (replyText === '1' && hd) {
            await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });

            await socket.sendMessage(m.chat, {
                video: { url: hd.url },
                mimetype: 'video/mp4',
                fileName: 'fb_hd.mp4',
                caption: `${footer}`
            }, { quoted: rMsg });

            await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

        } else if (replyText === '2' && sd) {
            await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });

            await socket.sendMessage(m.chat, {
                video: { url: sd.url },
                mimetype: 'video/mp4',
                fileName: 'fb_sd.mp4',
                caption: `${footer}`
            }, { quoted: rMsg });

            await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

        } else {
            await socket.sendMessage(m.chat, {
                text: '❌ Invalid option. Please reply 1 or 2.'
            }, { quoted: rMsg });
        }
    };

    socket.ev.on('messages.upsert', fbHandler);

    break;
}
// Handler for button click
case 'fb_dl': {
    let url = args[0];
    let quality = args[1] || '';
    if (!url) return socket.sendMessage(m.chat, { text: "*No download link provided*" });

    try {
        await socket.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(m.chat, {
            video: { url },
            caption: `${footer}`,
            fileName: `fb_${quality.toLowerCase()}.mp4`,
            mimetype: 'video/mp4'
        }, { quoted: msg });
        await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });
    } catch (err) {
        await socket.sendMessage(m.chat, { text: "*Error downloading video*" });
    }
    break;
}

// Handle button click
case 'downloadvid': {
    const url = args[0]; // buttonId passed like downloadhd_<url>
    if (!url) return await socket.sendMessage(from, { text: "❌ Invalid video URL" });

    try {
        // React immediately
        await socket.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

        // Fetch video download link
        const res = await fetch(`${apibase}/download/ytmp4?apikey=${apikey}&url=${url}`);
        const data = await res.json();
        if (!data.success || !data.result.download_url) {
            return await socket.sendMessage(from, { text: "❌ Download Failed. Try again." });
        }

        const downloadUrl = data.result.download_url;

        // Send video as fast as possible
        await socket.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: "video/mp4",
            caption: `${footer}`,
        }, { quoted: msg });

        // React after sending
        await socket.sendMessage(from, { react: { text: '✔️', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(from, { text: "*❌ Error occurred while downloading video.*" });
    }
    break;
}

case 'downloaddoc': {
    const url = args[0]; // buttonId passed like downloadhd_<url>
    if (!url) return await socket.sendMessage(from, { text: "❌ Invalid video URL" });

    try {
        // React immediately
        await socket.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

        // Fetch video download link
        const res = await fetch(`${apibase}/download/ytmp4?apikey=${apikey}&url=${url}`);
        const data = await res.json();
        if (!data.success || !data.result.download_url) {
            return await socket.sendMessage(from, { text: "❌ Download Failed. Try again." });
        }

        const downloadUrl = data.result.download_url;

        // Send video as fast as possible
        await socket.sendMessage(from, {
            document:{url:downloadUrl },
            mimetype:"video/mp4",        
            fileName:data.result.title + ".mp4",   
            caption :`${footer}`
            }, {quoted:msg})   
        // React after sending
        await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(from, { text: "*❌ Error occurred while downloading video.*" });
    }
    break;
}



case 'pair':
case 'bot':
case 'freebot': {
    try {
        const botNumber = socket.user.id.split(":")[0].replace(/[^0-9]/g, "");
        const reply = (text) =>
            socket.sendMessage(m.key.remoteJid, { text, mentions: [m.sender] }, { quoted: msg });

        // ✅ Allow only in private chats
        if (m.key.remoteJid.endsWith("@g.us")) {
            return reply(
                `⚠️ *This action is only allowed in private chats.*\n\n` +
                `> Tap here: https://wa.me/+${botNumber}?text=${prefix}freebot`
            );
        }

        const senderId = m.key.remoteJid;
        if (!senderId) return reply("❌ Cannot detect sender number.");

        const userNumber = senderId.split("@")[0];
        const pairNumber = userNumber.replace(/[^0-9]/g, "");

        if (activeSockets.has(pairNumber)) {
            return reply("❌ *This bot is already paired with another device.*");
        }

        // ✅ Send starting message
        await socket.sendMessage(senderId, {
            text: `🔄 *FREE BOT PAIRING INITIATED*\n\nGenerating code for *${pairNumber}*...`
        }, { quoted: msg });

        // ✅ Mock response for EmpirePair
        const mockRes = {
            headersSent: false,
            send: async (data) => {
                if (data.code) {
                    // 1️⃣ Send the code first
                    await reply(`*${data.code}*`);

                    // 2️⃣ Then send setup instructions
                    await reply(
                        `🔥 *Pairing Instructions* 🔥\n\n` +
                        `01 Copy the code above.\n` +
                        `02 Open *WhatsApp* on your phone.\n` +
                        `03 Go to *Settings > Linked Devices*.\n` +
                        `04 Tap *Link with Phone Number*.\n` +
                        `05 Paste the code & connect.\n\n` +
                        `> 📌 *Note: Code expires in 1 minute*`
                    );
                }
            },
            status: () => mockRes
        };

        // ✅ Generate using EmpirePair (built-in, no external URL)
        await EmpirePair(pairNumber, mockRes);

    } catch (error) {
        console.error("❌ Freebot command error:", error);
        await socket.sendMessage(m.key.remoteJid, { 
            text: "❌ An error occurred. Please try again later." 
        }, { quoted: msg });
    }
    break;
}

case 'getdp': {
    try {
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(m.chat, { text: "❌ Please provide a number.\n\nUsage: .getdp <number>" });

        // 🔹 Format number into JID
        let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

        // 🔹 Try to get profile picture
        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(jid, "image");
        } catch {
            ppUrl = "https://i.ibb.co/zVRCwXKX/default-avatar-profile-icon-vector-unknown-social-media-user-photo-default-avatar-profile-icon-vecto.jpg"; // default dp
        }

        // 🔹 Send DP with botName meta mention
        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: `🖼 *Profile Picture Found*\n\n*User:* ${q}\n`,
            buttons: [{ buttonId: `${prefix}pair`, buttonText: { displayText: "Pair Our Bot" }, type: 1 }],
            headerType: 4
        }, { quoted: myquoted }); // <-- botName meta mention

    } catch (e) {
        console.log("❌ getdp error:", e);
        await socket.sendMessage(m.chat, { text: "⚠️ Error: Could not fetch profile picture." });
    }
    break;
}
              
case 'ping': {
    const start = Date.now();
      await socket.sendMessage(m.chat, { react: { text: '🚀', key: msg.key } });
     await socket.sendPresenceUpdate('composing', m.chat);
    await delay(100);
    const tempMsg = await socket.sendMessage(m.chat, { text: 'Checking Speed' });

    const end = Date.now();
    const ping = end - start;

    // Edit the message to show the result
    await socket.sendMessage(m.chat, {
        text: `*Pong ${ping} ms*`,
        edit: tempMsg.key
    });
    break;
}




// Owner Contact Command - Send Owner Contact and Video Note - Last Update 2025-August-14
case 'owner': {
    const ownerNamePlain = "SANDES ISURANDA";
    const ownerNumber = "94716717099"; // without '+'
    const displayNumber = "+94 71 671 70 99";
    const email = "issumr869@gmail.com";

    // 2️⃣ Send vCard contact
    const vcard =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${ownerNamePlain}\n` +
        `ORG:${ownerNamePlain}\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${displayNumber}\n` +
        `EMAIL:${email}\n` +
        'END:VCARD';

    await socket.sendMessage(m.chat, {
        contacts: {
            displayName: ownerNamePlain,
            contacts: [{ vcard }]
        }
    },{ quoted: myquoted });

    // 3️⃣ Send premium styled message
    const msgText = `
*╭─「 OWNER DETAILS 」──●●►*
*│*🧑‍💻 Name : Sandes Isuranda 
*│* ♻ Role : Web Developer
*│* 🧬 Offical web : sandes-ofc.zone.id
*╰──────────●●►* 
`.trim();

    await socket.sendMessage(m.chat, { text: msgText });

    break;
}

                case 'deleteme': {
                    const userJid = jidNormalizedUser(socket.user.id);
                    const userNumber = userJid.split('@')[0];

                    if (userNumber !== number) {
                        return await socket.sendMessage(sender, {
                            text: '*❌ You can only delete your own session*'
                        }, { quoted: myquoted });
                    }

                    await socket.sendMessage(sender, {
                        image: { url: logo },
                        caption: formatMessage(
                            '🗑️ *SESSION DELETION*',
                            `⚠️ Your session will be permanently deleted!\n\n🔢 Number: ${number}\n\n*This action cannot be undone!*`,
                            `${footer}`
                        )
                    }, { quoted: myquoted });

                    setTimeout(async () => {
                        await deleteSessionImmediately(number);
                        socket.ws.close();
                        activeSockets.delete(number);
                    }, 3000);

                    break;
                }

                case 'vv':
                case 'viewonce': {
                    try {
                        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                        if (!quotedMsg) {
                            return await socket.sendMessage(m.chat, {
                                text: '🔥 *Please reply to a ViewOnce message!*\n\n📌 Usage: Reply to a viewonce message with `.vv`'
                            }, { quoted: myquoted });
                        }

                        await socket.sendMessage(m.chat, {
                            react: { text: '🤫', key: msg.key }
                        });

                        let mediaData = null;
                        let mediaType = null;
                        let caption = '';

                        // Check for viewonce media
                        if (quotedMsg.imageMessage?.viewOnce) {
                            mediaData = quotedMsg.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.videoMessage?.viewOnce) {
                            mediaData = quotedMsg.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessage?.message?.imageMessage) {
                            mediaData = quotedMsg.viewOnceMessage.message.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessage?.message?.videoMessage) {
                            mediaData = quotedMsg.viewOnceMessage.message.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessageV2?.message?.imageMessage) {
                            mediaData = quotedMsg.viewOnceMessageV2.message.imageMessage;
                            mediaType = 'image';
                            caption = mediaData.caption || '';
                        } else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) {
                            mediaData = quotedMsg.viewOnceMessageV2.message.videoMessage;
                            mediaType = 'video';
                            caption = mediaData.caption || '';
                        } else {
                            return await socket.sendMessage(m.chat, {
                                text: '❌ *This is not a ViewOnce message or it has already been viewed!*'
                            }, { quoted: myquoted });
                        }

                        if (mediaData && mediaType) {
                            await socket.sendMessage(sender, {
                                text: '*Fetching...*'
                            }, { quoted: myquoted });

                            const buffer = await downloadAndSaveMedia(mediaData, mediaType);

                            const messageContent = caption ?
                                `*ViewOnce ${mediaType} Retrieved*\n\n📝 Caption: ${caption}` :
                                `*ViewOnce ${mediaType} Retrieved*`;

                            if (mediaType === 'image') {
                                await socket.sendMessage(sender, {
                                    image: buffer,
                                    caption: messageContent
                                }, { quoted: myquoted });
                            } else if (mediaType === 'video') {
                                await socket.sendMessage(sender, {
                                    video: buffer,
                                    caption: messageContent
                                }, { quoted: myquoted });
                            }

                            await socket.sendMessage(m.chat, {
                                react: { text: '✔️', key: msg.key }
                            });

                            console.log(`✅ ViewOnce ${mediaType} retrieved for ${sender}`);
                        }

                    } catch (error) {
                        console.error('ViewOnce Error:', error);
                        await socket.sendMessage(m.chat, {
                            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'get-seeson': {
                    try {
                        const activeCount = activeSockets.size;
                        const pendingCount = pendingSaves.size;
                        const healthyCount = Array.from(sessionHealth.values()).filter(h => h === 'active' || h === 'connected').length;
                        const reconnectingCount = Array.from(sessionHealth.values()).filter(h => h === 'reconnecting').length;
                        const failedCount = Array.from(sessionHealth.values()).filter(h => h === 'failed' || h === 'error').length;

                        // Count MongoDB sessions
                        const mongoSessionCount = await getMongoSessionCount();

                        // Get uptimes
                        const uptimes = [];
                        activeSockets.forEach((socket, number) => {
                            const startTime = socketCreationTime.get(number);
                            if (startTime) {
                                const uptime = Date.now() - startTime;
                                uptimes.push({
                                    number,
                                    uptime: Math.floor(uptime / 1000)
                                });
                            }
                        });

                        uptimes.sort((a, b) => b.uptime - a.uptime);

                        const uptimeList = uptimes.slice(0, 5).map((u, i) => {
                            const hours = Math.floor(u.uptime / 3600);
                            const minutes = Math.floor((u.uptime % 3600) / 60);
                            return `${i + 1}. ${u.number} - ${hours}h ${minutes}m`;
                        }).join('\n');

                        await socket.sendMessage(m.chat, {
                            image: { url: logo },
                            caption: formatMessage(
                                '🪀 *SANDES-MD Whatsapp Bot*',
                                `✔️ *Active Sessions:* ${activeCount}\n` +
                                `🗿 *Healthy:* ${healthyCount}\n` +
                                `🔄 *Reconnecting:* ${reconnectingCount}\n` +
                                `❌ *Failed:* ${failedCount}\n` +
                                `💾 *Pending Saves:* ${pendingCount}\n` +
                                `☁️ *MongoDB Sessions:* ${mongoSessionCount}\n` +
                                `☁️ *MongoDB Status:* ${mongoConnected ? '✅ Connected' : '❌ Not Connected'}\n\n` +
                                `⏱️ *Top 5 Longest Running:*\n${uptimeList || 'No sessions running'}\n\n` +
                                `📅 *Report Time:* ${getSriLankaTimestamp()}`,
                                `${footer}`
                            )
                        }, { quoted: myquoted });

                    } catch (error) {
                        console.error('❌ Count error:', error);
                        await socket.sendMessage(m.chat, {
                            text: '*❌ Failed to get session count*'
                        }, { quoted: myquoted });
                    }
                    break;
                }

                case 'yts': {
                    try {
                        if (!args[0]) {
                            return await socket.sendMessage(m.chat, {
                                text: '*❌ Please provide a search query*\n*Usage:* .yts <search term>'
                            }, { quoted: myquoted });
                        }

                        const query = args.join(' ');
                        await socket.sendMessage(m.chat, { react: { text: '🔍', key: msg.key } });

                        const searchResults = await yts(query);

                        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
                            return await socket.sendMessage(m.chat, {
                                text: `*❌ No results found for:* ${query}`
                            }, { quoted: myquoted });
                        }

                        const videos = searchResults.videos.slice(0, 20);
                          await socket.sendPresenceUpdate('composing', m.chat);
                             await delay(900);

                        let resultText = `*🔍 YOUTUBE SEARCH RESULT*\n`;
                        resultText += `*Query:* ${query}\n`;
                        resultText += `*Found:* ${searchResults.videos.length} videos\n`;
                        resultText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                        videos.forEach((video, index) => {
                            resultText += `╭─────────────✑\n`;
                            resultText += `◉ *${index + 1}. ${video.title}*\n`;
                            resultText += `│❯❯◦ Duration: ${video.timestamp}\n`;
                            resultText += `│❯❯◦ Views: ${video.views ? video.views.toLocaleString() : 'N/A'}\n`;
                            resultText += `│❯❯◦ Uploaded: ${video.ago}\n`;
                            resultText += `│❯❯◦ Channel: ${video.author.name}\n`;
                            resultText += `│❯❯◦ Link: ${video.url}\n`;
                            resultText += `╰─────────────✑\n\n`;
                        });

                        resultText += `${footer}`;

                        await socket.sendMessage(m.chat, {
                            text: resultText,
                            contextInfo: {
                                externalAdReply: {
                                    title: videos[0].title,
                                    body: `${videos[0].author.name} • ${videos[0].timestamp}`,
                                    thumbnailUrl: videos[0].thumbnail,
                                    sourceUrl: videos[0].url,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: myquoted });

                        await socket.sendMessage(m.chat, { react: { text: '✔️', key: msg.key } });

                    } catch (error) {
                        console.error('❌ YouTube search error:', error);
                        await socket.sendMessage(m.chat, {
                            text: `*❌ Search failed*\n*Error:* ${error.message}`
                        }, { quoted: myquoted });
                    }
                    break;
                }
                       


default:
// Unknown command
break;
}
} catch (error) {
    console.error('❌ Command handler error:', error);
    await socket.sendMessage(sender, {
        image: { url: logo },
        caption: formatMessage(
            '❌ COMMAND ERROR HANDLER',
            'An error occurred but auto-recovery is active. Please try again.',
            `${footer}`
        )
    }
);}});}

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionHealth.set(sanitizedNumber, 'active');

        if (msg.key.remoteJid.endsWith('@s.whatsapp.net')) {
            await handleUnknownContact(socket, number, msg.key.remoteJid);
        }

        if (config.AUTO_RECORDING === 'true') {
            try {
                if (socket.ws.readyState === 1) { // 1 means OPEN
                    await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                }
            } catch (error) {
                console.error('❌ Failed to set recording presence:', error);
            }
        }
    });
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        sessionConnectionStatus.set(sanitizedNumber, connection);

        if (connection === 'close') {
            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            if (lastDisconnect?.error?.output?.statusCode === 401) {
                console.log(`❌ Session invalidated for ${number}, deleting immediately`);
                sessionHealth.set(sanitizedNumber, 'invalid');
                await updateSessionStatus(sanitizedNumber, 'invalid', new Date().toISOString());
                await updateSessionStatusInMongoDB(sanitizedNumber, 'invalid', 'invalid');

                setTimeout(async () => {
                    await deleteSessionImmediately(sanitizedNumber);
                }, config.IMMEDIATE_DELETE_DELAY);
            } else {
                console.log(`🔄 Connection closed for ${number}, attempting reconnect...`);
                sessionHealth.set(sanitizedNumber, 'reconnecting');
                await updateSessionStatus(sanitizedNumber, 'failed', new Date().toISOString(), {
                    disconnectedAt: new Date().toISOString(),
                    reason: lastDisconnect?.error?.message || 'Connection closed'
                });
                await updateSessionStatusInMongoDB(sanitizedNumber, 'disconnected', 'reconnecting');

                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);

                    const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
                    await EmpirePair(number, mockRes);
                } else {
                    console.log(`❌ Max reconnection attempts reached for ${number}, deleting...`);
                    setTimeout(async () => {
                        await deleteSessionImmediately(sanitizedNumber);
                    }, config.IMMEDIATE_DELETE_DELAY);
                }
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${number}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');

            setTimeout(async () => {
                await autoSaveSession(sanitizedNumber);
            }, 5000);
        } else if (connection === 'connecting') {
            sessionHealth.set(sanitizedNumber, 'connecting');
            sessionConnectionStatus.set(sanitizedNumber, 'connecting');
        }
    });
}

// **MAIN PAIRING FUNCTION**

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 Connecting: ${sanitizedNumber}`);

    try {
        fs.ensureDirSync(sessionPath);

        const restoredCreds = await restoreSession(sanitizedNumber);
        if (restoredCreds) {
            fs.writeFileSync(
                path.join(sessionPath, 'creds.json'),
                JSON.stringify(restoredCreds, null, 2)
            );
            console.log(`✅ Session restored: ${sanitizedNumber}`);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        const socket = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    version: [2, 3000, 1033105955],          
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
});


        socketCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');

        setupStatusHandlers(socket);
        setupStatusSavers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);

     if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    pair = "SANDESMD"
                    code = await socket.requestPairingCode(sanitizedNumber, pair);
                    console.log(`📱 Generated pairing code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }

            if (!res.headersSent && code) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();

            if (isSessionActive(sanitizedNumber)) {
                try {
                   /* const fileContent = await fs.readFile( //start
                        path.join(sessionPath, 'creds.json'),
                        'utf8'
                    );
                    const credData = JSON.parse(fileContent);

                    Save to MongoDB
                    wait saveSessionToMongoDB(sanitizedNumber, credData);
                    
                    console.log(`💾 Active session credentials updated: ${sanitizedNumber}`);//end
                */} catch (error) {
                    console.error(`❌ Failed to save credentials for ${sanitizedNumber}:`, error);
                }
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                try {
                    await delay(3000);
                    let userConfig = await loadUserConfigFromMongoDB(sanitizedNumber);
                    if (!userConfig) {
                        await updateUserConfig(sanitizedNumber, config);
                        userConfig = config;
                    }

                    const userJid = jidNormalizedUser(socket.user.id);
                    await updateAboutStatus(socket);

                    activeSockets.set(sanitizedNumber, socket);
                    socket.userConfig = userConfig; // Attach user config to the socket
                    sessionHealth.set(sanitizedNumber, 'active');
                    sessionConnectionStatus.set(sanitizedNumber, 'open');
                    disconnectionTime.delete(sanitizedNumber);
                    restoringNumbers.delete(sanitizedNumber);

                    // Check if initial messages have been sent from the database
                    const sessionDoc = await Session.findOne({ number: sanitizedNumber });
                    if (!sessionDoc || !sessionDoc.initialMessagesSent) {
                        console.log(`🚀 Sending initial welcome messages for ${sanitizedNumber}...`);

                        // Send welcome message to user
                        try {
                            await socket.sendMessage(userJid, {
                                image: { url: logo },
                                caption: formatMessage(
                                    '🪀 *SANDES-MD LITE WhatsApp Bot*',
                                    `Connect - ${mainSite}\n🤖 Auto-connected successfully!\n\n🔢 Number: ${sanitizedNumber}\n🍁 Channel: Auto-followed\n🔄 Auto-Reconnect: Active\n🧹 Auto-Cleanup: Inactive Sessions\n☁️ Storage: MongoDB (${mongoConnected ? 'Connected' : 'Connecting...'})\n📋 Pending Saves: ${pendingSaves.size}\n\n📋 Commands:\n📌${config.PREFIX}alive - Session status\n📌${config.PREFIX}menu - Show all commands\n*Special Note !* 📌\n\n \`IN SINHALA\` \n\n♻ *Bot එක දැනට තියෙන්නේ deactive mode එකේ. \nඒ කියන්නේ bot number එකෙන් යවන commands වලට විතරයි වැඩ කරන්නෙ.*\n✨ *ඔයාට ඕන නම් ඒක හැමෝටම වැඩ කරන විදිහට හදන්න, chat එකට .active කියලා type කරන්න.\n එතකොට .active දාපු chat එකට bot එක active වෙලා වැඩ කරයි.*\n\n\`IN ENGLISH\` \n\n♻ *The bot is currently in deactive mode. \nThat means it only responds to commands sent from the bot number.*\n✨ *If you want it to work for everyone, \ntype .active in the chat to activate it.After that, the bot will work in the chat where the .active command was used.*\n\n*THANS FOR USING AND TRUSTING US*\🍒    *_SANDES MD LITE ツ_*    🍒`,
                                    `${footer}`
                                )
                            });

                            // Send message to admins
                            await sendAdminConnectMessage(socket, sanitizedNumber);

                            // Update the flag in the database only after successful sending
                            await Session.updateOne({ number: sanitizedNumber }, { $set: { initialMessagesSent: true } }, { upsert: true });
                            console.log(`✅ Initial messages sent and flag updated for ${sanitizedNumber}.`);
                        } catch (msgError) {
                            console.error(`❌ Failed to send initial message to ${sanitizedNumber}:`, msgError);
                        }

                    } else {
                        console.log(`⏭️ Skipping initial welcome messages for ${sanitizedNumber} (already sent).`);
                    }

                    // Auto-follow newsletters on every connection
                    for (const newsletterJid of config.NEWSLETTER_JIDS) {
                        try {
                            await socket.newsletterFollow(newsletterJid);
                        } catch (error) {
                            // Ignore if already following
                        }
                    }

                    await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
                    await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
                    
                    let numbers = [];
                    if (fs.existsSync(config.NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(config.NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(config.NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }

                    //console.log(`✅ Session fully connected and active: ${sanitizedNumber}`);
                } catch (error) {
                    console.error('❌ Connection setup error:', error);
                    sessionHealth.set(sanitizedNumber, 'error');
                }
            }
        });

        return socket;
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);
        sessionHealth.set(sanitizedNumber, 'failed');
        sessionConnectionStatus.set(sanitizedNumber, 'failed');
        disconnectionTime.set(sanitizedNumber, Date.now());
        restoringNumbers.delete(sanitizedNumber);

        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable', details: error.message });
        }

        throw error;
    }
}

// **API ROUTES**

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');  
           if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'This number is already connected and active' : 'Session is reconnecting',
            health: sessionHealth.get(sanitizedNumber) || 'unknown',
            connectionStatus: sessionConnectionStatus.get(sanitizedNumber) || 'unknown',
            storage: 'MongoDB'
        });
    }

    await EmpirePair(number, res);
});

router.get('/api/active', (req, res) => {
    const activeNumbers = [];
    const healthData = {};

    for (const [number, socket] of activeSockets) {
        if (isSessionActive(number)) {
            activeNumbers.push(number);
            healthData[number] = {
                health: sessionHealth.get(number) || 'unknown',
                connectionStatus: sessionConnectionStatus.get(number) || 'unknown',
                uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
                lastBackup: lastBackupTime.get(number) || null,
                isActive: true
            };
        }
    }

    res.status(200).send({
        count: activeNumbers.length,
        numbers: activeNumbers,
        health: healthData,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        autoManagement: 'active'
    });
});

// Status endpoint to check server health and active sessions
router.get('/status', async (req, res) => {
    const start = Date.now();

    // Simulate ping time by delaying until send
    const uptime = process.uptime(); // server uptime in seconds
    const memoryUsage = process.memoryUsage().rss; // RAM usage
    const cpuLoad = os.loadavg()[0]; // 1-minute CPU load avg

    // activeSockets is your Map of sessions
    const sessionCount = activeSockets.size;

    res.status(200).send({
        online: true,
        ping: Date.now() - start + "ms",
        activesessions: sessionCount,
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: `${(memoryUsage / 1024 / 1024).toFixed(2)} MB`,
        cpuLoad: cpuLoad.toFixed(2),
        timestamp: new Date().toISOString()
    });
});

router.get('/ping', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;

    res.status(200).send({
        status: 'active',
        message: 'AUTO SESSION MANAGER is running with MongoDB',
        activeSessions: activeCount,
        totalSockets: activeSockets.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        pendingSaves: pendingSaves.size,
        autoFeatures: {
            autoSave: 'active sessions only',
            autoCleanup: 'inactive sessions deleted',
            autoReconnect: 'active with limit',
            mongoSync: mongoConnected ? 'active' : 'initializing'
        }
    });
});

router.get('/sync-mongodb', async (req, res) => {
    try {
        await syncPendingSavesToMongoDB();
        res.status(200).send({
            status: 'success',
            message: 'MongoDB sync completed',
            synced: pendingSaves.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'MongoDB sync failed',
            error: error.message
        });
    }
});

router.get('/session-health', async (req, res) => {
    const healthReport = {};
    for (const [number, health] of sessionHealth) {
        healthReport[number] = {
            health,
            uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
            reconnectionAttempts: reconnectionAttempts.get(number) || 0,
            lastBackup: lastBackupTime.get(number) || null,
            disconnectedSince: disconnectionTime.get(number) || null,
            isActive: activeSockets.has(number)
        };
    }

    res.status(200).send({
        status: 'success',
        totalSessions: sessionHealth.size,
        activeSessions: activeSockets.size,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        healthReport,
        autoManagement: {
            autoSave: 'running',
            autoCleanup: 'running',
            autoReconnect: 'running',
            mongoSync: mongoConnected ? 'running' : 'initializing'
        }
    });
});

router.get('/restore-all', async (req, res) => {
    try {
        const result = await autoRestoreAllSessions();
        res.status(200).send({
            status: 'success',
            message: 'Auto-restore completed',
            restored: result.restored,
            failed: result.failed
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Auto-restore failed',
            error: error.message
        });
    }
});

router.get('/cleanup', async (req, res) => {
    try {
        await autoCleanupInactiveSessions();
        res.status(200).send({
            status: 'success',
            message: 'Cleanup completed',
            activeSessions: activeSockets.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Cleanup failed',
            error: error.message
        });
    }
});

router.delete('/session/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            socket.ws.close();
        }

        await deleteSessionImmediately(sanitizedNumber);

        res.status(200).send({
            status: 'success',
            message: `Session ${sanitizedNumber} deleted successfully`
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to delete session',
            error: error.message
        });
    }
});

router.get('/mongodb-status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        const sessionCount = await getMongoSessionCount();

        res.status(200).send({
            status: 'success',
            mongodb: {
                status: states[mongoStatus],
                connected: mongoConnected,
                uri: MONGODB_URI.replace(/:[^:]*@/, ':****@'), // Hide password
                sessionCount: sessionCount
            }
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to get MongoDB status',
            error: error.message
        });
    }
});

// ⚙️ SETTINGS ROUTES (GET + POST)
router.get('/settings/:number', async (req, res) => {
  try {
    const number = req.params.number.replace(/[^0-9]/g, '');
    const localPath = path.join(__dirname, 'setting', `${number}.json`);
    
    let config = await loadUserConfigFromMongoDB(number);
    
    if (!config && fs.existsSync(localPath)) {
      config = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }

    if (!config) {
      return res.status(404).json({ error: 'No config found' });
    }

    res.json(config);
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/settings/:number', async (req, res) => {
  try {
    const number = req.params.number.replace(/[^0-9]/g, '');
    const newConfig = req.body; // Only changed fields
    const localPath = path.join(__dirname, 'setting', `${number}.json`);

    let existingConfig = await loadUserConfigFromMongoDB(number);
    if (!existingConfig && fs.existsSync(localPath)) {
      existingConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }

    // Ensure default structure
    if (!existingConfig) {
      existingConfig = {
        number,
        AUTO_VIEW_STATUS: "true",
        AUTO_LIKE_STATUS: "true",
        AUTO_RECORDING: "true",
        AUTO_LIKE_EMOJI: ["💗","🔥"],
        BUTTON: "true",
        PREFIX: "."
      };
    }

    // Merge only changed fields
    const mergedConfig = { ...existingConfig, ...newConfig };

    // Save merged config
    await saveUserConfigToMongoDB(number, mergedConfig);
    fs.ensureDirSync(path.join(__dirname, 'setting'));
    fs.writeFileSync(localPath, JSON.stringify(mergedConfig, null, 2));

    console.log(`✅ Config updated for ${number}`);
    res.json({ success: true, message: 'Settings updated successfully', config: mergedConfig });
  } catch (err) {
    console.error('POST /settings error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// **CLEANUP AND PROCESS HANDLERS**

process.on('exit', async () => {
    console.log('🛑 Shutting down auto-management...');

    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (autoCleanupInterval) clearInterval(autoCleanupInterval);
    // if (autoReconnectInterval) clearInterval(autoReconnectInterval); // This is now removed
    if (autoRestoreInterval) clearInterval(autoRestoreInterval);
    if (mongoSyncInterval) clearInterval(mongoSyncInterval);

    // Save pending items
    await syncPendingSavesToMongoDB().catch(console.error);

    // Close all active sockets
    activeSockets.forEach((socket, number) => {
        try {
            socket.ws.close();
        } catch (error) {
            console.error(`Failed to close socket for ${number}:`, error);
        }
    });

    // Close MongoDB connection
    await mongoose.connection.close();

    console.log('✅ Shutdown complete');
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    
    // Save all active sessions before shutdown
    await autoSaveAllActiveSessions();
    
    // Sync with MongoDB
    await syncPendingSavesToMongoDB();
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    // Save all active sessions before shutdown
    await autoSaveAllActiveSessions();
    
    // Sync with MongoDB
    await syncPendingSavesToMongoDB();
    
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
    
    // Try to save critical data
    syncPendingSavesToMongoDB().catch(console.error);
    
    setTimeout(() => {
        exec(`pm2 restart ${process.env.PM2_NAME || 'sandes-md-session'}`);
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected');
    mongoConnected = true;
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    mongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
    mongoConnected = false;
    
    // Try to reconnect
    setTimeout(() => {
        initializeMongoDB();
    }, 5000);
});

// Initialize auto-management on module load
initializeAutoManagement();

// Log startup status
console.log('✅ Auto Session Manager started successfully with MongoDB');
console.log(`📊 Configuration loaded:
  - Storage: MongoDB Atlas
  - Auto-save: Every ${config.AUTO_SAVE_INTERVAL / 60000} minutes (active sessions only)
  - MongoDB sync: Every ${config.MONGODB_SYNC_INTERVAL / 60000} minutes (for pending saves)
  - Auto-restore: Every ${config.AUTO_RESTORE_INTERVAL / 3600000} hour(s)
  - Auto-cleanup: Every ${config.AUTO_CLEANUP_INTERVAL / 60000} minutes (deletes inactive)
  - Disconnected cleanup timeout: ${config.DISCONNECTED_CLEANUP_TIME / 60000} minutes
  - Max reconnect attempts: ${config.MAX_FAILED_ATTEMPTS}
  - Pending Saves: ${pendingSaves.size}
`);

// Export the router
module.exports = router;
