#!/usr/bin/env node

/**
 * Lil' Gargs Discord Bot Startup Script
 * This script handles the bot startup process with proper error handling
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkEnvironment() {
  log('🔍 Checking environment...', colors.cyan);
  
  // In production (Fly.io), environment variables are set via secrets
  // In development, we need a .env file
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // Development environment - check for .env file
    if (!fs.existsSync('.env')) {
      log('❌ .env file not found!', colors.red);
      log('📝 Please copy .env.example to .env and configure your settings', colors.yellow);
      process.exit(1);
    }
  } else {
    // Production environment - check for required environment variables
    const requiredVars = [
      'DISCORD_TOKEN',
      'CLIENT_ID',
      'MONGODB_URI',
      'GEMINI_API_KEY'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      log('❌ Missing required environment variables!', colors.red);
      log(`📝 Missing: ${missingVars.join(', ')}`, colors.yellow);
      log('🔧 Set them using: fly secrets set VARIABLE_NAME="value"', colors.yellow);
      process.exit(1);
    }
    
    log('✅ Production environment variables found', colors.green);
  }
  
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    log('❌ Dependencies not installed!', colors.red);
    log('📦 Please run: npm install', colors.yellow);
    process.exit(1);
  }
  
  log('✅ Environment check passed', colors.green);
}

function deployCommands() {
  return new Promise((resolve, reject) => {
    log('🚀 Deploying Discord commands...', colors.cyan);
    
    const deployProcess = spawn('node', ['src/deploy-commands.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    deployProcess.on('close', (code) => {
      if (code === 0) {
        log('✅ Commands deployed successfully', colors.green);
        resolve();
      } else {
        log('❌ Failed to deploy commands', colors.red);
        reject(new Error(`Deploy process exited with code ${code}`));
      }
    });
    
    deployProcess.on('error', (error) => {
      log(`❌ Deploy error: ${error.message}`, colors.red);
      reject(error);
    });
  });
}

function startBot() {
  return new Promise((resolve, reject) => {
    log('🤖 Starting Lil\' Gargs Discord Bot...', colors.magenta);
    
    const botProcess = spawn('node', ['src/index.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    botProcess.on('close', (code) => {
      if (code === 0) {
        log('✅ Bot stopped gracefully', colors.green);
        resolve();
      } else {
        log(`❌ Bot exited with code ${code}`, colors.red);
        reject(new Error(`Bot process exited with code ${code}`));
      }
    });
    
    botProcess.on('error', (error) => {
      log(`❌ Bot error: ${error.message}`, colors.red);
      reject(error);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      log('\n🛑 Shutting down bot...', colors.yellow);
      botProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      log('\n🛑 Terminating bot...', colors.yellow);
      botProcess.kill('SIGTERM');
    });
  });
}

async function main() {
  try {
    log('🎮 Lil\' Gargs Discord Bot Launcher', colors.bright + colors.magenta);
    log('=====================================', colors.magenta);
    
    // Check environment
    checkEnvironment();
    
    // Deploy commands
    await deployCommands();
    
    // Start the bot
    await startBot();
    
  } catch (error) {
    log(`💥 Startup failed: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  log('💥 Unhandled Rejection at:', colors.red);
  console.log(promise);
  log('Reason:', colors.red);
  console.log(reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`💥 Uncaught Exception: ${error.message}`, colors.red);
  console.error(error.stack);
  process.exit(1);
});

// Run the main function
main();