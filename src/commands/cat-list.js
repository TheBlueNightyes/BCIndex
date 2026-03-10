import fs from 'fs';
import path from 'path';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { createCommandConfig, logger } from 'robo.js';

const CATS_FILE = path.resolve('src/storage/cats.json');
const INVENTORY_FILE = path.resolve('src/storage/inventory.json');

const CATS_PER_PAGE = 15;

function loadJSON(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (err) {
        logger.error(`Failed to parse ${filePath}:`, err);
        return {};
    }
}

export const config = createCommandConfig({
    description: 'See which cats you own'
});

export default async function (interaction) {
    await interaction.deferReply({ ephemeral: false });

    logger.info(`${interaction.user} viewed their cats.`);

    const user = interaction.user;
    const guildId = interaction.guild.id;
    const userId = user.id;

    const catsData = Object.values(loadJSON(CATS_FILE));
    const inventoryData = loadJSON(INVENTORY_FILE);
    const userCats = inventoryData[guildId]?.users?.[userId]?.cats || [];

    let currentPage = 0;
    const totalPages = Math.max(1, Math.ceil(catsData.length / CATS_PER_PAGE));

    const getPageEmbed = (page) => {
        const start = page * CATS_PER_PAGE;
        const pageCats = catsData.slice(start, start + CATS_PER_PAGE);

        const lines = pageCats.map(cat => {
            const owned = userCats.includes(cat.name);
            return `${owned ? '✅' : '❌'} **${cat.name}**`;
        });

        const totalOwned = userCats.length;
        const totalAvailable = catsData.length;
        const percentageOwned = totalAvailable
            ? ((totalOwned / totalAvailable) * 100).toFixed(1)
            : 0;

        return new EmbedBuilder()
            .setTitle(`${user.username}'s Cats`)
            .setDescription(lines.join('\n') || 'No cats found.')
            .setFooter({
                text: `Page ${page + 1}/${totalPages} • ${totalOwned}/${totalAvailable} cats (${percentageOwned}%)`
            })
            .setColor('#00AAFF')
            .setTimestamp();
    };

    const getButtons = () =>
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('⏮')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),

            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),

            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages - 1),

            new ButtonBuilder()
                .setCustomId('last')
                .setLabel('⏭')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === totalPages - 1)
        );

    // Always use editReply after defer
    const msg = await interaction.editReply({
        embeds: [getPageEmbed(currentPage)],
        components: [getButtons()]
    });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: i => i.user.id === userId
    });

    collector.on('collect', async i => {
        if (i.customId === 'first') currentPage = 0;
        if (i.customId === 'prev') currentPage--;
        if (i.customId === 'next') currentPage++;
        if (i.customId === 'last') currentPage = totalPages - 1;

        currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

        await i.update({
            embeds: [getPageEmbed(currentPage)],
            components: [getButtons()]
        });
    });

    collector.on('end', async () => {
        const disabledRow = getButtons();
        disabledRow.components.forEach(b => b.setDisabled(true));

        await msg.edit({ components: [disabledRow] }).catch(() => {});
    });
}