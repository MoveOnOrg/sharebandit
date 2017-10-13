var Promise = require("bluebird");

function SchemaActions(app, schema, sequelize, redis) {
  this.app = app
  this.schema = schema
  this.sequelize = sequelize
  this.redis = redis
  this.dbactions = new DBSchemaActions(app, schema, sequelize, redis)
}

SchemaActions.prototype = {
  newEvent: function(abver, abid, isAction) {
    // TODO
    // 1. try cache get on metadata,
    //    a. if rejected with err.noMetadata, then call dbactions.newEvent(.... ,loadMetadataIntoCache)
    return this.dbactions.newEvent(abver, abid, isAction)
  },
  newShare: function(newsharer, abver) {
    return this.dbactions.newShare(newsharer, abver)
  },
  trialLookup: function(url, abver) {
    return this.dbactions.trialLookup(url, abver)
  }
}

function RedisSchemaActions(app, redis) {
  this.app = app
  this.redis = redis
}

RedisSchemaActions.prototype = {
  _loadUrlFromDb: function(url, abid) {
    // 1. add abver members
    // 2. for each abver Metadata record,
    //    a. load in all Sharer abids into hyperloglog
    //    b. save METADATA
  },
  trialLookup: function(url, abver) {
    var r = this.redis
    return new Promise(function (resolve, reject) {
      r.get('METADATA_'+abver, function(err, data) {
        if (err) {
          return reject(err)
        } else if (data) {
          var parsedData = JSON.parse(data)
          if (parsedData.url == url) {
            return resolve(parsedData)
          }
        }
        resolve(null)
      })
    })
  },
  newShare: function(newsharer, abver) {
    var r = this.redis
    var event = (isAction ? 'action' : 'success')
    return new Promise(function (newShareResolve, newShareReject) {
      r.hincrby(('PROCESS_'+event), (abver+'_'+abid), 1, function(err){
        if (err) {
          newShareReject(err)
        } else {
          newShareResolve()
        }
      })
    })
  },
  newEvent: function(abver, abid, isAction) {
    var r = this.redis
    var event = (isAction ? 'action' : 'success')
    return new Promise(function (newEventResolve, newEventReject) {
      r.get('METADATA_'+abver, function(err, metadata) {
        if (err) {
          return newEventReject(err)
        } else {
          if (!metadata) {
            // this means we don't have the metadata url in cache,
            // so we can't incr them -- we'll have to fallback on the db
            return newEventReject({noMetadata: true})
          } else {
            // OK, now we can increment stuff!
            var metadataObj = JSON.parse(metadata)
            var url = metadataObj.url
            var commands = [
              ['hincrby', ('PROCESS_'+event), (abver+'_'+abid), 1], //used to update DB
              ['pfadd', ('sb_'+event+'_'+abver), abid], //used for bandit algorithm
              ['expire', ('sb_'+event+'_'+abver), 86400] // 1 day
            ]
            r.multi(commands).exec(function(err, res1, res2, res3) {
              if (err) {
                newEventReject(err)
              } else {
                // not sure what value is useful here....
                newEventResolve(metadata)
              }
            })
          }
        }
      })
    })
  },
  processCacheSaves: function() {
    // For each successMetric= {action,success}:
    // HGETALL SHAREBANDIT_PROCESS_<successMetric>
    // for all not 0
    //   send db update:
    //   HINCRBY SHAREBANDIT_PROCESS_<successMetric> <abver-abid> -<total_read>
    // for all 0:
    //   sort by abid, ascending
    //    HDEL all but top 10 keys
  }
}

function DBSchemaActions(app, schema, sequelize) {
  this.app = app
  this.schema = schema
  this.sequelize = sequelize
}

DBSchemaActions.prototype = {
  trialLookup: function(url, abver) {
    return this.schema.Metadata.findOne({
      'where': {'url': url, 'id': abver}
    })
  },
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
  newEvent: function(abver, abid, isAction, metadataRetrievalCallback) {
    var schema = this.schema
    var sequelize = this.sequelize
    var EVENT_KEY = (isAction ? 'action_count' : 'success_count')
    return new Promise(function (newEventResolve, newEventReject) {
      schema.Metadata.findById(abver).then(function(metadata) {
        if (metadata) {
          if (metadataRetrievalCallback) {
            metadataRetrievalCallback(metadata)
          }
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
                metadata.increment(EVENT_KEY, {transaction: t}).then(function() {
                  //2.
                  schema.Sharer.findOrCreate({where:{'key': abid,
                                                     'trial': abver},
                                              transaction: t
                                             })
                    .spread(function(sharer, created) {
                      //3.
                      sharer.increment(EVENT_KEY, {transaction: t}).then(
                        function() {
                          //4.
                          schema.Bandit.create({'trial': abver,
                                                'action': !!isAction}, {transaction: t}).then(resolve, rejlog);
                        }, rejlog);
                    })
                }, rejlog)
              });
            }).then(newEventResolve, newEventReject)
        } else {
          newEventReject('metadata not found ' + abver)
        }
      })
    })
  }
}

module.exports = function(app, schema, sequelize, redis) {
  if (redis) {
    return new SchemaActions(app, schema, sequelize, redis)
  } else {
    return new DBSchemaActions(app, schema, sequelize)
  }
}
