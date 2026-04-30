@echo off
REM IMS Setup and Initialization Script for Windows
REM Run this script to set up the development environment

echo ================================================
echo Incident Management System - Setup Script
echo ================================================
echo.

REM Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker found

REM Check Docker Compose
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker Compose found

REM Create .env file if it doesn't exist
if not exist .env (
    echo.
    echo 📝 Creating .env file from .env.example...
    copy .env.example .env
    echo ✅ .env file created. Please update it with your configuration.
)

REM Install dependencies
echo.
echo 📦 Installing Backend dependencies...
cd Backend
call npm install
cd ..

echo ✅ Backend dependencies installed

echo.
echo 📦 Installing Frontend dependencies...
cd frontend
call npm install
cd ..

echo ✅ Frontend dependencies installed

REM Build Docker images
echo.
echo 🐳 Building Docker images...
docker-compose build

echo ✅ Docker images built

REM Start services
echo.
echo 🚀 Starting services...
docker-compose up -d

echo ✅ Services started

REM Wait for services to be ready
echo.
echo ⏳ Waiting for services to be healthy...
timeout /t 10

REM Summary
echo.
echo ================================================
echo Setup Complete! 🎉
echo ================================================
echo.
echo Available services:
echo   - Backend API: http://localhost:8081
echo   - Frontend: http://localhost:5173
echo   - PostgreSQL: localhost:5432
echo   - MongoDB: localhost:27017
echo   - Redis: localhost:6379
echo   - RabbitMQ: http://localhost:15672 (guest/guest)
echo.
echo Next steps:
echo   1. View logs: docker-compose logs -f
echo   2. Run tests: cd Backend ^&^& npm test
echo   3. Check metrics: curl http://localhost:8081/metrics/json
echo.
echo To stop services:
echo   docker-compose down
echo.
echo For more information, see ENHANCEMENTS.md and PERFORMANCE_GUIDE.md
echo.
pause
