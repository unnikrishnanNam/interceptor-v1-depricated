const net = require('net');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const QueryStorage = require('./queryStorage');

class PostgreSQLProxy {
    constructor(proxyPort = 5432, targetHost = 'localhost', targetPort = 5433) {
        this.proxyPort = proxyPort;
        this.targetHost = targetHost;
        this.targetPort = targetPort;
        this.queryStorage = new QueryStorage();
        this.server = null;
        this.pendingQueries = new Map(); // Store queries waiting for approval
    }

    async start() {
        try {
            await this.queryStorage.connect();
            
            this.server = net.createServer((clientSocket) => {
                console.log('New client connected');
                this.handleClientConnection(clientSocket);
            });

            this.server.listen(this.proxyPort, () => {
                console.log(`PostgreSQL Proxy listening on port ${this.proxyPort}`);
                console.log(`Forwarding to PostgreSQL at ${this.targetHost}:${this.targetPort}`);
            });

            // Start monitoring for approved queries
            this.startQueryMonitoring();

        } catch (error) {
            console.error('Failed to start proxy:', error);
            throw error;
        }
    }

    async handleClientConnection(clientSocket) {
        let dbConnection = null;
        let isAuthenticated = false;
        let currentQuery = '';
        let clientBuffer = Buffer.alloc(0);

        // Create connection to actual PostgreSQL
        dbConnection = new net.Socket();
        
        dbConnection.connect(this.targetPort, this.targetHost, () => {
            console.log('Connected to PostgreSQL database');
        });

        // Handle data from client to database
        clientSocket.on('data', async (data) => {
            clientBuffer = Buffer.concat([clientBuffer, data]);
            
            try {
                const { messages, remainingBuffer } = this.parsePostgreSQLMessages(clientBuffer);
                clientBuffer = remainingBuffer;

                for (const message of messages) {
                    if (message.type === 'Q') { // Query message
                        console.log('Intercepted query:', message.query);
                        
                        // Check if this is a dangerous query that needs approval
                        if (this.isDangerousQuery(message.query)) {
                            console.log('🚨 Dangerous query detected, blocking execution');
                            await this.handleDangerousQuery(clientSocket, message.query);
                            continue; // Skip forwarding this message
                        }
                    }
                    
                    // For startup, authentication, and safe queries, forward directly
                    if (dbConnection && dbConnection.writable) {
                        dbConnection.write(message.rawData);
                    }
                }
            } catch (error) {
                console.error('Error parsing PostgreSQL message:', error);
                // For safety, don't forward raw data if parsing fails during query phase
                // This prevents dangerous queries from bypassing the filter
                console.log('⚠️ Parsing failed, blocking data to prevent bypass');
            }
        });

        // Handle data from database to client
        dbConnection.on('data', (data) => {
            if (clientSocket.writable) {
                clientSocket.write(data);
            }
        });

        // Handle connection closures
        clientSocket.on('close', () => {
            console.log('Client disconnected');
            if (dbConnection) {
                dbConnection.destroy();
            }
        });

        dbConnection.on('close', () => {
            console.log('Database connection closed');
            if (clientSocket.writable) {
                clientSocket.destroy();
            }
        });

        // Handle errors
        clientSocket.on('error', (err) => {
            console.error('Client socket error:', err);
        });

        dbConnection.on('error', (err) => {
            console.error('Database connection error:', err);
        });
    }

    parsePostgreSQLMessages(buffer) {
        const messages = [];
        let offset = 0;
        let isFirstMessage = true;

        while (offset < buffer.length) {
            // Handle startup message (first message has no type byte)
            if (isFirstMessage && buffer.length >= 8) {
                const length = buffer.readInt32BE(0);
                if (buffer.length >= length) {
                    const messageData = buffer.slice(0, length);
                    messages.push({
                        type: 'Startup',
                        rawData: messageData,
                        length: length
                    });
                    offset += length;
                    isFirstMessage = false;
                    continue;
                }
            }

            // Handle regular messages (with type byte)
            if (offset < buffer.length) {
                const messageType = String.fromCharCode(buffer[offset]);
                
                if (offset + 5 <= buffer.length) {
                    const length = buffer.readInt32BE(offset + 1);
                    const totalLength = length + 1;
                    
                    if (offset + totalLength <= buffer.length) {
                        const messageData = buffer.slice(offset, offset + totalLength);
                        const message = {
                            type: messageType,
                            rawData: messageData,
                            length: totalLength
                        };

                        // Parse query messages (type 'Q')
                        if (messageType === 'Q' && messageData.length > 5) {
                            const queryData = messageData.slice(5, -1); // Remove header and null terminator
                            message.query = queryData.toString('utf8');
                            console.log(`📨 Parsed query message: "${message.query}"`);
                        }

                        messages.push(message);
                        offset += totalLength;
                        isFirstMessage = false;
                    } else {
                        break; // Incomplete message
                    }
                } else {
                    break; // Not enough data for length
                }
            }
        }

        console.log(`📦 Parsed ${messages.length} messages, ${offset} bytes processed, ${buffer.length - offset} bytes remaining`);
        return {
            messages,
            remainingBuffer: buffer.slice(offset)
        };
    }

