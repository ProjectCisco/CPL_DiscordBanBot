import fs from 'fs';
import { goldStar, suspendedId, laggerId, hostId } from '../constants';
import mongo from '../util/mongo';
import { addCommand } from '.';

// Initialize bot login
fs.readFile('/home/cpl/LegacyCplBots/data/tokens.json', (err, data) => {
  if (err) throw err;
  const tokens = JSON.parse(data);
  bot.login(tokens.ban);
});

bot.on("error", (err) => {
  console.error(err);
});

process.on("uncaughtException", (err) => {
  console.error(err);
});

// Infraction commands and their durations
const commands = {
  quit: [1, 3, 7, 14, 30, 180],
  minor: [0, 1, 2, 3, 5, 7],
  moderate: [0, 1, 4, 7, 14, 30, 180],
  major: [7, 14, 30, 180],
  extreme: [30, 180],
  lagger: [0, 0, 0],
  rhost: [0, 0, 0],
  comp: [7],
  smurf: [30],
  oversub: [3],
}

// Fetch target member and ID
const fetchTargetAndId = async (message, targetString) => {
  const initialTarget = message.mentions.members.first();
  if (initialTarget) return { target: initialTarget, id: initialTarget.id };

  const id = targetString.replace(/\D/g, '');
  if (!id) return null;

  try {
    const target = await message.guild.members.fetch(id);
    return { target, id };
  } catch (error) {
    console.error('Error fetching member:', error);
    return null;
  }
};

// Send infraction message and update roles
const sendInfractionMessageAndUpdateRoles = async (target, id, infractionMessage, message) => {
  const sentMessage = await message.channel.send(`<@${id}>${infractionMessage}`);

  if (target) {
    try {
      await target.send(`You've been suspended in the CPL Discord server\n${sentMessage.url}`);
      if (!target.roles.cache.has(suspendedId)) {
        await target.roles.add(suspendedId);
      }
      if (target.roles.cache.has(goldStar)) {
        await target.roles.remove(goldStar);
      }
    } catch (error) {
      console.error('Error sending DM to member:', error);
    }
  }
};

// Build response message
const buildResponseMessage = (player, target, tiers) => {
  const tier = player.tier || 0;
  return `**${target.displayName}**\n${tiers[tier]}`;
};

