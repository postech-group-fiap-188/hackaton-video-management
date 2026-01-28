
const dbName = "videosdb";
const coll = "videos";

db = db.getSiblingDB(dbName);

print(`[mongo-init] ensuring collection '${coll}' in db '${dbName}'`);

db.createCollection(coll);

db[coll].createIndex({ id: 1 }, { unique: true });
db[coll].createIndex({ userId: 1, createdAt: -1 });

print("[mongo-init] done");
