exports.up = function (knex) {
  return knex.schema.createTable('user_roguelike_progression', (table) => {
    table.string('user_id', 36).notNullable().primary();
    table.integer('xp').notNullable().defaultTo(0);
    // general id -> xp
    table.jsonb('general_xp').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.dateTime('updated_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('user_roguelike_progression');
};
