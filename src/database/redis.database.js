import { createClient } from "redis";

import { config } from "../../config.js";

let redisClient = null;
let redisConnectPromise = null;

const createRedisClient = () => {
  const client = createClient({
    socket: {
      host: config.redisHost || "127.0.0.1",
      port: Number(config.redisPort || 6379),
      reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
    },
    database: Number(config.redisDb || 0),
    ...(config.redisPassword ? { password: config.redisPassword } : {}),
  });

  client.on("connect", () => {
    console.log("Redis: conectando...");
  });

  client.on("ready", () => {
    console.log("Redis: conexión disponible.");
  });

  client.on("reconnecting", () => {
    console.log("Redis: reconectando...");
  });

  client.on("error", (error) => {
    console.error("Redis error:", error);
  });

  client.on("end", () => {
    console.log("Redis: conexión finalizada.");
  });

  return client;
};

export const getRedisClient = async () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }

  if (redisClient.isReady) {
    return redisClient;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisClient.connect().finally(() => {
      redisConnectPromise = null;
    });
  }

  await redisConnectPromise;

  return redisClient;
};

export const closeRedisClient = async () => {
  if (!redisClient?.isOpen) {
    return;
  }

  await redisClient.quit();

  redisClient = null;
  redisConnectPromise = null;
};

export const pingRedis = async () => {
  const client = await getRedisClient();

  return client.ping();
};
