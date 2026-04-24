// server/referral.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Generate unique referral code
function generateReferralCode(userId) {
    return crypto.createHash('md5')
        .update(userId + Date.now().toString())
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();
}

// Setup referral routes
function setupReferralRoutes(app) {
    
    // Get referral stats
    app.get('/api/referral/stats', async (req, res) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ message: 'No token' });
            
            const decoded = jwt.verify(token, 'your_secret_key_change_this');
            const userId = decoded.userId;
            
            const user = global.users.find(u => u.id === userId);
            
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            // Generate referral code if not exists
            if (!user.referralCode) {
                const code = generateReferralCode(userId);
                user.referralCode = code;
            }
            
            res.json({
                success: true,
                stats: {
                    total_referrals: user.totalReferrals || 0,
                    completed_referrals: user.completedReferrals || 0,
                    pending_referrals: user.pendingReferrals || 0,
                    total_points_earned: user.referralPoints || 0
                },
                referral_code: user.referralCode || ''
            });
        } catch (error) {
            console.error('Referral stats error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Generate referral code
    app.post('/api/referral/generate-code', async (req, res) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ message: 'No token' });
            
            const decoded = jwt.verify(token, 'your_secret_key_change_this');
            const userId = decoded.userId;
            
            const user = global.users.find(u => u.id === userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            const code = generateReferralCode(userId);
            user.referralCode = code;
            
            res.json({ success: true, referral_code: code });
        } catch (error) {
            console.error('Generate code error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

module.exports = { setupReferralRoutes };