    isDangerousQuery(query) {
        const cleanQuery = query.trim().toUpperCase();
        console.log('🔍 Checking query:', cleanQuery);
        
        const dangerous = [
            /DELETE\s+FROM/i,
            /DROP\s+TABLE/i,
            /DROP\s+DATABASE/i,
            /TRUNCATE/i,
            /UPDATE.*SET/i,
            /INSERT\s+INTO/i,
            /ALTER\s+TABLE/i,
            /CREATE\s+TABLE/i,
            /CREATE\s+DATABASE/i,
            /CREATE\s+INDEX/i,
            /DROP\s+INDEX/i
        ];

        const isDangerous = dangerous.some(pattern => {
            const matches = pattern.test(cleanQuery);
            if (matches) {
                console.log(`⚠️ Dangerous pattern matched: ${pattern.source}`);
            }
            return matches;
        });

        console.log(`🔍 Query classification: ${isDangerous ? 'DANGEROUS' : 'SAFE'}`);
        return isDangerous;
    }

    async handleDangerousQuery(clientSocket, query) {
        try {
            const queryId = uuidv4();
            
            // Store query for approval
            const queryData = await this.queryStorage.storeQuery(queryId, {
                query: query.trim(),
                developerId: 'developer', // In a real app, you'd extract this from connection
                clientInfo: {
                    remoteAddress: clientSocket.remoteAddress,
                    remotePort: clientSocket.remotePort
                }
            });

            // Store client socket reference for later execution
            this.pendingQueries.set(queryId, {
                clientSocket,
                query: query.trim(),
                timestamp: new Date()
            });

            // Send response to client indicating query is queued
            const responseMessage = `Query queued for approval. Query ID: ${queryId}. Please wait for admin approval.`;
            this.sendNoticeToClient(clientSocket, responseMessage);

        } catch (error) {
            console.error('Error handling dangerous query:', error);
            this.sendErrorToClient(clientSocket, 'Failed to queue query for approval');
        }
    }

    sendNoticeToClient(clientSocket, message) {
        // PostgreSQL Notice Response format
        const notice = Buffer.from(message + '\0', 'utf8');
        const noticeResponse = Buffer.alloc(5 + notice.length + 1);
        
        noticeResponse[0] = 'N'.charCodeAt(0); // Notice Response
        noticeResponse.writeInt32BE(4 + notice.length + 1, 1); // Length
        noticeResponse[5] = 'M'.charCodeAt(0); // Message field
        notice.copy(noticeResponse, 6);
        noticeResponse[noticeResponse.length - 1] = 0; // Null terminator
        
        if (clientSocket.writable) {
            clientSocket.write(noticeResponse);
        }
    }

    sendErrorToClient(clientSocket, message) {
        // PostgreSQL Error Response format
        const errorMsg = Buffer.from(message + '\0', 'utf8');
        const errorResponse = Buffer.alloc(5 + errorMsg.length + 1);
        
        errorResponse[0] = 'E'.charCodeAt(0); // Error Response
        errorResponse.writeInt32BE(4 + errorMsg.length + 1, 1); // Length
        errorResponse[5] = 'M'.charCodeAt(0); // Message field
        errorMsg.copy(errorResponse, 6);
        errorResponse[errorResponse.length - 1] = 0; // Null terminator
        
        if (clientSocket.writable) {
            clientSocket.write(errorResponse);
        }
    }

    async startQueryMonitoring() {
        setInterval(async () => {
            try {
                // Check for approved queries
                const allQueries = await this.queryStorage.getAllQueries();
                const approvedQueries = allQueries.filter(q => q.status === 'approved');

                for (const query of approvedQueries) {
                    const pendingQuery = this.pendingQueries.get(query.id);
                    
                    if (pendingQuery) {
                        await this.executeApprovedQuery(query.id, pendingQuery);
                        this.pendingQueries.delete(query.id);
                    }
                }
            } catch (error) {
                console.error('Error monitoring queries:', error);
            }
        }, 1000); // Check every second
    }

    async executeApprovedQuery(queryId, pendingQuery) {
        try {
            console.log(`Executing approved query ${queryId}: ${pendingQuery.query}`);
            
            // Create direct connection to PostgreSQL to execute the query
            const client = new Client({
                host: this.targetHost,
                port: this.targetPort,
                database: 'testdb',
                user: 'testuser',
                password: 'testpass@123'
            });

            await client.connect();
            const result = await client.query(pendingQuery.query);
            await client.end();

            // Send success response to client
            const successMessage = `Query executed successfully. Rows affected: ${result.rowCount || 0}`;
            this.sendNoticeToClient(pendingQuery.clientSocket, successMessage);

            console.log(`Query ${queryId} executed successfully`);

        } catch (error) {
            console.error(`Error executing query ${queryId}:`, error);
            this.sendErrorToClient(pendingQuery.clientSocket, `Query execution failed: ${error.message}`);
        }
    }

    async stop() {
        if (this.server) {
            this.server.close();
        }
        await this.queryStorage.disconnect();
    }
}

module.exports = PostgreSQLProxy;
