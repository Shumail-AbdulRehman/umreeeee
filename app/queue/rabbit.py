"""Pika 1.4.4 BlockingConnection adapter; no test content in messages."""
import json

import pika

from app.core.config import RABBITMQ_URL, RED_TEAM_QUEUE_NAME


def connection():
    parameters = pika.URLParameters(RABBITMQ_URL)
    parameters.socket_timeout = 3
    parameters.blocked_connection_timeout = 5
    parameters.connection_attempts = 1
    parameters.heartbeat = 30
    return pika.BlockingConnection(parameters)


def declare(channel):
    channel.queue_declare(queue=RED_TEAM_QUEUE_NAME, durable=True)
    channel.queue_declare(queue=RED_TEAM_QUEUE_NAME + '.dead', durable=True)


class RabbitPublisher:
    def __init__(self):
        self.connection = connection()
        self.channel = self.connection.channel()
        declare(self.channel)
        self.channel.confirm_delivery()

    def publish(self, message):
        body = json.dumps(message, separators=(',', ':')).encode()
        if not self.channel.basic_publish(exchange='', routing_key=RED_TEAM_QUEUE_NAME,
                body=body, mandatory=True, properties=pika.BasicProperties(
                    delivery_mode=pika.DeliveryMode.Persistent, content_type='application/json')):
            raise RuntimeError('Broker did not confirm publication')

    def close(self):
        if self.connection.is_open:
            self.connection.close()
