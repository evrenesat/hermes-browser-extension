"""Capture chunk-pull: store, lease flow, notice, and envelope integration."""

import importlib.util
import json
import pathlib
import sys
import unittest

root = pathlib.Path(__file__).resolve().parents[1] / 'companion-plugin'
spec = importlib.util.spec_from_file_location('capture_plugin', root / '__init__.py', submodule_search_locations=[str(root)])
plugin = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = plugin
spec.loader.exec_module(plugin)
storemod = sys.modules['capture_plugin.context_store']
capturemod = sys.modules['capture_plugin.capture_store']
hooks = sys.modules['capture_plugin.hooks']
tools = sys.modules['capture_plugin.tools']


def turn(page='', capture=None):
    page_context = {'text': page}
    if capture is not None:
        page_context['capture'] = capture
    payload = {'protocol': 'hermes.browser.context.v1', 'contextScope': {'mode': 'follow-active'}, 'settings': {}, 'activeTab': {}, 'pageContext': page_context, 'tabs': [], 'selectedTabs': []}
    bc = {'delivery': 'full', 'payload': payload}
    return json.dumps({'protocol': 'hermes.browser.turn.v2', 'human_input': {'source': 'composer', 'text': 'test'}, 'browser_context': bc, 'attachment_context': {'items': []}, 'source_receipt': {'protocol': 'hermes.browser.turn.v2', 'version': 2, 'context_hash': 'hashX', 'delivery': 'full'}})


def hook_owner(session='session', turn_id='turn1', task_id='task1'):
    """The owner exactly as the trusted hook derives it from Hermes kwargs."""
    return storemod.ContextOwner(f'session:{session}', session, turn_id, task_id)


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class CaptureStoreTests(unittest.TestCase):
    def test_upload_adopt_read_and_repeat(self):
        clock = FakeClock()
        store = capturemod.CaptureStore(clock=clock)
        text = 'abcdef' * 5000  # 30000 chars
        uploaded = store.upload('session', text)
        self.assertTrue(uploaded['available'])
        capture_id = uploaded['capture_id']
        self.assertRegex(capture_id, r'^[a-f0-9]{32}$')
        self.assertTrue(store.adopt_or_refresh(capture_id, hook_owner()))
        first = store.read_chunk(capture_id, hook_owner(), 0, None)
        self.assertEqual(first['offset'], 0)
        self.assertEqual(first['chunk_chars'], 24000)
        self.assertTrue(first['has_more'])
        self.assertEqual(first['next_offset'], 24000)
        second = store.read_chunk(capture_id, hook_owner(), first['next_offset'], None)
        self.assertEqual(second['offset'], 24000)
        again = store.read_chunk(capture_id, hook_owner(), 0, None)
        self.assertEqual(again['chunk'], first['chunk'])

    def test_tail_chunk_and_offset_past_end(self):
        store = capturemod.CaptureStore()
        capture_id = store.upload('s2', 'y' * 25_000)['capture_id']
        store.adopt_or_refresh(capture_id, hook_owner('s2'))
        tail = store.read_chunk(capture_id, hook_owner('s2'), 24_000, None)
        self.assertEqual(tail['chunk'], 'y' * 1000)
        self.assertFalse(tail['has_more'])
        self.assertIsNone(tail['next_offset'])
        past = store.read_chunk(capture_id, hook_owner('s2'), 99_000, None)
        self.assertEqual(past['chunk'], '')
        self.assertFalse(past['has_more'])

    def test_session_fence_refuses_other_sessions_and_principals(self):
        store = capturemod.CaptureStore()
        capture_id = store.upload('mine', 'text here')['capture_id']
        store.adopt_or_refresh(capture_id, hook_owner('mine'))
        self.assertIsNone(store.read_chunk(capture_id, hook_owner('other'), 0, None))
        self.assertIsNotNone(store.read_chunk(capture_id, hook_owner('mine'), 0, None))

    def test_unadopted_upload_expires_sooner_than_adopted(self):
        clock = FakeClock()
        store = capturemod.CaptureStore(clock=clock, ttl_seconds=1800.0, upload_ttl_seconds=300.0)
        capture_id = store.upload('session', 'text')['capture_id']
        clock.now += 400
        self.assertFalse(store.adopt_or_refresh(capture_id, hook_owner()), 'pending capture should expire after 300s')
        capture_id2 = store.upload('session', 'text')['capture_id']
        store.adopt_or_refresh(capture_id2, hook_owner())
        clock.now += 400
        self.assertIsNotNone(store.read_chunk(capture_id2, hook_owner(), 0, None))
        clock.now += 1500
        self.assertIsNone(store.read_chunk(capture_id2, hook_owner(), 0, None))

    def test_bounds_and_eviction(self):
        store = capturemod.CaptureStore(max_chars=1000, max_per_session=2, max_captures=4)
        self.assertFalse(store.upload('session', 'a' * 1001)['available'])
        ids = [store.upload('session', f'text-{i}')['capture_id'] for i in range(3)]
        for capture_id in ids:
            store.adopt_or_refresh(capture_id, hook_owner())
        self.assertIsNone(store.read_chunk(ids[0], hook_owner(), 0, None))
        self.assertIsNotNone(store.read_chunk(ids[2], hook_owner(), 0, None))

    def test_refresh_extends_ttl(self):
        clock = FakeClock()
        store = capturemod.CaptureStore(clock=clock, ttl_seconds=1800.0)
        capture_id = store.upload('session', 'text')['capture_id']
        store.adopt_or_refresh(capture_id, hook_owner())
        clock.now += 1700
        store.adopt_or_refresh(capture_id, hook_owner())
        clock.now += 1700
        self.assertIsNotNone(store.read_chunk(capture_id, hook_owner(), 0, None))

    def test_clamp_chunk_args(self):
        self.assertEqual(capturemod.clamp_chunk_args({}), (0, 24000))
        self.assertEqual(capturemod.clamp_chunk_args({'offset': '12', 'chunk_chars': 5}), (12, 4000))
        self.assertEqual(capturemod.clamp_chunk_args({'offset': -5, 'chunk_chars': 10**9}), (0, 64000))
        self.assertEqual(capturemod.clamp_chunk_args({'offset': 'bad'}), (0, 24000))

    def test_disabled_store_refuses_uploads(self):
        store = capturemod.CaptureStore()
        store.configure(enabled=False)
        self.assertFalse(store.upload('session', 'text')['available'])


