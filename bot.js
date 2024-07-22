import Discort from 'discord.js'
import 'log-timestamp'

import mongo from './util/mongo'
import commands, { commandPrefix } from './commands'

const bot = new Discort.Client()

bot.once('ready', async() => {
  mongo.connect('banbot')
  console.log('Ban Bot ready')
  // setInterval(async() => {
  //     let unsuspended = await mongo.checkSuspensions()
  //     for (player of unsuspended) {
  //         if (!player.suspended) {
  //             let member = await bot.guilds.cache.get(cplId).members.fetch(player._id)

  //             if (member && member.roles.cache.has(suspendedId))
  //                 await member.roles.remove(suspendedId)
  //             else if (!member)
  //                 await mongo.unsuspendDue(player._id)
  //             else return

  //             let msg = '<@' + player._id + '> unsuspended.'
  //             bot.guilds.cache.get(cplId).channels.cache.get(suspended).send(msg);
  //         }
  //     }
  // }, 60000)
})

bot.on('message', async (message) => {
  if (!message.content.startsWith(commandPrefix) || message.author.bot) return
  if (!isSuspendedChannel(message.channel) && !isBotTestingChannel(message.channel)) return
  if (!isModerator(message.member)) return

  const parts = message.content.split(' ')
  const key = parts[0].replace(commandPrefix, '')
  const params = parts.slice(1)
  const command = commands[key]
  if (!command) return
  const { error, func, help } = command
  const minParams = help.match(/[^\<]+(?=\>)/g).length
  if (params.length < minParams) return message.channel.send(help).then((msg) => msg.delete(30000))
    try {
      func(message, params)
    } catch (err) {
      console.error(`${error}: ${err}`)
      message.channel.send('An error occurred while processing the command.')
    }
  message.delete()
})
