const axios = require('axios');

async function testSignup() {
    console.log('=== TESTING SIGNUP API ===\n');
    
    const userData = {
        name: 'apitest_' + Date.now(),
        email: 'apitest_' + Date.now() + '@test.com',
        password: '123456',
        withdrawPin: '123456'
    };
    
    console.log('Sending:', userData);
    
    try {
        const response = await axios.post('http://localhost:5000/api/signup', userData);
        console.log('\n✅ Response:', response.data);
        
        // Check if user was saved
        const fs = require('fs');
        const users = JSON.parse(fs.readFileSync('server/data/users.json', 'utf8'));
        console.log('\n📊 Total users in file:', users.length);
        console.log('Users:', users.map(u => u.name).join(', '));
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testSignup();
