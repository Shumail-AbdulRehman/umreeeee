from types import SimpleNamespace
from unittest.mock import Mock

from pymongo.errors import AutoReconnect

from app.queue import dispatcher, recovery


def test_dispatcher_dispatches_after_heartbeat_failure(monkeypatch):
    update_one = Mock(side_effect=[AutoReconnect('transient failure'), None, KeyboardInterrupt])
    db = SimpleNamespace(worker_heartbeats=SimpleNamespace(update_one=update_one))
    publisher = Mock()
    dispatch_once = Mock(return_value=True)
    sleep = Mock()
    monkeypatch.setattr(dispatcher, 'get_database', lambda: db)
    monkeypatch.setattr(dispatcher, 'RabbitPublisher', lambda: publisher)
    monkeypatch.setattr(dispatcher, 'dispatch_once', dispatch_once)
    monkeypatch.setattr(dispatcher, 'sleep', sleep)

    dispatcher.main()

    assert update_one.call_count == 3
    dispatch_once.assert_called_once_with(db, publisher)
    sleep.assert_called_once_with(2)
    publisher.close.assert_called_once_with()


def test_recovery_retries_after_error(monkeypatch, caplog, capsys):
    db = object()
    counts = {'dispatch_reset': 1}
    recover = Mock(side_effect=[AutoReconnect('private failure details'), counts])
    sleep = Mock()
    monkeypatch.setattr(recovery, 'recover', recover)

    recovery.main(database=db, sleep=sleep, iterations=2)

    assert recover.call_count == 2
    recover.assert_called_with(db)
    sleep.assert_called_once_with(15)
    assert capsys.readouterr().out == f'{counts}\n'
    assert caplog.messages == ['Red-team recovery retrying (AutoReconnect)']
