import fs from 'fs';
import path from 'path';
import { createCommandConfig, logger } from 'robo.js';

const SETUP_FILE = path.resolve('src/storage/setup.json');

function loadSetup() {
    if (!fs.existsSync(SETUP_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(SETUP_FILE, 'utf-8').trim() || '{}');
    } catch {
        return {};
    }
}

function saveSetup(data) {
    try {
        fs.writeFileSync(SETUP_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('Failed to save setup.json:', err);
    }
}

export const config = createCommandConfig({
    description: 'Set the channel for automatic cat spawns.',
    options: [{
        name: 'channel',
        description: 'The channel to spawn cats in',
        type: 'channel',
        required: true
    }]
});

export default async function (interaction) {
    logger.info(`${interaction.user} setup!`)
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
        return interaction.reply({
            content: '❌ Please select a text-based channel.',
            ephemeral: true
        });
    }

    const stats = loadSetup();
    stats[guildId] = channel.id;
    saveSetup(stats);

    return interaction.reply({
        content: `✅ Cat spawn channel set to <#${channel.id}>`,
        ephemeral: true
    });
}