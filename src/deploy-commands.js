const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const clientId = process.env.DISCORD_CLIENT_ID || Buffer.from(process.env.DISCORD_BOT_TOKEN.split(".")[0], "base64").toString("ascii");

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

const commandsPath = path.join(__dirname, "commands");
const deprecatedCommandFiles = new Set([
  "add-nft-contract.js",
  "config-nft-role.js",
  "remove-verification.js",
  "set-verification-log-channel.js",
  "setup-verification.js",
]);

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js") && !deprecatedCommandFiles.has(file));

const commands = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded: /${command.data.name}`);
  }
}

(async () => {
  try {
    // Step 1: Delete ALL guild-specific commands (these cause duplicates)
    console.log(`\n🧹 Step 1: Cleaning up guild-specific commands...`);

    const guildIds = [
      process.env.DISCORD_SERVER_ID,
      process.env.GUILD_ID,
    ].filter(Boolean);

    for (const guildId of guildIds) {
      try {
        const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        console.log(`   Found ${guildCommands.length} guild commands in ${guildId}`);
        if (guildCommands.length > 0) {
          await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
          console.log(`   ✅ Deleted all guild commands in ${guildId}`);
        }
      } catch (err) {
        console.log(`   ⚠️ Could not clean guild ${guildId}: ${err.message}`);
      }
    }

    // Step 2: Deploy global commands (replaces all global commands)
    console.log(`\n🚀 Step 2: Deploying ${commands.length} global commands...`);

    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Deployed ${data.length} commands:`);
    data.forEach(cmd => console.log(`   • /${cmd.name}`));

    // Step 3: Verify no guild commands remain
    console.log(`\n🔍 Step 3: Verifying no duplicates...`);
    for (const guildId of guildIds) {
      try {
        const remaining = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        console.log(`   Guild ${guildId}: ${remaining.length} commands (should be 0)`);
      } catch (err) { }
    }

    console.log("\n✨ Done! No more duplicates.\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
})();
