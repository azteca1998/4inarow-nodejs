# 4inarow-nodejs
4 in a row game implemented using NodeJS and Bootstrap.

## Usage
First of all, a username must be selected on the modal that is displayed automatically when the page is loaded. The username must have a length between 3 and 32 characters and should only contain uppercase and lowercase letters, numbers and underscores.

When the username is selected, the user is presented with a chat box on the right and a grayed board on the left. Typing /help on the chat box will enumerate the available commands.

To start a new game, the user number 1 (user1) has to type /c or /create to create a new room. Then, he/she can invite or wait other players to join his/her room. Only the first two players to join the game will play; that is: user1 and the first to join his/her room. The rest will be spectators of the game.

To join a game, the command /j or /join should be used with the username of the room's creator. For example, if user1 creates a room and user2 wants to join, then user2 should type "/j user1".

To leave the current room, the user must type /l or /leave. Mind that if the user that leaves the room is not a spectator, the current game will be cancelled.

When the current game ends, or a non-spectating player leaves the room, the board is grayed again, but not reset until the user joins a new game, or reloads the page.
