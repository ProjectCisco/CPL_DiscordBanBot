import { MongoClient } from 'mongodb'

import util from './util'

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

let _cli, _susp, _bandue, _suspdue, _unsuspdue;

const connectToMongoDB = async (bot) => {
  const url = `mongodb://${bot}:${util.getToken('mongo')}@localhost:27017/`;
  try {
    const client = await MongoClient.connect(url, {
      useNewUrlParser: true,
      poolSize: 10,
      useUnifiedTopology: true,
    });
    _cli = client;
    _susp = _cli.db('players').collection('suspensions');
    _bandue = _cli.db('players').collection('bans_due');
    _suspdue = _cli.db('players').collection('suspensions_due');
    _unsuspdue = _cli.db('players').collection('unsuspensions_due');
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }
};

const updateDecay = (currentDecay) => {
  const decayDate = new Date();
  decayDate.setDate(decayDate.getDate() + 90);
  return decayDate > new Date(currentDecay) ? decayDate : currentDecay;
};

const updatePlayer = async (player) => {
  try {
    await _susp.updateOne(
      { _id: player._id },
      {
        $set: {
          suspended: player.suspended,
          ends: player.ends,
          "quit.tier": player.quit.tier,
          "quit.decays": player.quit.decays,
          "minor.tier": player.minor.tier,
          "minor.decays": player.minor.decays,
          "moderate.tier": player.moderate.tier,
          "moderate.decays": player.moderate.decays,
          "major.tier": player.major.tier,
          "major.decays": player.major.decays,
          "extreme.tier": player.extreme.tier,
          "extreme.decays": player.extreme.decays
        }
      }
    );
  } catch (err) {
    console.error("Error updating player:", err);
  }
};

const handlePunishmentDecay = async (player) => {
  let update = false;

  const punishments = ['quit', 'minor', 'moderate', 'major', 'extreme'];
  punishments.forEach((type) => {
    if (player[type] && player[type].tier && player[type].decays) {
      if (new Date() > new Date(player[type].decays) && player[type].tier > 0) {
        player[type].tier--;
        player[type].decays = updateDecay(player[type].decays);
        update = true;
      }
    }
  });

  if (update) await updatePlayer(player);
};

const checkSuspensions = async () => {
  try {
    const players = await _susp.find().toArray();
    const unsuspended = [];

    for (let player of players) {
      if (player.suspended && new Date() > new Date(player.ends)) {
        player.suspended = false;
        player.ends = null;
        unsuspended.push(player);
        await updatePlayer(player);
      } else {
        await handlePunishmentDecay(player);
      }
    }
    return unsuspended;
  } catch (err) {
    console.error("Error checking suspensions:", err);
    return [];
  }
};

const applyPunishment = async (memberId, type, duration) => {
  try {
    const member = await _susp.findOne({ _id: memberId });
    let tier = member && member[type] ? member[type].tier : 0;
    tier = Math.max(tier + 1, 0);

    let ends = member && member.ends && member.ends > new Date() ? new Date(member.ends) : new Date();
    const decays = updateDecay(new Date());

    ends.setDate(ends.getDate() + duration[tier] || duration[duration.length - 1]);

    await _susp.updateOne(
      { _id: memberId },
      {
        $set: {
          [`${type}.tier`]: tier,
          [`${type}.decays`]: decays,
          suspended: tier > 0,
          ends: ends,
        },
      },
      { upsert: true }
    );

    return { tier: tier, ends: ends };
  } catch (err) {
    console.error(`Error applying ${type} punishment:`, err);
  }
};

const quit = (memberId) => applyPunishment(memberId, 'quit', [0, 1, 3, 7, 14, 30, 180]);
const minor = (memberId) => applyPunishment(memberId, 'minor', [0, 1, 2, 3, 5, 7]);
const moderate = (memberId) => applyPunishment(memberId, 'moderate', [0, 1, 4, 7, 14, 30, 180]);
const major = (memberId) => applyPunishment(memberId, 'major', [7, 14, 30, 180]);
const extreme = (memberId) => applyPunishment(memberId, 'extreme', [30, 180]);

const addDays = async (memberId, num) => {
  try {
    const member = await _susp.findOne({ _id: memberId });
    const ends = member && member.ends && member.ends > new Date() ? new Date(member.ends) : new Date();
    ends.setDate(ends.getDate() + parseInt(num));

    await _susp.updateOne(
      { _id: memberId },
      {
        $set: {
          suspended: true,
          ends: ends,
        },
      },
      { upsert: true }
    );
    return ends;
  } catch (err) {
    console.error("Error adding days:", err);
  }
};

const rmDays = async (memberId, num) => {
  try {
    const member = await _susp.findOne({ _id: memberId });
    if (member && member.ends) {
      const ends = new Date(member.ends);
      ends.setDate(ends.getDate() - parseInt(num));

      await _susp.updateOne(
        { _id: memberId },
        {
          $set: {
            ends: ends,
          },
        }
      );
      return ends;
    }
    return null;
  } catch (err) {
    console.error("Error removing days:", err);
  }
};

const unsuspend = async (memberId) => {
  try {
    await _susp.updateOne(
      { _id: memberId },
      {
        $set: {
          suspended: false,
          ends: null,
        },
      }
    );
  } catch (err) {
    console.error("Error unsuspending:", err);
  }
};

const insertDue = async (collection, memberId) => {
  try {
    await collection.insertOne({ _id: memberId });
  } catch (err) {
    console.error(`Error inserting into ${collection.collectionName}:`, err);
  }
};

const unsuspendDue = (memberId) => insertDue(_unsuspdue, memberId);
const banDue = (memberId) => insertDue(_bandue, memberId);
const suspensionDue = (memberId) => insertDue(_suspdue, memberId);

const isSuspended = async (memberId) => {
  try {
    const member = await _susp.findOne({ _id: memberId });
    return member ? member.suspended : false;
  } catch (err) {
    console.error("Error checking suspension status:", err);
    return false;
  }
};

const isGoodyTwoShoes = async (memberId) => {
  try {
    let member = await _susp.findOne({ _id: memberId });

    if (!member || member === undefined) {
      return true; 
    }

    let infractionCount = 0;

    ['extreme', 'major', 'moderate', 'minor', 'quit'].forEach((severity) => {
      if (member[severity] && member[severity].tier > 0) {
        infractionCount++;
      }
    });

    return infractionCount === 0;
  } catch (err) {
    console.error("Error checking member's infraction status:", err);
    return false; 
  }
};


export default {
  connect: connectToMongoDB,
  checkSuspensions,
  isGoodyTwoShoes,
  quit,
  minor,
  moderate,
  major,
  extreme,
  addDays,
  rmDays,
  unsuspend,
  unsuspendDue,
  banDue,
  suspensionDue,
  isSuspended,
};