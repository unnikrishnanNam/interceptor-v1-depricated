const express = require('express');
const QueryStorage = require('./queryStorage');

class AdminPortal {
    constructor(port = 3001) {
        this.app = express();
        this.port = port;
        this.queryStorage = new QueryStorage();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // CORS middleware for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            next();
        });

        // Logging middleware
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'OK', timestamp: new Date().toISOString() });
        });

        // Get all queries
        this.app.get('/queries', async (req, res) => {
            try {
                const queries = await this.queryStorage.getAllQueries();
                res.json({
                    success: true,
                    data: queries,
                    count: queries.length
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get pending queries
        this.app.get('/queries/pending', async (req, res) => {
            try {
                const queries = await this.queryStorage.getPendingQueries();
                res.json({
                    success: true,
                    data: queries,
                    count: queries.length
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get specific query
        this.app.get('/queries/:id', async (req, res) => {
            try {
                const query = await this.queryStorage.getQuery(req.params.id);
                if (!query) {
                    return res.status(404).json({
                        success: false,
                        error: 'Query not found'
                    });
                }
                res.json({
                    success: true,
                    data: query
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Approve query
        this.app.post('/queries/:id/approve', async (req, res) => {
            try {
                const query = await this.queryStorage.approveQuery(req.params.id);
                res.json({
                    success: true,
                    message: 'Query approved successfully',
                    data: query
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Reject query
        this.app.post('/queries/:id/reject', async (req, res) => {
            try {
                const reason = req.body.reason || 'No reason provided';
                const query = await this.queryStorage.rejectQuery(req.params.id, reason);
                res.json({
                    success: true,
                    message: 'Query rejected successfully',
                    data: query
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Simple web interface
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>PostgreSQL Proxy Admin Portal</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .query-item { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
                        .pending { border-left: 5px solid orange; }
                        .approved { border-left: 5px solid green; }
                        .rejected { border-left: 5px solid red; }
                        .query-text { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
                        button { margin: 5px; padding: 8px 15px; border: none; border-radius: 3px; cursor: pointer; }
                        .approve-btn { background: #4CAF50; color: white; }
                        .reject-btn { background: #f44336; color: white; }
                        .refresh-btn { background: #2196F3; color: white; }
                    </style>
                </head>
                <body>
                    <h1>PostgreSQL Proxy Admin Portal</h1>
                    <button class="refresh-btn" onclick="loadQueries()">Refresh Queries</button>
                    <div id="queries"></div>
                    
                    <script>
                        async function loadQueries() {
                            try {
                                const response = await fetch('/queries');
                                const result = await response.json();
                                displayQueries(result.data);
                            } catch (error) {
                                console.error('Error loading queries:', error);
                            }
                        }
                        
                        function displayQueries(queries) {
                            const container = document.getElementById('queries');
                            container.innerHTML = '';
                            
                            if (queries.length === 0) {
                                container.innerHTML = '<p>No queries found.</p>';
                                return;
                            }
                            
                            queries.forEach(query => {
                                const div = document.createElement('div');
                                div.className = 'query-item ' + query.status;
                                div.innerHTML = \`
                                    <h3>Query ID: \${query.id}</h3>
                                    <p><strong>Status:</strong> \${query.status}</p>
                                    <p><strong>Developer:</strong> \${query.developerId}</p>
                                    <p><strong>Timestamp:</strong> \${new Date(query.timestamp).toLocaleString()}</p>
                                    <div class="query-text">\${query.query}</div>
                                    \${query.status === 'pending' ? \`
                                        <button class="approve-btn" onclick="approveQuery('\${query.id}')">Approve</button>
                                        <button class="reject-btn" onclick="rejectQuery('\${query.id}')">Reject</button>
                                    \` : ''}
                                \`;
                                container.appendChild(div);
                            });
                        }
                        
                        async function approveQuery(id) {
                            try {
                                await fetch(\`/queries/\${id}/approve\`, { method: 'POST' });
                                loadQueries();
                            } catch (error) {
                                console.error('Error approving query:', error);
                            }
                        }
                        
                        async function rejectQuery(id) {
                            const reason = prompt('Enter rejection reason:');
                            if (reason !== null) {
                                try {
                                    await fetch(\`/queries/\${id}/reject\`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ reason })
                                    });
                                    loadQueries();
                                } catch (error) {
                                    console.error('Error rejecting query:', error);
                                }
                            }
                        }
                        
                        // Load queries on page load
                        loadQueries();
                        
                        // Auto-refresh every 5 seconds
                        setInterval(loadQueries, 5000);
                    </script>
                </body>
                </html>
            `);
        });

        // Error handling middleware
        this.app.use((error, req, res, next) => {
            console.error('Unhandled error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    async start() {
        try {
            await this.queryStorage.connect();
            
            this.server = this.app.listen(this.port, () => {
                console.log(`Admin portal running on http://localhost:${this.port}`);
                console.log(`API endpoints available at http://localhost:${this.port}/queries`);
            });
        } catch (error) {
            console.error('Failed to start admin portal:', error);
            throw error;
        }
    }

    async stop() {
        if (this.server) {
            this.server.close();
        }
        await this.queryStorage.disconnect();
    }
}

module.exports = AdminPortal;
