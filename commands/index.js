export const commandPrefix = '.'

const commands = {}

export const addCommand = (command, help, func, error) => {
  commands[command] = { error, func, help }
}


export default commands

