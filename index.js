const PostgreSQLProxy = require('./postgresProxy');
const AdminPortal = require('./adminPortal');

class InterceptorApp {
    constructor() {
        this.proxy = new PostgreSQLProxy(5432, 'localhost', 5433);
        this.adminPortal = new AdminPortal(3001);
    }

    async start() {
        try {
            console.log('Starting PostgreSQL Interceptor...');
            
            // Start the admin portal
            await this.adminPortal.start();
            console.log('✓ Admin portal started on http://localhost:3001');
            
            // Start the PostgreSQL proxy
            await this.proxy.start();
            console.log('✓ PostgreSQL proxy started on port 5432');
            
            console.log('\n=== PostgreSQL Interceptor Started Successfully ===');
            console.log('📊 Admin Portal: http://localhost:3001');
            console.log('🔌 Proxy Port: 5432 (clients connect here)');
            console.log('🗄️  Database Port: 5433 (actual PostgreSQL)');
            console.log('📦 Redis: localhost:6379');
            console.log('\nTo connect with a PostgreSQL client:');
            console.log('Host: localhost');
            console.log('Port: 5432');
            console.log('Database: testdb');
            console.log('User: postgres');
            console.log('Password: password123');
            
        } catch (error) {
            console.error('Failed to start interceptor:', error);
            process.exit(1);
        }
    }

    async stop() {
        console.log('Stopping PostgreSQL Interceptor...');
        await this.proxy.stop();
        await this.adminPortal.stop();
        console.log('✓ Interceptor stopped');
    }
}

// Handle graceful shutdown
const app = new InterceptorApp();

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await app.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await app.stop();
    process.exit(0);
});

// Start the application
if (require.main === module) {
    app.start().catch(error => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}

module.exports = InterceptorApp;
