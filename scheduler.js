'use strict';

const { EC2Client, StopInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

let db;
let timer;

function getEC2Client(region) {
  return new EC2Client({ region: region || 'us-west-2' });
}

async function checkAndShutdown() {
  try {
    const cfg = db.prepare('SELECT * FROM scheduler_config WHERE id=1').get();
    if (!cfg || cfg.enabled !== 1) return;

    const lastActivity = new Date(cfg.last_activity + 'Z');
    const idleMs  = Date.now() - lastActivity.getTime();
    const idleMin = idleMs / 60000;

    if (idleMin >= cfg.limit_minutes) {
      console.log(`[Scheduler] Idle for ${idleMin.toFixed(1)} min — stopping all instances`);

      const instances = db.prepare('SELECT * FROM instances').all();
      for (const inst of instances) {
        try {
          // Only stop if currently running
          const ec2  = getEC2Client(inst.region);
          const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [inst.instance_id] }));
          const state = desc.Reservations?.[0]?.Instances?.[0]?.State?.Name;
          if (state === 'running') {
            await ec2.send(new StopInstancesCommand({ InstanceIds: [inst.instance_id] }));
            console.log(`[Scheduler] Stopped instance ${inst.instance_id}`);
          }
        } catch (err) {
          console.error(`[Scheduler] Error stopping ${inst.instance_id}:`, err.message);
        }
      }

      // Reset timer to avoid repeat stops
      db.prepare("UPDATE scheduler_config SET last_activity=datetime('now') WHERE id=1").run();
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
  }
}

function init(database) {
  db = database;
  // Check every minute
  timer = setInterval(checkAndShutdown, 60 * 1000);
  timer.unref(); // Don't prevent process exit
  console.log('[Scheduler] Idle auto-shutdown monitor started');
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { init, stop };
