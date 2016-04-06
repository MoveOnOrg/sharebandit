var Sequelize = require('sequelize');

var init = function(sequelize) {
  // Configure database models
  var Metadata = sequelize.define('metadata', {
    id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true}, //abver parameter
    url: Sequelize.STRING,
    headline: Sequelize.STRING,
    text: Sequelize.STRING,
    image_url: Sequelize.STRING,
    version: Sequelize.INTEGER,
    //how many users click the share link
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    //how many users click and perform the desired action on the site
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    //how many people share the link: should be sum of Sharer for this trial
    trial_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}
  }, {
    indexes: [
      { unique: true,
        fields: ['url', 'version']
      }
    ]
  });

  var Sharer = sequelize.define('sharer', {
    key: Sequelize.STRING, //?abid parameter
    trial: {type: Sequelize.INTEGER, //?abver parameter
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

  var Bandits = sequelize.define('bandits', {
    trial: {type: Sequelize.INTEGER,
        references: {model: Metadata, key: 'id'}},
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    trial_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 1},
    time: {type: Sequelize.DATE, defaultValue: Sequelize.NOW}
  }, {
    indexes : [
      { unique: false,
        fields: ['trial', 'time']
      }
    ]
  });
  
  sequelize.authenticate();
  sequelize.sync();
  return {'Sharer': Sharer, 'Metadata': Metadata, 'Bandits': Bandits};
}

module.exports = init;
