const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'img-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Data storage
let users = [];
const trades = [];
const messages = [];
const deposits = [];
const withdrawals = [];
const onlineUsers = new Map();
const referralTransactions = [];

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_change_this';
const SALT_ROUNDS = 10;
const POINTS_TO_DOLLAR_RATE = 100;
const TRADE_PAYOUT_PERCENTAGE = 0.8; // 80% payout on wins

// Data persistence
const dataDir = path.join(__dirname, 'data');
const tradesFile = path.join(dataDir, 'trades.json');
const usersFile = path.join(dataDir, 'users.json');
const referralsFile = path.join(dataDir, 'referrals.json');
const messagesFile = path.join(dataDir, 'messages.json');
const depositsFile = path.join(dataDir, 'deposits.json');
const withdrawalsFile = path.join(dataDir, 'withdrawals.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadTrades() {
    if (fs.existsSync(tradesFile)) {
        try {
            const data = fs.readFileSync(tradesFile, 'utf8');
            const loadedTrades = JSON.parse(data);
            trades.push(...loadedTrades);
            console.log('✅ Loaded', loadedTrades.length, 'trades from file');
        } catch (error) {
            console.log('⚠️ Error loading trades:', error.message);
        }
    }
}

function saveTrades() {
    try {
        fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
        console.log('💾 Saved', trades.length, 'trades to file');
    } catch (error) {
        console.log('❌ Error saving trades:', error.message);
    }
}

function loadUsers() {
    if (fs.existsSync(usersFile)) {
        try {
            const data = fs.readFileSync(usersFile, 'utf8');
            let loadedUsers = JSON.parse(data);
            
            // CRITICAL FIX: Ensure users is always an array
            if (!Array.isArray(loadedUsers)) {
                console.log('⚠️ Users file was not an array, converting to array...');
                loadedUsers = [loadedUsers];
                fs.writeFileSync(usersFile, JSON.stringify(loadedUsers, null, 2));
            }
            
            users.push(...loadedUsers);
            console.log('✅ Loaded', loadedUsers.length, 'users from file');
            console.log('📊 Users array is now array?', Array.isArray(users));
        } catch (error) {
            console.log('⚠️ Error loading users:', error.message);
            // If file is corrupted, create new empty array
            users = [];
            fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
        }
    } else {
        // Create empty users file if it doesn't exist
        fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
        console.log('📁 Created new users.json file');
    }
}

function saveUsers() {
    try {
        // Ensure directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // CRITICAL FIX: Always ensure users is an array before saving
        if (!Array.isArray(users)) {
            console.error('❌ CRITICAL: users is not an array! Converting...');
            users = users ? [users] : [];
        }
        
        const usersToSave = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || '',
            password: u.password,
            withdrawPin: u.withdrawPin,
            demoBalance: u.demoBalance,
            demoTotalTrades: u.demoTotalTrades || 0,
            demoTotalProfit: u.demoTotalProfit || 0,
            demoWins: u.demoWins || 0,
            demoLosses: u.demoLosses || 0,
            realBalance: u.realBalance,
            realTotalDeposits: u.realTotalDeposits || 0,
            realTotalWithdrawals: u.realTotalWithdrawals || 0,
            realTotalTrades: u.realTotalTrades || 0,
            realTotalProfit: u.realTotalProfit || 0,
            realWins: u.realWins || 0,
            realLosses: u.realLosses || 0,
            isVerified: u.isVerified !== false,
            accountType: u.accountType || 'Standard',
            createdAt: u.createdAt,
            activeMode: u.activeMode || 'demo',
            referralCode: u.referralCode,
            referredBy: u.referredBy || null,
            referralPoints: u.referralPoints || 0,
            totalPointsEarned: u.totalPointsEarned || 0,
            pointsConverted: u.pointsConverted || 0,
            totalReferrals: u.totalReferrals || 0,
            completedReferrals: u.completedReferrals || 0,
            pendingReferrals: u.pendingReferrals || 0,
            referralBonusGiven: u.referralBonusGiven || false
        }));
        
        fs.writeFileSync(usersFile, JSON.stringify(usersToSave, null, 2));
        console.log('💾 Saved', users.length, 'users to file - Array format:', Array.isArray(usersToSave));
        return true;
    } catch (error) {
        console.error('❌ Error saving users:', error.message);
        console.error('❌ File path:', usersFile);
        return false;
    }
}

function loadDeposits() {
    if (fs.existsSync(depositsFile)) {
        try {
            const data = fs.readFileSync(depositsFile, 'utf8');
            const loadedDeposits = JSON.parse(data);
            deposits.push(...loadedDeposits);
            console.log('✅ Loaded', loadedDeposits.length, 'deposits from file');
        } catch (error) {
            console.log('⚠️ Error loading deposits:', error.message);
        }
    }
}

function saveDeposits() {
    try {
        fs.writeFileSync(depositsFile, JSON.stringify(deposits, null, 2));
        console.log('💾 Saved', deposits.length, 'deposits to file');
    } catch (error) {
        console.log('❌ Error saving deposits:', error.message);
    }
}

function loadMessages() {
    if (fs.existsSync(messagesFile)) {
        try {
            const data = fs.readFileSync(messagesFile, 'utf8');
            const loadedMessages = JSON.parse(data);
            messages.push(...loadedMessages);
            console.log('✅ Loaded', loadedMessages.length, 'messages from file');
        } catch (error) {
            console.log('⚠️ Error loading messages:', error.message);
        }
    }
}

function saveMessages() {
    try {
        fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
        console.log('💾 Saved', messages.length, 'messages to file');
    } catch (error) {
        console.log('❌ Error saving messages:', error.message);
    }
}

