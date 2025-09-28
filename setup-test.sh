#!/bin/bash

echo "🔄 Starting PostgreSQL Interceptor Test..."

# Function to check if a process is running on a port
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        echo "✅ Port $port is in use"
        return 0
    else
        echo "❌ Port $port is not in use"
        return 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for $service_name on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if check_port $port; then
            echo "✅ $service_name is ready!"
            return 0
        fi
        echo "⏳ Attempt $attempt/$max_attempts - waiting for $service_name..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service_name failed to start within $(($max_attempts * 2)) seconds"
    return 1
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"

# Start Docker Compose services
echo "🚀 Starting Docker services..."
npm run docker:up

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

wait_for_service 5433 "PostgreSQL"
wait_for_service 6379 "Redis"

echo ""
echo "🔍 Checking Docker containers..."
docker-compose ps

echo ""
echo "📋 To test the system:"
echo "1. Start the proxy: npm start"
echo "2. Connect to: localhost:5432 with credentials:"
echo "   - User: testuser"
echo "   - Password: testpass@123"
echo "   - Database: testdb"
echo "3. Try a DELETE query to test interception"
echo "4. Check admin portal: http://localhost:3001"

echo ""
echo "🧪 Run quick test: npm run test-queries"
