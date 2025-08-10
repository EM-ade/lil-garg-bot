const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  botToken: process.env.DISCORD_TOKEN,
  testChannelId: process.env.TEST_CHANNEL_ID || 'YOUR_TEST_CHANNEL_ID',
  testUserId: process.env.TEST_USER_ID || 'YOUR_USER_ID',
  delay: 2000, // Delay between commands to avoid rate limiting
};

class BotCommandTester {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    
    this.testResults = [];
    this.currentTest = 0;
    this.commands = [
      { name: 'askgarg', args: ['What is the meaning of life?'], description: 'Test AI chatbot' },
      { name: 'gargoracle', args: ['Tell me about my future'], description: 'Test mystical AI' },
      { name: 'pet adopt', args: ['TestPet'], description: 'Test pet adoption' },
      { name: 'pet status', args: [], description: 'Test pet status' },
      { name: 'battle start', args: ['@user'], description: 'Test battle start' },
      { name: 'battle status', args: [], description: 'Test battle status' },
      { name: 'status', args: [], description: 'Test bot status' },
      { name: 'config', args: [], description: 'Test config command' },
      { name: 'chat', args: [], description: 'Test chat system' },
      { name: 'list-documents', args: [], description: 'Test document listing' },
    ];
  }

  async start() {
    console.log('🤖 Starting Bot Command Tester...');
    
    try {
      await this.client.login(TEST_CONFIG.botToken);
      console.log('✅ Bot logged in successfully');
      
      // Wait for bot to be ready
      await new Promise(resolve => this.client.once('ready', resolve));
      console.log(`✅ Bot is ready! Logged in as ${this.client.user.tag}`);
      
      // Start testing commands
      await this.runTests();
      
    } catch (error) {
      console.error('❌ Error starting tester:', error);
    }
  }

  async runTests() {
    console.log(`\n🧪 Starting to test ${this.commands.length} commands...`);
    
    for (let i = 0; i < this.commands.length; i++) {
      const command = this.commands[i];
      console.log(`\n📝 Testing: ${command.name} ${command.args.join(' ')}`);
      console.log(`   Description: ${command.description}`);
      
      try {
        await this.testCommand(command);
        await this.delay(TEST_CONFIG.delay);
      } catch (error) {
        console.error(`   ❌ Error testing ${command.name}:`, error.message);
        this.testResults.push({ command: command.name, success: false, error: error.message });
      }
    }
    
    await this.generateReport();
    await this.client.destroy();
  }

  async testCommand(command) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command test timed out'));
      }, 10000);

      // Listen for bot responses
      const messageHandler = (message) => {
        if (message.author.id === this.client.user.id) {
          clearTimeout(timeout);
          this.client.off('messageCreate', messageHandler);
          
          console.log(`   ✅ Response received: ${message.content.substring(0, 100)}...`);
          this.testResults.push({ command: command.name, success: true, response: message.content });
          resolve();
        }
      };

      this.client.on('messageCreate', messageHandler);

      // Simulate command execution (this would need to be adapted based on your bot's structure)
      console.log(`   🔄 Executing command: /${command.name} ${command.args.join(' ')}`);
      
      // Note: This is a simplified test. In practice, you'd need to:
      // 1. Actually trigger the command in your Discord server
      // 2. Or create a mock Discord interaction
      // 3. Or test the command logic directly
    });
  }

  async generateReport() {
    console.log('\n📊 Test Results Report');
    console.log('========================');
    
    const successful = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => !r.success).length;
    
    console.log(`Total Commands Tested: ${this.commands.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((successful / this.commands.length) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Commands:');
      this.testResults.filter(r => !r.success).forEach(result => {
        console.log(`   - ${result.command}: ${result.error}`);
      });
    }
    
    console.log('\n✅ Successful Commands:');
    this.testResults.filter(r => r.success).forEach(result => {
      console.log(`   - ${result.command}`);
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the tester if this file is executed directly
if (require.main === module) {
  const tester = new BotCommandTester();
  tester.start().catch(console.error);
}

module.exports = BotCommandTester;

