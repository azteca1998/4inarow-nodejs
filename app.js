// Requires
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var uuid = require('uuid');


// Game engine code
function uuidToString(uuid) {
  // Converts an UUID from its binary form to its ascii form.
  //   Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  var text = '';

  for (i = 0; i < 16; i++) {
    var part = uuid[i].toString(16);
    if (part.length == 1) {
      part = '0' + part;
    }
    text += part;

    if (i == 3 || i == 5 || i == 7 || i == 9) {
      text += '-';
    }
  }

  return text;
}


class User {
  constructor(socket) {
    this.socket = socket;
    this.uuid = new Array(16);
    this.username = null;
    this.gameRoom = null;

    uuid.v4(null, this.uuid, 0);

    console.log('A new user with uuid ' + uuidToString(this.uuid) + ' has connected.');

    var self = this;
    this.socket.on('disconnect', function() {
      var msg = 'The user with uuid ' + uuidToString(self.uuid);
      if (self.username != null) {
        msg += ' and username ' + toString(self.username);
      }
      msg += ' has disconnected.';
      console.log(msg);

      // Broadcast logout
      if (self.username != null) {
        for (var userPos in connectedUsers) {
          var user = connectedUsers[userPos];
          if (user != self && self.username != null) {
            user.socket.emit('chat-message', '<Server>', self.username + ' quitted');
          }
        }
      }

      // Quit from current game if playing
      if (self.gameRoom != null) {
        self.gameRoom.delPlayer(self);
      }

      // Note: indexOf() returns -1 if the element is not found. This shouldn't
      //   affect the code because each user should be present on the array.
      connectedUsers.splice(connectedUsers.indexOf(self), 1);
    });

    this.socket.on('set-username', function(username) {
      if (self.username == null) {
        console.log('Setting username ' + username + ' for user ' + uuidToString(self.uuid));
        self.username = username;

        // Broadcast login
        for (var userPos in connectedUsers) {
          var user = connectedUsers[userPos];
          if (user != self && self.username != null) {
            user.socket.emit('chat-message', '<Server>', self.username + ' joined');
          }
        }
      }
    });

    this.socket.on('chat-message', function(msg) {
      for (var userPos in connectedUsers) {
        var user = connectedUsers[userPos];
        if (user != self && self.username != null) {
          user.socket.emit('chat-message', self.username, msg);
        }
      }
    });

    this.socket.on('chat-command', function(cmd) {
      handleCommand(self, cmd);
    });

    this.socket.on('column-click', function(n) {
      if (self.gameRoom != null && self.gameRoom.isPlaying(self)) {
        self.gameRoom.place(self, n);
      }
    });
  }

  update(gameRoom) {
    this.gameRoom = gameRoom;

    if (gameRoom == null) {
      this.socket.emit('lock-board');
    } else {
      this.socket.emit('set-board', gameRoom.cells);
    }
  }

  unlock() {
    this.socket.emit('unlock-board');
  }
}


class Board {
  constructor(user) {
    this.users = [];
    this.cells = new Array(6*7);
    this.turn = 0;

    this.addUser(user);

    user.socket.emit('chat-message', '<Server>', 'Room created. Waiting for an adversary');
    for (var userPos in connectedUsers) {
      var it = connectedUsers[userPos];
      if (it.username != user.username && user.username != null) {
        it.socket.emit('chat-message', '<Server>', user.username + ' has created a room');
      }
    }
  }

  addUser(user) {
    if (user.gameRoom == null) {
      this.users.push(user);
      user.update(this);

      if (this.users.length == 2) {
        this.users[0].socket.emit('chat-message', '<Server>', 'Your color is green. You start!');
        this.users[1].socket.emit('chat-message', '<Server>', 'Your color is blue. ' + this.users[0].username + ' starts.');

        for (var i = 0; i < this.users.length; i++) {
          this.users[i].socket.emit('unlock-board');
        }
      }
    }
  }

  delUser(user) {
    var idx = this.users.indexOf(user);
    if (idx == -1) {
      return;
    }
    if (idx >= 2) {
      // Spectator
      this.users.splice(idx, 1);
      user.update(null);
    } else {
      // Player
      for (var i = 0; i < this.users.length; i++) {
        this.users[i].update(null);
      }
      this.users = [];
      this.delBoard();
    }
  }

  delBoard() {
    activeBoards.splice(activeBoards.indexOf(this), 1);
  }

  isPlaying(user) {
    for (var i = 0; i < this.users.length; i++) {
      if (i == 2) {
        break;
      }
      if (user == this.users[i]) {
        return true;
      }
    }
    return false;
  }

  place(user, n) {
    if (user != this.users[this.turn]) {
      return;
    }

    var cellColor;
    if (user == this.users[0]) {
      cellColor = 'green';
    } else if (user == this.users[1]) {
      cellColor = 'blue';
    }

    for (var i = 35 + n; i >= 0; i -= 7) {
      if (this.cells[i] == null) {
        this.cells[i] = cellColor;
        // Update users' board
        for (var j = 0; j < this.users.length; j++) {
          this.users[j].update(this);
        }
        if (this.check(i)) {
          var winner, loser;
          if (this.turn == 0) {
            winner = this.users[0];
            loser = this.users[1];
          } else {
            winner = this.users[1];
            loser = this.users[0];
          }
          winner.socket.emit('chat-message', '<Server>', 'You won!');
          loser.socket.emit('chat-message', '<Server>', 'You lost.');
          // Delete the board
          this.delUser(this.users[0]);
        }
        // Switch turns
        if (this.turn == 0) {
          this.turn = 1;
        } else {
          this.turn = 0;
        }
        return;
      }
    }
  }