// Handle different types of infractions
const handleInfraction = async (message, command, targetData, player) => {
  if (!targetData) return message.channel.send('Member not found.');

  const { target, id } = targetData;
  let tiers, infractionMessage;

  switch (command) {
    case 'lagger':
      tiers = [
        '1st warning for laggerTag.',
        '2nd warning for laggerTag.',
        '3rd warning: Lagger role assigned.',
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier >= 3) {
        const laggerRole = target.guild.roles.cache.get(laggerId);
        if (laggerRole) {
          await target.roles.add(laggerRole);
          await message.channel.send(`${target.displayName} has been assigned the Lagger role.`);
        } else {
          await message.channel.send('Lagger role not found.');
        }
      } else {
        await mongo.updateLaggerTier(id);
      }
      break;

    case 'rhost':
      tiers = [
        '1st warning for Host.',
        '2nd warning for Host.',
        '3rd warning: Host role removed.',
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier >= 3) {
        const hostRole = target.guild.roles.cache.get(hostId);
        if (hostRole) {
          await target.roles.remove(hostRole);
          await message.channel.send(`${target.displayName} has had their Host role removed.`);
        } else {
          await message.channel.send('Host role not found.');
        }
      } else {
        await mongo.updateRhostTier(id);
      }
      break;

    case 'quit':
      tiers = [
        '1 day suspension.',
        '3 day suspension.',
        '7 day suspension.',
        '14 day suspension.',
        '30 day suspension.',
        `\n**RESULT:** ${target.displayName} banned from server.`
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier < 6) {
        await mongo.suspensionDue(id);
      } else {
        await mongo.banDue(id);
        await target.ban({ reason: 'Tier 6 Quit' });
      }
      break;

    case 'minor':
      tiers = [
        '\n**RESULT:** Warning.',
        '\n**RESULT:** 1 day suspension.',
        '\n**RESULT:** 2 day suspension.',
        '\n**RESULT:** 3 day suspension.',
        '\n**RESULT:** 5 day suspension.',
        '\n**RESULT:** 7 day suspension.'
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier > 1) {
        await mongo.suspensionDue(id);
      }
      break;

    case 'moderate':
      tiers = [
        '\n**RESULT:** Warning.',
        '\n**RESULT:** 1 day suspension.',
        '\n**RESULT:** 4 day suspension.',
        '\n**RESULT:** 7 day suspension.',
        '\n**RESULT:** 14 day suspension.',
        '\n**RESULT:** 30 day suspension.'
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier > 1) {
        await mongo.suspensionDue(id);
      }
      break;

    case 'major':
      tiers = [
        '\n**RESULT:** 7 day suspension.',
        '\n**RESULT:** 14 day suspension.',
        '\n**RESULT:** 30 day suspension.',
        `\n**RESULT:** ${target.displayName} banned from server.`
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier < 4) {
        await mongo.suspensionDue(id);
      } else {
        await mongo.banDue(id);
        await target.ban({ reason: `Major Infraction - Tier ${player.tier}` });
      }
      break;

    case 'extreme':
      tiers = [
        '\n**RESULT:** 30 day suspension.',
        `\n**RESULT:** ${target.displayName} banned from server.`
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      if (player.tier === 1) {
        await mongo.suspensionDue(id);
      } else {
        await mongo.banDue(id);
        await target.ban({ reason: `Extreme Infraction - Tier ${player.tier}` });
      }
      break;

    case 'comp':
      tiers = [
        '\n**RESULT:** 7 day suspension.',
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      await mongo.suspensionDue(id, 7); 
      await target.roles.add(suspendedId);
      break;

    case 'smurf':
      tiers = [
        '\n**RESULT:** 30 day suspension.',
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      await mongo.suspensionDue(id, 30);
      await target.roles.add(suspendedId);
      break;

    case 'oversub':
      tiers = [
        '\n**RESULT:** Each sub after the 3rd in a month is a 3 day suspension.',
      ];
      infractionMessage = buildResponseMessage(player, target, tiers);
      await mongo.suspensionDue(id, 3);
      await target.roles.add(suspendedId);
      break;

    default:
      return;
  }

  await sendInfractionMessageAndUpdateRoles(target, id, infractionMessage, message);
};

// Command handler for .lookup command
const lookupCommandHandler = async (message, args) => {
  try {
    const targetString = args.join(' ');
    const targetData = await fetchTargetAndId(message, targetString);

    if (!targetData) {
      return message.channel.send('User not found. Please mention a valid member.');
    }

    const userData = await mongo.getUserData(targetData.id);

    if (!userData) {
      return message.channel.send("No data found for this user.");
    }

    const tiersMessage = [];
    const formatDecayTime = (decay) => {
      const days = decay.days > 0 ? `${decay.days} days` : '';
      const hours = decay.hours > 0 ? `${decay.hours} hours` : '';
      return days && hours ? `${days}, ${hours}` : days || hours || '0 hours';
    };
    Object.keys(userData).forEach((key) =>
      tiersMessage.push(`${key}: Tier ${userData[key].tier} (Decay in ${formatDecayTime(userData[key].decays)})`)
    );

    const messageContent = `Current punishment tiers for ${targetData.target.displayName}:\n${tiersMessage.join('\n')}`;
    message.channel.send(messageContent);
  } catch (error) {
    console.error('Error handling .lookup command:', error);
    message.channel.send('An error occurred while processing the command.');
  }
};

// Register command handlers for various infraction commands
addCommand('lookup', '`Usage: .lookup <member>`', lookupCommandHandler);

Object.entries(commands).forEach(([command, duration]) => {
  addCommand(command, `\`Usage: .${command} <member>\``, async (message, [targetString]) => {
    const targetData = await fetchTargetAndId(message, targetString);
    const player = await mongo.applyPunishment(targetData.id, command, duration);
    await handleInfraction(message, command, targetData, player);
  }, `Error handling .${command}`);
});