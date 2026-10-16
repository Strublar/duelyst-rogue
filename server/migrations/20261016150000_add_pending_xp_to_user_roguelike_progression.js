// quest xp earned during a run, given when the run ends
exports.up = function (knex) {
  return knex.schema.table('user_roguelike_progression', (table) => {
    table.integer('pending_xp').notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.table('user_roguelike_progression', (table) => {
    table.dropColumn('pending_xp');
  });
};