function loadWithdrawals() {
    if (fs.existsSync(withdrawalsFile)) {
        try {
            const data = fs.readFileSync(withdrawalsFile, 'utf8');
            const loadedWithdrawals = JSON.parse(data);
            withdrawals.push(...loadedWithdrawals);
            console.log('✅ Loaded', loadedWithdrawals.length, 'withdrawals from file');
        } catch (error) {
            console.log('⚠️ Error loading withdrawals:', error.message);
        }
    }
}

function saveWithdrawals() {
    try {
        fs.writeFileSync(withdrawalsFile, JSON.stringify(withdrawals, null, 2));
        console.log('💾 Saved', withdrawals.length, 'withdrawals to file');
    } catch (error) {
        console.log('❌ Error saving withdrawals:', error.message);
    }
}

function loadReferrals() {
    if (fs.existsSync(referralsFile)) {
        try {
            const data = fs.readFileSync(referralsFile, 'utf8');
            const loadedReferrals = JSON.parse(data);
            referralTransactions.push(...loadedReferrals);
            console.log('✅ Loaded', loadedReferrals.length, 'referral transactions');
        } catch (error) {
            console.log('⚠️ Error loading referrals:', error.message);
        }
    }
}

function saveReferrals() {
    try {
        fs.writeFileSync(referralsFile, JSON.stringify(referralTransactions, null, 2));
        console.log('💾 Saved', referralTransactions.length, 'referral transactions to file');
    } catch (error) {
        console.log('❌ Error saving referrals:', error.message);
    }
}

// Load all data
loadTrades();
loadUsers();
loadMessages();
loadDeposits();
loadWithdrawals();
loadReferrals();

app.use('/uploads', express.static(uploadDir));

// ============ STATIC FILE SERVING FOR RENDER ============
const clientPath = path.join(__dirname, '..', 'client');
console.log('📁 Serving static files from:', clientPath);

app.use(express.static(clientPath));

app.get('/', (req, res) => {
    const indexPath = path.join(clientPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        users: users.length,
        trades: trades.length
    });
});

// ============ CRYPTO MAPPING & PRICE FETCHING ============

const cryptoMapping = [
    { symbol: 'BTC', name: 'Bitcoin', id: 'bitcoin', icon: '₿', color: '#f7931a' },
    { symbol: 'ETH', name: 'Ethereum', id: 'ethereum', icon: 'Ξ', color: '#627eea' },
    { symbol: 'BNB', name: 'Binance Coin', id: 'binancecoin', icon: 'ⓑ', color: '#f3ba2f' },
    { symbol: 'XRP', name: 'Ripple', id: 'ripple', icon: '✕', color: '#1a2b4c' },
    { symbol: 'ADA', name: 'Cardano', id: 'cardano', icon: '₳', color: '#0033ad' },
    { symbol: 'SOL', name: 'Solana', id: 'solana', icon: '◎', color: '#00ffa3' },
    { symbol: 'DOGE', name: 'Dogecoin', id: 'dogecoin', icon: 'Ð', color: '#c3a634' },
    { symbol: 'DOT', name: 'Polkadot', id: 'polkadot', icon: '●', color: '#e6007a' },
    { symbol: 'AVAX', name: 'Avalanche', id: 'avalanche-2', icon: '▲', color: '#e84142' },
    { symbol: 'SHIB', name: 'Shiba Inu', id: 'shiba-inu', icon: '🐕', color: '#f00' },
    { symbol: 'MATIC', name: 'Polygon', id: 'matic-network', icon: '◆', color: '#8247e5' },
    { symbol: 'LINK', name: 'Chainlink', id: 'chainlink', icon: '🔗', color: '#2a5ada' },
    { symbol: 'UNI', name: 'Uniswap', id: 'uniswap', icon: '🦄', color: '#ff007a' },
    { symbol: 'ATOM', name: 'Cosmos', id: 'cosmos', icon: '⚛', color: '#2e3148' },
    { symbol: 'LTC', name: 'Litecoin', id: 'litecoin', icon: 'Ł', color: '#345d9d' }
];

let cachedPrices = {};
let lastFetchTime = 0;
const CACHE_DURATION = 60000;

async function fetchRealPrices() {
    const now = Date.now();
    if (cachedPrices && (now - lastFetchTime) < CACHE_DURATION && Object.keys(cachedPrices).length > 0) {
        return cachedPrices;
    }
    
    try {
        const ids = cryptoMapping.map(c => c.id).join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
        const response = await axios.get(url);
        const prices = response.data;
        
        const priceMap = {};
        cryptoMapping.forEach(crypto => {
            priceMap[crypto.symbol] = prices[crypto.id]?.usd || 0;
        });
        
        cachedPrices = priceMap;
        lastFetchTime = now;
        console.log('✅ Real prices updated');
        return priceMap;
    } catch (error) {
        console.error('Error fetching real prices:', error.message);
        if (Object.keys(cachedPrices).length === 0) {
            cryptoMapping.forEach(crypto => {
                cachedPrices[crypto.symbol] = crypto.symbol === 'BTC' ? 75000 : 
                                              crypto.symbol === 'ETH' ? 2300 : 
                                              crypto.symbol === 'BNB' ? 600 : 100;
            });
        }
        return cachedPrices;
    }
}

async function getCurrentPrice(symbol) {
    const prices = await fetchRealPrices();
    return prices[symbol] || 0;
}

// ============ REFERRAL FUNCTIONS ============

function generateReferralCode(userId, email) {
    const hash = crypto.createHash('md5')
        .update(userId + email + Date.now().toString())
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();
    return hash;
}

