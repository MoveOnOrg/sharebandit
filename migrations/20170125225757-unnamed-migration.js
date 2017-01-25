'use strict';

module.exports = {
  up: function (queryInterface, Sequelize) {
    queryInterface.changeColumn(
      'metadata',
      'text',
      {
        type: Sequelize.TEXT,
        allowNull: true
      }
    )
  },

  down: function (queryInterface, Sequelize) {
    queryInterface.changeColumn(
      'metadata',
      'text',
      {
        type: Sequelize.STRING,
        allowNull: true
      }
    )
  }
};
