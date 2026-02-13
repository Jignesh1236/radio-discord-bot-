const { 
    Client, 
    GatewayIntentBits, 
    ChannelType 
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
const STREAM_URL = "https://eu8.fastcast4u.com/proxy/clyedupq?mp=%2F1?aw_0_req_lsid=2c0fae177108c9a42a7cf24878625444";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
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
            "-i", STREAM_URL,
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

/* ---------------- COMMAND ---------------- */
client.on("messageCreate", async (message) => {

    if (message.content === "!radio") {

        if (!message.member.voice.channel)
            return message.reply("Join voice channel first.");

        if (connection)
            return message.reply("Radio already running.");

        await connectToChannel(message.member.voice.channel);

        message.reply("📻 Radio Started (24/7 Mode)");
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