app.get('/api/referral/stats', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (!user.referralCode) {
            user.referralCode = generateReferralCode(userId, user.email);
            saveUsers();
        }
        
        const referredUsers = users.filter(u => u.referredBy === userId);
        
        const inviteLink = `${req.protocol}://${req.get('host')}/signup?ref=${user.referralCode}`;
        
        res.json({
            success: true,
            referral_code: user.referralCode,
            invite_link: inviteLink,
            total_referrals: user.totalReferrals || 0,
            completed_referrals: user.completedReferrals || 0,
            pending_referrals: user.pendingReferrals || 0,
            available_points: user.referralPoints || 0,
            total_points_earned: (user.totalPointsEarned || 0),
            points_converted: user.pointsConverted || 0,
            points_value_usd: ((user.referralPoints || 0) / POINTS_TO_DOLLAR_RATE).toFixed(2),
            conversion_rate: POINTS_TO_DOLLAR_RATE,
            referred_users: referredUsers.map(u => ({
                name: u.name,
                email: u.email,
                completed: u.referralBonusGiven === true,
                joinedAt: u.createdAt
            }))
        });
    } catch (error) {
        console.error('Referral stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/referral/generate-code', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const newCode = generateReferralCode(userId, user.email + Date.now());
        user.referralCode = newCode;
        saveUsers();
        
        res.json({ success: true, referral_code: newCode });
    } catch (error) {
        console.error('Generate code error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/referral/validate', async (req, res) => {
    try {
        const { referralCode } = req.body;
        if (!referralCode) {
            return res.json({ valid: false, message: 'No referral code provided' });
        }
        const referrer = users.find(u => u.referralCode === referralCode);
        if (!referrer) {
            return res.json({ valid: false, message: 'Invalid referral code' });
        }
        res.json({ valid: true, message: `Valid referral code from ${referrer.name}`, referrerName: referrer.name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/referral/convert-points', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const availablePoints = user.referralPoints || 0;
        
        if (availablePoints < POINTS_TO_DOLLAR_RATE) {
            return res.status(400).json({ success: false, message: `Need at least ${POINTS_TO_DOLLAR_RATE} points` });
        }
        
        const dollarsToAdd = Math.floor(availablePoints / POINTS_TO_DOLLAR_RATE);
        const pointsToDeduct = dollarsToAdd * POINTS_TO_DOLLAR_RATE;
        
        user.referralPoints -= pointsToDeduct;
        user.pointsConverted = (user.pointsConverted || 0) + pointsToDeduct;
        user.realBalance += dollarsToAdd;
        
        const conversionRecord = {
            id: referralTransactions.length + 1,
            userId: user.id,
            userName: user.name,
            pointsConverted: pointsToDeduct,
            dollarsAdded: dollarsToAdd,
            type: 'conversion',
            createdAt: new Date().toISOString()
        };
        referralTransactions.push(conversionRecord);
        saveReferrals();
        saveUsers();
        
        res.json({
            success: true,
            message: `Converted ${pointsToDeduct} points to $${dollarsToAdd}!`,
            pointsConverted: pointsToDeduct,
            dollarsAdded: dollarsToAdd,
            newRealBalance: user.realBalance,
            remainingPoints: user.referralPoints
        });
    } catch (error) {
        console.error('Convert points error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CRYPTO API ENDPOINTS ============

app.get('/api/crypto/list', async (req, res) => {
    const realPrices = await fetchRealPrices();
    const cryptos = cryptoMapping.map(crypto => ({
        symbol: crypto.symbol,
        name: crypto.name,
        icon: crypto.icon,
        color: crypto.color,
        currentPrice: realPrices[crypto.symbol] || 0
    }));
    res.json({ cryptos });
});

app.get('/api/crypto/price/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const price = await getCurrentPrice(symbol);
    const crypto = cryptoMapping.find(c => c.symbol === symbol);
    res.json({
        symbol,
        name: crypto?.name || symbol,
        price,
        icon: crypto?.icon || '💰',
        color: crypto?.color || '#fff'
    });
});

// ============ FIXED USER SYSTEM ============

app.post('/api/signup', async (req, res) => {
    console.log('📝 Signup attempt:', req.body.email);
    const { name, email, password, withdrawPin, phone, referralCode } = req.body;
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'User already exists' });
    }
    
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const hashedPin = await bcrypt.hash(withdrawPin || '123456', SALT_ROUNDS);
    
    let referrerId = null;
    let referralValid = false;
    
    if (referralCode) {
        const referrer = users.find(u => u.referralCode === referralCode);
        if (referrer && referrer.email !== email) {
            referrerId = referrer.id;
            referralValid = true;
            console.log(`✅ Valid referral code from ${referrer.name}`);
        }
    }
    
    // Generate unique ID
    const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
    
    const newUser = {
        id: newId,
        name,
        email,
        phone: phone || '',
        password: hashedPassword,
        withdrawPin: hashedPin,
        demoBalance: 10000,
        demoTotalTrades: 0,
        demoTotalProfit: 0,
        demoWins: 0,
        demoLosses: 0,
        realBalance: 0,
        realTotalDeposits: 0,
        realTotalWithdrawals: 0,
        realTotalTrades: 0,
        realTotalProfit: 0,
        realWins: 0,
        realLosses: 0,
        isVerified: true,
        accountType: 'Standard',
        createdAt: new Date().toISOString(),
        activeMode: 'demo',
        referralCode: null, // Will set after push
        referredBy: referrerId,
        referralPoints: 0,
        totalPointsEarned: 0,
        pointsConverted: 0,
        totalReferrals: 0,
        completedReferrals: 0,
        pendingReferrals: 0,
        referralBonusGiven: false
    };
    
    // Add to users array
    users.push(newUser);
    console.log(`📝 User added to array. Total users in memory: ${users.length}`);
    
    // Generate referral code after user has ID
    newUser.referralCode = generateReferralCode(newUser.id, newUser.email);
    
    let referralMessagesAdded = false;
    
    // NEW REFERRAL SYSTEM: 50 points on signup for BOTH
    if (referralValid && referrerId) {
        const referrer = users.find(u => u.id === referrerId);
        if (referrer) {
            referrer.totalReferrals = (referrer.totalReferrals || 0) + 1;
            referrer.pendingReferrals = (referrer.pendingReferrals || 0) + 1;
            
            // Give referrer 50 points immediately
            referrer.referralPoints = (referrer.referralPoints || 0) + 50;
            referrer.totalPointsEarned = (referrer.totalPointsEarned || 0) + 50;
            
            messages.push({
                id: messages.length + 1,
                userId: referrer.id,
                userName: 'System',
                text: `🎉 ${name} signed up using your referral code! You earned 50 points! You'll get another 50 points when they complete their first REAL trade!`,
                sender: 'admin',
                timestamp: new Date().toISOString(),
                read: false,
                adminRead: true
            });
            referralMessagesAdded = true;
        }
    }
    
    if (referralValid) {
        // Give new user 50 points immediately
        newUser.referralPoints = 50;
        newUser.totalPointsEarned = 50;
        
        messages.push({
            id: messages.length + 1,
            userId: newUser.id,
            userName: 'System',
            text: `🎉 Welcome! You've received 50 referral bonus points! You'll get another 50 points when you complete your first REAL trade!`,
            sender: 'admin',
            timestamp: new Date().toISOString(),
            read: false,
            adminRead: true
        });
        referralMessagesAdded = true;
    }
    
    if (referralMessagesAdded) {
        saveMessages();
    }
    
    // CRITICAL: Save users immediately after adding
    const userSaved = saveUsers();
    if (!userSaved) {
        console.error('❌ CRITICAL: Failed to save user!');
        return res.status(500).json({ message: 'Unable to save new user' });
    }
    
    console.log('✅ User created successfully!');
    console.log(`   Name: ${newUser.name}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Total users now: ${users.length}`);
    
    res.json({ 
        message: referralValid ? 'Account created! You received 50 referral points!' : 'Account created successfully!',
        user: {
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            accountType: newUser.accountType,
            createdAt: newUser.createdAt,
            referralPoints: newUser.referralPoints
        }
    });
});

app.post('/api/login', async (req, res) => {
    console.log('🔑 Login attempt:', req.body.email);
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    
    const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : 'N/A';
    
    console.log('✅ Login successful for:', email);
    
    res.json({
        token,
        message: 'Login successful',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || 'Not provided',
            accountType: user.accountType || 'Standard',
            memberSince: memberSince,
            demoBalance: user.demoBalance,
            realBalance: user.realBalance,
            activeMode: user.activeMode,
            referralPoints: user.referralPoints || 0,
            referralCode: user.referralCode
        }
    });
});

app.get('/api/user/data', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'N/A';
        
        res.json({
            name: user.name,
            email: user.email,
            phone: user.phone || 'Not provided',
            accountType: user.accountType || 'Standard',
            memberSince: memberSince,
            demoBalance: user.demoBalance,
            realBalance: user.realBalance,
            activeMode: user.activeMode || 'demo',
            isVerified: user.isVerified,
            realTotalTrades: user.realTotalTrades || 0,
            realTotalProfit: user.realTotalProfit || 0,
            realWins: user.realWins || 0,
            realLosses: user.realLosses || 0,
            referralCode: user.referralCode,
            referralPoints: user.referralPoints || 0,
            totalPointsEarned: user.totalPointsEarned || 0,
            pointsConverted: user.pointsConverted || 0,
            totalReferrals: user.totalReferrals || 0,
            completedReferrals: user.completedReferrals || 0
        });
    } catch (error) {
        console.error('User data error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const balance = user.activeMode === 'demo' ? user.demoBalance : user.realBalance;
        res.json({ balance, mode: user.activeMode || 'demo' });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/switch-mode', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const { mode } = req.body;
        
        user.activeMode = mode;
        const balance = mode === 'demo' ? user.demoBalance : user.realBalance;
        
        res.json({
            message: `Switched to ${mode.toUpperCase()} mode`,
            activeMode: mode,
            balance: balance
        });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// ============ PROFILE / SETTINGS SYSTEM ============

app.get('/api/user/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'N/A';
        
        res.json({
            name: user.name || 'N/A',
            email: user.email || 'N/A',
            phone: user.phone || 'Not provided',
            accountType: user.accountType || 'Standard',
            memberSince: memberSince,
            isVerified: user.isVerified || false
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/user/update-profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const { name, phone } = req.body;
        if (name) user.name = name;
        if (phone) user.phone = phone;
        saveUsers();
        
        res.json({ message: 'Profile updated successfully', user: { name: user.name, email: user.email, phone: user.phone || 'Not provided' } });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/user/change-password', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const { currentPassword, newPassword } = req.body;
        
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        user.password = hashedPassword;
        saveUsers();
        
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/user/change-pin', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const { currentPIN, newPIN } = req.body;
        
        const validPIN = await bcrypt.compare(currentPIN, user.withdrawPin);
        if (!validPIN) {
            return res.status(400).json({ message: 'Current PIN is incorrect' });
        }
        
        if (!/^\d{6}$/.test(newPIN)) {
            return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
        }
        
        const hashedPIN = await bcrypt.hash(newPIN, SALT_ROUNDS);
        user.withdrawPin = hashedPIN;
        saveUsers();
        
        res.json({ message: 'PIN changed successfully' });
    } catch (error) {
        console.error('PIN change error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/user/verify-pin', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const { pin } = req.body;
        
        const validPIN = await bcrypt.compare(pin, user.withdrawPin);
        res.json({ valid: validPIN, message: validPIN ? 'PIN verified' : 'Invalid PIN' });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// ============ TRADE ENDPOINT - NO PIN REQUIRED ============

app.post('/api/trade', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const { amount, direction, priceAtTrade, crypto, exitPrice, changePercent, duration, won } = req.body;
        
        console.log('📥 Received trade request:', {
            amount, direction, crypto, duration,
            won: won, wonType: typeof won,
            priceAtTrade, exitPrice
        });
        
        if (!amount || !direction || !crypto) {
            return res.status(400).json({ message: 'Missing required trade fields' });
        }
        
        const currentMode = user.activeMode || 'demo';
        let currentBalance = currentMode === 'demo' ? user.demoBalance : user.realBalance;
        
        if (amount > currentBalance) {
            return res.status(400).json({ 
                message: 'Insufficient balance', 
                balance: currentBalance,
                required: amount 
            });
        }
        
        let isWin = false;
        if (won === true || won === 'true' || won === 1 || won === '1') {
            isWin = true;
        }
        
        let balanceChange = 0;
        if (isWin) {
            balanceChange = amount * TRADE_PAYOUT_PERCENTAGE;
        } else {
            balanceChange = -amount;
        }
        
        const oldBalance = currentBalance;
        
        if (currentMode === 'demo') {
            user.demoBalance += balanceChange;
            user.demoTotalTrades = (user.demoTotalTrades || 0) + 1;
            if (isWin) {
                user.demoWins = (user.demoWins || 0) + 1;
            } else {
                user.demoLosses = (user.demoLosses || 0) + 1;
            }
            user.demoTotalProfit = (user.demoTotalProfit || 0) + balanceChange;
        } else {
            user.realBalance += balanceChange;
            user.realTotalTrades = (user.realTotalTrades || 0) + 1;
            if (isWin) {
                user.realWins = (user.realWins || 0) + 1;
            } else {
                user.realLosses = (user.realLosses || 0) + 1;
            }
            user.realTotalProfit = (user.realTotalProfit || 0) + balanceChange;
        }
        
        const newBalance = currentMode === 'demo' ? user.demoBalance : user.realBalance;
        
        const newTrade = {
            id: trades.length + 1,
            userId: user.id,
            userName: user.name,
            mode: currentMode,
            crypto: crypto,
            amount: Number(amount),
            direction: direction,
            won: isWin,
            result: isWin ? 'WIN' : 'LOSS',
            profit: balanceChange,
            stake: Number(amount),
            entryPrice: Number(priceAtTrade || currentBalance),
            exitPrice: Number(exitPrice || priceAtTrade || currentBalance),
            changePercent: Number(changePercent || 0),
            duration: duration || '1min',
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        
        trades.push(newTrade);
        
        saveTrades();
        saveUsers();
        
        console.log(`═══════════════════════════════════════════════`);
        console.log(`✅ TRADE SAVED for ${user.name}`);
        console.log(`   Mode: ${currentMode.toUpperCase()}`);
        console.log(`   Amount: $${amount}`);
        console.log(`   Direction: ${direction}`);
        console.log(`   Result: ${isWin ? 'WIN ✅' : 'LOSS ❌'}`);
        console.log(`   Balance Change: ${balanceChange >= 0 ? '+' : ''}$${balanceChange.toFixed(2)}`);
        console.log(`   Old Balance: $${oldBalance.toFixed(2)}`);
        console.log(`   New Balance: $${newBalance.toFixed(2)}`);
        console.log(`   Trade ID: ${newTrade.id}`);
        console.log(`═══════════════════════════════════════════════`);
        
        // NEW REFERRAL SYSTEM: Additional 50 points on first REAL trade
        const userRealTradesCount = trades.filter(t => t.userId === user.id && t.mode === 'real').length;
        if (userRealTradesCount === 1 && user.referredBy && !user.referralBonusGiven) {
            user.referralBonusGiven = true;
            user.completedReferrals = (user.completedReferrals || 0) + 1;
            
            const referrer = users.find(u => u.id === user.referredBy);
            if (referrer) {
                // Give referrer additional 50 points for first REAL trade
                referrer.referralPoints = (referrer.referralPoints || 0) + 50;
                referrer.totalPointsEarned = (referrer.totalPointsEarned || 0) + 50;
                referrer.completedReferrals = (referrer.completedReferrals || 0) + 1;
                referrer.pendingReferrals = Math.max(0, (referrer.pendingReferrals || 0) - 1);
                
                messages.push({
                    id: messages.length + 1,
                    userId: referrer.id,
                    userName: 'System',
                    text: `🎉 Your referral ${user.name} completed their first REAL trade! You earned 50 additional points! Total earned from this referral: 100 points!`,
                    sender: 'admin',
                    timestamp: new Date().toISOString(),
                    read: false,
                    adminRead: true
                });
                saveMessages();
                saveUsers();
            }
            
            // Give new user additional 50 points for first REAL trade
            user.referralPoints = (user.referralPoints || 0) + 50;
            user.totalPointsEarned = (user.totalPointsEarned || 0) + 50;
            saveUsers();
            
            messages.push({
                id: messages.length + 1,
                userId: user.id,
                userName: 'System',
                text: `🎉 Congratulations on your first REAL trade! You earned 50 additional points! Total referral points: 100! Keep trading to earn more!`,
                sender: 'admin',
                timestamp: new Date().toISOString(),
                read: false,
                adminRead: true
            });
            saveMessages();
        }
        
        res.json({
            success: true,
            won: isWin,
            profit: balanceChange,
            newBalance: newBalance,
            stake: amount,
            tradeId: newTrade.id,
            message: isWin ? `🎉 WIN! +$${balanceChange.toFixed(2)}` : `😞 LOSS! -$${amount.toFixed(2)}`
        });
        
    } catch (error) {
        console.error('❌ Trade error:', error);
        res.status(500).json({ 
            message: 'Server error processing trade', 
            error: error.message 
        });
    }
});

app.get('/api/trades', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userTrades = trades.filter(t => t.userId === decoded.userId);
        console.log('📊 Fetching trades for user', decoded.userId, ':', userTrades.length, 'trades found');
        res.json({ trades: userTrades });
    } catch (error) {
        console.log('❌ Trades error:', error.message);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/stats', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const userTrades = trades.filter(t => t.userId === decoded.userId);
        
        const totalTrades = userTrades.length;
        const wins = userTrades.filter(t => t.won === true).length;
        const losses = totalTrades - wins;
        const winRate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : 0;
        const netProfit = userTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        res.json({
            totalTrades,
            wins,
            losses,
            winRate: parseFloat(winRate),
            netProfit,
            balance: user.activeMode === 'demo' ? user.demoBalance : user.realBalance,
            mode: user.activeMode
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/debug/user-stats', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const userTrades = trades.filter(t => t.userId === decoded.userId);
        
        let totalStake = 0;
        let totalProfit = 0;
        let wins = 0;
        let losses = 0;
        
        userTrades.forEach(t => {
            totalStake += t.amount || 0;
            if (t.won) {
                wins++;
                totalProfit += t.profit || 0;
            } else {
                losses++;
                totalProfit += t.profit || 0;
            }
        });
        
        res.json({
            userId: user.id,
            name: user.name,
            mode: user.activeMode,
            demoBalance: user.demoBalance,
            realBalance: user.realBalance,
            stats: {
                totalTrades: userTrades.length,
                wins: wins,
                losses: losses,
                winRate: userTrades.length > 0 ? (wins / userTrades.length * 100).toFixed(1) : 0,
                totalStake: totalStake,
                totalProfit: totalProfit,
                netResult: totalProfit
            },
            recentTrades: userTrades.slice(-5).map(t => ({
                amount: t.amount,
                won: t.won,
                profit: t.profit,
                result: t.result,
                timestamp: t.timestamp
            }))
        });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token', error: error.message });
    }
});

// ============ CHAT & MESSAGES ============

app.get('/api/messages', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userMessages = messages.filter(m => m.userId === decoded.userId || m.userId === 'admin');
        res.json({ messages: userMessages });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/send-message', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const { text } = req.body;
        
        const newMessage = {
            id: messages.length + 1,
            userId: decoded.userId,
            userName: user ? user.name : 'User',
            text: text,
            hasImage: false,
            sender: 'user',
            timestamp: new Date().toISOString(),
            read: true,
            adminRead: false
        };
        
        messages.push(newMessage);
        saveMessages();
        res.json({ message: 'Message sent', data: newMessage });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        const imageMessage = {
            id: messages.length + 1,
            userId: decoded.userId,
            userName: user ? user.name : 'User',
            text: `📷 Image: ${req.file.filename}`,
            imageUrl: imageUrl,
            hasImage: true,
            sender: 'user',
            timestamp: new Date().toISOString(),
            read: true,
            adminRead: false
        };
        messages.push(imageMessage);
        saveMessages();
        res.json({ message: 'Image uploaded', imageUrl });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/messages/unread-count', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const unreadCount = messages.filter(m => m.userId === decoded.userId && m.sender === 'admin' && !m.read).length;
        res.json({ unreadCount });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/messages/mark-read', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { messageIds } = req.body;
        
        messages.forEach(msg => {
            if (messageIds.includes(msg.id) && msg.userId === decoded.userId && msg.sender === 'admin') {
                msg.read = true;
            }
        });
        saveMessages();
        
        res.json({ message: 'Messages marked as read' });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.post('/api/admin/reply', async (req, res) => {
    const { userId, text, adminName } = req.body;
    
    const adminReply = {
        id: messages.length + 1,
        userId: userId,
        userName: adminName || 'Support',
        text: text,
        hasImage: false,
        sender: 'admin',
        timestamp: new Date().toISOString(),
        read: false,
        adminRead: true
    };
    
    messages.push(adminReply);
    saveMessages();
    
    res.json({ message: 'Reply sent', data: adminReply });
});

app.get('/api/admin/messages/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const userMessages = messages.filter(m => m.userId === userId || m.userId === 'admin');
    userMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json({ messages: userMessages });
});

app.post('/api/messages/mark-admin-read', async (req, res) => {
    const { userId } = req.body;
    
    try {
        let markedCount = 0;
        messages.forEach(msg => {
            if (msg.userId === userId && msg.sender === 'user' && !msg.adminRead) {
                msg.adminRead = true;
                markedCount++;
            }
        });
        saveMessages();
        console.log(`📖 Marked ${markedCount} messages as read for user ${userId}`);
        res.json({ message: `${markedCount} messages marked as read` });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ message: 'Error marking messages as read' });
    }
});

app.get('/api/admin/users', async (req, res) => {
    res.json({ users: users.map(u => ({ 
        id: u.id, 
        name: u.name, 
        email: u.email, 
        demoBalance: u.demoBalance, 
        realBalance: u.realBalance,
        referralPoints: u.referralPoints || 0,
        totalReferrals: u.totalReferrals || 0 
    })) });
});

// ============ ONLINE STATUS ============

app.post('/api/user/heartbeat', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        onlineUsers.set(decoded.userId, { status: 'online', lastSeen: new Date().toISOString() });
        res.json({ status: 'online' });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/admin/users-with-status', async (req, res) => {
    const usersWithStatus = users.map(u => {
        const userStatus = onlineUsers.get(u.id);
        const isOnline = userStatus && (Date.now() - new Date(userStatus.lastSeen).getTime()) < 60000;
        
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            demoBalance: u.demoBalance,
            realBalance: u.realBalance,
            status: isOnline ? 'online' : 'offline',
            lastSeen: userStatus?.lastSeen || u.createdAt,
            referralPoints: u.referralPoints || 0,
            totalReferrals: u.totalReferrals || 0
        };
    });
    res.json({ users: usersWithStatus });
});

// ============ DEPOSIT SYSTEM ============

app.post('/api/deposit/request', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const { amount, method } = req.body;
        
        if (!amount || amount < 10) return res.status(400).json({ message: 'Minimum deposit is $10' });
        if (amount > 10000) return res.status(400).json({ message: 'Maximum deposit is $10,000' });
        
        const depositRequest = {
            id: deposits.length + 1,
            userId: user.id,
            userName: user.name,
            amount: amount,
            method: method,
            status: 'pending',
            notified: false,
            createdAt: new Date().toISOString(),
            transactionId: 'DEP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase()
        };
        deposits.push(depositRequest);
        saveDeposits();
        
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: user.name,
            text: `💰 DEPOSIT REQUEST: $${amount} via ${method}. Waiting for admin approval.`,
            sender: 'user',
            timestamp: new Date().toISOString(),
            read: true,
            adminRead: false
        });
        saveMessages();
        
        res.json({ message: `Deposit request submitted! Admin will approve your deposit of $${amount}.`, deposit: depositRequest });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/deposit/history', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userDeposits = deposits.filter(d => d.userId === decoded.userId);
        res.json({ deposits: userDeposits });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/admin/deposits', async (req, res) => {
    res.json({ deposits });
});

app.post('/api/admin/deposit/approve', async (req, res) => {
    const { depositId } = req.body;
    const deposit = deposits.find(d => d.id === depositId);
    if (!deposit) return res.status(404).json({ message: 'Deposit not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ message: 'Deposit already processed' });
    
    deposit.status = 'approved';
    deposit.approvedAt = new Date().toISOString();
    deposit.notified = false;
    saveDeposits();
    
    const user = users.find(u => u.id === deposit.userId);
    if (user) {
        user.realBalance += deposit.amount;
        user.realTotalDeposits = (user.realTotalDeposits || 0) + deposit.amount;
        saveUsers();
        
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: 'Admin',
            text: `✅ Your deposit of $${deposit.amount} has been APPROVED and added to your Real account balance!`,
            sender: 'admin',
            timestamp: new Date().toISOString(),
            read: false,
            adminRead: true
        });
        saveMessages();
    }
    
    res.json({ message: `Deposit of $${deposit.amount} approved!`, deposit });
});

app.post('/api/admin/deposit/reject', async (req, res) => {
    const { depositId, reason } = req.body;
    const deposit = deposits.find(d => d.id === depositId);
    if (!deposit) return res.status(404).json({ message: 'Deposit not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ message: 'Deposit already processed' });
    
    deposit.status = 'rejected';
    deposit.rejectedAt = new Date().toISOString();
    deposit.rejectionReason = reason || 'No reason provided';
    saveDeposits();
    
    const user = users.find(u => u.id === deposit.userId);
    if (user) {
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: 'Admin',
            text: `❌ Your deposit of $${deposit.amount} has been REJECTED. Reason: ${reason || 'No reason provided'}`,
            sender: 'admin',
            timestamp: new Date().toISOString(),
            read: false,
            adminRead: true
        });
        saveMessages();
    }
    
    res.json({ message: 'Deposit rejected', deposit });
});

// ============ WITHDRAWAL SYSTEM ============

app.post('/api/withdraw/request', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        const { amount, walletAddress, pin } = req.body;
        
        const validPin = await bcrypt.compare(pin, user.withdrawPin);
        if (!validPin) return res.status(400).json({ message: 'Invalid PIN' });
        if (!amount || amount < 10) return res.status(400).json({ message: 'Minimum withdrawal is $10' });
        if (amount > 10000) return res.status(400).json({ message: 'Maximum withdrawal is $10,000' });
        if (amount > user.realBalance) return res.status(400).json({ message: 'Insufficient real balance' });
        if (!walletAddress) return res.status(400).json({ message: 'Wallet address is required' });
        
        const withdrawRequest = {
            id: withdrawals.length + 1,
            userId: user.id,
            userName: user.name,
            amount: amount,
            walletAddress: walletAddress,
            status: 'pending',
            notified: false,
            createdAt: new Date().toISOString(),
            transactionId: 'WTD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase()
        };
        withdrawals.push(withdrawRequest);
        user.realBalance -= amount;
        user.realTotalWithdrawals = (user.realTotalWithdrawals || 0) + amount;
        saveUsers();
        saveWithdrawals();
        
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: user.name,
            text: `💸 WITHDRAWAL REQUEST: $${amount} to ${walletAddress}. Waiting for admin processing.`,
            sender: 'user',
            timestamp: new Date().toISOString(),
            read: true,
            adminRead: false
        });
        saveMessages();
        
        res.json({ message: `Withdrawal request of $${amount} submitted!`, withdrawal: withdrawRequest });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/withdraw/history', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userWithdrawals = withdrawals.filter(w => w.userId === decoded.userId);
        res.json({ withdrawals: userWithdrawals });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/admin/withdrawals', async (req, res) => {
    res.json({ withdrawals });
});

