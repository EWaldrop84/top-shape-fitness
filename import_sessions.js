/**
 * Top Shape Fitness — Google Calendar → Supabase Import
 * Week of 6/14–6/21/2026
 * 
 * Run with: node import_sessions.js
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nhaescbzxxgowflgrgll.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY env var required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TRAINER_EMAILS = {
  eric:    'eric@topshapefitness.com',
  patrick: 'patrick@topshapefitness.com',
  emma:    'emma@topshapefitness.com',
  jack:    'jack@topshapefitness.com',
  nick:    'nick@topshapefitness.com',
};

const SESSIONS = [
  // ERIC — Monday 6/15
  { trainer:'eric', client:'Lenny Bucci',          date:'2026-06-15', start:'05:00', end:'06:00', dur:60 },
  { trainer:'eric', client:'Drayton Calmes',        date:'2026-06-15', start:'06:00', end:'06:45', dur:45 },
  { trainer:'eric', client:'Sam Farnham',           date:'2026-06-15', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'Stuart McCluer',        date:'2026-06-15', start:'08:00', end:'09:00', dur:60 },
  { trainer:'eric', client:'Jim McNab',             date:'2026-06-15', start:'09:00', end:'10:00', dur:60 },
  { trainer:'eric', client:'Karl Gedge',            date:'2026-06-15', start:'10:00', end:'11:00', dur:60 },
  { trainer:'eric', client:'Ferris Kaplan',         date:'2026-06-15', start:'11:00', end:'12:00', dur:60 },
  { trainer:'eric', client:'John Cosgrove',         date:'2026-06-15', start:'12:00', end:'13:00', dur:60 },
  { trainer:'eric', client:'Alex Opoulos',          date:'2026-06-15', start:'13:00', end:'14:00', dur:60 },
  // ERIC — Tuesday 6/16
  { trainer:'eric', client:'Lenny Bucci',           date:'2026-06-16', start:'05:00', end:'05:30', dur:30 },
  { trainer:'eric', client:'Michael Schuster',      date:'2026-06-16', start:'05:30', end:'06:00', dur:30 },
  { trainer:'eric', client:'Rob Peppin',            date:'2026-06-16', start:'06:00', end:'07:00', dur:60 },
  { trainer:'eric', client:'Guy Lacerte',           date:'2026-06-16', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'Ali Razet',             date:'2026-06-16', start:'08:00', end:'09:00', dur:60 },
  { trainer:'eric', client:'Suzi Poeton',           date:'2026-06-16', start:'09:00', end:'10:00', dur:60 },
  { trainer:'eric', client:'Jane Spelce',           date:'2026-06-16', start:'09:00', end:'09:30', dur:30 },
  { trainer:'eric', client:'Chad Waldorf',          date:'2026-06-16', start:'11:00', end:'12:00', dur:60 },
  { trainer:'eric', client:'Chip Sloan',            date:'2026-06-16', start:'12:00', end:'13:00', dur:60 },
  { trainer:'eric', client:'Dave Peppin',           date:'2026-06-16', start:'13:00', end:'14:00', dur:60 },
  { trainer:'eric', client:'Jennifer Turchetta',    date:'2026-06-16', start:'14:00', end:'15:00', dur:60 },
  { trainer:'eric', client:'Josh Reda',             date:'2026-06-16', start:'17:00', end:'17:30', dur:30 },
  { trainer:'eric', client:'Liz Buterbaugh',        date:'2026-06-16', start:'17:30', end:'18:30', dur:60 },
  // ERIC — Wednesday 6/17
  { trainer:'eric', client:'Lenny Bucci',           date:'2026-06-17', start:'05:00', end:'06:00', dur:60 },
  { trainer:'eric', client:'Devin Darcangelo',      date:'2026-06-17', start:'06:00', end:'06:30', dur:30 },
  { trainer:'eric', client:'Jamie McNab',           date:'2026-06-17', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'Alison Brewer',         date:'2026-06-17', start:'08:00', end:'08:30', dur:30 },
  { trainer:'eric', client:'Jim McNab',             date:'2026-06-17', start:'08:30', end:'09:30', dur:60 },
  { trainer:'eric', client:'Jamie McNab',           date:'2026-06-17', start:'09:30', end:'10:00', dur:30 },
  { trainer:'eric', client:'John Cosgrove',         date:'2026-06-17', start:'10:00', end:'11:00', dur:60 },
  { trainer:'eric', client:'Bubber Cockrell',       date:'2026-06-17', start:'11:00', end:'12:00', dur:60 },
  { trainer:'eric', client:'Alex Opoulos',          date:'2026-06-17', start:'13:00', end:'14:00', dur:60 },
  // ERIC — Thursday 6/18
  { trainer:'eric', client:'Lenny Bucci',           date:'2026-06-18', start:'05:00', end:'05:30', dur:30 },
  { trainer:'eric', client:'Michael Schuster',      date:'2026-06-18', start:'05:30', end:'06:00', dur:30 },
  { trainer:'eric', client:'Rob Peppin',            date:'2026-06-18', start:'06:00', end:'07:00', dur:60 },
  { trainer:'eric', client:'Guy Lacerte',           date:'2026-06-18', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'Stuart McCluer',        date:'2026-06-18', start:'08:00', end:'09:00', dur:60 },
  { trainer:'eric', client:'Suzi Poeton',           date:'2026-06-18', start:'09:00', end:'10:00', dur:60 },
  { trainer:'eric', client:'Ferris Kaplan',         date:'2026-06-18', start:'11:00', end:'12:00', dur:60 },
  { trainer:'eric', client:'Jodi Peppin',           date:'2026-06-18', start:'12:00', end:'13:00', dur:60 },
  { trainer:'eric', client:'Todd Turchetta',        date:'2026-06-18', start:'13:00', end:'13:30', dur:30 },
  { trainer:'eric', client:'Bob Cane',              date:'2026-06-18', start:'14:00', end:'15:00', dur:60 },
  { trainer:'eric', client:'Ken Richardson',        date:'2026-06-18', start:'15:00', end:'15:45', dur:45 },
  { trainer:'eric', client:'Dave Peppin',           date:'2026-06-18', start:'16:00', end:'17:00', dur:60 },
  { trainer:'eric', client:'Josh Reda',             date:'2026-06-18', start:'17:00', end:'17:30', dur:30 },
  { trainer:'eric', client:'Liz Buterbaugh',        date:'2026-06-18', start:'17:30', end:'18:30', dur:60 },
  // ERIC — Friday 6/19
  { trainer:'eric', client:'Lenny Bucci',           date:'2026-06-19', start:'05:00', end:'06:00', dur:60 },
  { trainer:'eric', client:'Jamie McNab',           date:'2026-06-19', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'David Breedlove',       date:'2026-06-19', start:'08:00', end:'09:00', dur:60 },
  { trainer:'eric', client:'Jane Spelce',           date:'2026-06-19', start:'08:30', end:'09:00', dur:30 },
  { trainer:'eric', client:'Jim McNab',             date:'2026-06-19', start:'09:00', end:'10:00', dur:60 },
  { trainer:'eric', client:'Chad Waldorf',          date:'2026-06-19', start:'11:00', end:'12:00', dur:60 },
  { trainer:'eric', client:'Greg Sanders',          date:'2026-06-19', start:'12:00', end:'13:00', dur:60 },
  // ERIC — Saturday 6/20
  { trainer:'eric', client:'Lenny Bucci',           date:'2026-06-20', start:'06:30', end:'07:00', dur:30 },
  { trainer:'eric', client:'Bubber Cockrell',       date:'2026-06-20', start:'07:00', end:'08:00', dur:60 },
  { trainer:'eric', client:'Stuart McCluer',        date:'2026-06-20', start:'08:00', end:'09:00', dur:60 },
  // PATRICK — Monday 6/15
  { trainer:'patrick', client:'Lee Allen',          date:'2026-06-15', start:'09:00', end:'10:00', dur:60 },
  { trainer:'patrick', client:'Jena Waldorf',       date:'2026-06-15', start:'10:00', end:'10:45', dur:45 },
  { trainer:'patrick', client:'Nick Holmes',        date:'2026-06-15', start:'13:00', end:'14:00', dur:60 },
  { trainer:'patrick', client:'Wood Struthers',     date:'2026-06-15', start:'14:00', end:'14:30', dur:30 },
  { trainer:'patrick', client:'Reggie Gibson',      date:'2026-06-15', start:'16:30', end:'17:30', dur:60 },
  { trainer:'patrick', client:"Jennie O'Reilly",    date:'2026-06-15', start:'17:30', end:'18:30', dur:60 },
  { trainer:'patrick', client:'Eric Boyer',         date:'2026-06-15', start:'18:30', end:'19:30', dur:60 },
  // PATRICK — Tuesday 6/16
  { trainer:'patrick', client:'Brannen Daugherty',  date:'2026-06-16', start:'08:00', end:'08:45', dur:45 },
  { trainer:'patrick', client:'Connie Clasby',      date:'2026-06-16', start:'09:00', end:'10:00', dur:60 },
  { trainer:'patrick', client:'Dave Murrell',       date:'2026-06-16', start:'14:00', end:'15:00', dur:60 },
  { trainer:'patrick', client:'Eveon Class',        date:'2026-06-16', start:'15:00', end:'15:45', dur:45 },
  // PATRICK — Wednesday 6/17
  { trainer:'patrick', client:'Chris Keith',        date:'2026-06-17', start:'05:00', end:'06:00', dur:60 },
  { trainer:'patrick', client:'Ben Noelle',         date:'2026-06-17', start:'07:00', end:'08:00', dur:60 },
  { trainer:'patrick', client:'Robben Richards',    date:'2026-06-17', start:'09:30', end:'10:00', dur:30 },
  { trainer:'patrick', client:'Missy Derse',        date:'2026-06-17', start:'11:00', end:'11:45', dur:45 },
  { trainer:'patrick', client:'Nick Holmes',        date:'2026-06-17', start:'13:00', end:'14:00', dur:60 },
  { trainer:'patrick', client:'Eveon Class',        date:'2026-06-17', start:'15:00', end:'15:45', dur:45 },
  // PATRICK — Thursday 6/18
  { trainer:'patrick', client:'John Thiboutot',     date:'2026-06-18', start:'08:00', end:'09:00', dur:60 },
  { trainer:'patrick', client:'Connie Clasby',      date:'2026-06-18', start:'09:00', end:'10:00', dur:60 },
  { trainer:'patrick', client:'Jena Waldorf',       date:'2026-06-18', start:'10:00', end:'10:45', dur:45 },
  { trainer:'patrick', client:'Melissa Berger',     date:'2026-06-18', start:'11:00', end:'12:00', dur:60 },
  // PATRICK — Friday 6/19
  { trainer:'patrick', client:'Ben Noelle',         date:'2026-06-19', start:'08:00', end:'09:00', dur:60 },
  { trainer:'patrick', client:'Robben Richards',    date:'2026-06-19', start:'09:30', end:'10:00', dur:30 },
  { trainer:'patrick', client:'Missy Derse',        date:'2026-06-19', start:'11:00', end:'11:45', dur:45 },
  { trainer:'patrick', client:'Chip Sloan',         date:'2026-06-19', start:'12:00', end:'13:00', dur:60 },
  { trainer:'patrick', client:'Melissa Berger',     date:'2026-06-19', start:'13:00', end:'13:45', dur:45 },
  // EMMA — Monday 6/15
  { trainer:'emma', client:'David Breedlove',       date:'2026-06-15', start:'07:00', end:'08:00', dur:60 },
  { trainer:'emma', client:'Mike Hunter',           date:'2026-06-15', start:'08:00', end:'09:00', dur:60 },
  { trainer:'emma', client:'Matt Schilz',           date:'2026-06-15', start:'10:00', end:'11:00', dur:60 },
  { trainer:'emma', client:'Greg Sanders',          date:'2026-06-15', start:'11:00', end:'12:00', dur:60 },
  // EMMA — Tuesday 6/16
  { trainer:'emma', client:'Winslow Hastie',        date:'2026-06-16', start:'07:00', end:'07:30', dur:30 },
  { trainer:'emma', client:'Kate Lemmer',           date:'2026-06-16', start:'07:30', end:'08:30', dur:60 },
  { trainer:'emma', client:'Liz Guthridge',         date:'2026-06-16', start:'08:30', end:'09:00', dur:30 },
  { trainer:'emma', client:'Becky Hollingsworth',   date:'2026-06-16', start:'10:00', end:'11:00', dur:60 },
  { trainer:'emma', client:'Casey Henault',         date:'2026-06-16', start:'11:30', end:'12:00', dur:30 },
  { trainer:'emma', client:'Whit Kinder',           date:'2026-06-16', start:'12:00', end:'13:00', dur:60 },
  // EMMA — Wednesday 6/17
  { trainer:'emma', client:'David Breedlove',       date:'2026-06-17', start:'07:00', end:'08:00', dur:60 },
  { trainer:'emma', client:'Mike Hunter',           date:'2026-06-17', start:'08:00', end:'09:00', dur:60 },
  { trainer:'emma', client:'Matt Schilz',           date:'2026-06-17', start:'09:00', end:'10:00', dur:60 },
  { trainer:'emma', client:'Greg Sanders',          date:'2026-06-17', start:'11:00', end:'12:00', dur:60 },
  // EMMA — Thursday 6/18
  { trainer:'emma', client:'Winslow Hastie',        date:'2026-06-18', start:'07:00', end:'07:30', dur:30 },
  { trainer:'emma', client:'Kate Lemmer',           date:'2026-06-18', start:'07:30', end:'08:30', dur:60 },
  { trainer:'emma', client:'Liz Guthridge',         date:'2026-06-18', start:'08:30', end:'09:00', dur:30 },
  { trainer:'emma', client:'Erich Schmidt',         date:'2026-06-18', start:'09:00', end:'10:00', dur:60 },
  { trainer:'emma', client:'Tim Poeton',            date:'2026-06-18', start:'11:00', end:'11:30', dur:30 },
  { trainer:'emma', client:'Whit Kinder',           date:'2026-06-18', start:'12:00', end:'13:00', dur:60 },
  // EMMA — Friday 6/19
  { trainer:'emma', client:'Todd Eischeid',         date:'2026-06-19', start:'08:00', end:'09:00', dur:60 },
  { trainer:'emma', client:'Matt Schilz',           date:'2026-06-19', start:'09:00', end:'10:00', dur:60 },
  { trainer:'emma', client:'Becky Hollingsworth',   date:'2026-06-19', start:'10:00', end:'11:00', dur:60 },
  { trainer:'emma', client:'Mike Hunter',           date:'2026-06-19', start:'11:45', end:'12:45', dur:60 },
  // EMMA — Saturday 6/20
  { trainer:'emma', client:'Heather Rose',          date:'2026-06-20', start:'10:00', end:'10:30', dur:30 },
  // JACK — Tuesday 6/16
  { trainer:'jack', client:'Autumn Riggins',        date:'2026-06-16', start:'06:00', end:'06:45', dur:45 },
  { trainer:'jack', client:'Rose Thiboutot',        date:'2026-06-16', start:'07:00', end:'08:00', dur:60 },
  { trainer:'jack', client:'Erich Schmidt',         date:'2026-06-16', start:'08:30', end:'09:30', dur:60 },
  { trainer:'jack', client:'Michael Scardato',      date:'2026-06-16', start:'09:30', end:'10:15', dur:45 },
  { trainer:'jack', client:'Liz Fort',              date:'2026-06-16', start:'10:15', end:'11:00', dur:45 },
];

async function main() {
  console.log('🏋️  Top Shape Fitness — Calendar Import');
  console.log('📅  Week of 6/14–6/21/2026');
  console.log(`📊  ${SESSIONS.length} sessions to import\n`);

  console.log('── Step 1: Resolving trainer IDs ──────────────────────');
  const trainerMap = await resolveTrainers();

  console.log('\n── Step 2: Resolving client IDs ───────────────────────');
  const clientMap = await resolveClients();

  console.log('\n── Step 3: Inserting appointments ─────────────────────');
  const results = await insertAppointments(trainerMap, clientMap);

  console.log('\n── Summary ─────────────────────────────────────────────');
  console.log(`✅  Inserted:                  ${results.inserted}`);
  console.log(`⏭️   Skipped (duplicate):       ${results.skipped}`);
  console.log(`⚠️   Skipped (client missing):  ${results.missingClient}`);
  console.log(`❌  Errors:                    ${results.errors}`);
  console.log('\nDone.');
}

async function resolveTrainers() {
  const map = {};
  for (const [key, email] of Object.entries(TRAINER_EMAILS)) {
    const { data: user } = await supabase.from('users').select('id').eq('email', email).single();
    if (!user) { console.log(`  ⚠️  User not found: ${email}`); continue; }
    const { data: trainer } = await supabase.from('trainers').select('id').eq('user_id', user.id).single();
    if (!trainer) { console.log(`  ⚠️  Trainer record missing: ${email}`); continue; }
    map[key] = trainer.id;
    console.log(`  ✅  ${key}: ${trainer.id}`);
  }
  return map;
}

async function resolveClients() {
  const map = {};
  const { data: allClients } = await supabase
    .from('clients')
    .select('id, users!clients_user_id_fkey(first_name, last_name)');

  const lookup = {};
  for (const c of allClients || []) {
    if (c.users) {
      const full = `${c.users.first_name} ${c.users.last_name}`.trim().toLowerCase();
      lookup[full] = c.id;
    }
  }

  const names = [...new Set(SESSIONS.map(s => s.client))];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lookup[lower]) {
      map[name] = lookup[lower];
      console.log(`  ✅  "${name}"`);
      continue;
    }
    // Try last-name match
    const last = lower.split(' ').pop();
    const match = Object.entries(lookup).find(([k]) => k.split(' ').pop() === last);
    if (match) {
      map[name] = match[1];
      console.log(`  🔍  "${name}" matched by last name`);
    } else {
      console.log(`  ⚠️   "${name}" NOT FOUND — will be skipped (add client in app first)`);
    }
  }
  return map;
}

async function insertAppointments(trainerMap, clientMap) {
  const results = { inserted: 0, skipped: 0, missingClient: 0, errors: 0 };
  for (const s of SESSIONS) {
    const trainerId = trainerMap[s.trainer];
    const clientId  = clientMap[s.client];
    if (!trainerId) { results.errors++; continue; }
    if (!clientId)  { results.missingClient++; continue; }

    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('trainer_id', trainerId)
      .eq('client_id', clientId)
      .eq('appointment_date', s.date)
      .eq('start_time', s.start + ':00')
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  ⏭️  Duplicate: ${s.date} ${s.start} ${s.client}`);
      results.skipped++;
      continue;
    }

    const { error } = await supabase.from('appointments').insert({
      trainer_id:       trainerId,
      client_id:        clientId,
      appointment_date: s.date,
      start_time:       s.start + ':00',
      end_time:         s.end + ':00',
      duration_minutes: s.dur,
      status:           'completed',
      session_type:     'training',
      is_recurring:     true,
      session_deducted: false,
      notes:            'Imported from Google Calendar (week of 6/14/2026)',
    });

    if (error) {
      console.log(`  ❌  ${s.date} ${s.start} ${s.client}: ${error.message}`);
      results.errors++;
    } else {
      console.log(`  ✅  ${s.date} ${s.start}–${s.end} | ${s.client} → ${s.trainer}`);
      results.inserted++;
    }
  }
  return results;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
