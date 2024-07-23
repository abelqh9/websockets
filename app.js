// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const express = require("express");

const { redisClient, getRoomFromCache, addMessageToCache } = require("./redis");
const { addUser, getUser, deleteUser } = require("./users");

const app = express();
app.use(express.static(__dirname + "/public"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve frontend
app.get("/", async (req, res) => {
  res.render("index");
});
app.post("/toEmit", async (req, res) => {
  console.log("receiving data ...");
  console.log("body is ", req.body);
  if (req.body.to) {
    for (const toElement of req.body.to) {
      io.in(toElement).emit(req.body.event.name, req.body.event.data);
    }
  } else {
    io.emit(req.body.event.name, req.body.event.data);
  }

  res.send({ msg: "Enviado con exito" });
});

// [START cloudrun_websockets_server]
// Initialize Socket.io
const server = require("http").Server(app);
const io = require("socket.io")(server);

// [START cloudrun_websockets_redis_adapter]
const { createAdapter } = require("@socket.io/redis-adapter");
// Replace in-memory adapter with Redis
const subClient = redisClient.duplicate();
io.adapter(createAdapter(redisClient, subClient));
// [END cloudrun_websockets_redis_adapter]
// Add error handlers
redisClient.on("error", (err) => {
  console.error(err.message);
});

subClient.on("error", (err) => {
  console.error(err.message);
});

// Listen for new connection
io.on("connection", (socket) => {
  // const { token, userId } = socket.handshake.query;

  // if (userId) {
  //   addConnectedUser(+userId);
  //   io.emit("usersPresenceList", getConnectedUsers());
  // }

  // Add listener for "signin" event
  socket.on("signin", async ({ user, room }, callback) => {
    try {
      // Record socket ID to user's name and chat room
      addUser(socket.id, user, room);
      // Call join to subscribe the socket to a given channel
      socket.join(room);
      // Emit notification event
      socket.in(room).emit("notification", {
        title: "Someone's here",
        description: `${user} just entered the room`,
      });
      // Retrieve room's message history or return null
      const messages = await getRoomFromCache(room);
      // Use the callback to respond with the room's message history
      // Callbacks are more commonly used for event listeners than promises
      callback(null, messages);
    } catch (err) {
      callback(err, null);
    }
  });

  // [START cloudrun_websockets_update_socket]
  // Add listener for "updateSocketId" event
  socket.on("updateSocketId", async ({ user, room }) => {
    try {
      addUser(socket.id, user, room);
      socket.join(room);
    } catch (err) {
      console.error(err);
    }
  });
  // [END cloudrun_websockets_update_socket]

  // Add listener for "sendMessage" event
  socket.on("sendMessage", (message, callback) => {
    console.log("____message is ", message);

    // Retrieve user's name and chat room  from socket ID
    const { user, room } = getUser(socket.id);
    if (room) {
      console.log("____room is ", room);
      const msg = { user, text: message };
      // Push message to clients in chat room
      io.in(room).emit("message", msg);
      addMessageToCache(room, msg);
      callback();
    } else {
      callback("User session not found.");
    }
  });

  socket.on("joinChatBox", (ticketId) => {
    //logger.info("A client joined a ticket channel");
    socket.join(ticketId);
  });

  socket.on("joinNotification", () => {
    //logger.info("A client joined notification channel");
    socket.join("notification");
  });

  socket.on("joinTickets", (status) => {
    //logger.info(`A client joined to ${status} tickets channel.`);
    socket.join(status);
  });

  // Add listener for disconnection
  socket.on("disconnect", () => {
    // Remove socket ID from list
    const { user, room } = deleteUser(socket.id);
    if (user) {
      io.in(room).emit("notification", {
        title: "Someone just left",
        description: `${user} just left the room`,
      });
    }

    // if (userId) {
    //   removeConnectedUser(+userId);
    //   io.emit("usersPresenceList", getConnectedUsers());
    // }
  });
});
// [END cloudrun_websockets_server]

module.exports = server;