app.post('/api/admin/withdraw/complete', async (req, res) => {
    const { withdrawalId, transactionHash } = req.body;
    const withdrawal = withdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Withdrawal already processed' });
    
    withdrawal.status = 'completed';
    withdrawal.completedAt = new Date().toISOString();
    withdrawal.transactionHash = transactionHash || 'Completed';
    withdrawal.notified = false;
    saveWithdrawals();
    
    const user = users.find(u => u.id === withdrawal.userId);
    if (user) {
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: 'Admin',
            text: `✅ Your withdrawal of $${withdrawal.amount} has been COMPLETED!`,
            sender: 'admin',
            timestamp: new Date().toISOString(),
            read: false,
            adminRead: true
        });
        saveMessages();
    }
    
    res.json({ message: 'Withdrawal completed', withdrawal });
});

app.post('/api/admin/withdraw/reject', async (req, res) => {
    const { withdrawalId, reason } = req.body;
    const withdrawal = withdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Withdrawal already processed' });
    
    withdrawal.status = 'rejected';
    withdrawal.rejectedAt = new Date().toISOString();
    withdrawal.rejectionReason = reason || 'No reason provided';
    saveWithdrawals();
    
    const user = users.find(u => u.id === withdrawal.userId);
    if (user) {
        user.realBalance += withdrawal.amount;
        saveUsers();
        messages.push({
            id: messages.length + 1,
            userId: user.id,
            userName: 'Admin',
            text: `❌ Your withdrawal of $${withdrawal.amount} has been REJECTED. Reason: ${reason || 'No reason provided'}. Funds have been refunded.`,
            sender: 'admin',
            timestamp: new Date().toISOString(),
            read: false,
            adminRead: true
        });
        saveMessages();
    }
    
    res.json({ message: 'Withdrawal rejected, funds refunded', withdrawal });
});

