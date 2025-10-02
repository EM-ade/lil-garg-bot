const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const deprecatedCommandFiles = new Set([
  "add-nft-contract.js",
  "config-nft-role.js",
  "setup-verification.js",
  "remove-verification.js",
  "set-verification-log-channel.js",
]);

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js") && !deprecatedCommandFiles.has(file));

const skippedCommands = Array.from(deprecatedCommandFiles).filter((file) =>
  fs.existsSync(path.join(commandsPath, file))
);

if (skippedCommands.length > 0) {
  console.log(
    `Skipping legacy verification commands: ${skippedCommands.join(', ')}`
  );
}

// Load all command data
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
    console.log(`Loaded command: ${command.data.name}`);
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
    );
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    // Get client ID from environment or extract from bot token
    let clientId = process.env.DISCORD_CLIENT_ID;

    if (!clientId && process.env.DISCORD_BOT_TOKEN) {
      // Extract client ID from bot token (first part before the first dot)
      clientId = process.env.DISCORD_BOT_TOKEN.split(".")[0];
      // Decode base64 to get the actual client ID
      try {
        clientId = Buffer.from(clientId, "base64").toString("ascii");
      } catch (e) {
        console.error(
          "Could not extract client ID from bot token. Please set DISCORD_CLIENT_ID in your .env file."
        );
        process.exit(1);
      }
    }

    if (!clientId) {
      console.error(
        "DISCORD_CLIENT_ID is required. Please add it to your .env file."
      );
      console.error(
        "You can find your Client ID in the Discord Developer Portal under your application's General Information."
      );
      process.exit(1);
    }

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    console.error("Error deploying commands:", error);
  }
})();