class EnvelopeIntegrationTests(unittest.TestCase):
    def test_put_bcp_v2_names_capture_and_adopts_it(self):
        store = storemod.BrowserContextStore()
        uploaded = store.captures.upload('session', 'full page text goes here')
        envelope = turn('page', capture={'id': uploaded['capture_id'], 'totalChars': 24, 'deliveredChars': 4, 'chunkChars': 24000})
        status = store.put_bcp_v2(envelope, hook_owner())
        self.assertTrue(status['available'])
        self.assertEqual(status['capture']['id'], uploaded['capture_id'])
        self.assertEqual(status['capture']['delivered_chars'], 4)
        chunk = store.captures.read_chunk(uploaded['capture_id'], hook_owner(), 4, 24000)
        self.assertEqual(chunk['chunk'], 'full page text goes here'[4:])
        self.assertEqual(chunk['total_chars'], 24)

    def test_notice_names_capture_when_present(self):
        notice = hooks._context_notice({
            'context_id': 'a' * 32,
            'scope': 'follow-active',
            'payload_hash': 'hashX',
            'capture': {'id': 'b' * 32, 'total_chars': 45000, 'delivered_chars': 40000, 'chunk_chars': 24000},
        })
        self.assertIn('browser_get_capture_chunk', notice)
        self.assertIn('capture_id=' + 'b' * 32, notice)
        self.assertIn('offset=40000', notice)
        plain = hooks._context_notice({'context_id': 'a' * 32, 'scope': 'follow-active', 'payload_hash': 'hashX'})
        self.assertNotIn('browser_get_capture_chunk', plain)

    def test_capture_chunk_lease_flow(self):
        store = storemod.BrowserContextStore()
        hooks.set_store(store)
        uploaded = store.captures.upload('session', 'z' * 50_000)
        envelope = turn('page', capture={'id': uploaded['capture_id'], 'totalChars': 50_000, 'deliveredChars': 40_000, 'chunkChars': 24000})
        store.put_bcp_v2(envelope, hook_owner())
        hook_kwargs = {'tool_name': 'browser_get_capture_chunk', 'args': {'capture_id': uploaded['capture_id'], 'offset': 40_000, 'chunk_chars': 999_999}, 'session_id': 'session', 'task_id': 'task1', 'turn_id': 'turn1'}
        hooks.pre_llm_call(**{**hook_kwargs, 'user_message': envelope, 'tool_name': None})
        granted = hooks.pre_tool_call(**hook_kwargs)
        self.assertIsNone(granted)
        result = json.loads(tools.browser_get_capture_chunk(hook_kwargs['args'], session_id='session', task_id='task1'))
        self.assertTrue(result['available'])
        self.assertEqual(result['offset'], 40_000)
        self.assertEqual(result['chunk_chars'], 64000)
        self.assertEqual(result['chunk'], 'z' * 10000)
        self.assertIsNone(result['next_offset'])
        denied = json.loads(tools.browser_get_capture_chunk(hook_kwargs['args'], session_id='session', task_id='task1'))
        self.assertFalse(denied['available'])

    def test_lease_flow_refuses_without_adopted_capture(self):
        store = storemod.BrowserContextStore()
        hooks.set_store(store)
        hook_kwargs = {'tool_name': 'browser_get_capture_chunk', 'args': {'capture_id': 'c' * 32}, 'session_id': 'session', 'task_id': 'task1', 'turn_id': 'turn1'}
        self.assertEqual(hooks.pre_tool_call(**hook_kwargs)['action'], 'block')
        denied = json.loads(tools.browser_get_capture_chunk(hook_kwargs['args'], session_id='session', task_id='task1'))
        self.assertFalse(denied['available'])


if __name__ == '__main__':
    unittest.main()