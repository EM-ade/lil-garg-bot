#!/usr/bin/env node

/**
 * Debug script to check and deploy Discord commands
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const foldersPath = path.join(__dirname, 'src', 'commands');

// Check if commands directory exists
if (!fs.existsSync(foldersPath)) {
  console.error('❌ Commands directory not found at:', foldersPath);
  process.exit(1);
}

const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

console.log('🔍 Loading commands...');

for (const file of commandFiles) {
  const filePath = path.join(foldersPath, file);
  try {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`✅ Loaded: ${command.data.name}`);
    } else {
      console.log(`⚠️  Skipped ${file}: Missing 'data' or 'execute' property`);
    }
  } catch (error) {
    console.error(`❌ Error loading ${file}:`, error.message);
  }
}

console.log(`\n📊 Total commands loaded: ${commands.length}`);

// Check environment variables
const requiredVars = ['DISCORD_TOKEN', 'CLIENT_ID'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing environment variables:', missingVars.join(', '));
  console.log('💡 Make sure to set these via: fly secrets set VARIABLE_NAME="value"');
  process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

    // Check if GUILD_ID is set for guild-specific deployment
    if (process.env.GUILD_ID) {
      console.log(`📍 Deploying to guild: ${process.env.GUILD_ID}`);
      
      // Deploy guild-specific commands (faster for testing)
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );

      console.log(`✅ Successfully reloaded ${data.length} guild application (/) commands.`);
    } else {
      console.log('🌍 Deploying globally (this may take up to 1 hour to propagate)');
      
      // Deploy global commands
      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );

      console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
    }

    // List deployed commands for verification
    console.log('\n📋 Deployed commands:');
    commands.forEach(cmd => {
      console.log(`  • /${cmd.name} - ${cmd.description}`);
    });

  } catch (error) {
    console.error('❌ Error deploying commands:', error);
    
    if (error.code === 50001) {
      console.log('💡 Error 50001: Missing Access - Check bot permissions and make sure it\'s added to the server');
    } else if (error.code === 50035) {
      console.log('💡 Error 50035: Invalid Form Body - Check command structure');
    } else if (error.rawError?.message?.includes('Invalid token')) {
      console.log('💡 Invalid token - Check your DISCORD_TOKEN');
    }
  }
})();