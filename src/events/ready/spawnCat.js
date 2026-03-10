import fs from 'fs';
import path from 'path';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client, logger } from 'robo.js';
import { catAnswers } from '../../modules/catMemory.js';

const CATS_FILE = path.resolve('src/storage/cats.json');
const SETUP_FILE = path.resolve('src/storage/setup.json');
const EVENTS_FILE = path.resolve('src/storage/events.json');

function loadJSON(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8').trim();
        return JSON.parse(raw || '{}');
    } catch (err) {
        logger.error(`Failed to load ${filePath}:`, err);
        return {};
    }
}

function loadCatData() {
    return loadJSON(CATS_FILE);
}

function loadSetup() {
    return loadJSON(SETUP_FILE);
}

function loadActiveEvents(guildId) {
    const events = loadJSON(EVENTS_FILE);
    const now = new Date();

    const guildEvents = events[guildId] || {};
    const active = {};

    for (const [banner, data] of Object.entries(guildEvents)) {
        const expires = new Date(data.expires);
        if (expires > now) {
            active[banner] = parseFloat(data.buff); // e.g. "10" → 10
        }
    }

    return active;
}

const rarityChances = {
    "Normal": 30,
    "Special": 25,
    "Rare": 19.7,
    "Super Rare": 15,
    "Legend Rare": 0.3,
    "Uber Super Rare": 5
};

function getRandomRarity() {
    const totalWeight = Object.values(rarityChances).reduce((a, b) => a + b, 0);
    const rand = Math.random() * totalWeight;

    let cumulative = 0;
    for (const [rarity, weight] of Object.entries(rarityChances)) {
        cumulative += weight;
        if (rand < cumulative) return rarity;
    }
}

function bucketCatsByRarity(cats) {
    const buckets = {};
    for (const cat of Object.values(cats)) {
        if (!buckets[cat.rarity]) buckets[cat.rarity] = [];
        buckets[cat.rarity].push(cat);
    }
    return buckets;
}

function getRandomCat(cats, guildId) {
    const buckets = bucketCatsByRarity(cats);
    const activeEvents = loadActiveEvents(guildId);
    let tries = 0;

    while (tries < 10) {
        const rarity = getRandomRarity();
        const pool = buckets[rarity];
        if (pool && pool.length > 0) {
            const weightedPool = [];

            for (const cat of pool) {
                let weight = 1;

                if (cat.banner && cat.banner !== "None") {
                    const banners = Array.isArray(cat.banner) ? cat.banner : [cat.banner];
                    let totalBuff = 0;

                    for (const banner of banners) {
                        if (activeEvents[banner]) {
                            totalBuff += activeEvents[banner];
                        }
                    }

                    if (totalBuff > 0) {
                        weight += weight * (totalBuff / 100);
                    } else {
                        weight *= 0.25;
                    }
                }

                for (let i = 0; i < Math.floor(weight); i++) {
                    weightedPool.push(cat);
                }
            }

            if (weightedPool.length > 0) {
                const randomIndex = Math.floor(Math.random() * weightedPool.length);
                return weightedPool[randomIndex];
            }
        }

        tries++;
    }

    return null;
}

async function spawnRandomCat(channelId, guildId) {
    const cats = loadCatData();
    const catEntry = getRandomCat(cats, guildId);
    if (!catEntry) return;

const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) return;

    const rarityColors = {
        Normal: '#00AAFF',
        Special: '#3BA55D',
        Rare: '#9B59B6',
        "Super Rare": '#F1C40F',
        "Legend Rare": '#E74C3C',
        "Uber Super Rare": '#E74C3C'
    };

    const color = rarityColors[catEntry.rarity] || '#00AAFF';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setImage(catEntry.image);

    const button = new ButtonBuilder()
        .setCustomId('catch_temp')
        .setStyle(ButtonStyle.Primary)
        .setLabel('Catch!');

    const row = new ActionRowBuilder().addComponents(button);

    const msg = await channel.send({
        content: `A wild **${catEntry.name}** appeared!`,
        embeds: [embed],
        components: [row]
    });

    catAnswers.set(msg.id, catEntry.name);

    const updatedButton = ButtonBuilder.from(button).setCustomId(`catch:${msg.id}`);
    const updatedRow = new ActionRowBuilder().addComponents(updatedButton);
    await msg.edit({ components: [updatedRow] });

    setTimeout(async () => {
        try {
            const disabledButton = ButtonBuilder.from(updatedButton).setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
            await msg.edit({
                content: '⏰ The cat ran away!',
                components: [disabledRow]
            });
            catAnswers.delete(msg.id);
        } catch (err) {
            console.error('Timeout error disabling button:', err);
        }
    }, 5 * 60 * 1000);
}

export default async function () {
    logger.info('[autoSpawner] File loaded');

    const setup = loadSetup();

    const spawnToAllGuilds = async () => {
        for (const [guildId, channelId] of Object.entries(setup)) {
            await spawnRandomCat(channelId, guildId);
        }
    };

    const startSpawner = async () => {
        logger.info('[autoSpawner] Starting 10-minute cat spawn timer...');

        await spawnToAllGuilds();
        setInterval(spawnToAllGuilds, 10 * 60 * 1000);
    };

    if (client.isReady()) {
        startSpawner();
    } else {
        client.once('ready', startSpawner);
    }
}