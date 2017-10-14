var Promise = require("bluebird");

function SchemaActions(schema, sequelize, redis) {
  this.schema = schema
  this.sequelize = sequelize
  this.redis = redis
  this.dbActions = new DBSchemaActions(schema, sequelize)
  this.redisActions = new RedisSchemaActions(redis)
}

SchemaActions.prototype = {
  newEvent: function(abver, abid, isAction) {
    var redisActions = this.redisActions
    var dbActions = this.dbActions
    return new Promise(function (newEventResolve, newEventReject) {
      redisActions.newEvent(abver, abid, isAction)
        .then(newEventResolve,
              function(err) {
                if (err.noMetadata) {
                  dbActions.newEvent(abver, abid, isAction, redisActions.loadMetadataIntoCache.bind(redisActions))
                    .then(newEventResolve, newEventReject)
                } else {
                  newEventReject(err)
                }
              })
    })
  },
  newShare: function(newsharer, abver) {
    var redisActions = this.redisActions
    var dbActions = this.dbActions
    return new Promise(function (newEventResolve, newEventReject) {
      redisActions.newShare(newsharer, abver)
        .then(newEventResolve,
              function(err) {
                dbActions.newShare(newsharer, abver)
                  .then(newEventResolve, newEventReject)
              })
    })
  },
  trialLookup: function(url, abver) {
    return this.dbActions.trialLookup(url, abver)
  },
  getSuccessfulShareCountsByTrial: function(url, abver) {
    return this.dbActions.getSuccessfulShareCountsByTrial(url, abver)
  }
}

function RedisSchemaActions(redis) {
  this.redis = redis
}

RedisSchemaActions.prototype = {
  loadMetadataIntoCache: function(metadata) {
    this.redis.set('METADATA_'+metadata.id, JSON.stringify(metadata.toJSON()), function(err, data){})
  },
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
    var event = 'success' //a new share is a click with 0 clicks
    return new Promise(function (newShareResolve, newShareReject) {
      r.hincrby(('PROCESS_'+event), (abver+'_'+abid), 0, function(err){
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
  getSuccessfulShareCountsByTrial: function(url, abver) {
    var r = this.redis
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

function DBSchemaActions(schema, sequelize) {
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
  },
  getSuccessfulShareCountsByTrial: function(url, successMetric) {
    var query = ('SELECT trial, sum(case when Sharers.{{success_field}}_count > 0 then 1 else 0 end) AS success, count(key) AS trials'
                 +' FROM Sharers'
                 +' JOIN Metadata on (Metadata.id = Sharers.trial)'
                 +' WHERE Metadata.url = ? GROUP BY trial')
              .replace('{{success_field}}',
                       ((successMetric == 'action') ? 'action' : 'success')
                      );

    return this.sequelize.query(
      query,
      {
        replacements: [url],
        type: this.sequelize.QueryTypes.SELECT
      }
    )
  }
}

module.exports = function(schema, sequelize, redis) {
  if (redis) {
    return new SchemaActions(schema, sequelize, redis)
  } else {
    return new DBSchemaActions(schema, sequelize)
  }
}
