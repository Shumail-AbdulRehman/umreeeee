from unittest.mock import Mock

import pika
import pytest

from app.queue.rabbit import RED_TEAM_QUEUE_NAME, RabbitPublisher


def test_confirmed_publish_accepts_none_and_preserves_delivery_options():
    publisher = object.__new__(RabbitPublisher)
    publisher.channel = Mock()
    publisher.channel.basic_publish.return_value = None

    publisher.publish({'v': 1, 'job_id': 'job-1'})

    publisher.channel.basic_publish.assert_called_once()
    kwargs = publisher.channel.basic_publish.call_args.kwargs
    assert kwargs['body'] == b'{"v":1,"job_id":"job-1"}'
    assert kwargs['mandatory'] is True
    assert kwargs['routing_key'] == RED_TEAM_QUEUE_NAME
    assert kwargs['properties'].delivery_mode == pika.DeliveryMode.Persistent.value
    assert kwargs['properties'].content_type == 'application/json'


def test_publish_propagates_broker_failure():
    publisher = object.__new__(RabbitPublisher)
    error = pika.exceptions.NackError([])
    publisher.channel = Mock()
    publisher.channel.basic_publish.side_effect = error

    with pytest.raises(pika.exceptions.NackError) as raised:
        publisher.publish({'v': 1})
    assert raised.value is error
