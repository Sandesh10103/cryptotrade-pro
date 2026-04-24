const fs = require('fs');
const path = require('path');

const usersFile = path.join(__dirname, 'server/data/users.json');

console.log('=== TESTING USER SAVE ===\n');

// Read current file
let users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

// Ensure it's an array
if (!Array.isArray(users)) {
    console.log('Converting to array...');
    users = [users];
}

console.log('Current users:', users.length);
console.log('Users:', users.map(u => u.name).join(', '));

// Add a test user
const testUser = {
    id: users.length + 1,
    name: 'test_' + Date.now(),
    email: 'test_' + Date.now() + '@test.com',
    password: 'hashed',
    withdrawPin: 'hashed',
    demoBalance: 10000,
    realBalance: 0,
    createdAt: new Date().toISOString(),
    referralCode: 'TEST123',
    referralPoints: 0
};

users.push(testUser);
console.log('\n✅ Added test user:', testUser.name);
console.log('New users count:', users.length);

// Save to file
fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
console.log('✅ Saved to file');

// Verify
const verify = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
console.log('\n=== VERIFICATION ===');
console.log('File is array:', Array.isArray(verify));
console.log('Total users in file:', verify.length);
console.log('Users:', verify.map(u => u.name).join(', '));

// Clean up - remove test user
console.log('\n=== CLEANING UP ===');
const cleaned = verify.filter(u => !u.name.startsWith('test_'));
fs.writeFileSync(usersFile, JSON.stringify(cleaned, null, 2));
console.log('Removed test user');
console.log('Final users count:', cleaned.length);
console.log('Final users:', cleaned.map(u => u.name).join(', '));
