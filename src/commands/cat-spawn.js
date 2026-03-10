import fs from 'fs';
import path from 'path';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createCommandConfig, logger } from 'robo.js';
import { catAnswers } from '../modules/catMemory.js';

const CATS_FILE = path.resolve('src/storage/cats.json');

function loadJSON(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8').trim() || '{}');
    } catch (err) {
        logger.error(`Failed to parse ${filePath}:`, err);
        return {};
    }
}

export const config = createCommandConfig({
    description: 'View and spawn your cats!',
    options: [{
        name: 'cat',
        description: 'Cat to spawn',
        type: 'string',
        required: true,
        autocomplete: true
    }]
});

export async function autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const catsData = Object.values(loadJSON(CATS_FILE));

    const filtered = catsData
        .filter(cat => cat.name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25)
        .map(cat => ({ name: cat.name, value: cat.name }));

    await interaction.respond(filtered);
}

export default async function catSpawn(interaction) {
    logger.info(`${interaction.user.username} is spawning a cat.`);
    const catsData = loadJSON(CATS_FILE);
    const catName = interaction.options.getString('cat');
    const catEntry = Object.values(catsData).find(c => c.name.toLowerCase() === catName.toLowerCase());

    if (!catEntry) {
        return interaction.reply({ content: `❌ That cat doesn't exist!`, ephemeral: true });
    }

    const rarityColors = {
        Normal: '#00AAFF',
        Special: '#3BA55D',
        Rare: '#9B59B6',
        'Super Rare': '#F1C40F',
        'Legend Rare': '#E74C3C',
        'Uber Super Rare': '#E74C3C'
    };

    const color = rarityColors[catEntry.rarity] || '#00AAFF';
    const embed = new EmbedBuilder().setColor(color).setImage(catEntry.image);

    const button = new ButtonBuilder().setCustomId('catch_temp').setStyle(ButtonStyle.Primary).setLabel('Catch!');
    const row = new ActionRowBuilder().addComponents(button);

    await interaction.deferReply();
    const msg = await interaction.channel.send({ content: 'A wild cat has appeared!', embeds: [embed], components: [row], fetchReply: true });
    await interaction.deleteReply();

    catAnswers.set(msg.id, catEntry.name);

    const updatedButton = ButtonBuilder.from(button).setCustomId(`catch:${msg.id}`);
    const updatedRow = new ActionRowBuilder().addComponents(updatedButton);
    await msg.edit({ components: [updatedRow] });

    setTimeout(async () => {
        try {
            const disabledButton = ButtonBuilder.from(updatedButton).setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
            await msg.edit({ content: '⏰ The cat ran away!', components: [disabledRow] });
            catAnswers.delete(msg.id);
        } catch (err) {
            console.error('Timeout error disabling button:', err);
        }
    }, 5 * 60 * 1000);
}