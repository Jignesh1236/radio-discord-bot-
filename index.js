const { 
    Client, 
    GatewayIntentBits, 
    ChannelType,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    StreamType
} = require('@discordjs/voice');

const prism = require('prism-media');
const ffmpegPath = require('ffmpeg-static');

const TOKEN = "TOKEN_HERE";

// Radio Stations Configuration
const RADIO_STATIONS = {
    "big927": {
        name: "BIG 92.7 FM (Vadodara)",
        url: "https://stream.zeno.fm/dbstwo3dvhhtv",
        emoji: "🎵"
    },
    "radiocity911": {
        name: "Radio City 91.1 FM (Vadodara)",
        url: "https://stream.zeno.fm/pxc55r5uyc9uv",
        emoji: "🎶"
    },
    "red935": {
        name: "Red 93.5 FM (Vadodara)",
        url: "https://stream.zeno.fm/9phrkb1e3v8uv",
        emoji: "🔴"
    },
    "radiomirchi983": {
        name: "Radio Mirchi 98.3 FM (Vadodara)",
        url: "https://eu8.fastcast4u.com/proxy/clyedupq?mp=%2F1?aw_0_req_lsid=2c0fae177108c9a42a7cf24878625444",
        emoji: "📻"
    },
    "kishorkumar": {
        name: "Kishore Kumar Radio",
        url: "https://stream.zeno.fm/0ghtfp8ztm0uv",
        emoji: "🎤"
    },
    "lata": {
        name: "Lata Mangeshkar Radio",
        url: "https://stream.zeno.fm/87xam8pf7tzuv",
        emoji: "🎼"
    },
    "handofjesus": {
        name: "Hand Of Jesus - Gujarati",
        url: "https://dc1.serverse.com/proxy/hojgujarati/stream",
        emoji: "🎇"
    }
};

let currentStreamUrl = RADIO_STATIONS.big927.url;
let currentStationId = "big927";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

let connection;
let player;
let currentChannel;

/* ---------------- STREAM CREATE ---------------- */
function createStream() {
    const ffmpeg = new prism.FFmpeg({
        executable: ffmpegPath,
        args: [
            "-reconnect", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-fflags", "nobuffer",
            "-flags", "low_delay",
            "-i", currentStreamUrl,
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2",
            "-vn"
        ]
    });

    return createAudioResource(ffmpeg, {
        inputType: StreamType.Raw
    });
}

/* ---------------- STAGE DIRECT SPEAK ---------------- */
async function enableStageDirectSpeak(channel) {
    try {
        if (channel.type === ChannelType.GuildStageVoice) {
            const me = await channel.guild.members.fetchMe();

            // Request to speak + unsuppress
            await me.voice.setRequestToSpeak(true);
            await me.voice.setSuppressed(false);

            console.log("Bot is now speaking on stage!");
        }
    } catch (err) {
        console.log("Stage speak error:", err.message);
    }
}

/* ---------------- CONNECT ---------------- */
async function connectToChannel(channel) {

    currentChannel = channel;

    connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
        } catch {
            reconnect();
        }
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    // Stage direct speak
    await enableStageDirectSpeak(channel);

    player = createAudioPlayer();

    player.on("error", error => {
        console.log("Player Error:", error.message);
        reloadStream();
    });

    player.on(AudioPlayerStatus.Idle, () => {
        reloadStream();
    });

    connection.subscribe(player);

    startStream();
}

/* ---------------- START STREAM ---------------- */
function startStream() {
    const resource = createStream();
    player.play(resource);
}

/* ---------------- RELOAD STREAM ---------------- */
function reloadStream() {
    if (!player) return;
    console.log("Reloading stream...");
    const resource = createStream();
    player.play(resource);
}

/* ---------------- RECONNECT ---------------- */
function reconnect() {
    if (!currentChannel) return;
    console.log("Reconnecting...");
    connectToChannel(currentChannel);
}

/* ---------------- COMMAND & INTERACTIONS ---------------- */
client.on("messageCreate", async (message) => {

    if (message.content === "!radio") {

        if (!message.member.voice.channel)
            return message.reply("Join voice channel first.");

        if (connection)
            return message.reply("Radio already running.");

        await connectToChannel(message.member.voice.channel);

        message.reply("📻 Radio Started (24/7 Mode)");
    }

    // Send radio player embed with dropdown
    if (message.content === "!player") {
        const embed = new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🎙️ Radio Station Selector")
            .setDescription("Select a radio station from the dropdown below")
            .addFields(
                { name: "Current Station", value: `${RADIO_STATIONS[currentStationId].emoji} ${RADIO_STATIONS[currentStationId].name}`, inline: false }
            )
            .setFooter({ text: "Click the dropdown to change station" })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("radio_select")
            .setPlaceholder("Choose a radio station...")
            .addOptions(
                Object.entries(RADIO_STATIONS).map(([id, station]) => ({
                    label: station.name,
                    value: id,
                    emoji: station.emoji,
                    default: id === currentStationId
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Handle radio station selection
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === "radio_select") {
        const selectedStationId = interaction.values[0];
        const selectedStation = RADIO_STATIONS[selectedStationId];

        if (!selectedStation) return interaction.reply({ content: "Station not found!", ephemeral: true });

        // Update current stream
        currentStreamUrl = selectedStation.url;
        currentStationId = selectedStationId;

        // Reload stream if bot is connected
        if (player) {
            reloadStream();
        }

        // Update embed
        const embed = new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("🎙️ Radio Station Selector")
            .setDescription("Select a radio station from the dropdown below")
            .addFields(
                { name: "Current Station", value: `${selectedStation.emoji} ${selectedStation.name}`, inline: false }
            )
            .setFooter({ text: "Switched to new station!" })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("radio_select")
            .setPlaceholder("Choose a radio station...")
            .addOptions(
                Object.entries(RADIO_STATIONS).map(([id, station]) => ({
                    label: station.name,
                    value: id,
                    emoji: station.emoji,
                    default: id === currentStationId
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({ embeds: [embed], components: [row] });
        
        console.log(`Switched to: ${selectedStation.name}`);
    }
});

/* ---------------- RELOAD ON USER JOIN ---------------- */
client.on("voiceStateUpdate", (oldState, newState) => {

    if (!connection || !currentChannel) return;

    // If someone joins same VC → reload stream
    if (!oldState.channelId && newState.channelId === currentChannel.id) {
        reloadStream();
    }

    // If bot kicked → reconnect
    if (oldState.id === client.user.id && !newState.channelId) {
        reconnect();
    }
});

/* ---------------- ERROR HANDLING ---------------- */
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

/* ---------------- LOGIN ---------------- */
client.login(TOKEN);
