import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { RabbitEventMap } from "@nevo/shared-types";

const EXCHANGE_NAME = "nevo.events";

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
  connectionPromise ??= buildConnection();
  return connectionPromise;
};

export const getRabbitChannel = () => {
  channelPromise ??= (async () => {
    const connection = await getRabbitConnection();
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    return channel;
  })();
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
      channel.nack(message, false, true);
    }
  });
};
