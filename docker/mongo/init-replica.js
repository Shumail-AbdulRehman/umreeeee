// A dedicated Compose volume only. Never reconfigure an existing replica set.
const expected = {_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]};
let configuration;
try {
    configuration = rs.conf();
} catch (error) {
    if (error.code !== 94 && error.codeName !== "NotYetInitialized") throw error;
    const result = rs.initiate(expected);
    if (result.ok !== 1) throw new Error("Replica-set initialization failed.");
}
if (configuration && (
    configuration._id !== expected._id ||
    configuration.members.length !== 1 ||
    configuration.members[0].host !== expected.members[0].host
)) {
    throw new Error("The Mongo volume has a different replica-set configuration. No changes were made.");
}
let primary = false;
for (let attempt = 0; attempt < 90; attempt += 1) {
    if (db.getSiblingDB("admin").runCommand({hello: 1}).isWritablePrimary) {
        primary = true;
        break;
    }
    sleep(1000);
}
if (!primary) throw new Error("MongoDB did not elect a primary within 90 seconds.");
print("Replica set rs0 is ready.");