// ============ TRANSACTIONS ============

app.get('/api/transactions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        
        const userDeposits = deposits.filter(d => d.userId === userId).map(d => ({
            type: 'deposit',
            amount: d.amount,
            status: d.status,
            createdAt: d.createdAt,
            transactionId: d.transactionId
        }));
        
        const userWithdrawals = withdrawals.filter(w => w.userId === userId).map(w => ({
            type: 'withdrawal',
            amount: w.amount,
            status: w.status,
            createdAt: w.createdAt,
            transactionId: w.transactionId
        }));
        
        const userTrades = trades.filter(t => t.userId === userId).map(t => ({
            type: 'trade',
            action: 'updown',
            symbol: t.crypto,
            amount: t.amount,
            direction: t.direction,
            won: t.won,
            profit: t.profit,
            createdAt: t.createdAt
        }));
        
        const all = [...userDeposits, ...userWithdrawals, ...userTrades];
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const totalDeposits = userDeposits.filter(d => d.status === 'approved').reduce((sum, d) => sum + d.amount, 0);
        const totalWithdrawals = userWithdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0);
        const totalTrades = userTrades.length;
        const totalProfit = userTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        res.json({
            transactions: all,
            summary: { totalDeposits, totalWithdrawals, totalTrades, totalProfit }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.get('/api/referral/invite-link', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const inviteLink = `${req.protocol}://${req.get('host')}/index.html?ref=${user.referralCode}`;
        res.json({ success: true, invite_link: inviteLink });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== CHECK AUTH ENDPOINT ==========
app.get('/api/check-auth', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint to check users.json format
app.get('/api/debug/users-format', (req, res) => {
    try {
        const data = fs.readFileSync(usersFile, 'utf8');
        const parsed = JSON.parse(data);
        res.json({
            isArray: Array.isArray(parsed),
            length: Array.isArray(parsed) ? parsed.length : 1,
            format: Array.isArray(parsed) ? 'array' : 'object',
            sample: Array.isArray(parsed) ? parsed[0] : parsed
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Safety auto-save every 30 seconds
setInterval(() => {
    if (users.length > 0) {
        saveUsers();
        console.log('🔄 Auto-saved users (safety backup)');
    }
}, 30000);

// Save on process exit
process.on('SIGINT', () => {
    console.log('📝 Saving data before shutdown...');
    saveUsers();
    saveTrades();
    saveMessages();
    saveDeposits();
    saveWithdrawals();
    saveReferrals();
    process.exit();
});
// ============ DELETE USER ENDPOINT ============
app.delete('/api/admin/delete-user/:userId', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if admin (you can add proper admin check)
        // For now, allow any authenticated user or hardcode email check
        const adminUser = users.find(u => u.id === decoded.userId);
        if (!adminUser || adminUser.email !== 'sa@gmail.com') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        
        const userId = parseInt(req.params.userId);
        let usersList = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        
        // Find user to delete
        const userToDelete = usersList.find(u => u.id === userId);
        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Don't allow deleting the main admin
        if (userToDelete.email === 'sa@gmail.com') {
            return res.status(403).json({ message: 'Cannot delete main admin account' });
        }
        
        // Remove user
        usersList = usersList.filter(u => u.id !== userId);
        
        // Reorder IDs
        usersList = usersList.map((u, index) => ({ ...u, id: index + 1 }));
        
        // Save to file
        fs.writeFileSync(usersFile, JSON.stringify(usersList, null, 2));
        
        // Also remove user's trades (optional)
        let allTrades = [];
        if (fs.existsSync(tradesFile)) {
            allTrades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
            allTrades = allTrades.filter(t => t.userId !== userId);
            fs.writeFileSync(tradesFile, JSON.stringify(allTrades, null, 2));
        }
        
        console.log(`🗑️ User deleted: ${userToDelete.name} (${userToDelete.email})`);
        
        res.json({ 
            success: true, 
            message: `User ${userToDelete.name} deleted successfully`,
            remainingUsers: usersList.length
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
});

// Get all users with details (for admin)
app.get('/api/admin/all-users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const adminUser = users.find(u => u.id === decoded.userId);
        
        if (!adminUser || adminUser.email !== 'sa@gmail.com') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        
        const usersList = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        res.json({ users: usersList });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});
// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Total users: ${users.length}`);
    console.log(`🪙 Real crypto prices enabled`);
    console.log(`🎁 Referral system enabled (${POINTS_TO_DOLLAR_RATE} points = $1)`);
    console.log(`📈 Trade payout: ${TRADE_PAYOUT_PERCENTAGE * 100}% on wins`);
    console.log(`💾 Data saved to JSON files`);
    console.log(`📁 Users file path: ${usersFile}`);
    fetchRealPrices();
});