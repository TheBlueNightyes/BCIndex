import fs from 'fs';
import path from 'path';
import { Events, ButtonBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { client, logger } from 'robo.js';
import { catAnswers } from '../modules/catMemory.js';

const INVENTORY_FILE = path.resolve('src/storage/inventory.json');

function loadInventoryData() {
    try {
        const raw = fs.readFileSync(INVENTORY_FILE, 'utf-8');
        return JSON.parse(raw || '{}');
    } catch {
        return {};
    }
}

function saveInventoryData(data) {
    try {
        fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        logger.error('Failed to save inventory data:', err);
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    // When the "Catch!" button is clicked
    if (interaction.isButton() && interaction.customId.startsWith('catch:')) {
        const messageId = interaction.customId.split(':')[1];

        const modal = new ModalBuilder()
            .setCustomId(`catCatching:${messageId}`)
            .setTitle('Catch!')
            .addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Name?')
                    .setPlaceholder('Type it here...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ));

        return await interaction.showModal(modal);
    }

    // When the modal is submitted
    if (interaction.isModalSubmit() && interaction.customId.startsWith('catCatching:')) {
        const messageId = interaction.customId.split(':')[1];
        const correctAnswer = catAnswers.get(messageId);
        const userAnswer = interaction.fields.getTextInputValue('name');

        if (!correctAnswer) {
            return await interaction.reply({ content: '❌ This cat is no longer catchable.', ephemeral: true });
        }

        const data = loadInventoryData();
        if (!data[guildId]) data[guildId] = {};
        if (!data[guildId].users) data[guildId].users = {};
        if (!data[guildId].users[userId]) data[guildId].users[userId] = { cats: [] };

        const ownedCats = data[guildId].users[userId].cats;

        if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
            if (ownedCats.includes(correctAnswer)) {
                catAnswers.delete(messageId);
                return await interaction.reply({ content: `😼 You already own **${correctAnswer}**!`, ephemeral: true });
            }

            // Mark cat as caught and disable button
            ownedCats.push(correctAnswer);
            saveInventoryData(data);
            catAnswers.delete(messageId);

            // Try disabling the button
            const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (originalMessage) {
                const disabledRow = ActionRowBuilder.from(originalMessage.components[0]).setComponents(
                    originalMessage.components[0].components.map(button =>
                        ButtonBuilder.from(button).setDisabled(true)
                    )
                );
                await originalMessage.edit({ components: [disabledRow] }).catch(() => {});
            }
            return await interaction.reply({ content: `🎉 ${interaction.user} caught **${correctAnswer}**!` });
        } else {
            return await interaction.reply({ content: `❌ ${interaction.user} Wrong name!` });
        }
    }
});