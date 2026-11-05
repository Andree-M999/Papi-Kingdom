require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// Configuratie (Pas dit aan naar jouw kanaal-ID's)
const HONEYPOT_CHANNEL_ID = '1527812303981117635';
const WELCOME_CHANNEL_ID = '1469816876161826916';

// Tijdelijke opslag voor actieve herstelcodes (Gebruik in productie eventueel een database zoals MongoDB of SQLite)
const recoveryCodes = new Map();

client.once('ready', () => {
    console.log(`✅ Ingelogd als ${client.user.tag}! De bot is klaar voor gebruik.`);
});

/**
 * 1. Spinnenweb (Honeypot) functionaliteit
 */
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.channel.id === HONEYPOT_CHANNEL_ID) {
        try {
            // Verwijder het bericht direct
            await message.delete().catch(() => {});

            // Geef de gebruiker een timeout van 1 dag (24 uur)
            const member = message.member;
            if (member && member.moderatable) {
                await member.timeout(24 * 60 * 60 * 1000, 'Bericht geplaatst in het spinnenweb/honeypot kanaal.');
            }

//! Genereer een unieke recovery code
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            recoveryCodes.set(message.author.id, { code, guildId: message.guild.id });

            // Bouw de DM Embed (overeenkomstig met jouw stijl)
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🔒 Your account may have been hacked')
                .setDescription(
                    `Your account posted a message in #${message.channel.name} in ${message.guild.name}, a channel where nobody is allowed to type. Hacked accounts and spam bots do that. That is why you received a timeout of 1 day.\n\n` +
                    `**What now?**\n` +
                    `1. Change your Discord password.\n` +
                    `2. Turn on two-factor authentication.\n` +
                    `3. Remove unknown apps under Settings → Authorised Apps.\n\n` +
                    `Do you have your account back? Then click the button below (works immediately).\n\n` +
                    `**Recovery code**\n\`\`\`${code}\`\`\``
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_recovery')
                    .setLabel('Herstel account / Verwijder timeout')
                    .setStyle(ButtonStyle.Success)
            );

            // Stuur naar de DM van de gebruiker (vang fouten op als DM's gesloten zijn)
            await message.author.send({ embeds: [dmEmbed], components: [row] }).catch(() => {
                console.log(`⚠️ Kon geen DM sturen naar ${message.author.tag} (mogelijk staan privéberichten uit).`);
            });

        } catch (error) {
            console.error('❌ Fout bij het afhandelen van het spinnenweb bericht:', error);
        }
    }
});

/**
 * 2. Welkomstbericht (Alles netjes binnen de embed)
 */
client.on('guildMemberAdd', async (member) => {
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!welcomeChannel) return;

    const memberCount = member.guild.memberCount;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`Welcome to ${member.guild.name}!`)
        .setDescription(
            `Welkom ${member} in ${member.guild.name}. Jij bent de ${memberCount}e in de server, lees even de regels door en veel plezier in de server!\n\n` +
            `Hi ${member}, glad you are here. You are member number ${memberCount}.`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] }).catch(console.error);
});

/**
 * 3. Afhandelen van knopklikken en modals (Recovery systeem)
 */
client.on('interactionCreate', async (interaction) => {
    // Knopklik in DM
    if (interaction.isButton() && interaction.customId === 'verify_recovery') {
        const modal = new ModalBuilder()
            .setCustomId('recovery_modal')
            .setTitle('Account Herstellen');

        const codeInput = new TextInputBuilder()
            .setCustomId('recovery_code_input')
            .setLabel('Typ hieronder de recovery code')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Typ de code exact over...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // Inzenden van de Modal met de code
    if (interaction.isModalSubmit() && interaction.customId === 'recovery_modal') {
        const userInputCode = interaction.fields.getTextInputValue('recovery_code_input').trim();
        const session = recoveryCodes.get(interaction.user.id);

        if (!session) {
            return interaction.reply({ content: '❌ Geen actieve herstelprocedure gevonden of deze is verlopen.', ephemeral: true });
        }

        if (userInputCode === session.code) {
            try {
                const guild = client.guilds.cache.get(session.guildId);
                if (guild) {
                    const guildMember = await guild.members.fetch(interaction.user.id);
                    if (guildMember) {
                        await guildMember.timeout(null, 'Juiste recovery code ingevoerd via DM.');
                    }
                }

                // Verwijder de code uit het geheugen nadat deze met succes is gebruikt
                recoveryCodes.delete(interaction.user.id);
                
                await interaction.reply({ content: '✅ Code correct! Je timeout is succesvol opgeheven. Welkom terug!', ephemeral: true });
            } catch (err) {
                console.error('❌ Fout bij het opheffen van de timeout:', err);
                await interaction.reply({ content: '❌ Er ging iets mis bij het opheffen van je timeout. Neem contact op met een beheerder.', ephemeral: true });
            }
        } else {
            await interaction.reply({ content: '❌ De ingevoerde code is onjuist. Probeer het opnieuw.', ephemeral: true });
        }
    }
});

// Start de bot via de token in het .env bestand
client.login(process.env.DISCORD_TOKEN);