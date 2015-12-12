//set up
var express = require('express')
var app = express();
var bodyParser = require('body-parser')

//If a client asks for a file,
//look in the public folder. If it's there, give it to them.
app.use(express.static(__dirname + '/public'));

//socket.io
var http = require('http').Server(app);
var io = require('socket.io')(http);
var users = [];
var nextID = 0;
var murderWordList = ["banana", "inception", "potato", "hot", "bump", "kerfuffle", "sherlock", "sing", "random", "platypus"];
var murderer = null;
var murderWord = null;
var gameState = null;
var lurkerCount = 0;
var lurkerTime = 30000;
var deathDelay = 30000;
var cards = ["lurker", "blackout", "dud"];


// On connection of a new player, create a new user
io.on('connection', function(socket){
  console.log("A new user has connected. Creating new user.");
  var user = {};
    user.id = nextID;
    user.name = user.id.toString();
    user.socket = socket;
    nextID++;
    user.state = "new";
    user.xp = 0;
    user.xpCategory = null;
    user.score = 0;
    //user.detectiveScore = 0;
    //user.murderScore = 0;
    //user.sessionScore = 0;
    user.sessionRank = null;
    user.cards = {};
      user.cards.blackOut = 0;
      user.cards.lurker = 0;
      user.cards.dud = 0;
    user.cardsAvail = 0;
    user.timeoutID = 0;
    user.lurker = false;
    users.push(user);
    console.log("A new user was created: " + user.name);

  // Hide accuse form & startbutton for the user who has just connected
  user.socket.emit('accuse form hide');
  user.socket.emit('start button hide'); 

  // List the online users + score, update user profiles
    userProfileData();
    userListUpdate(); 

  // Send all users msg on new user joining
  io.emit('announcement', user.name + ' has joined the room');

  //Checks if game is in session, if not, then checks number of uses, reveals start button as needed
  gameStartCheck();

  // Checks number of users
  function gameStartCheck() {
    //Checks if there is an active game
    if(gameState === true) {
      user.socket.emit('user numbers update', "Game in session.");
      io.emit('announcement', "New player " + user.name + " has joined but is not active for current game." )
    } else if (users.length<4) {
      io.emit('user numbers update', "Four players needed to start game.");
    } else {
        io.emit('user numbers hide');
        io.emit('start button unhide'); 
    };
  };

  // Checks number of Lurkers
  function lurkerCheck(){
    if(lurkerCount===1){
      io.emit('lurker alert on');
    } else if (lurkerCount===0) {
      io.emit('lurker alert off');
    };
  };

  //Sets lurker time if user is not the murderer
  function lurkerTimer() {
    console.log("Running the lurkerTimer function");
    if (user.state === "alive") {
        console.log("LurkerTimer: The user is not the murderer but they are alive, setting LurkerTime");
        user.timeoutID = setTimeout(function(){
          user.lurker = true;
          lurkerCount++;
          lurkerCheck();
          console.log('New Lurker: '+ user.name +' LurkerCount: '+lurkerCount);
        }, lurkerTime);
    };
  };

  // Compare by score
  function compareByScore(a,b){
    return b.score - a.score;
  };

  // GET USER WITH NAME DUH
  var GetUserWithName = function (userName) {
    for(i=0; i<users.length; i++){
        if(users[i].name === userName){
          return users[i];
        }
      }
    return null;
  }

  //Updates the user list, sends update to HTML, also updates each individual's score & username
  function userListUpdate() {
    console.log("User list updated begins.")
    uList = [];
    users.forEach(function(user) {
      var player = {name:user.name, score:user.score, state:user.state};
      uList.push(player);
    });
    uList.sort(compareByScore);
    io.emit('user update', uList);
    console.log("User list update complete.")
  };

  //Compare by session score
  function compareByScore(a,b){
    return b.score - a.score;
  }

  //Update ranks
  function userRank() {
    users.sort(compareByScore);
    users.forEach(function(user) {
      user.sessionRank = users.indexOf(user) + 1
    });
  };

  //Updates the single user's profile data
  function userProfileData() {
    var userProfile = {name:user.name, score:user.score};
    console.log("Sending "+userProfile.name+ "their profile data")
    user.socket.emit('profile data', userProfile);
  }; 

  //Updates all users profile data
  function allUsersProfileUpdate() {
    users.forEach(function(user) {
        userProfileData();
    });
  };

  // Change username, update all users about the name change
  socket.on('change username', function(updateUsername){
    var usernameMatch = 0;
    for(i=0; i<users.length; i++) {
      if(users[i].name===updateUsername)
        usernameMatch++;
    };
    if (usernameMatch === 0) {
      user.name = updateUsername;
      userProfileData();
      userListUpdate();
      io.emit('announcement', 'Welcome: ' + updateUsername);
    } else {
      user.socket.emit('choose another username');
      console.log('username taken');
    };
  });

  //When the Start Game button is clicked
  socket.on('start game', function(startGame){
    gameState = true;
    io.emit('start button hide');
    io.emit('show popover');
    console.log("Game starting");
    
    // do this for each user
    users.forEach(function(user) {
      user.state = "alive";

      // Establish how many CARDS they can click
      // If user's session rank is null (i.e it is the first round) they get two cards.
      if (user.sessionRank === null) {
      user.cardsAvail = 2;
      }
      // If user has a session rank the number of cards they get is calculated by 5/rank.
        else {
          user.cardsAvail = Math.ceil(5/user.sessionRank);
        };
        user.socket.emit('how many cards', user.cardsAvail);
        console.log("Username: " + user.name + " Cards available = " + user.cardsAvail);
    });

    // Randomly choose murderer
    console.log("Choosing murderer");
    var userMax = users.length - 1;
    var userMin = 0;
    var selectedUser = Math.floor(Math.random() * (userMax - userMin + 1)) + userMin;
    murderer = users[selectedUser];
    murderer.state = "murderer";
    murderer.lurker = false;
    console.log("Murderer has been chosen");
    //console.log(users);

    // Randomly choose murder word
    var wordMax = murderWordList.length - 1;
    var wordMin = 0;
    var selectedMurderWord = Math.floor(Math.random() * (wordMax - wordMin + 1)) + wordMin;
    murderWord = murderWordList[selectedMurderWord];

    // Tell the murderer what the murder word is
    console.log("The murderer is: " + murderer.name + '. The murder word is: ' + murderWord + '.');
    //io.emit('chat message', 'Sorry I ruined the game, the randomly selected murderer is ' + murderer.name + 
    //' and the murder word is ' + murderWord + '. Matt please help me only tell the murderer this important fact!!');
    murderer.socket.emit('show murder button', murderWord);
    //Tell everyone else they are not the murderer
    murderer.socket.broadcast.emit('announcement', "YOU ARE NOT THE MURDERER - BEWARE THERE IS A KILLER AMONGST US");
    murderer.socket.broadcast.emit('accuse form unhide');
    
    userListUpdate();

    //Start the lurker timer for everyone who is alive (not the murderer)
    users.forEach(function(user) {
      if (user.state==="alive") {
        user.timeoutID = setTimeout(function(){
        user.lurker = true;
        lurkerCount++;
        lurkerCheck();
        console.log('New Lurker: '+ user.name +' LurkerCount: '+lurkerCount);
        }, lurkerTime);
      };
    });

  });


  //CARDS
  socket.on('card pick', function(cardID){
      //-1 to the number of cards available to user
      user.cardsAvail--;
      //Randomly selects a card
      var cardTypeMax = cards.length - 1;
      var cardTypeMin = 0;
      var selectedCardType = Math.floor(Math.random() * (cardTypeMax - cardTypeMin + 1)) + cardTypeMin;
      var cardType = cards[selectedCardType];
      //+1 to the card type for the user
      if (cardType === "blackout") {
        user.cards.blackOut++;
      } else if (cardType === "lurker") {
        user.cards.lurker++;
      } else if (cardType === "dud") {
        user.cards.dud++;
      } else {
        console.log("Error: A non-valid card type was selected.")
      };
      //Sends user card selection
      var cardSelection = {card:cardType, cardID:cardID};
      user.socket.emit('and the card is', cardSelection);
      //Checks to see if user has cards available
      console.log(user.name+" sent "+cardID+", "+user.cardsAvail+" cards left to click");
      if(user.cardsAvail < 1){
      //No more cards available, sends user card selection
      user.socket.emit('card selection complete');
      userCardUpdate();
      }; 
  });

  function userCardUpdate() {
      var userCards = {username:user.name, blackout:user.cards.blackOut, lurker:user.cards.lurker, dud:user.cards.dud};
      user.socket.emit('powerup button update', userCards);
   };

  // When the LURKER button is clicked
  socket.on('death to lurkers', function(){
    // Only run this function if game is running
    if(gameState === true) {
      user.cards.lurker--;
      userCardUpdate();
      if(lurkerCount>0){
        users.forEach(function(user){
          // If the user is a lurker and they are alive, kill them
          if(user.lurker===true && user.state==="alive"){
            user.state="dead";
            user.socket.emit('accuse form hide');
        };
      });
    };
      userListUpdate();
      allUsersProfileUpdate();
      io.emit('announcement', lurkerCount + " LURKERS HAVE BEEN KILLED");
      murdererWinCheck();
      lurkerCount=0;
      lurkerCheck();
    };
  });

  // When the BLACKOUT button is clicked
  socket.on('blackout time', function(){
    if(gameState === true) {
      user.cards.blackOut--;
      userCardUpdate();
      io.emit('blackout');
    };
  });

  //WHEN A CHAT MESSAGE IS SENT
  socket.on('chat message', function(chat){
    // Check if user state is dead
    var msg = chat.msg;
    if(user.state==="dead"){
      //split creates array from string split at argument
      var words = msg.split(" ");
      // search the words array, add ooo to end of each word
      words.forEach(function(word, index) {
        words[index]+="oooooooooo";
      });
      //join builds string from array joined at argument
      msg = words.join(" ");
    };

    //Send chat message to all players
    var chatUpdate = {sender:user.name, content:msg};
    //console.log(chat);
    io.emit('chat message', chatUpdate); 

    // Reset the lurker fields & timer
    if(user.lurker===true) {
      console.log("This user " + user.name + " was a lurker. " + user.lurker);
      user.lurker = false;
      lurkerCount--;
      lurkerCheck();
      console.log("This user " + user.name + " is no longer a lurker. " + user.lurker);
      console.log("this is the lurkercount: " + lurkerCount);
      clearTimeout(user.timeoutID);
      lurkerTimer();
    } else {
      console.log("user was not a lurker");
    };

    //checking murderer chat for murderword, if murder word is found, check # of usernames, 
    //if # usernames = 1, check that the person is alive, if they are, kill them.
    if(user===murderer){
      console.log("User who chatted is murderer(" + user.name + "). Checking chat for murdered word.");
      //Check chat for murder word
      var murderWordToSearch = new RegExp("\\b"+murderWord+"\\b");
      console.log("Murder word to search = " + murderWordToSearch);
      var murderWordSearchResult = murderWordToSearch.test(msg);
      console.log("Murder word search results = " + murderWordSearchResult);
      if(murderWordSearchResult === true) {
        console.log("Murderword search result was true");
        console.log("This is the chat victim: ");
        console.log(chat.victim);
        if(chat.victim !== null) {
          console.log(chat.victim+" is about to die.");
          var victim = GetUserWithName(chat.victim);
          //users.forEach(function(user) {
            //if(user.state==="alive" && msg.indexOf(user.name)>-1){
          victim.state = "halfDead";
          userListUpdate();
          console.log(victim.name + " is now half dead.");
          if (victim.lurker === true) {
            console.log(lurkerCount);
            console.log("Lurker is now half dead. Removing " + victim.name + " from lurker count");
            victim.lurker = false;
            lurkerCount--;
            clearTimeout(user.timeoutID);
            console.log(lurkerCount);
          };
        
          setTimeout(function(){ 
            victim.state = "dead";
            io.emit('death anim');
            victim.socket.emit('accuse form hide');
            io.emit('announcement', victim.name + " IS DEAD");
            console.log(victim.name + " is now dead.");
            //console.log(users);
            murdererWinCheck();
            userListUpdate();              
          }, Math.floor(Math.random() * deathDelay));
        };
      }; 
    };
  });

  //has murderer won?
  var murdererWinCheck = function(){
    var aliveCount = 0;
    //First, check that the murderer didn't kill themselves - removed so murderer can't kill
    /*if (murderer.state === "dead") {
      console.log("Murdered killed themselves");
      io.emit('chat message', "The murderer just killed themselves. Now that's clever. And stupid. -1 to " + murderer.name);
      murderer.score = murderer.score - 1;
      resetGame();
    } 
    else {*/ 
    for (i=0; i<users.length; i++){
        if(users[i].state==="alive" || users[i].state==="halfDead"){
          aliveCount++;
        };
      };
    if (aliveCount===0) {
      io.emit('announcement', "DEAD, DEAD, THEY'RE ALL DEAD!! The Murderer Has Won. +1 to " + murderer.name);
      murderer.score++;
      //murderer.sessionScore++;
      //murderer.murderScore++;
      allUsersProfileUpdate();
      userListUpdate();
      userRank();
      resetGame();
    };
  };

  //Resetting the game
  var resetGame = function(){
    gameState = false;
    io.emit('accuse form hide');
    murderer.socket.emit('hide murder button');
    murderer = null;
    murderWord = null;
    lurkerCount = 0;
    users.forEach(function(user) {
      user.state = "new";
      user.cardsAvail = 0;
      clearTimeout(user.timeoutID);
      user.lurker = false;
    });
    userListUpdate();
    lurkerCheck();
    gameStartCheck();
  };


  // Has Murderer lost?
  socket.on('accusation', function(accused){ 
    if(user.state==="halfDead") {
      user.socket.emit('announcement', "Accusation unsuccessful, the murderer got to first! Just you wait . . .");
    } else if (accused===murderer.name){
      user.score++;
      //user.sessionScore++;
      //user.detectiveScore++;
      murderer.score--;
      //murderer.sessionScore--;
      //murderer.murderScore--;
      io.emit('announcement', "The murderer has been caught! +1 to " + user.name);
      userRank();
      resetGame();
      } else {
      user.state = "dead"
      user.score --;
      //user.sessionScore --;
      //user.detectiveScore --;
      io.emit('announcement', "Wap wow. False accusation. -1 to " + user.name);
      murdererWinCheck();
    };
    userListUpdate();
    allUsersProfileUpdate();
  });


  // On disconnect, remove the user from the userlist and update all users
  socket.on('disconnect', function(){
    console.log("A user has been disconnected. Run function to disconnect " + user.name);
    var index = users.indexOf(user);
    if(index > -1) {
      users.splice(index, 1);
    };
    // If user leaving is the murderer, reset the game and notify all players
    if(user===murderer){
        io.emit('announcement', "The murderer has left the room. Must be a pacifist! Game reset.");
        userRank();
        resetGame();
    } else if (user.state==="new") {
      gameStartCheck();
    };
    if (gameState===true) {
      murdererWinCheck();
    };  
    userListUpdate();
    io.emit('announcement', user.name + ' has left the room');
    console.log("The disconnection is complete for " + user.name);
  });



});


//listen for connections on port 3000
http.listen(process.env.PORT || 3000, function(){
  console.log('listening on *:3000');
});
