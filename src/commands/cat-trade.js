import fs from 'fs';
import path from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from 'discord.js';
import { createCommandConfig, logger } from 'robo.js';

const INVENTORY_FILE = path.resolve('src/storage/inventory.json');
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

function saveInventory(data) {
    try {
        fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        logger.error('Failed to save inventory.json:', err);
    }
}

export const config = createCommandConfig({
    description: 'Trade cats.',
    options: [{
        name: 'user',
        description: 'The user to trade with',
        type: 'user',
        required: true
    },
    {
        name: 'cat',
        description: 'Cat to trade',
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

export default async function (interaction) {
    logger.info(`${interaction.user.username} initiated a trade!`);
    const user = interaction.user;
    const targetUser = interaction.options.getUser('user');
    const catName = interaction.options.getString('cat');
    const guildId = interaction.guildId;

    const catsData = loadJSON(CATS_FILE);
    const catEntry = Object.values(catsData).find(c => c.name.toLowerCase() === catName.toLowerCase());

    if (!catEntry) {
        return interaction.reply({
            content: `❌ That cat doesn't exist!`,
            ephemeral: true
        });
    }

    if (targetUser.id === user.id) {
        return interaction.reply({ content: '❌ You cannot trade with yourself!', ephemeral: true });
    }

    const inventory = loadJSON(INVENTORY_FILE);
    const userCats = inventory[guildId]?.users?.[user.id]?.cats || [];

    if (!userCats.includes(catEntry.name)) {
        return interaction.reply({ content: `❌ You don’t own **${catEntry.name}**.`, ephemeral: true });
    }

    const acceptButton = new ButtonBuilder()
        .setCustomId(`accept_trade_${interaction.id}`)
        .setLabel('Accept Trade')
        .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
        .setCustomId(`decline_trade_${interaction.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

    const buttonRow = new ActionRowBuilder().addComponents(acceptButton, declineButton);

    const embed = new EmbedBuilder()
        .setTitle('Trade Request')
        .setDescription(`${user} wants to trade their **${catEntry.name}** with you.`)
        .setColor('#FFD700');

    const tradeMsg = await interaction.reply({
        content: `${targetUser}`,
        embeds: [embed],
        components: [buttonRow],
        fetchReply: true
    });

    const tradeCollector = tradeMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
    });

    tradeCollector.on('collect', async (btnInt) => {
        if (btnInt.user.id !== targetUser.id) {
            return btnInt.reply({ content: '❌ This trade is not for you.', ephemeral: true });
        }

        const offeredCat = catEntry.name;

        if (!inventory[guildId]) inventory[guildId] = { users: {} };
        if (!inventory[guildId].users[user.id]) inventory[guildId].users[user.id] = { cats: [] };
        if (!inventory[guildId].users[targetUser.id]) inventory[guildId].users[targetUser.id] = { cats: [] };

        const ownerCats = inventory[guildId].users[user.id].cats;
        const targetCats = inventory[guildId].users[targetUser.id].cats;

        // Re-check ownership
        if (!ownerCats.includes(offeredCat)) {
            return btnInt.update({
                content: `❌ Trade failed. ${user.username} doesn't own **${offeredCat}**.`,
                components: [],
                embeds: []
            });
        }

        // Re-check recipient ownership
        if (targetCats.includes(offeredCat)) {
            return btnInt.update({
                content: `❌ Trade failed. ${targetUser.username} already owns **${offeredCat}**.`,
                components: [],
                embeds: []
            });
        }

        // Transfer the cat
        inventory[guildId].users[user.id].cats = ownerCats.filter(cat => cat !== offeredCat);
        targetCats.push(offeredCat);

        saveInventory(inventory);

        await btnInt.update({
            content: `✅ Trade complete! ${user.username} traded **${offeredCat}** to ${targetUser.username}.`,
            components: [],
            embeds: []
        });
    });

    tradeCollector.on('end', async (_, reason) => {
        if (reason === 'time') {
            await tradeMsg.edit({
                content: '⌛ Trade request timed out.',
                components: [],
                embeds: []
            }).catch(() => {});
        }
    });
}