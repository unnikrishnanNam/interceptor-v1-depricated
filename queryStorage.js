const redis = require('redis');

class QueryStorage {
    constructor() {
        this.client = redis.createClient({
            host: 'localhost',
            port: 6379
        });
        
        this.client.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
        
        this.client.on('connect', () => {
            console.log('Connected to Redis');
        });
    }

    async connect() {
        await this.client.connect();
    }

    async disconnect() {
        await this.client.disconnect();
    }

    async storeQuery(queryId, queryData) {
        try {
            const data = {
                id: queryId,
                query: queryData.query,
                timestamp: new Date().toISOString(),
                status: 'pending',
                developerId: queryData.developerId || 'unknown',
                clientInfo: queryData.clientInfo || {},
                ...queryData
            };
            
            await this.client.hSet(`query:${queryId}`, data);
            await this.client.lPush('pending_queries', queryId);
            
            console.log(`Query ${queryId} stored successfully`);
            return data;
        } catch (error) {
            console.error('Error storing query:', error);
            throw error;
        }
    }

    async getQuery(queryId) {
        try {
            const queryData = await this.client.hGetAll(`query:${queryId}`);
            return Object.keys(queryData).length > 0 ? queryData : null;
        } catch (error) {
            console.error('Error retrieving query:', error);
            throw error;
        }
    }

    async getPendingQueries() {
        try {
            const queryIds = await this.client.lRange('pending_queries', 0, -1);
            const queries = [];
            
            for (const queryId of queryIds) {
                const query = await this.getQuery(queryId);
                if (query && query.status === 'pending') {
                    queries.push(query);
                }
            }
            
            return queries;
        } catch (error) {
            console.error('Error retrieving pending queries:', error);
            throw error;
        }
    }

    async approveQuery(queryId) {
        try {
            const exists = await this.client.hExists(`query:${queryId}`, 'id');
            if (!exists) {
                throw new Error(`Query ${queryId} not found`);
            }
            
            await this.client.hSet(`query:${queryId}`, 'status', 'approved');
            await this.client.hSet(`query:${queryId}`, 'approvedAt', new Date().toISOString());
            await this.client.lRem('pending_queries', 1, queryId);
            await this.client.lPush('approved_queries', queryId);
            
            console.log(`Query ${queryId} approved`);
            return await this.getQuery(queryId);
        } catch (error) {
            console.error('Error approving query:', error);
            throw error;
        }
    }

    async rejectQuery(queryId, reason = '') {
        try {
            const exists = await this.client.hExists(`query:${queryId}`, 'id');
            if (!exists) {
                throw new Error(`Query ${queryId} not found`);
            }
            
            await this.client.hSet(`query:${queryId}`, 'status', 'rejected');
            await this.client.hSet(`query:${queryId}`, 'rejectedAt', new Date().toISOString());
            await this.client.hSet(`query:${queryId}`, 'rejectionReason', reason);
            await this.client.lRem('pending_queries', 1, queryId);
            await this.client.lPush('rejected_queries', queryId);
            
            console.log(`Query ${queryId} rejected: ${reason}`);
            return await this.getQuery(queryId);
        } catch (error) {
            console.error('Error rejecting query:', error);
            throw error;
        }
    }

    async getAllQueries() {
        try {
            const keys = await this.client.keys('query:*');
            const queries = [];
            
            for (const key of keys) {
                const query = await this.client.hGetAll(key);
                if (Object.keys(query).length > 0) {
                    queries.push(query);
                }
            }
            
            return queries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } catch (error) {
            console.error('Error retrieving all queries:', error);
            throw error;
        }
    }
}

module.exports = QueryStorage;
