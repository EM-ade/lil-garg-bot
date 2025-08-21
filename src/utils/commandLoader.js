const fs = require('fs');
const path = require('path');
const logger = require('./logger');

async function loadCommands(client) {
    const loadStartTime = new Date();
    console.log(`[${loadStartTime.toISOString()}] [COMMAND_LOADER] Starting command loading...`);

    try {
        const commandsPath = path.join(__dirname, '../commands');

        // Create commands directory if it doesn't exist
        if (!fs.existsSync(commandsPath)) {
            console.log(`[${new Date().toISOString()}] [COMMAND_LOADER] Creating commands directory...`);
            fs.mkdirSync(commandsPath, { recursive: true });
            logger.info('Created commands directory');
            console.log(`[${new Date().toISOString()}] [COMMAND_LOADER] Commands directory created.`);
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        console.log(`[${new Date().toISOString()}] [COMMAND_LOADER] Found ${commandFiles.length} command files.`);

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            console.log(`[${new Date().toISOString()}] [COMMAND_LOADER] Loading command: ${file}`);

            try {
                const command = require(filePath);

                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`[${new Date().toISOString()}] [COMMAND_LOADER] Successfully loaded command: ${command.data.name}`);
                    logger.info(`Loaded command: ${command.data.name}`);
                } else {
                    console.warn(`[${new Date().toISOString()}] [COMMAND_LOADER] Warning: Command ${file} missing required properties`);
                    logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            } catch (fileError) {
                console.error(`[${new Date().toISOString()}] [COMMAND_LOADER] Error loading command ${file}:`, fileError);
                logger.error(`Error loading command ${file}:`, fileError);
            }
        }

        const loadEndTime = new Date();
        const loadDuration = (loadEndTime - loadStartTime) / 1000;
        console.log(`[${loadEndTime.toISOString()}] [COMMAND_LOADER] Command loading complete (took ${loadDuration.toFixed(2)}s).`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [COMMAND_LOADER] Critical error during command loading:`, error);
        throw error;
    }
}

module.exports = { loadCommands };