  check(nCell) {
    // TODO: Code this minding the cell number (nCell) to save computing power.
    for (var i = 0; i < 6; i++) {
      for (var j = 0; j < 7; j++) {
        var cell = this.cells[i*7+j];

        if (cell == null) {
          continue;
        }

        if (j+3 < 7 && cell == this.cells[i*7+j+1] && cell == this.cells[i*7+j+2] && cell == this.cells[i*7+j+3]) {
          return true;
        }
        if (i+3 < 6) {
          if (cell == this.cells[(i+1)*7+j] && cell == this.cells[(i+2)*7+j] && cell == this.cells[(i+3)*7+j]) {
            return true;
          }
          if (cell == this.cells[(i+1)*7+j+1] && cell == this.cells[(i+2)*7+j+2] && cell == this.cells[(i+3)*7+j+3]) {
            return true;
          }
          if (cell == this.cells[(i+1)*7+j-1] && cell == this.cells[(i+2)*7+j-2] && cell == this.cells[(i+3)*7+j-3]) {
            return true;
          }
        }
      }
    }
    return false;
  }
}

function handleCommand(user, command) {
  var parts = command.split(' ');

  switch(parts[0]) {
    case '/help':
      user.socket.emit('chat-message', '<Server>', 'Available commands:');
      user.socket.emit('chat-message', '<Server>', ' - /help - Show this message');
      user.socket.emit('chat-message', '<Server>', ' - /c /create - Create a new match');
      user.socket.emit('chat-message', '<Server>', ' - /j /join - Join a match');
      user.socket.emit('chat-message', '<Server>', ' - /i /invite - Invite someone to a match');
      user.socket.emit('chat-message', '<Server>', ' - /l /leave - Leave current match');
      break;
    case '/c':
    case '/create':
      if (user.gameRoom != null) {
        user.socket.emit('chat-message', '<Server>', 'You need to leave your current board first!');
      }

      console.log('Creating a new board (creator is ' + user.username + ')')
      activeBoards.push(new Board(user));
      break;
    case '/j':
    case '/join':
      if (parts.length < 2) {
        user.socket.emit('chat-message', '<Server>', 'Usage: ' + parts[0] + ' <creator username>');
      } else {
        if (user.gameRoom != null) {
          user.socket.emit('chat-message', '<Server>', 'You need to leave your current board first!');
        }

        for (var i = 0; i < activeBoards.length; i++) {
          if (activeBoards[i].users[0].username == parts[1]) {
            activeBoards[i].addUser(user);
            user.socket.emit('chat-message', '<Server>', 'You joined ' + activeBoards[i].users[0].username + '\'s board');
            for (var j = 0; j < activeBoards[i].users.length; j++) {
              var u = activeBoards[i].users[j];
              if (u != user) {
                u.socket.emit('chat-message', '<Server>', user.username + ' joined the board');
              }
            }
            break;
          }
        }
      }
      break;
    case '/i':
    case '/invite':
      if (parts.length < 2) {
        user.socket.emit('chat-message', '<Server>', 'Usage: ' + parts[0] + ' <target username>');
      } else if (user.gameRoom == null) {
        console.log(user, user.username, user.gameRoom);
        user.socket.emit('chat-message', '<Server>', 'You must already be in a board to invite users.');
      } else if (user.username == parts[1]) {
        user.socket.emit('chat-message', '<Server>', 'You can\'t invite yourself!');
      } else {
        for (var i = 0; i < connectedUsers.length; i++) {
          var u = connectedUsers[i];
          console.log("Username: " + u.username);
          if (u.username == parts[1]) {
            user.socket.emit('chat-message', '<Server>', 'Inviting user ' + u.username);
            u.socket.emit('chat-message', '<Server>', 'User ' + user.username + ' is inviting you to join his/her board');
            if (u.gameRoom != null) {
              u.socket.emit('chat-message', '<Server>', 'To join him/her, leave your current board with /l and type /j ' + user.username);
            } else {
              u.socket.emit('chat-message', '<Server>', 'To join him/her, type /j ' + user.username);
            }
            return;
          }
        }
        user.socket.emit('chat-message', '<Server>', 'There isn\'t any user with username ' + parts[1]);
      }
      break;
    case '/l':
    case '/leave':
      if (user.gameRoom == null) {
        user.socket.emit('chat-message', '<Server>', 'You must be in a board to be able to leave.');
      } else {
        user.socket.emit('chat-message', '<Server>', 'You left the board.');
        for (var i = 0; i < user.gameRoom.users.length; i++) {
          var u = user.gameRoom.users[i];
          if (u != user) {
            u.socket.emit('chat-message', '<Server>', user.username + ' left the board.');
          }
        }
        user.gameRoom.delUser(user);
      }
      break;
  }
}


var connectedUsers = [];
var activeBoards = [];


// HTTP server code
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});


io.on('connection', function(socket) {
  // Add the user to the connectedUsers array.
  connectedUsers.push(new User(socket));
});


http.listen(8080, function() {
  console.log('Listening on *:8080');
});

