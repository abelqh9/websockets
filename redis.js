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

// [START cloudrun_websockets_redis]
const REDISHOST = process.env.REDISHOST || "localhost";
const REDISPORT = process.env.REDISPORT || 6379;

// Instantiate the Redis client
const redisClient = require("redis").createClient({
  // url: `redis://${REDISHOST}:${REDISPORT}`,
  socket: {
    host: "redis-17886.c284.us-east1-2.gce.redns.redis-cloud.com",
    port: 17886,
  },
  password: "MaJJm93KUZ3RhcgKRq415ANOYtb7Td26",
});

const subClient = redisClient.duplicate();

// Connect to the Redis server
(async () => {
  await redisClient.connect();
  await subClient.connect();
})();
// [END cloudrun_websockets_redis]

// Insert new messages into the Redis cache
async function addMessageToCache(roomName, msg) {
  // Check for current cache
  let room = await getRoomFromCache(roomName);
  if (room) {
    // Update old room
    room.messages.push(msg);
  } else {
    // Create a new room
    room = {
      room: roomName,
      messages: [msg],
    };
  }
  await redisClient.set(roomName, JSON.stringify(room));
  // Insert message to the database as well
  addMessageToDb(room);
}

// Query Redis for messages for a specific room
// If not in Redis, query the database
async function getRoomFromCache(roomName) {
  if (!(await redisClient.exists(roomName))) {
    const room = getRoomFromDatabase(roomName);
    if (room) {
      await redisClient.set(roomName, JSON.stringify(room));
    }
  }
  return JSON.parse(await redisClient.get(roomName));
}

// In-memory database example -
// Production applications should use a persistent database such as Firestore
const messageDb = [
  {
    room: "my-room",
    messages: [
      { user: "Chris", text: "Hi!" },
      { user: "Chris", text: "How are you!?" },
      { user: "Megan", text: "Doing well!" },
      { user: "Chris", text: "That's great" },
    ],
  },
  {
    room: "new-room",
    messages: [
      { user: "Chris", text: "The project is due tomorrow" },
      { user: "Chris", text: "I am wrapping up the final pieces" },
      { user: "Chris", text: "Are you ready for the presentation" },
      { user: "Megan", text: "Of course!" },
    ],
  },
];

// Insert messages into the example database for long term storage
async function addMessageToDb(data) {
  const room = messageDb.find((messages) => messages.room === data.room);
  if (room) {
    // Update room in database
    Object.assign(room, data);
  } else {
    // Create new room in database
    messageDb.push(data);
  }
}

// Query the example database for messages for a specific room
function getRoomFromDatabase(roomName) {
  return messageDb.find((messages) => messages.room === roomName);
}

module.exports = {
  getRoomFromCache,
  addMessageToCache,
  redisClient,
  subClient,
};
