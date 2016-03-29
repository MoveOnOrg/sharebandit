var Sequelize = require('sequelize');

var init = function(sequelize) {
  // Configure database models
  var Metadata = sequelize.define('metadata', {
    id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
    url: Sequelize.STRING,
    headline: Sequelize.STRING,
    text: Sequelize.STRING,
    image_url: Sequelize.STRING,
    version: Sequelize.INTEGER,
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    trial_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}
  }, {
    indexes: [
      { unique: true,
        fields: ['url', 'version']
      }
    ]
  });

  var Sharer = sequelize.define('sharer', {
    key: Sequelize.STRING,
    trial: {type: Sequelize.INTEGER, //abver will reference this
            references: { model: Metadata, key: 'id'}},
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
  }, {
    indexes: [
      { unique: true,
        fields: ['key','trial']
      }
    ]
  });
  
  sequelize.authenticate();
  sequelize.sync();
  return {'Sharer': Sharer, 'Metadata': Metadata};
}

module.exports = init;
