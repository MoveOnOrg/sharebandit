var Sequelize = require('sequelize');

/*
  TODO: rename all these things to be more clear:
  success => "click" because that's what it is
  action => "conversion" because that's the ad-term
  Metadata => Trial
  Bandit => ?ClickerAction

 */

var init = function(sequelize) {
  // Configure database models
  var Metadata = sequelize.define('metadata', {
    /// For each VARIANT of a url one of these is created
    id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true}, //abver parameter
    url: Sequelize.STRING,
    headline: Sequelize.STRING,
    text: Sequelize.TEXT,
    image_url: Sequelize.STRING,
    version: Sequelize.INTEGER,
    //how many users click the share link
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    //how many users click and perform the desired action on the site
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    //how many people share the link: should be sum of Sharer for this trial
    trial_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0}
    //updatedAt - auto-created by sequelize
    //createdAt - auto-created by sequelize
  }, {
    indexes: [
      { unique: true,
        fields: ['url', 'version']
      }
    ]
  });

  var Sharer = sequelize.define('sharer', {
    /// Each person that shares the link will create an entry here, 
    ///   and then success_count will be for visits, and actions for completed actions
    key: Sequelize.STRING, //?abid parameter
    trial: {type: Sequelize.INTEGER, //?abver parameter
            references: { model: Metadata, key: 'id'}},
    success_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    action_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
    //updatedAt - auto-created by sequelize
    //createdAt - auto-created by sequelize
  }, {
    indexes: [
      { unique: true,
        fields: ['key','trial']
      }
    ]
  });

  var Bandit = sequelize.define('bandit', {
    /// Created for each successful click (action=0) or conversion (action=1)
    trial: {type: Sequelize.INTEGER,
            references: {model: Metadata, key: 'id'}},
    action: {type: Sequelize.BOOLEAN, defaultValue: false},
    time: {type: Sequelize.DATE, defaultValue: Sequelize.NOW}
    //updatedAt - auto-created by sequelize
    //createdAt - auto-created by sequelize
  }, {
    indexes : [
      { unique: false,
        fields: ['trial', 'time']
      }
    ]
  });
  
  return {'Sharer': Sharer, 'Metadata': Metadata, 'Bandit': Bandit};
}

module.exports = init;
