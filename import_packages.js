const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nhaescbzxxgowflgrgll.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_KEY required'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TRAINER_NAMES = ['eric', 'patrick', 'emma', 'jack', 'nick'];

const PACKAGES = [
  {"client":"Peggy Balla","trainer":"Patrick","sessions_remaining":5.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"1/14/2026","last_session":"2026-03-12"},
  {"client":"Melissa Berger","trainer":"Patrick","sessions_remaining":7.0,"sessions_total":24,"per_session_price_cents":9000,"package_cost_cents":216000,"duration_minutes":60,"package_start_date":"5/6/2026","last_session":"2026-06-19"},
  {"client":"Meredy Bolka","trainer":"Emma","sessions_remaining":11.0,"sessions_total":12,"per_session_price_cents":7500,"package_cost_cents":90000,"duration_minutes":30,"package_start_date":"6/16/2026","last_session":"2026-06-17"},
  {"client":"Eric Boyer","trainer":"Patrick","sessions_remaining":4.0,"sessions_total":12,"per_session_price_cents":9000,"package_cost_cents":108000,"duration_minutes":60,"package_start_date":"5/11/2026","last_session":"2026-06-15"},
  {"client":"David & Betty Breedlove","trainer":"Eric","sessions_remaining":14.0,"sessions_total":36,"per_session_price_cents":7972,"package_cost_cents":286992,"duration_minutes":60,"package_start_date":"4/28/2026","last_session":"2026-06-19"},
  {"client":"Michael Brewer","trainer":"Patrick","sessions_remaining":18.0,"sessions_total":36,"per_session_price_cents":5200,"package_cost_cents":187200,"duration_minutes":30,"package_start_date":"5/28/2026","last_session":"2026-06-17"},
  {"client":"Lenny Bucci","trainer":"Eric","sessions_remaining":4.0,"sessions_total":24,"per_session_price_cents":5414,"package_cost_cents":129936,"duration_minutes":30,"package_start_date":"6/3/2026","last_session":"2026-06-20"},
  {"client":"Liz Buterbaugh","trainer":"Eric","sessions_remaining":2.0,"sessions_total":24,"per_session_price_cents":7250,"package_cost_cents":174000,"duration_minutes":60,"package_start_date":"3/25/2026","last_session":"2026-06-18"},
  {"client":"Drayton Calmes","trainer":"Eric","sessions_remaining":13.0,"sessions_total":48,"per_session_price_cents":6500,"package_cost_cents":312000,"duration_minutes":45,"package_start_date":"1/13/2026","last_session":"2026-06-18"},
  {"client":"Bob Cane","trainer":"Eric","sessions_remaining":2.0,"sessions_total":6,"per_session_price_cents":9000,"package_cost_cents":54000,"duration_minutes":60,"package_start_date":"2026-05-20","last_session":"2026-06-18"},
  {"client":"CJ Cantwell","trainer":"Eric","sessions_remaining":12.0,"sessions_total":12,"per_session_price_cents":5500,"package_cost_cents":66000,"duration_minutes":30,"package_start_date":"6/16/2026","last_session":""},
  {"client":"Connie Clasby","trainer":"Patrick","sessions_remaining":89.0,"sessions_total":156,"per_session_price_cents":6500,"package_cost_cents":1014000,"duration_minutes":60,"package_start_date":"1/1/2026","last_session":"2026-06-18"},
  {"client":"Ross Cowan","trainer":"Jack","sessions_remaining":4.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"4/22/2026","last_session":"2026-06-04"},
  {"client":"Linda Dilgren","trainer":"Emma","sessions_remaining":6.0,"sessions_total":6,"per_session_price_cents":9250,"package_cost_cents":55500,"duration_minutes":45,"package_start_date":"6/12/2026","last_session":""},
  {"client":"Henry Eang","trainer":"Eric","sessions_remaining":7.0,"sessions_total":36,"per_session_price_cents":7250,"package_cost_cents":261000,"duration_minutes":60,"package_start_date":"04/14/2026","last_session":"2026-06-12"},
  {"client":"Ellen Elliotte","trainer":"Patrick","sessions_remaining":1.0,"sessions_total":6,"per_session_price_cents":10000,"package_cost_cents":60000,"duration_minutes":60,"package_start_date":"9/17/2025","last_session":"2026-05-09"},
  {"client":"Patty Seif","trainer":"Eric","sessions_remaining":9.0,"sessions_total":24,"per_session_price_cents":9500,"package_cost_cents":228000,"duration_minutes":60,"package_start_date":"4/27/2026","last_session":"2026-06-03"},
  {"client":"Sam Farnham","trainer":"Eric","sessions_remaining":25.0,"sessions_total":36,"per_session_price_cents":7194,"package_cost_cents":258984,"duration_minutes":60,"package_start_date":"5/7/2026","last_session":"2026-06-15"},
  {"client":"Liz Guthridge","trainer":"Emma","sessions_remaining":9.0,"sessions_total":36,"per_session_price_cents":5488,"package_cost_cents":197568,"duration_minutes":30,"package_start_date":"2/25/2026","last_session":"2026-06-18"},
  {"client":"Winslow Hastie","trainer":"Emma","sessions_remaining":2.0,"sessions_total":12,"per_session_price_cents":6000,"package_cost_cents":72000,"duration_minutes":30,"package_start_date":"5/13/2026","last_session":"2026-06-18"},
  {"client":"Casey Henualt","trainer":"Emma","sessions_remaining":17.0,"sessions_total":24,"per_session_price_cents":6000,"package_cost_cents":144000,"duration_minutes":30,"package_start_date":"5/29/2026","last_session":"2026-06-20"},
  {"client":"Becky Hollingsworth","trainer":"Emma","sessions_remaining":3.0,"sessions_total":24,"per_session_price_cents":7937,"package_cost_cents":190488,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Nick Holmes","trainer":"Patrick","sessions_remaining":30.0,"sessions_total":78,"per_session_price_cents":9000,"package_cost_cents":702000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-17"},
  {"client":"Mike Hunter","trainer":"Emma","sessions_remaining":10.0,"sessions_total":12,"per_session_price_cents":10000,"package_cost_cents":120000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Ferris Kaplan","trainer":"Eric","sessions_remaining":7.0,"sessions_total":12,"per_session_price_cents":8375,"package_cost_cents":100500,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Chris Keith","trainer":"Patrick","sessions_remaining":20.0,"sessions_total":36,"per_session_price_cents":8500,"package_cost_cents":306000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-17"},
  {"client":"Guy Lacerte","trainer":"Eric","sessions_remaining":8.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"John LaMaster","trainer":"Patrick","sessions_remaining":18.0,"sessions_total":36,"per_session_price_cents":8500,"package_cost_cents":306000,"duration_minutes":60,"package_start_date":"","last_session":""},
  {"client":"Croft Lane","trainer":"Emma","sessions_remaining":1.0,"sessions_total":6,"per_session_price_cents":8750,"package_cost_cents":52500,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Gil Kerlikowski","trainer":"Emma","sessions_remaining":2.0,"sessions_total":24,"per_session_price_cents":6000,"package_cost_cents":144000,"duration_minutes":30,"package_start_date":"","last_session":""},
  {"client":"Anna Laszlo","trainer":"Emma","sessions_remaining":1.0,"sessions_total":24,"per_session_price_cents":7500,"package_cost_cents":180000,"duration_minutes":45,"package_start_date":"","last_session":""},
  {"client":"Autumn & Al","trainer":"Eric","sessions_remaining":22.0,"sessions_total":36,"per_session_price_cents":6660,"package_cost_cents":239760,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"Jordan McCarthy","trainer":"Eric","sessions_remaining":17.0,"sessions_total":24,"per_session_price_cents":8800,"package_cost_cents":211200,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"Stuart McCluer","trainer":"Eric","sessions_remaining":16.0,"sessions_total":36,"per_session_price_cents":7500,"package_cost_cents":270000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-20"},
  {"client":"Jamie McNab","trainer":"Eric","sessions_remaining":4.0,"sessions_total":20,"per_session_price_cents":7000,"package_cost_cents":140000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Warren Miller","trainer":"Eric","sessions_remaining":14.0,"sessions_total":24,"per_session_price_cents":7000,"package_cost_cents":168000,"duration_minutes":60,"package_start_date":"","last_session":""},
  {"client":"Helen Mitternight","trainer":"Eric","sessions_remaining":6.0,"sessions_total":12,"per_session_price_cents":7850,"package_cost_cents":94200,"duration_minutes":60,"package_start_date":"","last_session":""},
  {"client":"Dave Murrell","trainer":"Patrick","sessions_remaining":5.0,"sessions_total":24,"per_session_price_cents":9000,"package_cost_cents":216000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"Ben Noelle","trainer":"Patrick","sessions_remaining":8.0,"sessions_total":24,"per_session_price_cents":9500,"package_cost_cents":228000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Rob Peppin","trainer":"Eric","sessions_remaining":25.0,"sessions_total":42,"per_session_price_cents":9500,"package_cost_cents":399000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Suzi Poeton","trainer":"Eric","sessions_remaining":6.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Tony Powell","trainer":"Patrick","sessions_remaining":17.0,"sessions_total":24,"per_session_price_cents":5916,"package_cost_cents":141984,"duration_minutes":30,"package_start_date":"","last_session":""},
  {"client":"Josh Reda","trainer":"Eric","sessions_remaining":10.0,"sessions_total":24,"per_session_price_cents":5500,"package_cost_cents":132000,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Jessica Reichert","trainer":"Patrick","sessions_remaining":2.0,"sessions_total":6,"per_session_price_cents":10000,"package_cost_cents":60000,"duration_minutes":60,"package_start_date":"","last_session":""},
  {"client":"Robben Richards","trainer":"Patrick","sessions_remaining":10.0,"sessions_total":12,"per_session_price_cents":5500,"package_cost_cents":66000,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Greg Sanders","trainer":"Eric","sessions_remaining":10.0,"sessions_total":125,"per_session_price_cents":7500,"package_cost_cents":937500,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Matt Schilz","trainer":"Emma","sessions_remaining":17.0,"sessions_total":24,"per_session_price_cents":9000,"package_cost_cents":216000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Erich Schmidt","trainer":"Emma","sessions_remaining":2.0,"sessions_total":4,"per_session_price_cents":8900,"package_cost_cents":35600,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Michael Schuster","trainer":"Eric","sessions_remaining":4.0,"sessions_total":14,"per_session_price_cents":5200,"package_cost_cents":72800,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Florrie Sloan","trainer":"Emma","sessions_remaining":8.0,"sessions_total":24,"per_session_price_cents":7500,"package_cost_cents":180000,"duration_minutes":45,"package_start_date":"","last_session":""},
  {"client":"John Thiboutot","trainer":"Patrick","sessions_remaining":7.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Todd Turchetta","trainer":"Eric","sessions_remaining":21.0,"sessions_total":36,"per_session_price_cents":5277,"package_cost_cents":189972,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Jennifer Turchetta","trainer":"Eric","sessions_remaining":25.0,"sessions_total":36,"per_session_price_cents":5270,"package_cost_cents":189720,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"John Lacour","trainer":"Eric","sessions_remaining":18.0,"sessions_total":36,"per_session_price_cents":8000,"package_cost_cents":288000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-17"},
  {"client":"Chad Waldorf","trainer":"Eric","sessions_remaining":31.0,"sessions_total":68,"per_session_price_cents":7517,"package_cost_cents":511156,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Lee Allen","trainer":"Eric","sessions_remaining":63.0,"sessions_total":68,"per_session_price_cents":7517,"package_cost_cents":511156,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Ali Razet","trainer":"Eric","sessions_remaining":18.0,"sessions_total":60,"per_session_price_cents":8500,"package_cost_cents":510000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"Brannen Daugherty","trainer":"Patrick","sessions_remaining":7.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-16"},
  {"client":"Ann Yancy","trainer":"Emma","sessions_remaining":4.0,"sessions_total":25,"per_session_price_cents":6000,"package_cost_cents":150000,"duration_minutes":30,"package_start_date":"","last_session":""},
  {"client":"Jennie O'Reilly","trainer":"Patrick","sessions_remaining":4.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-15"},
  {"client":"Wood Struthers","trainer":"Patrick","sessions_remaining":8.0,"sessions_total":12,"per_session_price_cents":6000,"package_cost_cents":72000,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-15"},
  {"client":"Mike Velasco","trainer":"Emma","sessions_remaining":9.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Glen Gardner","trainer":"Jack","sessions_remaining":2.0,"sessions_total":12,"per_session_price_cents":8750,"package_cost_cents":105000,"duration_minutes":45,"package_start_date":"","last_session":""},
  {"client":"Huger Sinkler","trainer":"Emma","sessions_remaining":3.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":45,"package_start_date":"","last_session":""},
  {"client":"Todd Eischeid","trainer":"Emma","sessions_remaining":16.0,"sessions_total":24,"per_session_price_cents":9500,"package_cost_cents":228000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"John Derse","trainer":"Patrick","sessions_remaining":1.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":45,"package_start_date":"","last_session":""},
  {"client":"Mark Young","trainer":"Patrick","sessions_remaining":4.0,"sessions_total":25,"per_session_price_cents":8500,"package_cost_cents":212500,"duration_minutes":60,"package_start_date":"","last_session":""},
  {"client":"Whit Kinder","trainer":"Emma","sessions_remaining":7.0,"sessions_total":12,"per_session_price_cents":8750,"package_cost_cents":105000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Jena Waldorf","trainer":"Patrick","sessions_remaining":3.0,"sessions_total":12,"per_session_price_cents":7517,"package_cost_cents":90204,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Dave Peppin","trainer":"Eric","sessions_remaining":5.0,"sessions_total":24,"per_session_price_cents":9500,"package_cost_cents":228000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Jodi Peppin","trainer":"Eric","sessions_remaining":3.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-18"},
  {"client":"Karl Gedge","trainer":"Eric","sessions_remaining":4.0,"sessions_total":12,"per_session_price_cents":9500,"package_cost_cents":114000,"duration_minutes":60,"package_start_date":"","last_session":"2026-06-15"},
  {"client":"Jane Spelce","trainer":"Eric","sessions_remaining":6.0,"sessions_total":12,"per_session_price_cents":7517,"package_cost_cents":90204,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-19"},
  {"client":"Eveon Class","trainer":"Patrick","sessions_remaining":4.0,"sessions_total":12,"per_session_price_cents":8000,"package_cost_cents":96000,"duration_minutes":45,"package_start_date":"","last_session":"2026-06-17"},
  {"client":"Tim Poeton","trainer":"Emma","sessions_remaining":3.0,"sessions_total":12,"per_session_price_cents":7500,"package_cost_cents":90000,"duration_minutes":30,"package_start_date":"","last_session":"2026-06-18"}
];

async function main() {
  console.log('Top Shape Fitness — Package Import');
  console.log(PACKAGES.length + ' packages to import\n');

  // Resolve trainer IDs
  const trainerMap = {};
  for (const name of TRAINER_NAMES) {
    const { data: user } = await supabase.from('users').select('id').eq('email', name + '@topshapefitness.com').single();
    if (!user) continue;
    const { data: trainer } = await supabase.from('trainers').select('id').eq('user_id', user.id).single();
    if (trainer) { trainerMap[name] = trainer.id; console.log('Trainer resolved: ' + name); }
  }

  // Resolve clients
  const { data: allClients } = await supabase.from('clients').select('id, users!clients_user_id_fkey(first_name, last_name)');
  const clientLookup = {};
  for (const c of allClients || []) {
    if (c.users) clientLookup[`${c.users.first_name} ${c.users.last_name}`.trim().toLowerCase()] = c.id;
  }

  // Get/create one package template per distinct session duration.
  // The live `packages` schema only has: name, session_count, duration_days, is_active —
  // there is no per-session minutes column, so we encode duration in the template name.
  const durations = [...new Set(PACKAGES.map((p) => p.duration_minutes))];
  const pkgByDuration = {};
  for (const dur of durations) {
    const name = `Imported - ${dur} Min`;
    let { data: pkg } = await supabase.from('packages').select('id').eq('name', name).maybeSingle();
    if (!pkg) {
      const { data: newPkg, error: pkgErr } = await supabase
        .from('packages')
        .insert({ name, session_count: 1, duration_days: 180, is_active: false })
        .select('id')
        .single();
      if (pkgErr) { console.error('Failed to create template "' + name + '": ' + pkgErr.message); process.exit(1); }
      pkg = newPkg;
    }
    pkgByDuration[dur] = pkg.id;
    console.log('Template ready: ' + name);
  }

  const results = { inserted: 0, skipped: 0, missing: [], errors: 0 };

  for (const p of PACKAGES) {
    const nameLower = p.client.toLowerCase();
    let clientId = clientLookup[nameLower];
    if (!clientId) {
      const lastName = nameLower.split(' ').pop();
      const match = Object.entries(clientLookup).find(([k]) => k.split(' ').pop() === lastName);
      if (match) clientId = match[1];
    }
    if (!clientId) { results.missing.push(p.client); continue; }

    const trainerId = trainerMap[p.trainer.toLowerCase()];
    if (!trainerId) { console.log('No trainer: ' + p.trainer); results.errors++; continue; }

    const packageId = pkgByDuration[p.duration_minutes];
    if (!packageId) { console.log('No template for duration: ' + p.duration_minutes); results.errors++; continue; }

    const { data: existing } = await supabase.from('client_packages').select('id').eq('owner_client_id', clientId).limit(1);
    if (existing && existing.length > 0) { console.log('Skip (existing): ' + p.client); results.skipped++; continue; }

    let purchaseDate = null;
    if (p.package_start_date) {
      const parts = p.package_start_date.split('/');
      if (parts.length === 3) purchaseDate = `${parts[2].length===2?'20'+parts[2]:parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
      else purchaseDate = p.package_start_date || null;
    }

    const remaining = Math.ceil(p.sessions_remaining);
    const total = p.sessions_total || remaining;

    const { error } = await supabase.from('client_packages').insert({
      owner_client_id: clientId,
      package_id: packageId,
      sessions_total: total,
      sessions_remaining: remaining,
      sessions_used: Math.max(0, total - remaining),
      price_paid_cents: p.package_cost_cents,
      purchase_date: purchaseDate,
      expiration_waived: true,
      is_active: true,
    });

    if (error) { console.log('Error ' + p.client + ': ' + error.message); results.errors++; }
    else { console.log('Inserted: ' + p.client + ' | ' + p.sessions_remaining + ' remaining'); results.inserted++; }
  }

  console.log('\n=== SUMMARY ===');
  console.log('Inserted: ' + results.inserted);
  console.log('Skipped (duplicate): ' + results.skipped);
  console.log('Not found: ' + results.missing.length);
  console.log('Errors: ' + results.errors);
  if (results.missing.length) { console.log('\nNot found in app:'); results.missing.forEach(n => console.log('  - ' + n)); }
}

main().catch(err => { console.error(err); process.exit(1); });
