const { Client } = require('pg');

async function testQueries() {
    const client = new Client({
        host: 'localhost',
        port: 5432, // Connect to proxy
        database: 'testdb',
        user: 'testuser',
        password: 'testpass@123'
    });

    try {
        await client.connect();
        console.log('✓ Connected to PostgreSQL proxy');

        // Test safe query (should execute immediately)
        console.log('\n1. Testing safe query...');
        const safeResult = await client.query('SELECT COUNT(*) as user_count FROM users');
        console.log('✓ Safe query result:', safeResult.rows[0]);

        // Test dangerous query (should be queued for approval)
        console.log('\n2. Testing dangerous query...');
        try {
            await client.query("INSERT INTO users (name, email) VALUES ('Test User', 'test@test.com')");
        } catch (error) {
            console.log('→ Dangerous query response:', error.message);
        }

        console.log('\n3. Testing another dangerous query...');
        try {
            await client.query('DELETE FROM users WHERE email = \'test@test.com\'');
        } catch (error) {
            console.log('→ Dangerous query response:', error.message);
        }

        console.log('\n✓ Test completed. Check the admin portal at http://localhost:3001 to approve queries.');

    } catch (error) {
        console.error('✗ Test failed:', error.message);
    } finally {
        await client.end();
    }
}

// Run the test
if (require.main === module) {
    testQueries().catch(console.error);
}

module.exports = testQueries;
