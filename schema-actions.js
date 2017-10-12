var Promise = require("bluebird");

function SchemaActions(app, schema, sequelize, redis) {
  this.app = app
  this.schema = schema
  this.sequelize = sequelize
  this.redis = redis
}

SchemaActions.prototype = {
  newShare: function(newsharer, abver) {
    var schema = this.schema
    return this.sequelize.transaction(function(t) {
      //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
      // but that really f---s with the transaction, so better to do callback hell here
      return new Promise(function (resolve, reject) {
        schema.Sharer.findOrCreate({'where': newsharer}).spread(function(sharer, created) {
          if (created) {
            schema.Metadata.findById(abver).then(function(metadata) {
              metadata.increment('trial_count').then(resolve, reject);
            });
          } else {
            resolve();
          }
        })
      });
    })
  },
  newClick: function(abver, abid) {
    var schema = this.schema
    var sequelize = this.sequelize
    return new Promise(function (newClickResolve, newClickReject) {
      schema.Metadata.findById(abver).then(function(metadata) {
        if (metadata) {
          sequelize.transaction(/*{
                                  deferrable: Sequelize.Deferrable.SET_IMMEDIATE,
                                  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
                                  },*/
            function(t) {
              //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
              // but that really f---s with the transaction, so better to do callback hell here
              return new Promise(function (resolve, reject) {
                var rejlog = function() {
                  //console.log('rejected!');
                  reject();
                };
                //1.
                metadata.increment('success_count', {transaction: t}).then(function() {
                  //2.
                  schema.Sharer.findOrCreate({where:{'key': abid,
                                                     'trial': abver},
                                              transaction: t
                                             })
                    .spread(function(sharer, created) {
                      //3.
                      sharer.increment('success_count', {transaction: t}).then(
                        function() {
                          //4.
                          schema.Bandit.create({'trial': abver,
                                                'action': false}, {transaction: t}).then(resolve, rejlog);
                        }, rejlog);
                    })
                }, rejlog)
              });
            }).then(newClickResolve, newClickReject)
        } else {
          newClickReject('metadata not found ' + abver)
        }
      })
    })
  }
}

module.exports = SchemaActions
