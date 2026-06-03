import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { RabbitEventMap } from "@nevo/shared-types";

const EXCHANGE_NAME = "nevo.events";
const RETRY_COUNT_HEADER = "nevo-retry-count";

const readPositiveIntegerEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readNonNegativeIntegerEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getRetryCount = (message: ConsumeMessage) => {
  const value = message.properties.headers?.[RETRY_COUNT_HEADER];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
};

const scheduleRetry = (
  channel: Channel,
  message: ConsumeMessage,
  routingKey: keyof RabbitEventMap,
  retryCount: number,
  retryDelayMs: number
) => {
  const timer = setTimeout(() => {
    try {
      channel.publish(EXCHANGE_NAME, routingKey, message.content, {
        persistent: true,
        contentType: message.properties.contentType ?? "application/json",
        correlationId: message.properties.correlationId,
        headers: {
          ...message.properties.headers,
          [RETRY_COUNT_HEADER]: retryCount
        }
      });
    } catch (error) {
      console.error(`[rabbit] failed to republish ${routingKey} retry ${retryCount}`, error);
    }
  }, retryDelayMs);

  timer.unref?.();
};

let connectionPromise: Promise<ChannelModel> | undefined;
let channelPromise: Promise<Channel> | undefined;

const getRabbitUrl = () => process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const buildConnection = async () => {
  const connection = await connect(getRabbitUrl());
  connection.on("error", () => {
    connectionPromise = undefined;
    channelPromise = undefined;
  });
  connection.on("close", () => {
    connectionPromise = undefined;
    channelPromise = undefined;
  });
  return connection;
};

export const getRabbitConnection = () => {
  connectionPromise ??= buildConnection().catch((error) => {
    connectionPromise = undefined;
    channelPromise = undefined;
    throw error;
  });
  return connectionPromise;
};

export const getRabbitChannel = () => {
  channelPromise ??= (async () => {
    const connection = await getRabbitConnection();
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    return channel;
  })().catch((error) => {
    channelPromise = undefined;
    throw error;
  });
  return channelPromise;
};

export const publishEvent = async <TEventName extends keyof RabbitEventMap>(
  eventName: TEventName,
  payload: RabbitEventMap[TEventName]
) => {
  const channel = await getRabbitChannel();
  channel.publish(EXCHANGE_NAME, eventName, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: "application/json"
  });
};

type EventHandlers = {
  [TEventName in keyof RabbitEventMap]?: (payload: RabbitEventMap[TEventName]) => Promise<void> | void;
};

export const subscribeToEvents = async (serviceName: string, handlers: EventHandlers) => {
  const channel = await getRabbitChannel();
  const maxRetries = readNonNegativeIntegerEnv("RABBITMQ_FAILED_EVENT_MAX_RETRIES", 2);
  const retryDelayMs = readPositiveIntegerEnv("RABBITMQ_FAILED_EVENT_RETRY_DELAY_MS", 5000);
  await channel.prefetch(readPositiveIntegerEnv("RABBITMQ_PREFETCH", 5));

  const queueName = `${serviceName}.queue`;
  await channel.assertQueue(queueName, { durable: true });

  const eventNames = Object.keys(handlers) as Array<keyof RabbitEventMap>;
  for (const eventName of eventNames) {
    await channel.bindQueue(queueName, EXCHANGE_NAME, eventName);
  }

  await channel.consume(queueName, async (message: ConsumeMessage | null) => {
    if (!message) {
      return;
    }

    const routingKey = message.fields.routingKey as keyof RabbitEventMap;
    const handler = handlers[routingKey];

    if (!handler) {
      channel.ack(message);
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as RabbitEventMap[keyof RabbitEventMap];
      await (handler as (eventPayload: RabbitEventMap[keyof RabbitEventMap]) => Promise<void> | void)(payload);
      channel.ack(message);
    } catch (error) {
      console.error(`[${serviceName}] failed to process ${routingKey}`, error);

      const nextRetryCount = getRetryCount(message) + 1;
      if (nextRetryCount <= maxRetries) {
        scheduleRetry(channel, message, routingKey, nextRetryCount, retryDelayMs);
        channel.ack(message);
        console.warn(
          `[${serviceName}] scheduled retry ${nextRetryCount}/${maxRetries} for ${routingKey} in ${retryDelayMs}ms`
        );
        return;
      }

      console.error(`[${serviceName}] dropping ${routingKey} after ${maxRetries} failed retries`);
      channel.nack(message, false, false);
    }
  });
};
