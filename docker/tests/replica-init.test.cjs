// Test the actual initializer with mongosh boundaries; no database is contacted.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const source = fs.readFileSync(path.join(__dirname, '../mongo/init-replica.js'), 'utf8')
const expected = { _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }
function run({ configuration = expected, missing = false, readyAfter = 0, failure, initiation = { ok: 1 } } = {}) {
  let initiated = 0, polls = 0, sleeps = 0
  const context = {
    rs: {
      conf() {
        if (failure) throw failure
        if (missing) throw Object.assign(Error('Not initialized'), { code: 94 })
        return configuration
      },
      initiate(config) {
        assert.equal(JSON.stringify(config), JSON.stringify(expected))
        initiated += 1
        return initiation
      },
    },
    db: { getSiblingDB: () => ({ runCommand: () => ({ isWritablePrimary: polls++ >= readyAfter }) }) },
    sleep: () => { sleeps += 1 },
    print: () => {},
  }
  vm.runInNewContext(source, context)
  return { initiated, polls, sleeps }
}
test('initializes a fresh replica set and waits for election', () => {
  assert.deepEqual(run({ missing: true, readyAfter: 2 }), { initiated: 1, polls: 3, sleeps: 2 })
})
test('restarting with the expected set never reinitializes it', () => {
  assert.equal(run().initiated, 0)
})
test('never reconfigures an incompatible existing volume', () => {
  assert.throws(() => run({ configuration: { _id: 'other', members: expected.members } }), /different replica-set/)
  assert.throws(() => run({ configuration: { ...expected, members: [{ _id: 0, host: 'other:27017' }] } }), /different replica-set/)
})
test('does not mistake arbitrary database failures for a fresh database', () => {
  assert.throws(() => run({ failure: Error('Connection lost') }), /Connection lost/)
})
test('fails closed if initialization or election fails', () => {
  assert.throws(() => run({ missing: true, initiation: { ok: 0 } }), /initialization failed/)
  assert.throws(() => run({ readyAfter: 100 }), /90 seconds/)
})
