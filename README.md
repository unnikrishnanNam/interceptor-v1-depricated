# PostgreSQL Interceptor Proxy

A simple PostgreSQL proxy that intercepts database queries, requires admin approval for dangerous operations, and provides a web-based administration interface.

## 🎯 Purpose

This proxy ensures that developers cannot blindly execute potentially dangerous database operations. All risky queries (DELETE, DROP, UPDATE, INSERT, etc.) must be approved by an administrator before execution.

## 🏗️ Architecture

```
[DB Client] → [Proxy:5432] → [Admin Portal:3001] → [PostgreSQL:5433]
                     ↓
                [Redis:6379]
```

- **Proxy Server (Port 5432)**: Intercepts PostgreSQL wire protocol
- **Admin Portal (Port 3001)**: Web interface for query approval
- **PostgreSQL (Port 5433)**: Actual database engine
- **Redis (Port 6379)**: Stores pending queries and metadata

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Docker and Docker Compose
- Git

### Installation

1. **Clone and setup the project:**
```bash
git clone <your-repo-url>
cd interceptor-v1
npm install
```

2. **Start the infrastructure:**
```bash
# Start PostgreSQL and Redis containers
npm run docker:up

# Wait for containers to be ready (about 10-15 seconds)
# You can check logs with: npm run docker:logs
```

3. **Start the interceptor proxy:**
```bash
npm start
```

You should see:
```
✓ Admin portal started on http://localhost:3001
✓ PostgreSQL proxy started on port 5432
```

## 📊 Admin Portal

Open http://localhost:3001 in your browser to access the admin interface where you can:

- View all queries (pending, approved, rejected)
- Approve or reject pending queries
- Monitor query history

### API Endpoints

- `GET /queries` - Get all queries
- `GET /queries/pending` - Get pending queries
- `GET /queries/:id` - Get specific query
- `POST /queries/:id/approve` - Approve a query
- `POST /queries/:id/reject` - Reject a query (with reason)

## 🔌 Connecting Database Clients

Configure your PostgreSQL client with these connection details:

- **Host**: `localhost`
- **Port**: `5432` (proxy port)
- **Database**: `testdb`
- **Username**: `testuser`
- **Password**: `testpass@123`

### Tested Clients
- DBeaver
- DataGrip
- pgAdmin
- psql command line
- Any PostgreSQL-compatible client

## 🔄 Workflow Example

1. **Connect your DB client** to `localhost:5432`

2. **Execute a safe query** (gets executed immediately):
```sql
SELECT * FROM users;
```

3. **Execute a dangerous query** (gets queued for approval):
```sql
DELETE FROM users WHERE id = 1;
```

4. **Client receives notification**:
```
Query queued for approval. Query ID: abc123-def456. Please wait for admin approval.
```

5. **Admin approves the query** via the web portal at http://localhost:3001

6. **Query gets executed** and client receives confirmation

## 🚨 Dangerous Operations (Require Approval)

The following SQL operations are considered dangerous and require approval:

- `DELETE FROM` - Data deletion
- `DROP TABLE` - Table deletion
- `DROP DATABASE` - Database deletion
- `TRUNCATE` - Table truncation
- `UPDATE ... SET` - Data modification
- `INSERT INTO` - Data insertion
- `ALTER TABLE` - Schema changes
- `CREATE TABLE` - Table creation
- `CREATE DATABASE` - Database creation

## 🗂️ Project Structure

```
interceptor-v1/
├── index.js              # Main application entry point
├── postgresProxy.js      # PostgreSQL proxy server
├── adminPortal.js        # Web-based admin interface
├── queryStorage.js       # Redis storage management
├── docker-compose.yml    # Infrastructure setup
├── init.sql             # Database initialization
├── package.json         # Node.js dependencies
└── README.md           # This file
```

## 🧪 Testing the System

### Test Setup

1. **Start all services:**
```bash
npm run docker:up
npm start
```

2. **Connect using psql:**
```bash
psql -h localhost -p 5432 -U testuser -d testdb
```

### Test Scenarios

**Scenario 1: Safe Query (Immediate Execution)**
```sql
-- This executes immediately
SELECT * FROM users;
SELECT * FROM products;
```

**Scenario 2: Dangerous Query (Requires Approval)**
```sql
-- This gets queued for approval
DELETE FROM users WHERE id = 1;
```

1. Execute the DELETE query
2. You'll receive a notification with Query ID
3. Open http://localhost:3001
4. Find the pending query and click "Approve"
5. The query will execute and you'll get a success notification

**Scenario 3: Multiple Dangerous Queries**
```sql
INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');
UPDATE products SET price = 99.99 WHERE id = 1;
DROP TABLE IF EXISTS temp_table;
```

Each query will be queued separately and can be approved/rejected individually.

## 🔧 Configuration

### Environment Variables

You can customize the configuration by setting these environment variables:

```bash
# Proxy configuration
PROXY_PORT=5432
TARGET_HOST=localhost
TARGET_PORT=5433

# Admin portal
ADMIN_PORT=3001

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=testdb
POSTGRES_USER=testuser
POSTGRES_PASSWORD=testpass@123
```

### Docker Compose Customization

Edit `docker-compose.yml` to customize:
- PostgreSQL version and settings
- Redis configuration
- Port mappings
- Volume mounts

## 🛠️ Development

### Starting in Development Mode
```bash
npm run dev
```

### Viewing Logs
```bash
# View container logs
npm run docker:logs

# View specific service logs
docker-compose logs postgresql
docker-compose logs redis
```

### Stopping Services
```bash
# Stop the proxy
Ctrl+C

# Stop containers
npm run docker:down
```

## 🐛 Troubleshooting

### Common Issues

**1. "Connection refused" when connecting client**
```bash
# Check if proxy is running
lsof -i :5432

# Check if containers are running
docker-compose ps
```

**2. "Redis connection failed"**
```bash
# Restart Redis container
docker-compose restart redis

# Check Redis logs
docker-compose logs redis
```

**3. "PostgreSQL connection failed"**
```bash
# Check PostgreSQL container
docker-compose logs postgresql

# Verify PostgreSQL is responding
docker-compose exec postgresql psql -U testuser -d testdb -c "SELECT 1;"
```

**4. Admin portal not loading**
```bash
# Check if admin portal is running
curl http://localhost:3001/health

# Should return: {"status":"OK","timestamp":"..."}
```

### Debug Mode

Add debug logging by setting:
```bash
DEBUG=true npm start
```

## 📝 API Examples

### Using curl to interact with the admin API:

```bash
# Get all queries
curl http://localhost:3001/queries

# Get pending queries
curl http://localhost:3001/queries/pending

# Approve a query
curl -X POST http://localhost:3001/queries/YOUR_QUERY_ID/approve

# Reject a query
curl -X POST http://localhost:3001/queries/YOUR_QUERY_ID/reject \
  -H "Content-Type: application/json" \
  -d '{"reason":"Query is too risky"}'
```

## 🔒 Security Considerations

⚠️ **Important**: This is a proof-of-concept implementation. For production use, consider:

- Adding authentication and authorization
- Implementing SSL/TLS encryption
- Adding rate limiting
- Implementing audit logging
- Adding user management
- Securing the admin portal
- Adding query validation and sanitization

## 📄 License

ISC License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs: `npm run docker:logs`
3. Create an issue with detailed error information

---

**Happy querying! 🎉**
